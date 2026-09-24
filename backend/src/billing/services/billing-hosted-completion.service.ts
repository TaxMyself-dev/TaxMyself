import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BillingAttempt } from '../entities/billing-attempt.entity';
import { PaymentMethod } from '../entities/payment-method.entity';
import { Subscription } from '../entities/subscription.entity';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { BillingEventType, SubscriptionStatus } from '../enums/billing.enums';
import {
  CardDetails,
  HostedTokenRecoveryReason,
  validateHostedCaptureResult,
} from '../utils/billing-hosted-card-result.util';
import { encryptCardcomToken } from '../utils/billing-token-encryption.util';
import { CardcomService } from './cardcom.service';
import { BillingEventService } from './billing-event.service';
import { BillingIssuerConfigService } from './billing-issuer-config.service';
import {
  BillingLifecycleService,
  PostCaptureDeferredError,
  ResumeCapturedAttemptResult,
} from './billing-lifecycle.service';
import { BillingReceiptService } from './billing-receipt.service';

/**
 * A hosted attempt whose capture is confirmed locally is not touched by a
 * recovery activation until the original webhook request has had this long to
 * finish its own activation, which is the only place the verified card token is
 * available. It stops a concurrent duplicate delivery from activating first and
 * making the original request skip storing the token.
 */
export const HOSTED_ACTIVATION_RECOVERY_GRACE_MS = 2 * 60_000;
/** The sweep only considers attempts captured at least this long ago. */
export const HOSTED_RECOVERY_SWEEP_GRACE_MS = 5 * 60_000;
export const HOSTED_RECOVERY_SWEEP_BATCH = 50;

export type HostedCompletionStatus =
  | ResumeCapturedAttemptResult['status']
  | 'UNAVAILABLE';

export interface HostedRecoverySweepSummary {
  found: number;
  completed: number;
  pending: number;
}

/**
 * Local completion of a canonical HOSTED (PAST_DUE recovery) attempt whose
 * CardCom capture is already confirmed in our database. Every step is
 * retryable without another charge or hosted checkout (the only provider
 * contact is the lookup-only, best-effort card-token recovery during
 * activation, `CardcomService.getLowProfileResult`):
 *
 *   activation -> receipt/journal -> success-event link -> attempt/obligation
 *   completion
 *
 * Activation runs BEFORE the receipt (its period is the activated period) and
 * completion runs only after every step succeeded; any failure keeps the attempt
 * CAPTURED. Callers: the first webhook delivery (right after its own
 * activation), a replayed webhook, and the renewal sweep.
 */
