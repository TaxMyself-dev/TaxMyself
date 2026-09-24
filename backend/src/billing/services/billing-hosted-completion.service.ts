import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { BillingAttempt } from '../entities/billing-attempt.entity';
import { Subscription } from '../entities/subscription.entity';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { BillingEventType, SubscriptionStatus } from '../enums/billing.enums';
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
 * retryable without another provider call or hosted checkout:
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
   * Same fields the webhook activation writes, but WITHOUT the card token — the
   * verified token exists only in the provider's result, which recovery must not
   * fetch. Under a row lock, so concurrent runs serialize and the second sees an
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
        gracePeriodEndsAt: null,
        canceledAt: null,
        endedAt: null,
      });
      return true;
    });

    if (activated) {
      await this.billingEventService.logEvent({
        firebaseId,
        eventType: BillingEventType.SUBSCRIPTION_ACTIVATED,
        subscriptionId,
        billingAttemptId: attempt.id,
        metadata: {
          planId: attempt.planId,
          recoveredLocally: true,
          // The hosted result's card token is not available locally.
          cardTokenStored: false,
        },
      });
      this.logger.log(
        `Recovered subscription #${subscriptionId} activation for captured attempt #${attempt.id}`,
      );
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
