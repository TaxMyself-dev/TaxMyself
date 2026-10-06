import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import {
  DataSource,
  EntityManager,
  In,
  IsNull,
  LessThanOrEqual,
  Not,
  Or,
  QueryRunner,
} from 'typeorm';
import {
  BillingAccessMode,
  BillingAttemptStatus,
  BillingAttemptTrigger,
  BillingChargeMode,
  BillingObligationKind,
  BillingObligationStatus,
  SubscriptionStatus,
} from '../enums/billing.enums';
import {
  decideRenewalDecline,
  renewalGracePeriodEnd,
  renewalPeriodStart,
} from '../domain/billing-renewal-policy';
import { BillingAttempt } from '../entities/billing-attempt.entity';
import { BillingAttemptObligation } from '../entities/billing-attempt-obligation.entity';
import { billingDebtQuote } from '../domain/billing-debt-quote';
import { billingDate } from '../domain/billing-debt-periods';
import { BillingObligation } from '../entities/billing-obligation.entity';
import { PaymentMethod } from '../entities/payment-method.entity';
import { Subscription } from '../entities/subscription.entity';
import { BillingEvent } from '../entities/billing-event.entity';
import { BillingEventType } from '../enums/billing.enums';
import { ResolveBillingAttemptDto } from '../dtos/admin/resolve-billing-attempt.dto';
import {
  assertBillingAttemptTransition,
  assertAdminNoChargeResolution,
  assertBillingObligationTransition,
  assertBillingPeriod,
  assertCardcomExternalUniqTranId,
  BILLING_ATTEMPT_BLOCKING_STATUSES,
} from '../domain/billing-state-machine';

const DEFAULT_LEASE_MS = 30_000;
/** Post-capture receipt/PDF/email work is slower than a provider call. */
const FINALIZATION_LEASE_MS = 5 * 60_000;
const MAX_EXTERNAL_KEY_ATTEMPTS = 5;
const RECONCILIATION_DELAYS_MS = [
  60_000,
  5 * 60_000,
  30 * 60_000,
  2 * 60 * 60_000,
  24 * 60 * 60_000,
] as const;

/**
 * Legacy failure category (Task 5A2) of an UNKNOWN attempt whose local
 * pre-flight failed before any provider request. New local failures never
 * become UNKNOWN (see `applyPreSubmissionFailure`); the reconciliation finder
 * keeps skipping this tag only for rows persisted before that change.
 */
export const PRE_SUBMISSION_LOCAL_FAILURE = 'PRE_SUBMISSION_LOCAL_FAILURE';

/**
 * Typed reasons a token charge failed locally BEFORE any provider request, so
 * no charge can have been made. Never derived from an error message.
 */
export enum BillingPreSubmissionFailureReason {
  NO_PAYMENT_METHOD = 'NO_PAYMENT_METHOD',
  NO_STORED_TOKEN = 'NO_STORED_TOKEN',
  CARD_EXPIRY_MISSING = 'CARD_EXPIRY_MISSING',
  CARD_EXPIRED = 'CARD_EXPIRED',
  TOKEN_DECRYPTION_FAILED = 'TOKEN_DECRYPTION_FAILED',
}

/**
 * CUSTOMER_ACTION: the customer must update the payment method (attempt ends
 * DECLINED without a provider decline, subscription goes PAST_DUE).
 * SYSTEM_ACTION: an operator must investigate (attempt goes to MANUAL_REVIEW,
 * subscription untouched).
 */
export type BillingPreSubmissionDisposition =
  | 'CUSTOMER_ACTION'
  | 'SYSTEM_ACTION';

export function preSubmissionDisposition(
  reason: BillingPreSubmissionFailureReason,
): BillingPreSubmissionDisposition {
  return reason === BillingPreSubmissionFailureReason.TOKEN_DECRYPTION_FAILED
    ? 'SYSTEM_ACTION'
    : 'CUSTOMER_ACTION';
}

/** Sanitized `failure_category` persisted for a local pre-submission failure. */
export function preSubmissionFailureCategory(
  reason: BillingPreSubmissionFailureReason,
): string {
  return `LOCAL_${reason}`;
}

export const BILLING_EXTERNAL_KEY_FACTORY = Symbol(
  'BILLING_EXTERNAL_KEY_FACTORY',
);

export interface BillingMutationActorContext {
  actorFirebaseId: string | null | undefined;
  subjectFirebaseId: string;
  isDelegatedAccess?: boolean;
  isAdminImpersonation?: boolean;
  isRepresentedSubject?: boolean;
}

/**
 * Single shared owner-mutation gate for every billing money/state-changing
 * operation (checkout, payment-method replacement, renewal, recovery, plan
 * changes, ...). `actorFirebaseId` must be the request's real verified
 * caller (FirebaseAuthGuard's `request.user.actorFirebaseId`, which is never
 * rewritten by delegation/admin impersonation) — never the possibly-rewritten
 * `request.user.firebaseId`. Comparing a rewritten id to itself would always
 * pass, which is exactly the bypass this check exists to close.
 */
export function assertBillingOwnerMutation(
  context: BillingMutationActorContext,
): void {
  if (
    !context.actorFirebaseId ||
    context.actorFirebaseId !== context.subjectFirebaseId ||
    context.isDelegatedAccess ||
    context.isAdminImpersonation ||
    context.isRepresentedSubject
  ) {
    throw new ForbiddenException(
      'Billing mutations may only be performed by the subscription owner',
    );
  }
}

/**
 * Why a renewal attempt was not opened. Nothing is persisted and no provider
 * call is possible: the caller treats it as a skip.
 */
export type RenewalDeferralReason =
  | 'NOT_ACTIVE'
  | 'NOT_DUE'
  | 'PERIOD_MISMATCH';

export class BillingRenewalDeferredError extends Error {
  constructor(public readonly reason: RenewalDeferralReason) {
    super(`Billing renewal deferred: ${reason}`);
    this.name = 'BillingRenewalDeferredError';
  }
}

export interface OpenBillingAttemptInput {
  actor: BillingMutationActorContext;
  subscriptionId: number;
  kind: BillingObligationKind;
  trigger: BillingAttemptTrigger;
  chargeMode: BillingChargeMode;
  planId: number;
  paymentMethodId?: number | null;
  periodStart: string;
  periodEnd: string;
  amountAgorot: number;
  amountBeforeVatAgorot: number;
  vatAmountAgorot: number;
  currency?: string;
  /**
   * Renewal only. Re-checks, under the subscription row lock, that the
   * subscription is ACTIVE, that its (possibly retry-scheduled) due date has
   * arrived and that `periodStart` is the period being collected. A stale
   * cron read therefore can never open an attempt whose retry is not due.
   */
  enforceRenewalSchedule?: boolean;
  /** Recheck recovery state/period under the subscription lock. */
  enforceRecoverySchedule?: boolean;
}

export interface ApplyNormalizedOutcomeOptions {
  /**
   * Token-renewal attempts only. A definitive DECLINED outcome also applies the
   * bounded renewal-decline policy (retry schedule or PAST_DUE) to the
   * subscription, atomically with the attempt write. Never used for UNKNOWN.
   */
  renewalDeclinePolicy?: boolean;
}

export interface OpenBillingAttemptResult {
  obligation: BillingObligation;
  attempt: BillingAttempt;
  created: boolean;
}

export interface AttemptLeaseResult {
  claimed: boolean;
  attempt: BillingAttempt;
  reason?: 'NOT_DUE' | 'ALREADY_CLAIMED' | 'NOT_CLAIMABLE';
}

export interface FinalizationLeaseResult {
  claimed: boolean;
  attempt: BillingAttempt;
  reason?: 'ALREADY_COMPLETED' | 'NOT_CAPTURED' | 'ALREADY_CLAIMED';
}

