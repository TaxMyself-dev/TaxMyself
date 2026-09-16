import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { DataSource, EntityManager, QueryRunner } from 'typeorm';
import {
  BillingAttemptStatus,
  BillingAttemptTrigger,
  BillingChargeMode,
  BillingObligationKind,
  BillingObligationStatus,
} from '../enums/billing.enums';
import { BillingAttempt } from '../entities/billing-attempt.entity';
import { BillingObligation } from '../entities/billing-obligation.entity';
import { Subscription } from '../entities/subscription.entity';
import {
  assertBillingAttemptTransition,
  assertBillingPeriod,
  assertCardcomExternalUniqTranId,
  BILLING_ATTEMPT_BLOCKING_STATUSES,
} from '../domain/billing-state-machine';

const DEFAULT_LEASE_MS = 30_000;
const MAX_EXTERNAL_KEY_ATTEMPTS = 5;
const RECONCILIATION_DELAYS_MS = [
  60_000,
  5 * 60_000,
  30 * 60_000,
  2 * 60 * 60_000,
  24 * 60 * 60_000,
] as const;

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
      );

      obligation.activeAttemptId = attempt.id;
      obligation.version += 1;
      await manager.save(BillingObligation, obligation);
      return { obligation, attempt, created: true };
    });
  }

  async claimForSubmission(
    attemptId: number,
    leaseOwner: string,
    expectedStateVersion: number,
    now = new Date(),
    leaseMs = DEFAULT_LEASE_MS,
  ): Promise<AttemptLeaseResult> {
    return this.inTransaction(async (manager) => {
      const attempt = await this.lockAttempt(manager, attemptId);

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
  ): Promise<BillingAttempt> {
    return this.inTransaction(async (manager) => {
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

  nextReconciliationAction(
    completedReconciliations: number,
    from: Date,
  ): Date | null {
    const delay = RECONCILIATION_DELAYS_MS[completedReconciliations];
    return delay === undefined ? null : new Date(from.getTime() + delay);
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
        paymentMethodId: input.paymentMethodId ?? null,
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