@Injectable()
export class BillingHostedCompletionService {
  private readonly logger = new Logger(BillingHostedCompletionService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Subscription)
    private readonly subscriptionRepo: Repository<Subscription>,
    @InjectRepository(SubscriptionPlan)
    private readonly planRepo: Repository<SubscriptionPlan>,
    private readonly lifecycle: BillingLifecycleService,
    private readonly billingReceiptService: BillingReceiptService,
    private readonly billingIssuerConfigService: BillingIssuerConfigService,
    private readonly billingEventService: BillingEventService,
    @Optional() private readonly cardcomService?: CardcomService,
  ) {}

  async completeCapturedHostedAttempt(params: {
    firebaseId: string;
    subscriptionId: number;
    billingAttemptId: number;
  }): Promise<HostedCompletionStatus> {
    const { firebaseId, subscriptionId, billingAttemptId } = params;

    const result = await this.lifecycle.resumeCapturedAttempt({
      actor: { actorFirebaseId: firebaseId, subjectFirebaseId: firebaseId },
      attemptId: billingAttemptId,
      leaseOwner: `hosted-recovery-${billingAttemptId}`,
      activate: (attempt) =>
        this.activateSubscription({ firebaseId, subscriptionId, attempt }),
      receipt: {
        createReceipt: (attempt) =>
          this.createReceipt({
            firebaseId,
            subscriptionId,
            attempt: attempt as BillingAttempt,
          }),
      },
    });

    if (
      result.status === 'RECEIPT_PENDING' &&
      result.failureCategory !== 'ACTIVATION_DEFERRED'
    ) {
      // The attempt stays CAPTURED and the next run resumes it. Recorded once
      // per attempt (not per retry), with a category only: never provider,
      // token or payment detail.
      await this.billingEventService.logReceiptFailureOncePerAttempt({
        firebaseId,
        subscriptionId,
        billingAttemptId,
        metadata: {
          attemptId: billingAttemptId,
          cardcomDealNumber: result.attempt.cardcomTransactionId,
          phase: 'POST_CAPTURE_RECOVERY',
          failureCategory: result.failureCategory,
        },
      });
    }
    return result.status;
  }

  /**
   * Local recovery sweep for hosted attempts stuck CAPTURED (activation or
   * receipt/link failed and no webhook was ever re-delivered). Runs from the
   * existing renewal sweep; never calls CardCom. Bounded and never throws.
   */
  async recoverCapturedHostedAttempts(
    now: Date = new Date(),
  ): Promise<HostedRecoverySweepSummary> {
    const summary: HostedRecoverySweepSummary = {
      found: 0,
      completed: 0,
      pending: 0,
    };
    let candidates: Array<{
      attemptId: number;
      subscriptionId: number;
      firebaseId: string;
    }>;
    try {
      candidates = await this.lifecycle.findCapturedHostedAttempts(
        new Date(now.getTime() - HOSTED_RECOVERY_SWEEP_GRACE_MS),
        HOSTED_RECOVERY_SWEEP_BATCH,
      );
    } catch (error) {
      this.logger.error(
        `Hosted capture recovery sweep could not list attempts: ${
          (error as Error)?.message ?? 'unknown error'
        }`,
      );
      return summary;
    }

    summary.found = candidates.length;
    for (const candidate of candidates) {
      try {
        const status = await this.completeCapturedHostedAttempt({
          firebaseId: candidate.firebaseId,
          subscriptionId: candidate.subscriptionId,
          billingAttemptId: candidate.attemptId,
        });
        if (status === 'COMPLETED' || status === 'ALREADY_COMPLETED') {
          summary.completed += 1;
        } else {
          summary.pending += 1;
        }
      } catch (error) {
        summary.pending += 1;
        this.logger.warn(
          `Hosted capture recovery skipped attempt #${candidate.attemptId}: ${
            (error as Error)?.message ?? 'unknown error'
          }`,
        );
      }
    }
    return summary;
  }

  /**
   * Applies the subscription state the captured payment paid for, exactly once.
   * Same fields the webhook activation writes. The card token is NOT part of this
   * transaction: it is recovered best-effort afterwards from a lookup-only
   * LowProfile result, so a lookup problem can never block activation. Under a row lock, so concurrent runs serialize and the second sees an
   * already-active subscription and does nothing. It never overwrites a state it
   * was not created for: only PAST_DUE is activated; ACTIVE is a no-op; anything
   * else fails (manual review) rather than being changed.
   */
  private async activateSubscription(params: {
    firebaseId: string;
    subscriptionId: number;
    attempt: BillingAttempt;
  }): Promise<void> {
    const { firebaseId, subscriptionId, attempt } = params;
    const capturedAt = attempt.capturedAt;
    if (!capturedAt) {
      throw new Error('Captured attempt has no capture time');
    }

    // Lookup-only and outside any row lock. Only worth doing when this run is
    // about to activate a PAST_DUE subscription past the recovery grace period;
    // an ACTIVE subscription (a repeat run) triggers no provider contact at all.
    const pending = await this.subscriptionRepo
      .findOne({ where: { id: subscriptionId } })
      .catch(() => null);
    const lookup =
      pending?.status === SubscriptionStatus.PAST_DUE &&
      Date.now() - capturedAt.getTime() >= HOSTED_ACTIVATION_RECOVERY_GRACE_MS
        ? await this.lookupCardForRecovery({
            firebaseId,
            subscriptionId,
            attempt,
          })
        : null;

    const activated = await this.dataSource.transaction(async (manager) => {
      const subscription = await manager.findOne(Subscription, {
        where: { id: subscriptionId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!subscription || subscription.firebaseId !== firebaseId) {
        throw new Error('Subscription not found for the captured attempt');
      }
      if (subscription.status === SubscriptionStatus.ACTIVE) {
        return false; // already activated (first delivery, admin, or a prior recovery)
      }
      if (subscription.status !== SubscriptionStatus.PAST_DUE) {
        throw new Error(
          'Subscription state does not permit activation recovery',
        );
      }
      if (
        Date.now() - capturedAt.getTime() <
        HOSTED_ACTIVATION_RECOVERY_GRACE_MS
      ) {
        throw new PostCaptureDeferredError(
          'Original webhook activation may still be in progress',
        );
      }
      const plan = await manager.findOne(SubscriptionPlan, {
        where: { id: attempt.planId },
      });
      if (!plan) {
        throw new Error('Plan for the captured attempt not found');
      }
      const periodEnd = new Date(capturedAt);
      periodEnd.setMonth(periodEnd.getMonth() + 1);
      await manager.update(Subscription, subscription.id, {
        status: SubscriptionStatus.ACTIVE,
        planId: attempt.planId,
        currentPeriodStart: capturedAt,
        currentPeriodEnd: periodEnd,
        nextBillingDate: periodEnd,
        // Same retry-state reset as a successful canonical renewal: the next
        // cycle starts a fresh 3-day / 7-day / PAST_DUE sequence.
        renewalAttempts: 0,
        gracePeriodEndsAt: null,
        canceledAt: null,
        endedAt: null,
      });
      return true;
    });

    if (activated) {
      let tokenRecoveryReason: HostedTokenRecoveryReason | null =
        'LOOKUP_UNAVAILABLE';
      if (lookup && 'card' in lookup) {
        const stored = await this.storeRecoveredCard({
          firebaseId,
          subscriptionId,
          attempt,
          card: lookup.card,
        });
        tokenRecoveryReason = 'reason' in stored ? stored.reason : null;
      } else if (lookup && 'reason' in lookup) {
        tokenRecoveryReason = lookup.reason;
      }
      await this.billingEventService.logEvent({
        firebaseId,
        eventType: BillingEventType.SUBSCRIPTION_ACTIVATED,
        subscriptionId,
        billingAttemptId: attempt.id,
        metadata: {
          planId: attempt.planId,
          recoveredLocally: true,
          cardTokenStored: tokenRecoveryReason === null,
          // Sanitized category only; never the token, card data or provider text.
          ...(tokenRecoveryReason !== null && { tokenRecoveryReason }),
        },
      });
      this.logger.log(
        `Recovered subscription #${subscriptionId} activation for captured attempt #${attempt.id}`,
      );
    }
  }

  /**
   * Lookup-only: reads the LowProfile result of the attempt's own hosted
   * checkout and accepts card details only if it provably belongs to this
   * captured attempt. Never creates a checkout or submits a charge, never
   * throws, and never logs or returns the raw provider result.
   */
  private async lookupCardForRecovery(params: {
    firebaseId: string;
    subscriptionId: number;
    attempt: BillingAttempt;
  }): Promise<
    | { card: CardDetails & { token: string } }
    | { reason: HostedTokenRecoveryReason }
  > {
    const { firebaseId, subscriptionId, attempt } = params;
    if (!attempt.cardcomLowProfileId) return { reason: 'NO_LOW_PROFILE_ID' };
    if (!attempt.cardcomTransactionId) return { reason: 'NO_TRANSACTION_ID' };
    if (!this.cardcomService) return { reason: 'LOOKUP_UNAVAILABLE' };

    let result: unknown;
    try {
      result = await this.cardcomService.getLowProfileResult(
        attempt.cardcomLowProfileId,
      );
    } catch {
      return { reason: 'LOOKUP_FAILED' };
    }
    const validated = validateHostedCaptureResult(result, {
      lowProfileId: attempt.cardcomLowProfileId,
      transactionId: attempt.cardcomTransactionId,
      amountAgorot: attempt.amountAgorot,
      firebaseId,
      subscriptionId,
      planId: attempt.planId,
      billingAttemptId: attempt.id,
    });
    if ('reason' in validated) {
      this.logger.warn(
        `Card token recovery rejected for attempt #${attempt.id}: ${validated.reason}`,
      );
    }
    return validated;
  }

  /**
   * Stores a verified recovered token under the subscription row lock, after
   * activation, reusing the existing token encryption. It never overwrites a
   * payment method that changed after the attempt opened (updated or created at
   * or after the attempt's creation): that token is discarded. Best-effort,
   * never throws.
   */
  private async storeRecoveredCard(params: {
    firebaseId: string;
    subscriptionId: number;
    attempt: BillingAttempt;
    card: CardDetails & { token: string };
  }): Promise<
    { stored: true } | { stored: false; reason: HostedTokenRecoveryReason }
  > {
    const { firebaseId, subscriptionId, attempt, card } = params;
    let encryptedToken: string;
    try {
      encryptedToken = encryptCardcomToken(card.token);
    } catch {
      return { stored: false, reason: 'ENCRYPTION_FAILED' };
    }
    const unavailable = {
      stored: false as const,
      reason: 'PAYMENT_METHOD_UNAVAILABLE' as const,
    };
    try {
      return await this.dataSource.transaction(async (manager) => {
        const subscription = await manager.findOne(Subscription, {
          where: { id: subscriptionId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!subscription || subscription.firebaseId !== firebaseId) {
          return unavailable;
        }
        if (subscription.paymentMethodId != null) {
          const paymentMethod = await manager.findOne(PaymentMethod, {
            where: { id: subscription.paymentMethodId },
          });
          if (!paymentMethod || paymentMethod.firebaseId !== firebaseId) {
            return unavailable;
          }
          if (
            !attempt.createdAt ||
            !paymentMethod.updatedAt ||
            paymentMethod.updatedAt.getTime() >= attempt.createdAt.getTime()
          ) {
            return {
              stored: false as const,
              reason: 'PAYMENT_METHOD_NEWER' as const,
            };
          }
          paymentMethod.cardcomToken = encryptedToken;
          paymentMethod.last4 = card.last4;
          paymentMethod.cardBrand = card.brand;
          paymentMethod.cardExpiryMonth = card.expiryMonth;
          paymentMethod.cardExpiryYear = card.expiryYear;
          await manager.save(PaymentMethod, paymentMethod);
        } else {
          const created = await manager.save(
            PaymentMethod,
            manager.create(PaymentMethod, {
              firebaseId,
              cardcomToken: encryptedToken,
              last4: card.last4,
              cardBrand: card.brand,
              cardExpiryMonth: card.expiryMonth,
              cardExpiryYear: card.expiryYear,
            }),
          );
          await manager.update(Subscription, subscription.id, {
            paymentMethodId: created.id,
          });
        }
        return { stored: true as const };
      });
    } catch {
      return { stored: false, reason: 'STORE_FAILED' };
    }
  }

  private async createReceipt(params: {
    firebaseId: string;
    subscriptionId: number;
    attempt: BillingAttempt;
  }): Promise<{ receiptDocId: number }> {
    const { firebaseId, subscriptionId, attempt } = params;
    // Read after activation: the receipt period is the activated period.
    const subscription = await this.subscriptionRepo.findOne({
      where: { id: subscriptionId },
    });
    if (
      !subscription ||
      subscription.firebaseId !== firebaseId ||
      !subscription.currentPeriodStart ||
      !subscription.currentPeriodEnd
    ) {
      throw new Error('Subscription is not activated for the captured attempt');
    }
    const plan = await this.planRepo.findOne({ where: { id: attempt.planId } });
    if (!plan) throw new Error('Plan for the captured attempt not found');
    const issuer = await this.billingIssuerConfigService.getKeepintaxIssuer();
    return this.billingReceiptService.ensureReceiptForCapturedAttempt({
      issuer,
      eventType: BillingEventType.PAYMENT_SUCCESS,
      attempt: {
        id: attempt.id,
        amountAgorot: attempt.amountAgorot,
        amountBeforeVatAgorot: attempt.amountBeforeVatAgorot,
        vatAmountAgorot: attempt.vatAmountAgorot,
        currency: attempt.currency,
        cardcomTransactionId: attempt.cardcomTransactionId,
      },
      firebaseId,
      subscriptionId,
      planName: plan.name,
      periodStart: subscription.currentPeriodStart,
      periodEnd: subscription.currentPeriodEnd,
      eventMetadata: { planId: attempt.planId },
    });
  }
}