/** An attempt selected by a reconciliation sweep, with its owner context. */
export interface ReconciliationCandidate {
  attemptId: number;
  subscriptionId: number;
  firebaseId: string;
  stateVersion: number;
  chargeMode: BillingChargeMode;
}

export interface BillingPeriodSnapshot {
  obligation: BillingObligation;
  /** The satisfied attempt if the period is settled, else the active one. */
  attempt: BillingAttempt | null;
}

export type NormalizedChargeOutcome =
  | {
      kind: 'CAPTURED';
      cardcomTransactionId: string;
      providerTerminalRef?: string | null;
      providerResponseCode?: number | null;
    }
  | {
      kind: 'DECLINED';
      providerResponseCode?: number | null;
      failureCategory?: string | null;
    }
  | {
      kind: 'UNKNOWN';
      providerResponseCode?: number | null;
      failureCategory?: string | null;
    };

/**
 * Provider-free coordination boundary for billing debts and charge attempts.
 * Every public mutation owns a short local transaction; callers must perform
 * network I/O only after a lease has committed and before applying a normalized
 * result in a second transaction.
 */
@Injectable()
export class BillingAttemptOrchestrationService {
  private readonly externalKeyFactory: () => string;

  constructor(
    private readonly dataSource: DataSource,
    @Optional()
    @Inject(BILLING_EXTERNAL_KEY_FACTORY)
    externalKeyFactory?: () => string,
  ) {
    this.externalKeyFactory =
      externalKeyFactory ?? (() => `b${randomBytes(16).toString('base64url')}`);
  }

  assertOwnerMutation(context: BillingMutationActorContext): void {
    assertBillingOwnerMutation(context);
  }

  /** Reserve the entire reviewed balance before any hosted provider I/O. */
  async createRecoveryCollection(actor: BillingMutationActorContext, subscriptionId: number,
    expectedIds: number[], expectedQuote?: string): Promise<OpenBillingAttemptResult> {
    this.assertOwnerMutation(actor);
    return this.inTransaction(async manager => {
      const subscription = await manager.findOne(Subscription, {
        where: { id: subscriptionId }, lock: { mode: 'pessimistic_write' },
      });
      if (!subscription || subscription.firebaseId !== actor.subjectFirebaseId) {
        throw new ForbiddenException('Subscription owner mismatch');
      }
      if (subscription.billingAccessMode === BillingAccessMode.COMPLIMENTARY_FULL ||
        ![SubscriptionStatus.PAST_DUE, SubscriptionStatus.CANCELED].includes(subscription.status)) {
        throw new ConflictException('Recovery state changed; refresh before paying');
      }
      const debts = await manager.find(BillingObligation, {
        where: { subscriptionId, status: BillingObligationStatus.OPEN },
        order: { id: 'ASC' }, lock: { mode: 'pessimistic_write' },
      });
      const ids = debts.map(debt => debt.id);
      if (!ids.length || JSON.stringify(ids) !== JSON.stringify([...expectedIds].sort((a,b) => a-b)) ||
        (expectedQuote && billingDebtQuote(debts) !== expectedQuote)) {
        throw new ConflictException('Debt balance changed; refresh before paying');
      }
      const first = debts[0];
      for (const debt of debts) {
        if (debt.subscriptionId !== subscriptionId || debt.firebaseIdSnapshot !== actor.subjectFirebaseId || debt.currency !== first.currency ||
          debt.kind !== BillingObligationKind.RECURRING_PERIOD || debt.satisfiedAttemptId != null ||
          debt.activeAttemptId != null) {
          throw new ConflictException('Debt is reserved or requires review');
        }
      }
      const latest = await manager.findOne(BillingAttempt, {
        where: { obligationId: first.id }, order: { attemptNumber: 'DESC' },
      });
      const sum = (key: 'amountAgorot' | 'amountBeforeVatAgorot' | 'vatAmountAgorot') =>
        debts.reduce((total, debt) => total + debt[key], 0);
      const input: OpenBillingAttemptInput = {
        actor, subscriptionId, kind: first.kind, planId: first.planId,
        trigger: BillingAttemptTrigger.RECOVERY, chargeMode: BillingChargeMode.LOW_PROFILE_HOSTED,
        periodStart: first.periodStart, periodEnd: first.periodEnd, currency: first.currency,
        amountAgorot: sum('amountAgorot'), amountBeforeVatAgorot: sum('amountBeforeVatAgorot'),
        vatAmountAgorot: sum('vatAmountAgorot'),
      };
      this.validateOpenInput(input);
      const attempt = await this.saveAttemptWithUniqueProviderKey(manager, first,
        (latest?.attemptNumber ?? 0) + 1, input, null);
      for (const debt of debts) {
        await manager.save(BillingAttemptObligation, manager.create(BillingAttemptObligation, {
          attemptId: attempt.id, obligationId: debt.id,
        }));
        debt.activeAttemptId = attempt.id;
        debt.version += 1;
        await manager.save(BillingObligation, debt);
      }
      return { obligation: first, attempt, created: true };
    });
  }

  async findAttemptObligations(attempt: BillingAttempt): Promise<BillingObligation[]> {
    return this.loadAttemptObligations(this.dataSource.manager, attempt, false);
  }

  /** Called only behind the controller's real-caller admin gate. No provider I/O. */
  async prepareAdminResolution(subscriptionId: number, attemptId: number,
    actorFirebaseId: string, dto: ResolveBillingAttemptDto, now = new Date()): Promise<BillingAttempt> {
    return this.inTransaction(async manager => {
      const sub = await this.lockSubscriptionOfAttempt(manager, attemptId);
      if (!sub || sub.id !== subscriptionId) throw new ForbiddenException('Attempt does not belong to subscription');
      const attempt = await this.lockAttempt(manager, attemptId);
      if (!actorFirebaseId || dto.evidence.trim().length < 10) throw new BadRequestException('Document the verification evidence');
      if (attempt.stateVersion !== dto.expectedStateVersion || this.hasLiveLease(attempt, now)) {
        throw new ConflictException('Attempt changed or is being processed; refresh its status');
      }
      const debts = await this.loadAttemptObligations(manager, attempt, true);
      if (debts.some(debt => debt.activeAttemptId !== attempt.id || debt.status !== BillingObligationStatus.OPEN)) {
        throw new ConflictException('Attempt is no longer active for all debts');
      }
      const fromStatus = attempt.status;
      if (fromStatus === BillingAttemptStatus.CREATED && now.getTime() - attempt.createdAt.getTime() < 5 * 60_000) {
        throw new ConflictException('Checkout creation may still be running; wait before manual resolution');
      }
      if (dto.action === 'CONFIRM_NO_CHARGE') {
        if (dto.confirmedNoChargeAndCheckoutClosed !== true || attempt.capturedAt || attempt.cardcomTransactionId ||
          ![BillingAttemptStatus.CREATED, BillingAttemptStatus.AWAITING_CUSTOMER, BillingAttemptStatus.PROCESSING,
            BillingAttemptStatus.UNKNOWN, BillingAttemptStatus.MANUAL_REVIEW].includes(attempt.status)) {
          throw new ConflictException('Release requires proof of no charge and a closed checkout; captured funds cannot be released');
        }
        // An operator attests to external evidence, not merely an absent local transaction.
        assertAdminNoChargeResolution(attempt.status, Boolean(attempt.capturedAt || attempt.cardcomTransactionId));
        attempt.status = BillingAttemptStatus.CANCELED;
        attempt.failureCategory = 'ADMIN_CONFIRMED_NO_CHARGE';
        attempt.completedAt = now;
        for (const debt of debts) {
          debt.activeAttemptId = null;
          debt.version += 1;
          await manager.save(BillingObligation, debt);
        }
      } else if (dto.action === 'COMPLETE_CAPTURED') {
        if (!attempt.cardcomTransactionId || !attempt.capturedAt ||
          ![BillingAttemptStatus.CAPTURED, BillingAttemptStatus.MANUAL_REVIEW].includes(attempt.status)) {
          throw new ConflictException('Only an already verified capture may be completed');
        }
        assertBillingAttemptTransition(attempt.status, BillingAttemptStatus.CAPTURED);
        attempt.status = BillingAttemptStatus.CAPTURED;
      } else {
        if (attempt.capturedAt || attempt.cardcomTransactionId ||
          ![BillingAttemptStatus.CREATED, BillingAttemptStatus.AWAITING_CUSTOMER, BillingAttemptStatus.PROCESSING,
            BillingAttemptStatus.UNKNOWN, BillingAttemptStatus.MANUAL_REVIEW].includes(attempt.status)) {
          throw new ConflictException('Attempt cannot be reconciled');
        }
        if (dto.lowProfileId) {
          if (attempt.chargeMode !== BillingChargeMode.LOW_PROFILE_HOSTED ||
            (attempt.cardcomLowProfileId && attempt.cardcomLowProfileId !== dto.lowProfileId)) {
            throw new ConflictException('Cannot replace the existing provider identity');
          }
          attempt.cardcomLowProfileId = dto.lowProfileId;
        }
        if (attempt.chargeMode === BillingChargeMode.LOW_PROFILE_HOSTED && !attempt.cardcomLowProfileId) {
          throw new BadRequestException('Recover the LowProfile ID from CardCom before checking');
        }
        if (attempt.status === BillingAttemptStatus.CREATED) attempt.status = BillingAttemptStatus.AWAITING_CUSTOMER;
        assertBillingAttemptTransition(attempt.status, BillingAttemptStatus.UNKNOWN);
        attempt.status = BillingAttemptStatus.UNKNOWN;
        attempt.unknownSince ??= now;
      }
      this.clearLease(attempt);
      attempt.nextActionAt = dto.action === 'CHECK_PROVIDER' ? now : null;
      attempt.stateVersion += 1;
      await manager.save(BillingAttempt, attempt);
      await manager.save(BillingEvent, manager.create(BillingEvent, {
        firebaseId: sub.firebaseId, subscriptionId, billingAttemptId: attempt.id,
        eventType: BillingEventType.PAYMENT_VERIFIED,
        metadata: { kind: 'ADMIN_BILLING_RESOLUTION', actorFirebaseId, action: dto.action, evidence: dto.evidence.trim(),
          confirmedNoChargeAndCheckoutClosed: dto.confirmedNoChargeAndCheckoutClosed === true,
          fromStatus, toStatus: attempt.status },
      }));
      return attempt;
    });
  }

