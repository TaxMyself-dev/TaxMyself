import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThanOrEqual, QueryRunner, Repository } from 'typeorm';
import { decryptCardcomToken } from '../utils/billing-token-encryption.util';

import { Subscription } from '../entities/subscription.entity';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { PaymentMethod } from '../entities/payment-method.entity';

import {
  BillingAttemptStatus,
  BillingEventType,
  BillingObligationStatus,
  SubscriptionStatus,
} from '../enums/billing.enums';
import { ModuleName } from 'src/enum';
import {
  CardcomService,
  CardcomApiError,
  CardcomTransactionInfo,
} from './cardcom.service';
import { BillingEventService } from './billing-event.service';
import { BillingReceiptService } from './billing-receipt.service';
import { BillingIssuerConfigService } from './billing-issuer-config.service';
import { PricingService } from './pricing.service';
import { BillingLifecycleService } from './billing-lifecycle.service';
import { BillingHostedCompletionService } from './billing-hosted-completion.service';
import { BillingAttempt } from '../entities/billing-attempt.entity';
import { NormalizedChargeOutcome } from './billing-attempt-orchestration.service';

/** Total charge attempts allowed per billing cycle before moving to PAST_DUE. */
const MAX_RENEWAL_ATTEMPTS = 3;
/** Days to wait before the next attempt, indexed by (attemptNumber - 1) for attempts 1 and 2. */
const RETRY_DELAYS_DAYS = [3, 7];
/** Grace period length once a subscription becomes PAST_DUE. */
const GRACE_PERIOD_DAYS = 14;
/** Bounded concurrency for the daily batch — avoids hammering CardCom/DB. */
const BATCH_SIZE = 10;

export type RenewalOutcome =
  | 'success'
  | 'retry_scheduled'
  | 'past_due'
  | 'skipped'
  | 'blocked_pending_receipt'
  | 'error';

export interface RenewalResult {
  subscriptionId: number;
  outcome: RenewalOutcome;
  attemptNumber?: number;
  billingPeriod?: string;
  cardcomResponseCode?: number;
  nextBillingDate?: Date | null;
  message?: string;
}

export interface RenewalBatchResult {
  totalDue: number;
  processed: number;
  succeeded: number;
  retryScheduled: number;
  pastDue: number;
  skipped: number;
  blockedPendingReceipt: number;
  errors: number;
  results: RenewalResult[];
}