  async recordHostedCreationFailure(attemptId: number, definiteRejection: boolean): Promise<void> {
    await this.inTransaction(async manager => {
      await this.lockSubscriptionOfAttempt(manager, attemptId);
      const attempt = await this.lockAttempt(manager, attemptId);
      if (attempt.status !== BillingAttemptStatus.CREATED || attempt.cardcomLowProfileId) return;
      const status = definiteRejection ? BillingAttemptStatus.CANCELED : BillingAttemptStatus.MANUAL_REVIEW;
      assertBillingAttemptTransition(attempt.status, status);
      attempt.status = status;
      attempt.failureCategory = definiteRejection ? 'HOSTED_CREATE_REJECTED' : 'HOSTED_CREATE_UNCERTAIN';
      attempt.stateVersion += 1;
      if (definiteRejection) {
        for (const debt of await this.loadAttemptObligations(manager, attempt, true)) {
          if (debt.activeAttemptId !== attemptId) throw new ConflictException('Reservation changed');
          debt.activeAttemptId = null;
          debt.version += 1;
          await manager.save(BillingObligation, debt);
        }
      }
      await manager.save(BillingAttempt, attempt);
    });
  }

  private async loadAttemptObligations(manager: EntityManager, attempt: BillingAttempt,
    lock: boolean): Promise<BillingObligation[]> {
    const links = await manager.find(BillingAttemptObligation, {
      where: { attemptId: attempt.id }, order: { obligationId: 'ASC' },
    });
    // Old attempts retain their direct provenance; migration also backfills links.
    const ids = links?.length ? links.map(link => link.obligationId) : [attempt.obligationId];
    const debts: BillingObligation[] = [];
    for (const id of ids) {
      const debt = await manager.findOne(BillingObligation, {
        where: { id }, ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
      });
      if (!debt) throw new ConflictException('Linked billing debt missing');
      debts.push(debt);
    }
    if (links?.length && (!ids.includes(attempt.obligationId) || debts.some(debt =>
      debt.subscriptionId !== debts[0].subscriptionId || debt.currency !== attempt.currency) ||
      ['amountAgorot', 'amountBeforeVatAgorot', 'vatAmountAgorot'].some(key =>
        debts.reduce((total, debt) => total + debt[key], 0) !== attempt[key]))) {
      throw new ConflictException('Billing collection membership/totals mismatch');
    }
    return debts;
  }

  private async lockCollectionSubscription(manager: EntityManager, attemptId: number): Promise<void> {
    const members = await manager.find(BillingAttemptObligation, { where: { attemptId } });
    if (members?.length > 1) await this.lockSubscriptionOfAttempt(manager, attemptId);
  }

  async createOrGetAttempt(
    input: OpenBillingAttemptInput,
  ): Promise<OpenBillingAttemptResult> {
    this.assertOwnerMutation(input.actor);
    this.validateOpenInput(input);

    return this.inTransaction(async (manager) => {
      const subscription = await manager.findOne(Subscription, {
        where: { id: input.subscriptionId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!subscription) {
        throw new BadRequestException('Subscription not found');
      }
      if (subscription.firebaseId !== input.actor.subjectFirebaseId) {
        throw new ForbiddenException(
          'Billing mutation subject does not own the subscription',
        );
      }
      if (input.enforceRenewalSchedule) {
        this.assertRenewalDue(subscription, input.periodStart, new Date());
      }
      if (input.enforceRecoverySchedule && (
        subscription.status !== SubscriptionStatus.PAST_DUE ||
        (!renewalPeriodStart(subscription) || !this.matchesPeriodDate(renewalPeriodStart(subscription)!, input.periodStart))
      )) {
        throw new ConflictException('Billing recovery state or period changed; refresh before paying');
      }
      const paymentMethodId = await this.resolvePaymentMethodId(
        manager,
        subscription,
        input,
      );

      const obligationKey = this.buildObligationKey(
        input.subscriptionId,
        input.periodStart,
      );
      const obligation = await this.createOrLockObligation(
        manager,
        obligationKey,
        subscription,
        input,
      );
      this.assertMatchingObligation(obligation, input);

      if (obligation.status !== BillingObligationStatus.OPEN) {
        throw new ConflictException(
          `Billing obligation is ${obligation.status} and cannot accept a new attempt`,
        );
      }

      if (obligation.activeAttemptId !== null) {
        const activeAttempt = await manager.findOne(BillingAttempt, {
          where: { id: obligation.activeAttemptId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!activeAttempt || activeAttempt.obligationId !== obligation.id) {
          throw new ConflictException(
            'Billing obligation active attempt pointer is inconsistent',
          );
        }
        if (BILLING_ATTEMPT_BLOCKING_STATUSES.has(activeAttempt.status)) {
          return { obligation, attempt: activeAttempt, created: false };
        }
        obligation.activeAttemptId = null;
        obligation.version += 1;
        await manager.save(BillingObligation, obligation);
      }

      const latestAttempt = await manager.findOne(BillingAttempt, {
        where: { obligationId: obligation.id },
        order: { attemptNumber: 'DESC' },
      });
      const attemptNumber = (latestAttempt?.attemptNumber ?? 0) + 1;
      const attempt = await this.saveAttemptWithUniqueProviderKey(
        manager,
        obligation,
        attemptNumber,
        input,
        paymentMethodId,
      );

      obligation.activeAttemptId = attempt.id;
      obligation.version += 1;
      await manager.save(BillingObligation, obligation);
      await manager.save(BillingAttemptObligation, manager.create(BillingAttemptObligation, {
        attemptId: attempt.id, obligationId: obligation.id,
      }));
      return { obligation, attempt, created: true };
    });
  }

  async claimForSubmission(
    attemptId: number,
    leaseOwner: string,
    expectedStateVersion: number,
    now = new Date(),
    leaseMs = DEFAULT_LEASE_MS,
    subjectFirebaseId?: string,
  ): Promise<AttemptLeaseResult> {
    return this.inTransaction(async (manager) => {
      if (subjectFirebaseId) await this.lockCollectionSubscription(manager, attemptId);
      const attempt = await this.lockAttempt(manager, attemptId);
      if (subjectFirebaseId) {
        const debt = await this.lockObligation(manager, attempt.obligationId);
        if (debt.firebaseIdSnapshot !== subjectFirebaseId) throw new ForbiddenException('Billing attempt owner mismatch');
      }

      if (
        attempt.status === BillingAttemptStatus.PROCESSING &&
        attempt.leaseExpiresAt &&
        attempt.leaseExpiresAt <= now
      ) {
        await this.moveProcessingToUnknown(manager, attempt, now);
        return { claimed: false, attempt, reason: 'NOT_CLAIMABLE' };
      }

      if (
        attempt.stateVersion !== expectedStateVersion ||
        attempt.status !== BillingAttemptStatus.CREATED
      ) {
        return { claimed: false, attempt, reason: 'NOT_CLAIMABLE' };
      }
      if (this.hasLiveLease(attempt, now)) {
        return { claimed: false, attempt, reason: 'ALREADY_CLAIMED' };
      }
      if (attempt.nextActionAt && attempt.nextActionAt > now) {
        return { claimed: false, attempt, reason: 'NOT_DUE' };
      }

      assertBillingAttemptTransition(
        attempt.status,
        BillingAttemptStatus.PROCESSING,
      );
      attempt.status = BillingAttemptStatus.PROCESSING;
      attempt.submittedAt ??= now;
      this.assignLease(attempt, leaseOwner, now, leaseMs);
      await manager.save(BillingAttempt, attempt);
      return { claimed: true, attempt };
    });
  }

  /** A verified hosted callback can arrive after checkout or during review. */
  async claimForHostedOutcome(attemptId: number, leaseOwner: string, subjectFirebaseId: string,
    now = new Date()): Promise<AttemptLeaseResult> {
    return this.inTransaction(async manager => {
      await this.lockSubscriptionOfAttempt(manager, attemptId);
      const attempt = await this.lockAttempt(manager, attemptId);
      const debts = await this.loadAttemptObligations(manager, attempt, true);
      if (debts.some(debt => debt.firebaseIdSnapshot !== subjectFirebaseId)) throw new ForbiddenException('Billing attempt owner mismatch');
      if (this.hasLiveLease(attempt, now)) return { claimed: false, attempt, reason: 'ALREADY_CLAIMED' };
      if (attempt.chargeMode !== BillingChargeMode.LOW_PROFILE_HOSTED ||
        attempt.capturedAt || attempt.cardcomTransactionId ||
        ![BillingAttemptStatus.CREATED, BillingAttemptStatus.AWAITING_CUSTOMER, BillingAttemptStatus.PROCESSING,
          BillingAttemptStatus.UNKNOWN, BillingAttemptStatus.MANUAL_REVIEW].includes(attempt.status) ||
        debts.some(debt => debt.activeAttemptId !== attemptId)) {
        return { claimed: false, attempt, reason: 'NOT_CLAIMABLE' };
      }
      const target = [BillingAttemptStatus.UNKNOWN, BillingAttemptStatus.MANUAL_REVIEW].includes(attempt.status)
        ? BillingAttemptStatus.UNKNOWN : BillingAttemptStatus.PROCESSING;
      assertBillingAttemptTransition(attempt.status, target);
      attempt.status = target;
      this.assignLease(attempt, leaseOwner, now, DEFAULT_LEASE_MS);
      await manager.save(BillingAttempt, attempt);
      return { claimed: true, attempt };
    });
  }

  async claimForReconciliation(
    attemptId: number,
    leaseOwner: string,
    expectedStateVersion: number,
    now = new Date(),
    leaseMs = DEFAULT_LEASE_MS,
  ): Promise<AttemptLeaseResult> {
    return this.inTransaction(async (manager) => {
      const attempt = await this.lockAttempt(manager, attemptId);
      if (
        attempt.stateVersion !== expectedStateVersion ||
        attempt.status !== BillingAttemptStatus.UNKNOWN
      ) {
        return { claimed: false, attempt, reason: 'NOT_CLAIMABLE' };
      }
      if (this.hasLiveLease(attempt, now)) {
        return { claimed: false, attempt, reason: 'ALREADY_CLAIMED' };
      }
      if (attempt.nextActionAt && attempt.nextActionAt > now) {
        return { claimed: false, attempt, reason: 'NOT_DUE' };
      }

      this.assignLease(attempt, leaseOwner, now, leaseMs);
      await manager.save(BillingAttempt, attempt);
      return { claimed: true, attempt };
    });
  }

  async applyNormalizedOutcome(
    attemptId: number,
    leaseOwner: string,
    expectedStateVersion: number,
    outcome: NormalizedChargeOutcome,
    now = new Date(),
    options: ApplyNormalizedOutcomeOptions = {},
  ): Promise<BillingAttempt> {
    return this.inTransaction(async (manager) => {
      await this.lockCollectionSubscription(manager, attemptId);
      // Lock order matches createOrGetAttempt (subscription first), so a
      // concurrent opener and a decline can never deadlock each other.
      const renewalSubscription =
        options.renewalDeclinePolicy && outcome.kind === 'DECLINED'
          ? await this.lockSubscriptionOfAttempt(manager, attemptId)
          : null;
      const attempt = await this.lockAttempt(manager, attemptId);
      if (
        attempt.stateVersion !== expectedStateVersion ||
        attempt.leaseOwner !== leaseOwner
      ) {
        throw new ConflictException(
          'Billing attempt lease or version is stale',
        );
      }
      if (attempt.leaseExpiresAt && attempt.leaseExpiresAt <= now) {
        throw new ConflictException('Billing attempt lease has expired');
      }
      if (
        attempt.status !== BillingAttemptStatus.PROCESSING &&
        attempt.status !== BillingAttemptStatus.UNKNOWN
      ) {
        throw new ConflictException(
          `Cannot apply provider outcome while attempt is ${attempt.status}`,
        );
      }

      const wasReconciliation = attempt.status === BillingAttemptStatus.UNKNOWN;
      const targetStatus = BillingAttemptStatus[outcome.kind];
      assertBillingAttemptTransition(attempt.status, targetStatus);
      attempt.status = targetStatus;
      attempt.providerResponseCode = outcome.providerResponseCode ?? null;
      attempt.failureCategory =
        outcome.kind === 'CAPTURED' ? null : outcome.failureCategory ?? null;
      attempt.lastReconciledAt = wasReconciliation
        ? now
        : attempt.lastReconciledAt;
      attempt.reconciliationAttempts += wasReconciliation ? 1 : 0;
      this.clearLease(attempt);

      if (outcome.kind === 'CAPTURED') {
        attempt.cardcomTransactionId = outcome.cardcomTransactionId;
        attempt.providerTerminalRef = outcome.providerTerminalRef ?? null;
        attempt.capturedAt = now;
        attempt.nextActionAt = null;
      } else if (outcome.kind === 'DECLINED') {
        attempt.nextActionAt = null;
        const obligations = await this.loadAttemptObligations(manager, attempt, true);
        for (const debt of obligations) {
          if (debt.activeAttemptId !== attempt.id) {
            throw new ConflictException('Billing attempt is no longer active for its obligation');
          }
          debt.activeAttemptId = null;
          debt.version += 1;
          await manager.save(BillingObligation, debt);
        }
        const obligation = obligations[0];
        if (renewalSubscription) {
          await this.applyRenewalDeclinePolicy(
            manager,
            renewalSubscription,
            attempt,
            obligation,
            now,
          );
        }
      } else {
        attempt.unknownSince ??= now;
        const nextAction = this.nextReconciliationAction(
          attempt.reconciliationAttempts,
          now,
        );
        if (nextAction === null) {
          assertBillingAttemptTransition(
            attempt.status,
            BillingAttemptStatus.MANUAL_REVIEW,
          );
          attempt.status = BillingAttemptStatus.MANUAL_REVIEW;
          attempt.nextActionAt = null;
        } else {
          attempt.nextActionAt = nextAction;
        }
      }

      attempt.stateVersion += 1;
      return manager.save(BillingAttempt, attempt);
    });
  }

  /**
   * Terminates a claimed token attempt whose local pre-flight failed BEFORE any
   * provider request, in one transaction. No charge can have been made, so it
   * is never UNKNOWN, never reconciled and never consumes the 3/7-day
   * provider-decline policy (`renewalAttempts` is not touched).
   * - CUSTOMER_ACTION: PROCESSING -> DECLINED (sanitized local category), the
   *   obligation's active pointer is cleared so the hosted recovery flow may
   *   open a new attempt, and an ACTIVE subscription still collecting this
   *   period becomes PAST_DUE with the standard grace period.
   * - SYSTEM_ACTION: PROCESSING -> UNKNOWN -> MANUAL_REVIEW in one write. The
   *   attempt keeps blocking its obligation (no replay); the subscription is
   *   left unchanged for an operator.
   */
  async applyPreSubmissionFailure(
    attemptId: number,
    leaseOwner: string,
    expectedStateVersion: number,
    reason: BillingPreSubmissionFailureReason,
    now = new Date(),
  ): Promise<BillingAttempt> {
    const disposition = preSubmissionDisposition(reason);
    return this.inTransaction(async (manager) => {
      // Subscription first, as in applyNormalizedOutcome / createOrGetAttempt.
      const subscription =
        disposition === 'CUSTOMER_ACTION'
          ? await this.lockSubscriptionOfAttempt(manager, attemptId)
          : null;
      const attempt = await this.lockAttempt(manager, attemptId);
      if (
        attempt.stateVersion !== expectedStateVersion ||
        attempt.leaseOwner !== leaseOwner
      ) {
        throw new ConflictException(
          'Billing attempt lease or version is stale',
        );
      }
      if (attempt.leaseExpiresAt && attempt.leaseExpiresAt <= now) {
        throw new ConflictException('Billing attempt lease has expired');
      }
      if (attempt.status !== BillingAttemptStatus.PROCESSING) {
        throw new ConflictException(
          `Cannot apply a local failure while attempt is ${attempt.status}`,
        );
      }

      attempt.providerResponseCode = null;
      attempt.failureCategory = preSubmissionFailureCategory(reason);
      attempt.nextActionAt = null;
      this.clearLease(attempt);

      if (disposition === 'CUSTOMER_ACTION') {
        assertBillingAttemptTransition(
          attempt.status,
          BillingAttemptStatus.DECLINED,
        );
        attempt.status = BillingAttemptStatus.DECLINED;
        const obligation = await this.lockObligation(
          manager,
          attempt.obligationId,
        );
        if (obligation.activeAttemptId !== attempt.id) {
          throw new ConflictException(
            'Billing attempt is no longer active for its obligation',
          );
        }
        obligation.activeAttemptId = null;
        obligation.version += 1;
        await manager.save(BillingObligation, obligation);
        if (
          subscription &&
          this.isActiveCollectingRenewalPeriod(
            subscription,
            attempt,
            obligation,
          )
        ) {
          await manager.update(Subscription, subscription.id, {
            status: SubscriptionStatus.PAST_DUE,
            gracePeriodEndsAt: renewalGracePeriodEnd(now),
          });
        }
      } else {
        assertBillingAttemptTransition(
          attempt.status,
          BillingAttemptStatus.UNKNOWN,
        );
        assertBillingAttemptTransition(
          BillingAttemptStatus.UNKNOWN,
          BillingAttemptStatus.MANUAL_REVIEW,
        );
        attempt.status = BillingAttemptStatus.MANUAL_REVIEW;
      }

      attempt.stateVersion += 1;
      return manager.save(BillingAttempt, attempt);
    });
  }

  async expireProcessingLeaseToUnknown(
    attemptId: number,
    now = new Date(),
  ): Promise<BillingAttempt> {
    return this.inTransaction(async (manager) => {
      const attempt = await this.lockAttempt(manager, attemptId);
      if (
        attempt.status !== BillingAttemptStatus.PROCESSING ||
        !attempt.leaseExpiresAt ||
        attempt.leaseExpiresAt > now
      ) {
        return attempt;
      }
      await this.moveProcessingToUnknown(manager, attempt, now);
      return attempt;
    });
  }

  /**
   * Read-only view of one billing period's canonical debt and its settled or
   * active attempt. Lets callers detect an already-CAPTURED or already-settled
   * period before re-deriving a price or opening/submitting anything.
   */
  async findPeriodSnapshot(
    subscriptionId: number,
    periodStart: string,
    subjectFirebaseId: string,
  ): Promise<BillingPeriodSnapshot | null> {
    return this.inTransaction(async (manager) => {
      const obligation = await manager.findOne(BillingObligation, {
        where: {
          obligationKey: this.buildObligationKey(subscriptionId, periodStart),
        },
      });
      if (!obligation) return null;
      if (obligation.firebaseIdSnapshot !== subjectFirebaseId) {
        throw new ForbiddenException(
          'Billing mutation subject does not own the billing period',
        );
      }
      const attemptId =
        obligation.satisfiedAttemptId ?? obligation.activeAttemptId;
      const attempt =
        attemptId == null
          ? null
          : await manager.findOne(BillingAttempt, { where: { id: attemptId } });
      return { obligation, attempt };
    });
  }

  /**
   * Hosted attempts whose charge was captured but whose local completion never
   * finished, oldest first. `capturedBefore` is a grace cut-off so the sweep
   * does not race the original webhook request that is still completing them.
   * Read-only; the caller resumes each through the normal owner-checked,
   * leased post-capture path.
   */
  async findCapturedHostedAttempts(
    capturedBefore: Date,
    limit: number,
  ): Promise<
    Array<{ attemptId: number; subscriptionId: number; firebaseId: string }>
  > {
    return this.inTransaction(async (manager) => {
      const attempts = await manager.find(BillingAttempt, {
        where: {
          status: BillingAttemptStatus.CAPTURED,
          chargeMode: BillingChargeMode.LOW_PROFILE_HOSTED,
          capturedAt: LessThanOrEqual(capturedBefore),
        },
        order: { capturedAt: 'ASC' },
        take: limit,
      });
      const owned = await this.withOwners(manager, attempts);
      return owned.map(({ attemptId, subscriptionId, firebaseId }) => ({
        attemptId,
        subscriptionId,
        firebaseId,
      }));
    });
  }

  /** PROCESSING attempts whose submission lease has expired (read-only). */
  async findExpiredProcessingAttempts(
    now: Date,
    limit: number,
  ): Promise<ReconciliationCandidate[]> {
    return this.inTransaction(async (manager) =>
      this.withOwners(
        manager,
        await manager.find(BillingAttempt, {
          where: {
            status: BillingAttemptStatus.PROCESSING,
            leaseExpiresAt: LessThanOrEqual(now),
          },
          order: { leaseExpiresAt: 'ASC' },
          take: limit,
        }),
      ),
    );
  }

  /**
   * UNKNOWN attempts whose read-only reconciliation is due, oldest first. An
   * attempt that failed locally before any provider request is not an uncertain
   * charge and is never selected. Read-only.
   */
  async findDueUnknownAttempts(
    now: Date,
    limit: number,
  ): Promise<ReconciliationCandidate[]> {
    return this.inTransaction(async (manager) =>
      this.withOwners(
        manager,
        await manager.find(BillingAttempt, {
          where: {
            status: BillingAttemptStatus.UNKNOWN,
            nextActionAt: Or(IsNull(), LessThanOrEqual(now)),
            failureCategory: Or(IsNull(), Not(PRE_SUBMISSION_LOCAL_FAILURE)),
          },
          order: { nextActionAt: 'ASC' },
          take: limit,
        }),
      ),
    );
  }

  private async withOwners(
    manager: EntityManager,
    attempts: BillingAttempt[],
  ): Promise<ReconciliationCandidate[]> {
    if (attempts.length === 0) return [];
    const obligations = await manager.find(BillingObligation, {
      where: { id: In([...new Set(attempts.map((a) => a.obligationId))]) },
    });
    const byId = new Map(obligations.map((o) => [o.id, o]));
    return attempts.flatMap((attempt) => {
      const obligation = byId.get(attempt.obligationId);
      return obligation
        ? [
            {
              attemptId: attempt.id,
              subscriptionId: obligation.subscriptionId,
              firebaseId: obligation.firebaseIdSnapshot,
              stateVersion: attempt.stateVersion,
              chargeMode: attempt.chargeMode,
            },
          ]
        : [];
    });
  }

  /**
   * Persists the CardCom LowProfile id of a HOSTED checkout on its canonical
   * attempt so a captured payment can later be looked up (read-only) locally.
   * Never overwrites: an attempt keeps the first LowProfile id it was given,
   * and an id already used by another attempt is not recorded. Only an owned,
   * hosted, not-yet-captured attempt accepts it. The lease/state version is
   * untouched, so a concurrent claim or outcome is not invalidated.
   */
  async recordHostedLowProfileId(
    attemptId: number,
    lowProfileId: string,
    subjectFirebaseId: string,
  ): Promise<{
    recorded: boolean;
    reason?: 'ALREADY_SET' | 'NOT_ELIGIBLE' | 'LOW_PROFILE_IN_USE';
  }> {
    if (!lowProfileId || lowProfileId.length > 255) {
      return { recorded: false, reason: 'NOT_ELIGIBLE' };
    }
    try {
      return await this.inTransaction(async (manager) => {
        const attempt = await this.lockAttempt(manager, attemptId);
        const obligation = await this.lockObligation(
          manager,
          attempt.obligationId,
        );
        if (obligation.firebaseIdSnapshot !== subjectFirebaseId) {
          throw new ForbiddenException(
            'Billing mutation subject does not own the billing attempt',
          );
        }
        if (attempt.cardcomLowProfileId != null) {
          return { recorded: false, reason: 'ALREADY_SET' as const };
        }
        const openStatuses = [
          BillingAttemptStatus.CREATED,
          BillingAttemptStatus.AWAITING_CUSTOMER,
          BillingAttemptStatus.PROCESSING,
          BillingAttemptStatus.UNKNOWN,
        ];
        if (
          attempt.chargeMode !== BillingChargeMode.LOW_PROFILE_HOSTED ||
          !openStatuses.includes(attempt.status)
        ) {
          return { recorded: false, reason: 'NOT_ELIGIBLE' as const };
        }
        attempt.cardcomLowProfileId = lowProfileId;
        if (attempt.status === BillingAttemptStatus.CREATED) attempt.status = BillingAttemptStatus.AWAITING_CUSTOMER;
        attempt.stateVersion += 1;
        await manager.save(BillingAttempt, attempt);
        return { recorded: true };
      });
    } catch (error) {
      if (this.isDuplicateEntry(error)) {
        return { recorded: false, reason: 'LOW_PROFILE_IN_USE' };
      }
      throw error;
    }
  }

  /**
   * Exclusive lease for the post-capture phase (receipt, journal, completion)
   * of an already-CAPTURED attempt. It never touches the provider and never
   * changes the attempt status; it only serializes concurrent recovery runs.
   * The lease is exclusive regardless of owner label: renewal lease owners are
   * deterministic per period, so two concurrent runs share the same label.
   */
  async claimForFinalization(
    attemptId: number,
    leaseOwner: string,
    subjectFirebaseId: string,
    now = new Date(),
    leaseMs = FINALIZATION_LEASE_MS,
  ): Promise<FinalizationLeaseResult> {
    return this.inTransaction(async (manager) => {
      await this.lockCollectionSubscription(manager, attemptId);
      const attempt = await this.lockAttempt(manager, attemptId);
      const obligation = await this.lockObligation(
        manager,
        attempt.obligationId,
      );
      if (obligation.firebaseIdSnapshot !== subjectFirebaseId) {
        throw new ForbiddenException(
          'Billing mutation subject does not own the billing attempt',
        );
      }
      if (attempt.status === BillingAttemptStatus.COMPLETED) {
        return { claimed: false, attempt, reason: 'ALREADY_COMPLETED' };
      }
      if (attempt.status !== BillingAttemptStatus.CAPTURED) {
        return { claimed: false, attempt, reason: 'NOT_CAPTURED' };
      }
      if (this.hasLiveLease(attempt, now)) {
        return { claimed: false, attempt, reason: 'ALREADY_CLAIMED' };
      }
      this.assignLease(attempt, leaseOwner, now, leaseMs);
      await manager.save(BillingAttempt, attempt);
      return { claimed: true, attempt };
    });
  }

  /**
   * Releases a finalization lease after a failed post-capture step so the next
   * run can retry immediately. `expectedStateVersion` (the version returned by
   * the claim) stops a stale run from releasing a newer holder's lease. The
   * attempt stays CAPTURED.
   */
  async releaseFinalizationLease(
    attemptId: number,
    expectedStateVersion: number,
  ): Promise<void> {
    await this.inTransaction(async (manager) => {
      const attempt = await this.lockAttempt(manager, attemptId);
      if (
        attempt.status !== BillingAttemptStatus.CAPTURED ||
        attempt.stateVersion !== expectedStateVersion
      ) {
        return;
      }
      this.clearLease(attempt);
      await manager.save(BillingAttempt, attempt);
    });
  }

  /**
   * Atomically records the local side of a successful charge. Receipt/journal
   * creation must complete before this method is called; a captured attempt
   * therefore remains blocking when finalization fails and can be retried
   * without charging the provider again.
   */
  async finalizeCapturedAttempt(
    attemptId: number,
    receiptDocId: number,
    now = new Date(),
  ): Promise<BillingAttempt> {
    if (!Number.isInteger(receiptDocId) || receiptDocId <= 0) {
      throw new BadRequestException('A valid receipt document is required');
    }
    return this.inTransaction(async (manager) => {
      await this.lockCollectionSubscription(manager, attemptId);
      const attempt = await this.lockAttempt(manager, attemptId);
      const obligations = await this.loadAttemptObligations(manager, attempt, true);
      if (attempt.status === BillingAttemptStatus.COMPLETED) {
        if (attempt.receiptDocId === receiptDocId && obligations.every(debt =>
          debt.status === BillingObligationStatus.SATISFIED && debt.satisfiedAttemptId === attempt.id)) return attempt;
        throw new ConflictException('Completed billing membership is inconsistent');
      }
      for (const debt of obligations) {
        if (debt.status !== BillingObligationStatus.OPEN || debt.activeAttemptId !== attempt.id) {
          throw new ConflictException('Every linked debt must be open and reserved by this attempt');
        }
      }
      const obligation = obligations[0];
      if (obligation.activeAttemptId !== attempt.id) {
        throw new ConflictException(
          'Billing attempt is not the active obligation attempt',
        );
      }
      if (attempt.status !== BillingAttemptStatus.CAPTURED) {
        throw new ConflictException(
          `Only CAPTURED attempts can be finalized (current: ${attempt.status})`,
        );
      }
      if (obligation.status !== BillingObligationStatus.OPEN) {
        throw new ConflictException(
          `Only OPEN obligations can be finalized (current: ${obligation.status})`,
        );
      }
      assertBillingAttemptTransition(
        attempt.status,
        BillingAttemptStatus.COMPLETED,
      );
      assertBillingObligationTransition(
        obligation.status,
        BillingObligationStatus.SATISFIED,
      );
      attempt.receiptDocId = receiptDocId;
      attempt.completedAt = now;
      attempt.stateVersion += 1;
      attempt.status = BillingAttemptStatus.COMPLETED;
      this.clearLease(attempt);
      for (const debt of obligations) {
        debt.satisfiedAttemptId = attempt.id;
        debt.satisfiedAt = now;
        debt.activeAttemptId = null;
        debt.status = BillingObligationStatus.SATISFIED;
        debt.version += 1;
        await manager.save(BillingObligation, debt);
      }
      return manager.save(BillingAttempt, attempt);
    });
  }

  nextReconciliationAction(
    completedReconciliations: number,
    from: Date,
  ): Date | null {
    const delay = RECONCILIATION_DELAYS_MS[completedReconciliations];
    return delay === undefined ? null : new Date(from.getTime() + delay);
  }

  /**
   * Resolves and row-locks the subscription that owns an attempt, BEFORE the
   * attempt and obligation locks are taken. The unlocked reads only find the
   * id; every decision is made after the locks below.
   */
  private async lockSubscriptionOfAttempt(
    manager: EntityManager,
    attemptId: number,
  ): Promise<Subscription | null> {
    const peek = await manager.findOne(BillingAttempt, {
      where: { id: attemptId },
    });
    if (!peek) throw new BadRequestException('Billing attempt not found');
    const obligation = await manager.findOne(BillingObligation, {
      where: { id: peek.obligationId },
    });
    if (!obligation) {
      throw new ConflictException('Billing obligation not found');
    }
    return manager.findOne(Subscription, {
      where: { id: obligation.subscriptionId },
      lock: { mode: 'pessimistic_write' },
    });
  }

  /**
   * Applies the bounded renewal-decline policy inside the caller's transaction
   * (the DECLINED write): first/second confirmed decline schedule the retry in
   * `nextBillingDate`; the final one moves an ACTIVE subscription to PAST_DUE.
   * Only an ACTIVE subscription still collecting THIS period is touched, so
   * CANCELED/PAST_DUE/advanced subscriptions are never rewritten by a decline.
   */
  private async applyRenewalDeclinePolicy(
    manager: EntityManager,
    subscription: Subscription,
    attempt: BillingAttempt,
    obligation: BillingObligation,
    now: Date,
  ): Promise<void> {
    if (
      !this.isActiveCollectingRenewalPeriod(subscription, attempt, obligation)
    ) {
      return;
    }
    const decision = decideRenewalDecline(subscription.renewalAttempts, now);
    await manager.update(
      Subscription,
      subscription.id,
      decision.kind === 'RETRY'
        ? {
            renewalAttempts: decision.attemptNumber,
            nextBillingDate: decision.retryAt,
          }
        : {
            renewalAttempts: decision.attemptNumber,
            status: SubscriptionStatus.PAST_DUE,
            gracePeriodEndsAt: decision.gracePeriodEndsAt,
          },
    );
  }

  /**
   * True only for a token-renewal attempt whose ACTIVE subscription is still
   * collecting this obligation's period. Guards every renewal-driven
   * subscription write, so CANCELED/PAST_DUE/advanced rows are never touched.
   */
  private isActiveCollectingRenewalPeriod(
    subscription: Subscription,
    attempt: BillingAttempt,
    obligation: BillingObligation,
  ): boolean {
    if (
      attempt.trigger !== BillingAttemptTrigger.RENEWAL ||
      attempt.chargeMode !== BillingChargeMode.TOKEN_TRANSACTION ||
      subscription.id !== obligation.subscriptionId ||
      subscription.firebaseId !== obligation.firebaseIdSnapshot ||
      subscription.status !== SubscriptionStatus.ACTIVE
    ) {
      return false;
    }
    const periodStart = renewalPeriodStart(subscription);
    return (
      !!periodStart &&
      this.matchesPeriodDate(periodStart, obligation.periodStart)
    );
  }

  private assertRenewalDue(
    subscription: Subscription,
    periodStart: string,
    now: Date,
  ): void {
    if (subscription.billingAccessMode === BillingAccessMode.COMPLIMENTARY_FULL ||
      subscription.status !== SubscriptionStatus.ACTIVE) {
      throw new BillingRenewalDeferredError('NOT_ACTIVE');
    }
    if (!subscription.nextBillingDate || subscription.nextBillingDate > now) {
      throw new BillingRenewalDeferredError('NOT_DUE');
    }
    const collecting = renewalPeriodStart(subscription);
    if (!collecting || !this.matchesPeriodDate(collecting, periodStart)) {
      throw new BillingRenewalDeferredError('PERIOD_MISMATCH');
    }
  }

  private matchesPeriodDate(instant: Date, period: string): boolean {
    // Existing pre-KT-040 rows used UTC date keys; never open a duplicate debt.
    return billingDate(instant) === period || instant.toISOString().slice(0, 10) === period;
  }

  private async createOrLockObligation(
    manager: EntityManager,
    obligationKey: string,
    subscription: Subscription,
    input: OpenBillingAttemptInput,
  ): Promise<BillingObligation> {
    let obligation = await manager.findOne(BillingObligation, {
      where: { obligationKey },
      lock: { mode: 'pessimistic_write' },
    });
    if (obligation) return obligation;

    const candidate = manager.create(BillingObligation, {
      subscriptionId: subscription.id,
      firebaseIdSnapshot: subscription.firebaseId,
      obligationKey,
      kind: input.kind,
      status: BillingObligationStatus.OPEN,
      planId: input.planId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      amountAgorot: input.amountAgorot,
      amountBeforeVatAgorot: input.amountBeforeVatAgorot,
      vatAmountAgorot: input.vatAmountAgorot,
      currency: input.currency ?? 'ILS',
      activeAttemptId: null,
      satisfiedAttemptId: null,
      version: 0,
      satisfiedAt: null,
    });
    try {
      await manager.save(BillingObligation, candidate);
      obligation = candidate;
    } catch (error) {
      if (!this.isDuplicateEntry(error)) throw error;
      obligation = await manager.findOne(BillingObligation, {
        where: { obligationKey },
        lock: { mode: 'pessimistic_write' },
      });
      if (!obligation) throw error;
    }
    return obligation;
  }

  private async saveAttemptWithUniqueProviderKey(
    manager: EntityManager,
    obligation: BillingObligation,
    attemptNumber: number,
    input: OpenBillingAttemptInput,
    paymentMethodId: number | null,
  ): Promise<BillingAttempt> {
    let lastCollision: unknown;
    for (
      let keyAttempt = 0;
      keyAttempt < MAX_EXTERNAL_KEY_ATTEMPTS;
      keyAttempt += 1
    ) {
      const providerKey = this.externalKeyFactory();
      assertCardcomExternalUniqTranId(providerKey);
      const attempt = manager.create(BillingAttempt, {
        obligationId: obligation.id,
        attemptNumber,
        trigger: input.trigger,
        chargeMode: input.chargeMode,
        status: BillingAttemptStatus.CREATED,
        paymentMethodId,
        cardcomExternalUniqTranId: providerKey,
        cardcomLowProfileId: null,
        providerTerminalRef: null,
        cardcomTransactionId: null,
        providerResponseCode: null,
        failureCategory: null,
        planId: input.planId,
        amountAgorot: input.amountAgorot,
        amountBeforeVatAgorot: input.amountBeforeVatAgorot,
        vatAmountAgorot: input.vatAmountAgorot,
        currency: input.currency ?? 'ILS',
        receiptDocId: null,
        leaseOwner: null,
        leaseExpiresAt: null,
        stateVersion: 0,
        nextActionAt: null,
        unknownSince: null,
        submittedAt: null,
        capturedAt: null,
        completedAt: null,
        reconciliationAttempts: 0,
        lastReconciledAt: null,
      });
      try {
        return await manager.save(BillingAttempt, attempt);
      } catch (error) {
        if (!this.isExternalKeyCollision(error)) throw error;
        lastCollision = error;
      }
    }
    throw new ConflictException(
      'Unable to allocate a unique provider request key',
      { cause: lastCollision as Error },
    );
  }

  private async resolvePaymentMethodId(
    manager: EntityManager,
    subscription: Subscription,
    input: OpenBillingAttemptInput,
  ): Promise<number | null> {
    if (input.chargeMode === BillingChargeMode.LOW_PROFILE_HOSTED) {
      if (input.paymentMethodId != null) {
        throw new ForbiddenException(
          'Hosted billing attempts cannot select a stored payment method',
        );
      }
      return null;
    }

    // A renewal with no usable payment method is still opened, with no stored
    // id: the executor reports NO_PAYMENT_METHOD before any provider request
    // and `applyPreSubmissionFailure` moves the subscription to PAST_DUE.
    const renewalWithoutMethod =
      input.trigger === BillingAttemptTrigger.RENEWAL;
    const paymentMethodId = subscription.paymentMethodId;
    if (
      input.paymentMethodId != null &&
      input.paymentMethodId !== paymentMethodId
    ) {
      throw new ForbiddenException(
        'Billing attempt payment method does not belong to the subscription',
      );
    }
    if (paymentMethodId == null) {
      if (renewalWithoutMethod) return null;
      throw new BadRequestException(
        'Subscription does not have a stored payment method',
      );
    }

    const paymentMethod = await manager.findOne(PaymentMethod, {
      where: { id: paymentMethodId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!paymentMethod) {
      if (renewalWithoutMethod) return null;
      throw new ConflictException(
        'Subscription payment method pointer is inconsistent',
      );
    }
    if (paymentMethod.firebaseId !== subscription.firebaseId) {
      throw new ForbiddenException(
        'Subscription payment method belongs to another owner',
      );
    }
    return paymentMethod.id;
  }

  private validateOpenInput(input: OpenBillingAttemptInput): void {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(input.periodStart) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.periodEnd)
    ) {
      throw new BadRequestException('Billing period must use YYYY-MM-DD');
    }
    assertBillingPeriod(
      new Date(`${input.periodStart}T00:00:00.000Z`),
      new Date(`${input.periodEnd}T00:00:00.000Z`),
    );
    if (
      new Date(`${input.periodStart}T00:00:00.000Z`)
        .toISOString()
        .slice(0, 10) !== input.periodStart ||
      new Date(`${input.periodEnd}T00:00:00.000Z`)
        .toISOString()
        .slice(0, 10) !== input.periodEnd
    ) {
      throw new BadRequestException('Billing period contains an invalid date');
    }
    if (
      !Number.isInteger(input.amountAgorot) ||
      !Number.isInteger(input.amountBeforeVatAgorot) ||
      !Number.isInteger(input.vatAmountAgorot) ||
      input.amountAgorot < 0 ||
      input.amountBeforeVatAgorot < 0 ||
      input.vatAmountAgorot < 0 ||
      input.amountBeforeVatAgorot + input.vatAmountAgorot !== input.amountAgorot
    ) {
      throw new BadRequestException('Billing amounts are inconsistent');
    }
    if (!/^[A-Z]{3}$/.test(input.currency ?? 'ILS')) {
      throw new BadRequestException(
        'Billing currency must be an ISO-4217 code',
      );
    }
  }

  private assertMatchingObligation(
    obligation: BillingObligation,
    input: OpenBillingAttemptInput,
  ): void {
    if (
      obligation.subscriptionId !== input.subscriptionId ||
      obligation.firebaseIdSnapshot !== input.actor.subjectFirebaseId ||
      obligation.periodStart !== input.periodStart ||
      obligation.periodEnd !== input.periodEnd ||
      obligation.kind !== input.kind ||
      obligation.planId !== input.planId ||
      obligation.amountAgorot !== input.amountAgorot ||
      obligation.amountBeforeVatAgorot !== input.amountBeforeVatAgorot ||
      obligation.vatAmountAgorot !== input.vatAmountAgorot ||
      obligation.currency !== (input.currency ?? 'ILS')
    ) {
      throw new ConflictException(
        'Canonical billing obligation does not match the requested debt snapshot',
      );
    }
  }

  private buildObligationKey(
    subscriptionId: number,
    periodStart: string,
  ): string {
    return `subscription:${subscriptionId}:period:${periodStart}`;
  }

  private async lockAttempt(
    manager: EntityManager,
    attemptId: number,
  ): Promise<BillingAttempt> {
    const attempt = await manager.findOne(BillingAttempt, {
      where: { id: attemptId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!attempt) throw new BadRequestException('Billing attempt not found');
    return attempt;
  }

  private async lockObligation(
    manager: EntityManager,
    obligationId: number,
  ): Promise<BillingObligation> {
    const obligation = await manager.findOne(BillingObligation, {
      where: { id: obligationId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!obligation) {
      throw new ConflictException('Billing obligation not found');
    }
    return obligation;
  }

  private assignLease(
    attempt: BillingAttempt,
    leaseOwner: string,
    now: Date,
    leaseMs: number,
  ): void {
    if (!leaseOwner || leaseOwner.length > 191 || leaseMs <= 0) {
      throw new BadRequestException('Invalid billing attempt lease');
    }
    attempt.leaseOwner = leaseOwner;
    attempt.leaseExpiresAt = new Date(now.getTime() + leaseMs);
    attempt.stateVersion += 1;
  }

  private clearLease(attempt: BillingAttempt): void {
    attempt.leaseOwner = null;
    attempt.leaseExpiresAt = null;
  }

  private hasLiveLease(attempt: BillingAttempt, now: Date): boolean {
    return Boolean(
      attempt.leaseOwner &&
        attempt.leaseExpiresAt &&
        attempt.leaseExpiresAt > now,
    );
  }

  private async moveProcessingToUnknown(
    manager: EntityManager,
    attempt: BillingAttempt,
    now: Date,
  ): Promise<void> {
    assertBillingAttemptTransition(
      attempt.status,
      BillingAttemptStatus.UNKNOWN,
    );
    attempt.status = BillingAttemptStatus.UNKNOWN;
    attempt.unknownSince ??= now;
    attempt.nextActionAt = this.nextReconciliationAction(0, now);
    this.clearLease(attempt);
    attempt.stateVersion += 1;
    await manager.save(BillingAttempt, attempt);
  }

  private isDuplicateEntry(error: unknown): boolean {
    const code = (error as { code?: string; driverError?: { code?: string } })
      ?.code;
    const driverCode = (error as { driverError?: { code?: string } })
      ?.driverError?.code;
    return code === 'ER_DUP_ENTRY' || driverCode === 'ER_DUP_ENTRY';
  }

  private isExternalKeyCollision(error: unknown): boolean {
    if (!this.isDuplicateEntry(error)) return false;
    const message = String(
      (error as { message?: string; driverError?: { message?: string } })
        ?.driverError?.message ??
        (error as { message?: string })?.message ??
        '',
    );
    return message.includes('ux_billing_attempt_external_uniq');
  }

  private async inTransaction<T>(
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    const queryRunner: QueryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const result = await work(queryRunner.manager);
      await queryRunner.commitTransaction();
      return result;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