@Injectable()
export class SubscriptionRenewalService {
  private readonly logger = new Logger(SubscriptionRenewalService.name);

  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptionRepo: Repository<Subscription>,
    private readonly cardcomService: CardcomService,
    private readonly billingEventService: BillingEventService,
    private readonly billingReceiptService: BillingReceiptService,
    private readonly billingIssuerConfigService: BillingIssuerConfigService,
    private readonly pricingService: PricingService,
    private readonly billingLifecycleService: BillingLifecycleService,
    private readonly dataSource: DataSource,
    private readonly hostedCompletion: BillingHostedCompletionService,
  ) {}

  // ─── Cron entry point ───────────────────────────────────────────────────────

  /**
   * Daily renewal sweep. Runs once at 03:00 Asia/Jerusalem.
   * Deliberately daily (not hourly/monthly): the WHERE clause uses
   * `nextBillingDate <= NOW()` rather than an exact-date match, so a subscription
   * due on a day the server/job was down is picked up on the next run instead of
   * being skipped — without re-scanning the table more often than necessary.
   *
   * Thin wrapper — all batch logic lives in processDueRenewals() so the admin
   * manual "run cron now" endpoint exercises the exact same code path.
   */
  @Cron('0 3 * * *', {
    name: 'subscriptionRenewalCron',
    timeZone: 'Asia/Jerusalem',
  })
  async runDailyRenewalCron(): Promise<void> {
    this.logger.log('Subscription renewal cron starting');
    const summary = await this.processDueRenewals();
    this.logger.log(
      `Subscription renewal cron complete: totalDue=${summary.totalDue} ` +
        `succeeded=${summary.succeeded} retryScheduled=${summary.retryScheduled} ` +
        `pastDue=${summary.pastDue} skipped=${summary.skipped} errors=${summary.errors}`,
    );
  }

  // ─── Batch processing ────────────────────────────────────────────────────────

  /**
   * Finds all subscriptions due for renewal (status=ACTIVE AND nextBillingDate<=NOW())
   * and processes them in bounded-concurrency batches. Never throws — every
   * subscription is handled independently via processSubscriptionById, which
   * catches its own errors.
   *
   * Public so it can be called from both the daily cron and the admin manual
   * "run cron now" endpoint — there is exactly one implementation of the batch
   * logic, no idempotency/retry/charge behavior is duplicated or bypassed.
   */
  async processDueRenewals(): Promise<RenewalBatchResult> {
    const due = await this.subscriptionRepo.find({
      where: {
        status: SubscriptionStatus.ACTIVE,
        nextBillingDate: LessThanOrEqual(new Date()),
      },
      select: ['id'],
    });

    const results: RenewalResult[] = [];
    let succeeded = 0;
    let retryScheduled = 0;
    let pastDue = 0;
    let skipped = 0;
    let blockedPendingReceipt = 0;
    let errors = 0;

    for (let i = 0; i < due.length; i += BATCH_SIZE) {
      const batch = due.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map((s) => this.processSubscriptionById(s.id)),
      );
      for (const r of batchResults) {
        results.push(r);
        switch (r.outcome) {
          case 'success':
            succeeded++;
            break;
          case 'retry_scheduled':
            retryScheduled++;
            break;
          case 'past_due':
            pastDue++;
            break;
          case 'skipped':
            skipped++;
            break;
          case 'blocked_pending_receipt':
            blockedPendingReceipt++;
            break;
          case 'error':
            errors++;
            break;
        }
      }
    }

    // Local-only recovery of hosted payments already captured but never
    // completed (activation or receipt/link failed, no webhook re-delivered).
    // Runs on the same schedule and manual trigger as renewals, never calls
    // CardCom, and cannot fail the batch.
    try {
      const recovery =
        await this.hostedCompletion.recoverCapturedHostedAttempts();
      if (recovery.found > 0) {
        this.logger.log(
          `Captured hosted payment recovery: found=${recovery.found} completed=${recovery.completed} pending=${recovery.pending}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Captured hosted payment recovery failed: ${
          (error as Error)?.message ?? 'unknown error'
        }`,
      );
    }

    return {
      totalDue: due.length,
      processed: results.length,
      succeeded,
      retryScheduled,
      pastDue,
      skipped,
      blockedPendingReceipt,
      errors,
      results,
    };
  }

  // ─── Single-subscription processing (used by cron and the admin manual trigger) ──

  /**
   * Processes renewal for one subscription. Safe to call repeatedly/concurrently
   * with itself or the batch cron — the row lock + idempotency check make a
   * second concurrent call for the same subscription a no-op.
   * Never throws.
   */
  async processSubscriptionById(
    subscriptionId: number,
  ): Promise<RenewalResult> {
    try {
      return await this.chargeSubscription(subscriptionId);
    } catch (err) {
      this.logger.error(
        `Unhandled error processing renewal for subscription #${subscriptionId}: ${
          (err as Error).message
        }`,
        (err as Error).stack,
      );
      return {
        subscriptionId,
        outcome: 'error',
        message: (err as Error).message,
      };
    }
  }

  // ─── Core transactional charge flow ──────────────────────────────────────────

  private async chargeSubscription(
    subscriptionId: number,
  ): Promise<RenewalResult> {
    return this.chargeSubscriptionCanonical(subscriptionId);
  }

  /** Canonical renewal path. The legacy implementation remains below only as
   * a comparison aid during rollout; all callers enter this method. */
  private async chargeSubscriptionCanonical(
    subscriptionId: number,
  ): Promise<RenewalResult> {
    const subscription = await this.subscriptionRepo.findOne({
      where: { id: subscriptionId },
    });
    if (
      !subscription ||
      subscription.status !== SubscriptionStatus.ACTIVE ||
      !subscription.nextBillingDate
    ) {
      return {
        subscriptionId,
        outcome: 'skipped',
        message: 'Subscription is not due for canonical renewal',
      };
    }
    // Once a period is completed nextBillingDate moves forward, so a repeated
    // invocation (admin manual trigger, racing run) must be a no-op rather than
    // opening — and charging — the next period early.
    if (subscription.nextBillingDate > new Date()) {
      return {
        subscriptionId,
        outcome: 'skipped',
        message: 'Subscription is not due for renewal yet',
      };
    }
    const periodStart = subscription.nextBillingDate;
    const periodEnd = this.addOneMonth(periodStart);
    const periodStartDate = periodStart.toISOString().slice(0, 10);
    const actor = {
      actorFirebaseId: subscription.firebaseId,
      subjectFirebaseId: subscription.firebaseId,
    };
    const billingPeriod = this.formatBillingPeriod(periodStart);

    // A period that is already CAPTURED (post-capture work pending) or settled
    // must never be re-priced or re-charged: a fresh price may have drifted
    // from what was captured. Its canonical debt snapshot is authoritative.
    const existing = await this.billingLifecycleService.inspectPeriod(
      actor,
      subscriptionId,
      periodStartDate,
    );
    const settledOrCaptured =
      !!existing &&
      (existing.obligation.status === BillingObligationStatus.SATISFIED ||
        existing.attempt?.status === BillingAttemptStatus.CAPTURED);

    const planId = settledOrCaptured
      ? existing.obligation.planId
      : subscription.planId;
    const plan = planId
      ? await this.subscriptionRepo.manager.findOne(SubscriptionPlan, {
          where: { id: planId },
        })
      : null;
    if (!plan)
      return {
        subscriptionId,
        outcome: 'error',
        message: 'Subscription has no plan assigned',
      };
    const pricing = settledOrCaptured
      ? {
          finalAmountAgorot: existing.obligation.amountAgorot,
          amountBeforeVatAgorot: existing.obligation.amountBeforeVatAgorot,
          vatAmountAgorot: existing.obligation.vatAmountAgorot,
        }
      : await this.pricingService.calculateCheckoutPrice(
          subscription.firebaseId,
          plan.id,
        );
    const result = await this.billingLifecycleService.executeRenewal(
      {
        actor,
        subscriptionId,
        planId: plan.id,
        periodStart: periodStartDate,
        periodEnd: periodEnd.toISOString().slice(0, 10),
        amountAgorot: pricing.finalAmountAgorot,
        amountBeforeVatAgorot: pricing.amountBeforeVatAgorot,
        vatAmountAgorot: pricing.vatAmountAgorot,
        currency: 'ILS',
      },
      {
        createReceipt: (attempt, outcome) =>
          this.createCanonicalRenewalReceipt(
            subscription,
            plan,
            periodStart,
            periodEnd,
            billingPeriod,
            attempt as BillingAttempt,
            outcome,
          ),
      },
      `renewal-${subscriptionId}-${billingPeriod}`,
    );

    if (
      result.submitted &&
      (result.submitted.kind !== 'APPLIED' ||
        result.submitted.outcome?.kind !== 'CAPTURED')
    ) {
      const nonCapture = result.submitted.outcome;
      return {
        subscriptionId,
        outcome: nonCapture?.kind === 'UNKNOWN' ? 'error' : 'retry_scheduled',
        billingPeriod,
        message:
          nonCapture && 'failureCategory' in nonCapture
            ? nonCapture.failureCategory ?? undefined
            : undefined,
      };
    }
    if (result.resume?.status === 'LEASE_HELD')
      return {
        subscriptionId,
        outcome: 'skipped',
        billingPeriod,
        message: 'Post-capture completion is already in progress',
      };
    if (result.resume?.status === 'NOT_CAPTURED')
      return {
        subscriptionId,
        outcome: 'skipped',
        billingPeriod,
        message: 'Attempt is no longer awaiting post-capture completion',
      };
    if (result.resume?.status === 'RECEIPT_PENDING') {
      // The charge was captured and stays CAPTURED (never re-submitted); the
      // next run resumes only this phase. Sanitized category only — no
      // provider, token or payment detail is persisted or returned.
      await this.billingEventService.logReceiptFailureOncePerAttempt({
        firebaseId: subscription.firebaseId,
        subscriptionId,
        billingAttemptId: result.resume.attempt.id,
        metadata: {
          billingPeriod,
          attemptId: result.resume.attempt.id,
          cardcomDealNumber: result.resume.attempt.cardcomTransactionId,
          phase: 'POST_CAPTURE_RECOVERY',
          failureCategory: result.resume.failureCategory,
        },
      });
      return {
        subscriptionId,
        outcome: 'blocked_pending_receipt',
        billingPeriod,
        message: 'Payment captured; receipt/finalization is pending retry',
      };
    }
    if (!result.finalized)
      return {
        subscriptionId,
        outcome: 'error',
        billingPeriod,
        message: 'Receipt finalization did not complete',
      };

    // Compare-and-set on the still-due nextBillingDate so the period advances
    // exactly once even if two runs both reach this point.
    const advanced = await this.subscriptionRepo.update(
      {
        id: subscriptionId,
        status: SubscriptionStatus.ACTIVE,
        nextBillingDate: periodStart,
      },
      {
        status: SubscriptionStatus.ACTIVE,
        renewalAttempts: 0,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        nextBillingDate: periodEnd,
        gracePeriodEndsAt: null,
      },
    );
    if (!advanced.affected)
      return {
        subscriptionId,
        outcome: 'skipped',
        billingPeriod,
        message: 'Subscription period was already advanced',
      };
    return {
      subscriptionId,
      outcome: 'success',
      billingPeriod,
      cardcomResponseCode: 0,
      nextBillingDate: periodEnd,
    };
  }

  /**
   * Idempotent per attempt: the success event, the receipt document (and its
   * journal entry), the PDFs and the email are each created at most once, so
   * this can be called again for the same CAPTURED attempt after any partial
   * failure. Amounts come from the attempt's own immutable snapshot — what was
   * actually charged — never from a fresh price.
   */
  private async createCanonicalRenewalReceipt(
    subscription: Subscription,
    plan: SubscriptionPlan,
    periodStart: Date,
    periodEnd: Date,
    billingPeriod: string,
    attempt: BillingAttempt,
    outcome: NormalizedChargeOutcome,
  ): Promise<{ receiptDocId: number }> {
    const issuer = await this.billingIssuerConfigService.getKeepintaxIssuer();
    return this.billingReceiptService.ensureReceiptForCapturedAttempt({
      issuer,
      eventType: BillingEventType.RENEWAL_SUCCESS,
      attempt: {
        id: attempt.id,
        amountAgorot: attempt.amountAgorot,
        amountBeforeVatAgorot: attempt.amountBeforeVatAgorot,
        vatAmountAgorot: attempt.vatAmountAgorot,
        currency: attempt.currency,
        cardcomTransactionId:
          outcome.kind === 'CAPTURED'
            ? outcome.cardcomTransactionId
            : attempt.cardcomTransactionId,
      },
      firebaseId: subscription.firebaseId,
      subscriptionId: subscription.id,
      planName: plan.name,
      periodStart,
      periodEnd,
      eventMetadata: { billingPeriod },
    });
  }

  private async chargeSubscriptionLegacy(
    subscriptionId: number,
  ): Promise<RenewalResult> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    // Captured inside the transaction, used for post-commit event logging / receipts.
    let postCommit:
      | {
          outcome: 'success';
          subscriptionId: number;
          firebaseId: string;
          planName: string;
          planModules: ModuleName[];
          billingPeriod: string;
          idempotencyKey: string;
          attemptNumber: number;
          cardcomDealNumber: string | null;
          chargedAmountAgorot: number;
          amountBeforeVatAgorot: number;
          vatAmountAgorot: number;
          currentPeriodStart: Date;
          currentPeriodEnd: Date;
          rawResponse: Record<string, any>;
          approvalNumber: string | null;
          last4: string | null;
          cardMonth: number | null;
          cardYear: number | null;
        }
      | {
          outcome: 'retry_scheduled' | 'past_due';
          firebaseId: string;
          billingPeriod: string;
          idempotencyKey: string;
          attemptNumber: number;
          cardcomResponseCode: number | null;
          cardcomDescription: string | null;
          retryScheduledFor: Date | null;
          rawResponse: Record<string, any> | null;
        }
      | null = null;

    let result: RenewalResult;

    try {
      // ── 1. Reload + lock the subscription row ──────────────────────────────
      const subscription = await qr.manager.findOne(Subscription, {
        where: { id: subscriptionId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!subscription) {
        await qr.rollbackTransaction();
        return {
          subscriptionId,
          outcome: 'skipped',
          message: 'Subscription not found',
        };
      }

      const now = new Date();

      // ── 2. Re-verify it's still due (guards against a race since the cron's SELECT) ──
      if (
        subscription.status !== SubscriptionStatus.ACTIVE ||
        !subscription.nextBillingDate ||
        subscription.nextBillingDate > now
      ) {
        await qr.rollbackTransaction();
        return {
          subscriptionId,
          outcome: 'skipped',
          message: `Not due — status=${subscription.status} nextBillingDate=${
            subscription.nextBillingDate?.toISOString() ?? 'null'
          }`,
        };
      }

      const previousNextBillingDate = subscription.nextBillingDate;
      const billingPeriod = this.formatBillingPeriod(previousNextBillingDate);
      const idempotencyKey = `renewal:${subscription.id}:${billingPeriod}`;
      const attemptNumber = subscription.renewalAttempts + 1;

      // ── 2b. Refuse to charge again while a prior successful charge still has
      // no receipt — surfacing that failure for manual resolution takes
      // priority over collecting more money the customer can't be invoiced for.
      const unresolvedFailure =
        await this.billingEventService.getUnresolvedReceiptFailure(
          subscription.id,
        );
      if (unresolvedFailure) {
        await qr.rollbackTransaction();
        this.logger.warn(
          `Subscription #${subscriptionId} renewal blocked — unresolved receipt failure on ` +
            `billing_event #${unresolvedFailure.id}. Resolve via admin before charging again.`,
        );
        return {
          subscriptionId,
          outcome: 'blocked_pending_receipt',
          message: `Prior charge (billing_event #${unresolvedFailure.id}) has no receipt yet`,
        };
      }

      // ── 3. Local idempotency: already charged for this period? ─────────────
      const alreadySucceeded =
        await this.billingEventService.hasSuccessfulRenewal(
          qr.manager,
          subscription.id,
          idempotencyKey,
        );
      if (alreadySucceeded) {
        await qr.rollbackTransaction();
        this.logger.warn(
          `Subscription #${subscriptionId} already has a RENEWAL_SUCCESS for ${idempotencyKey} ` +
            `but is still due — likely nextBillingDate wasn't advanced after a prior crash. Skipping charge.`,
        );
        return {
          subscriptionId,
          outcome: 'skipped',
          billingPeriod,
          message:
            'Already renewed for this billing period (idempotency key match)',
        };
      }

      // ── 4. Load payment method + plan, decrypt token, compute amount ───────
      const paymentMethod = subscription.paymentMethodId
        ? await qr.manager.findOne(PaymentMethod, {
            where: { id: subscription.paymentMethodId },
          })
        : null;

      const plan = subscription.planId
        ? await qr.manager.findOne(SubscriptionPlan, {
            where: { id: subscription.planId },
          })
        : null;

      if (!paymentMethod || !plan) {
        const reason = !paymentMethod
          ? 'No payment method on file'
          : 'Subscription has no plan assigned';
        return await this.handleFailure(qr, subscription, {
          attemptNumber,
          billingPeriod,
          idempotencyKey,
          cardcomResponseCode: null,
          cardcomDescription: reason,
          rawResponse: null,
        });
      }

      let cardExpirationMMYY: string;
      try {
        cardExpirationMMYY = this.buildCardExpirationMMYY(
          paymentMethod.cardExpiryMonth,
          paymentMethod.cardExpiryYear,
        );
      } catch (err) {
        return await this.handleFailure(qr, subscription, {
          attemptNumber,
          billingPeriod,
          idempotencyKey,
          cardcomResponseCode: null,
          cardcomDescription: (err as Error).message,
          rawResponse: null,
        });
      }

      const decryptedToken = decryptCardcomToken(paymentMethod.cardcomToken);

      const pricing = await this.pricingService.calculateCheckoutPrice(
        subscription.firebaseId,
        plan.id,
      );

      // ── 5. Charge CardCom (still inside the lock — see service-level note) ──
      let chargeResponse: CardcomTransactionInfo;
      try {
        chargeResponse = await this.cardcomService.chargeByToken({
          token: decryptedToken,
          cardExpirationMMYY,
          amountAgorot: pricing.finalAmountAgorot,
          externalUniqTranId: idempotencyKey,
        });
      } catch (err) {
        // Transport-level failure (no response from CardCom at all) — treat as a failed attempt.
        const message =
          err instanceof CardcomApiError ? err.message : (err as Error).message;
        return await this.handleFailure(qr, subscription, {
          attemptNumber,
          billingPeriod,
          idempotencyKey,
          cardcomResponseCode: null,
          cardcomDescription: message,
          rawResponse: null,
        });
      }

      const success = (chargeResponse.ResponseCode ?? -1) === 0;

      if (!success) {
        return await this.handleFailure(qr, subscription, {
          attemptNumber,
          billingPeriod,
          idempotencyKey,
          cardcomResponseCode: chargeResponse.ResponseCode ?? null,
          cardcomDescription: chargeResponse.Description ?? null,
          rawResponse: chargeResponse,
        });
      }

      // ── 6. Success — advance the period from the PREVIOUS nextBillingDate ──
      // (not from `now`) so a late cron run never causes date drift.
      const currentPeriodEnd = this.addOneMonth(previousNextBillingDate);

      await qr.manager.update(Subscription, subscription.id, {
        status: SubscriptionStatus.ACTIVE,
        renewalAttempts: 0,
        currentPeriodStart: previousNextBillingDate,
        currentPeriodEnd,
        nextBillingDate: currentPeriodEnd,
        gracePeriodEndsAt: null,
      });

      await qr.commitTransaction();

      const cardcomDealNumber =
        chargeResponse.TranzactionId != null
          ? String(chargeResponse.TranzactionId)
          : null;
      const last4 =
        chargeResponse.Last4CardDigitsString ??
        (chargeResponse.Last4CardDigits != null
          ? String(chargeResponse.Last4CardDigits).padStart(4, '0')
          : null);

      postCommit = {
        outcome: 'success',
        subscriptionId: subscription.id,
        firebaseId: subscription.firebaseId,
        planName: plan.name,
        planModules: (plan.modules ??
          Object.values(ModuleName)) as ModuleName[],
        billingPeriod,
        idempotencyKey,
        attemptNumber,
        cardcomDealNumber,
        chargedAmountAgorot: pricing.finalAmountAgorot,
        amountBeforeVatAgorot: pricing.amountBeforeVatAgorot,
        vatAmountAgorot: pricing.vatAmountAgorot,
        currentPeriodStart: previousNextBillingDate,
        currentPeriodEnd,
        rawResponse: chargeResponse,
        approvalNumber: chargeResponse.ApprovalNumber ?? null,
        last4,
        cardMonth:
          chargeResponse.CardMonth ?? paymentMethod.cardExpiryMonth ?? null,
        cardYear:
          chargeResponse.CardYear ?? paymentMethod.cardExpiryYear ?? null,
      };

      result = {
        subscriptionId,
        outcome: 'success',
        attemptNumber,
        billingPeriod,
        cardcomResponseCode: 0,
        nextBillingDate: currentPeriodEnd,
      };
    } catch (err) {
      await qr.rollbackTransaction();
      this.logger.error(
        `Renewal transaction failed for subscription #${subscriptionId}: ${
          (err as Error).message
        }`,
        (err as Error).stack,
      );
      return {
        subscriptionId,
        outcome: 'error',
        message: (err as Error).message,
      };
    } finally {
      await qr.release();
    }

    // ── Post-commit: billing events, receipt (never affects the charge) ──
    if (postCommit?.outcome === 'success') {
      await this.afterRenewalSuccess(postCommit);
    }

    return result!;
  }

  /**
   * Shared failure path for both pre-charge defensive failures (no payment method,
   * bad expiry) and real CardCom declines/transport errors. Increments
   * renewalAttempts, decides retry vs. PAST_DUE, updates the row, and commits —
   * all still inside the caller's transaction/lock.
   */
  private async handleFailure(
    qr: QueryRunner,
    subscription: Subscription,
    failure: {
      attemptNumber: number;
      billingPeriod: string;
      idempotencyKey: string;
      cardcomResponseCode: number | null;
      cardcomDescription: string | null;
      rawResponse: Record<string, any> | null;
    },
  ): Promise<RenewalResult> {
    const {
      attemptNumber,
      billingPeriod,
      idempotencyKey,
      cardcomResponseCode,
      cardcomDescription,
      rawResponse,
    } = failure;
    const now = new Date();
    const isFinalAttempt = attemptNumber >= MAX_RENEWAL_ATTEMPTS;

    let retryScheduledFor: Date | null = null;
    let outcome: 'retry_scheduled' | 'past_due';

    if (!isFinalAttempt) {
      const delayDays = RETRY_DELAYS_DAYS[attemptNumber - 1];
      retryScheduledFor = new Date(now);
      retryScheduledFor.setDate(retryScheduledFor.getDate() + delayDays);
      outcome = 'retry_scheduled';

      await qr.manager.update(Subscription, subscription.id, {
        renewalAttempts: attemptNumber,
        nextBillingDate: retryScheduledFor,
      });
    } else {
      const gracePeriodEndsAt = new Date(now);
      gracePeriodEndsAt.setDate(
        gracePeriodEndsAt.getDate() + GRACE_PERIOD_DAYS,
      );
      outcome = 'past_due';

      await qr.manager.update(Subscription, subscription.id, {
        renewalAttempts: attemptNumber,
        status: SubscriptionStatus.PAST_DUE,
        gracePeriodEndsAt,
      });
    }

    await qr.commitTransaction();

    // Log after commit (consistent with the webhook flow's pattern).
    await this.billingEventService.logEvent({
      firebaseId: subscription.firebaseId,
      eventType:
        outcome === 'retry_scheduled'
          ? BillingEventType.RETRY_SCHEDULED
          : BillingEventType.RENEWAL_FAILED,
      subscriptionId: subscription.id,
      metadata: this.buildFailureMetadata({
        idempotencyKey,
        billingPeriod,
        attemptNumber,
        cardcomResponseCode,
        cardcomDescription,
        retryScheduledFor,
        rawResponse,
      }),
    });

    this.logger.warn(
      `Renewal ${
        outcome === 'past_due' ? 'FAILED (final)' : 'failed, retry scheduled'
      }: ` +
        `subscriptionId=${subscription.id} billingPeriod=${billingPeriod} attempt=${attemptNumber}/${MAX_RENEWAL_ATTEMPTS} ` +
        `cardcomResponseCode=${cardcomResponseCode ?? 'n/a'} ` +
        `nextAction=${
          outcome === 'past_due'
            ? 'PAST_DUE'
            : `retry@${retryScheduledFor?.toISOString()}`
        }`,
    );

    return {
      subscriptionId: subscription.id,
      outcome,
      attemptNumber,
      billingPeriod,
      cardcomResponseCode: cardcomResponseCode ?? undefined,
      nextBillingDate: retryScheduledFor,
    };
  }

  // ─── Post-success: billing event, receipt ────────────────────────────────────

  private async afterRenewalSuccess(data: {
    subscriptionId: number;
    firebaseId: string;
    planName: string;
    planModules: ModuleName[];
    billingPeriod: string;
    idempotencyKey: string;
    attemptNumber: number;
    cardcomDealNumber: string | null;
    chargedAmountAgorot: number;
    amountBeforeVatAgorot: number;
    vatAmountAgorot: number;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    rawResponse: Record<string, any>;
    approvalNumber: string | null;
    last4: string | null;
    cardMonth: number | null;
    cardYear: number | null;
  }): Promise<void> {
    const {
      subscriptionId,
      firebaseId,
      planName,
      planModules,
      billingPeriod,
      idempotencyKey,
      attemptNumber,
      cardcomDealNumber,
      chargedAmountAgorot,
      amountBeforeVatAgorot,
      vatAmountAgorot,
      currentPeriodStart,
      currentPeriodEnd,
      rawResponse,
      approvalNumber,
      last4,
      cardMonth,
      cardYear,
    } = data;

    const renewalSuccessEvent = await this.billingEventService.logEvent({
      firebaseId,
      eventType: BillingEventType.RENEWAL_SUCCESS,
      subscriptionId: subscriptionId,
      amountAgorot: chargedAmountAgorot,
      amountBeforeVatAgorot,
      vatAmountAgorot,
      currency: 'ILS',
      cardcomDealNumber,
      metadata: {
        idempotencyKey,
        billingPeriod,
        attemptNumber,
        maxAttempts: MAX_RENEWAL_ATTEMPTS,
        cardcomResponseCode: 0,
        cardcomDescription: rawResponse.Description ?? null,
        cardcomTransactionId: cardcomDealNumber,
        approvalNumber,
        last4,
        cardMonth,
        cardYear,
        retryScheduledFor: null,
        rawCardcomResponse: this.sanitizeRawResponse(rawResponse),
      },
    });

    this.logger.log(
      `Renewal SUCCESS: subscriptionId=${subscriptionId} firebaseId=${firebaseId.substring(
        0,
        8,
      )}... ` +
        `billingPeriod=${billingPeriod} attempt=${attemptNumber}/${MAX_RENEWAL_ATTEMPTS} ` +
        `dealNumber=${
          cardcomDealNumber ?? 'n/a'
        } nextBillingDate=${currentPeriodEnd.toISOString()}`,
    );

    // Reuse the existing receipt generation flow (same three BillingReceiptService
    // calls the webhook uses after a successful checkout payment).
    if (renewalSuccessEvent) {
      await this.generateReceiptAfterRenewal({
        firebaseId,
        subscriptionId,
        planName,
        amountBeforeVatAgorot,
        vatAmountAgorot,
        amountIncludingVatAgorot: chargedAmountAgorot,
        periodStart: currentPeriodStart,
        periodEnd: currentPeriodEnd,
        cardcomDealNumber,
        renewalSuccessEvent,
      });
    }
  }

  private async generateReceiptAfterRenewal(params: {
    firebaseId: string;
    subscriptionId: number;
    planName: string;
    amountBeforeVatAgorot: number;
    vatAmountAgorot: number;
    amountIncludingVatAgorot: number;
    periodStart: Date;
    periodEnd: Date;
    cardcomDealNumber: string | null;
    renewalSuccessEvent: { id: number };
  }): Promise<void> {
    const {
      firebaseId,
      subscriptionId,
      planName,
      amountBeforeVatAgorot,
      vatAmountAgorot,
      amountIncludingVatAgorot,
      periodStart,
      periodEnd,
      cardcomDealNumber,
      renewalSuccessEvent,
    } = params;

    try {
      const issuer = await this.billingIssuerConfigService.getKeepintaxIssuer();

      const receipt = await this.billingReceiptService.createReceiptForPayment(
        issuer,
        {
          firebaseId,
          subscriptionId,
          amountBeforeVatAgorot,
          vatAmountAgorot,
          amountIncludingVatAgorot,
          planName,
          periodStart,
          periodEnd,
          cardcomDealNumber,
        },
      );

      await this.billingEventService.updatePaymentEventWithReceipt(
        renewalSuccessEvent.id,
        receipt.receiptDocId,
      );

      await this.billingReceiptService.finalizeBillingReceiptPdfs(
        receipt.receiptDocId,
        issuer,
        firebaseId,
      );
      await this.billingReceiptService.sendReceiptEmailForPaymentEvent(
        renewalSuccessEvent.id,
        issuer.issuerName,
      );

      this.logger.log(
        `Renewal receipt complete: receiptDocId=${receipt.receiptDocId} docNumber=${receipt.docNumber} ` +
          `subscriptionId=${subscriptionId} dealNumber=${
            cardcomDealNumber ?? 'null'
          }`,
      );
    } catch (err) {
      this.logger.error(
        `Renewal receipt generation failed for subscriptionId=${subscriptionId}: ${
          (err as Error).message
        }`,
        (err as Error).stack,
      );
      await this.billingEventService.logEvent({
        firebaseId,
        eventType: BillingEventType.RECEIPT_FAILED,
        subscriptionId,
        metadata: { error: (err as Error).message, cardcomDealNumber },
      });
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private buildFailureMetadata(params: {
    idempotencyKey: string;
    billingPeriod: string;
    attemptNumber: number;
    cardcomResponseCode: number | null;
    cardcomDescription: string | null;
    retryScheduledFor: Date | null;
    rawResponse: Record<string, any> | null;
  }): Record<string, any> {
    return {
      idempotencyKey: params.idempotencyKey,
      billingPeriod: params.billingPeriod,
      attemptNumber: params.attemptNumber,
      maxAttempts: MAX_RENEWAL_ATTEMPTS,
      cardcomResponseCode: params.cardcomResponseCode,
      cardcomDescription: params.cardcomDescription,
      cardcomTransactionId:
        params.rawResponse?.TranzactionId != null
          ? String(params.rawResponse.TranzactionId)
          : null,
      retryScheduledFor: params.retryScheduledFor?.toISOString() ?? null,
      rawCardcomResponse: params.rawResponse
        ? this.sanitizeRawResponse(params.rawResponse)
        : null,
    };
  }

  /** Strips any field that could carry a token/secret before storing in BillingEvent.metadata. */
  private sanitizeRawResponse(raw: Record<string, any>): Record<string, any> {
    const { Token, ...safe } = raw;
    return safe;
  }

  private formatBillingPeriod(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }

  private addOneMonth(date: Date): Date {
    const result = new Date(date);
    result.setMonth(result.getMonth() + 1);
    return result;
  }

  /** month=12,year=2026 → "1226". Works whether the stored year is 2 or 4 digits. */
  private buildCardExpirationMMYY(
    month: number | null,
    year: number | null,
  ): string {
    if (!month || !year) {
      throw new Error('Payment method missing card expiry month/year');
    }
    const mm = String(month).padStart(2, '0');
    const yy = String(year % 100).padStart(2, '0');
    return `${mm}${yy}`;
  }
}
