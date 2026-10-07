import { ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  BillingAttemptStatus,
  BillingAttemptTrigger,
  BillingChargeMode,
  BillingObligationKind,
  BillingObligationStatus,
  SubscriptionStatus,
} from '../enums/billing.enums';
import { BillingAttempt } from '../entities/billing-attempt.entity';
import { BillingObligation } from '../entities/billing-obligation.entity';
import { PaymentMethod } from '../entities/payment-method.entity';
import { Subscription } from '../entities/subscription.entity';
import { BillingEvent } from '../entities/billing-event.entity';
import { PLAN_CHANGE_POLICY, PlanChangeSnapshot } from '../domain/billing-plan-change';
import {
  BillingAttemptOrchestrationService,
  OpenBillingAttemptInput,
} from './billing-attempt-orchestration.service';

describe('BillingAttemptOrchestrationService', () => {
  let manager: {
    findOne: jest.Mock;
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let queryRunner: {
    manager: typeof manager;
    connect: jest.Mock;
    startTransaction: jest.Mock;
    commitTransaction: jest.Mock;
    rollbackTransaction: jest.Mock;
    release: jest.Mock;
  };
  let service: BillingAttemptOrchestrationService;
  let keys: string[];

  const owner = {
    actorFirebaseId: 'owner-1',
    subjectFirebaseId: 'owner-1',
  };

  const openInput = (): OpenBillingAttemptInput => ({
    actor: owner,
    subscriptionId: 7,
    kind: BillingObligationKind.RECURRING_PERIOD,
    trigger: BillingAttemptTrigger.RENEWAL,
    chargeMode: BillingChargeMode.TOKEN_TRANSACTION,
    planId: 3,
    paymentMethodId: 5,
    periodStart: '2026-09-01',
    periodEnd: '2026-10-01',
    amountAgorot: 11700,
    amountBeforeVatAgorot: 10000,
    vatAmountAgorot: 1700,
  });

  const subscription = () =>
    Object.assign(new Subscription(), {
      id: 7,
      firebaseId: 'owner-1',
      paymentMethodId: 5,
    });

  const paymentMethod = (overrides: Partial<PaymentMethod> = {}) =>
    Object.assign(new PaymentMethod(), {
      id: 5,
      firebaseId: 'owner-1',
      ...overrides,
    });

  const obligation = (overrides: Partial<BillingObligation> = {}) =>
    Object.assign(new BillingObligation(), {
      id: 11,
      subscriptionId: 7,
      firebaseIdSnapshot: 'owner-1',
      obligationKey: 'subscription:7:period:2026-09-01',
      kind: BillingObligationKind.RECURRING_PERIOD,
      status: BillingObligationStatus.OPEN,
      planId: 3,
      periodStart: '2026-09-01',
      periodEnd: '2026-10-01',
      amountAgorot: 11700,
      amountBeforeVatAgorot: 10000,
      vatAmountAgorot: 1700,
      currency: 'ILS',
      activeAttemptId: null,
      satisfiedAttemptId: null,
      version: 0,
      satisfiedAt: null,
      ...overrides,
    });

  const attempt = (overrides: Partial<BillingAttempt> = {}) =>
    Object.assign(new BillingAttempt(), {
      id: 21,
      obligationId: 11,
      attemptNumber: 1,
      status: BillingAttemptStatus.CREATED,
      stateVersion: 0,
      leaseOwner: null,
      leaseExpiresAt: null,
      nextActionAt: null,
      unknownSince: null,
      submittedAt: null,
      capturedAt: null,
      cardcomTransactionId: null,
      providerTerminalRef: null,
      providerResponseCode: null,
      failureCategory: null,
      reconciliationAttempts: 0,
      lastReconciledAt: null,
      ...overrides,
    });

  beforeEach(() => {
    keys = ['bABCDEFGHIJKLMNOPQRSTUV'];
    manager = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((_entity, value) => value),
      save: jest.fn(async (_entity, value) => value),
    };
    queryRunner = {
      manager,
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
    };
    const dataSource = {
      createQueryRunner: jest.fn(() => queryRunner),
    } as unknown as DataSource;
    service = new BillingAttemptOrchestrationService(
      dataSource,
      () => keys.shift() ?? 'bZYXWVUTSRQPONMLKJIHGFE',
    );
  });

  it('enforces owner-only billing mutation context', () => {
    expect(() => service.assertOwnerMutation(owner)).not.toThrow();
    for (const context of [
      { actorFirebaseId: 'agent', subjectFirebaseId: 'owner-1' },
      { ...owner, isDelegatedAccess: true },
      { ...owner, isAdminImpersonation: true },
      { ...owner, isRepresentedSubject: true },
    ]) {
      expect(() => service.assertOwnerMutation(context)).toThrow(
        ForbiddenException,
      );
    }
  });

  it('creates one canonical obligation and one numbered active attempt under row locks', async () => {
    const sub = subscription();
    manager.findOne
      .mockResolvedValueOnce(sub)
      .mockResolvedValueOnce(paymentMethod())
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    manager.save.mockImplementation(async (entity, value) => {
      if (entity === BillingObligation && !value.id) value.id = 11;
      if (entity === BillingAttempt && !value.id) value.id = 21;
      return value;
    });

    const result = await service.createOrGetAttempt(openInput());

    expect(result.created).toBe(true);
    expect(result.attempt.attemptNumber).toBe(1);
    expect(result.attempt.cardcomExternalUniqTranId).toHaveLength(23);
    expect(result.obligation.activeAttemptId).toBe(21);
    expect(manager.findOne).toHaveBeenNthCalledWith(1, Subscription, {
      where: { id: 7 },
      lock: { mode: 'pessimistic_write' },
    });
    expect(manager.findOne).toHaveBeenNthCalledWith(2, PaymentMethod, {
      where: { id: 5 },
      lock: { mode: 'pessimistic_write' },
    });
    expect(manager.findOne).toHaveBeenNthCalledWith(3, BillingObligation, {
      where: { obligationKey: 'subscription:7:period:2026-09-01' },
      lock: { mode: 'pessimistic_write' },
    });
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
  });

  it('rechecks initial purchase eligibility under the subscription lock', async () => {
    manager.findOne.mockResolvedValueOnce({ ...subscription(), status: SubscriptionStatus.ACTIVE });
    await expect(service.createOrGetAttempt({ ...openInput(), enforceInitialPurchase: true,
      kind: BillingObligationKind.CHECKOUT, trigger: BillingAttemptTrigger.CHECKOUT,
      chargeMode: BillingChargeMode.LOW_PROFILE_HOSTED })).rejects.toThrow('Initial purchase state changed');
    expect(manager.save).not.toHaveBeenCalled();
    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
  });

  it.each(['same-plan', 'due', 'retry', 'canceled'])('rejects ineligible upgrade %s before provider submission', async reason => {
    const sub = { ...subscription(), status: SubscriptionStatus.ACTIVE, planId: 2,
      currentPeriodStart: new Date('2026-09-01'), currentPeriodEnd: new Date('2099-10-01'),
      nextBillingDate: new Date('2099-10-01'), renewalAttempts: 0 };
    if (reason === 'same-plan') sub.planId = 3;
    if (reason === 'due') sub.nextBillingDate = new Date('2000-01-01');
    if (reason === 'retry') sub.renewalAttempts = 1;
    if (reason === 'canceled') sub.status = SubscriptionStatus.CANCELED;
    manager.findOne.mockResolvedValueOnce(sub);
    await expect(service.createOrGetAttempt({ ...openInput(), enforceUpgrade: true,
      kind: BillingObligationKind.CHECKOUT, trigger: BillingAttemptTrigger.CHECKOUT,
      chargeMode: BillingChargeMode.LOW_PROFILE_HOSTED })).rejects.toThrow('Upgrade state changed');
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('reserves an upgrade with the locked source plan and period in its identity', async () => {
    manager.findOne.mockResolvedValueOnce({ ...subscription(), status: SubscriptionStatus.ACTIVE, planId: 2,
      currentPeriodStart: new Date('2026-09-01'), currentPeriodEnd: new Date('2099-10-01'),
      nextBillingDate: new Date('2099-10-01'), renewalAttempts: 0 })
      .mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    manager.find.mockResolvedValueOnce([]);
    manager.save.mockImplementation(async (entity, value) => {
      if (entity === BillingObligation && !value.id) value.id = 11;
      if (entity === BillingAttempt && !value.id) value.id = 21;
      return value;
    });
    const result = await service.createOrGetAttempt({ ...openInput(), paymentMethodId: null,
      enforceUpgrade: true, kind: BillingObligationKind.CHECKOUT,
      trigger: BillingAttemptTrigger.CHECKOUT, chargeMode: BillingChargeMode.LOW_PROFILE_HOSTED });
    expect(result.created).toBe(true);
    expect(result.obligation.obligationKey).toContain(':upgrade:2:');
    expect(result.obligation.obligationKey).toContain(':to:3:amount:11700');
  });

  it('commits immutable prorated terms with the attempt and rolls back if their write fails', async () => {
    const sub = { ...subscription(), status: SubscriptionStatus.ACTIVE, planId: 2,
      currentPeriodStart: new Date('2026-09-01'), currentPeriodEnd: new Date('2099-10-01'),
      nextBillingDate: new Date('2099-10-01'), renewalAttempts: 0 };
    const snapshot: PlanChangeSnapshot = { policy: PLAN_CHANGE_POLICY, action: 'UPGRADE', sourcePlanId: 2,
      targetPlanId: 3, sourcePeriodStart: sub.currentPeriodStart.toISOString(), sourcePeriodEnd: sub.currentPeriodEnd.toISOString(),
      quotedAt: new Date().toISOString(), scheduleEventId: null, sourceMonthlyNetAgorot: 5000,
      targetMonthlyNetAgorot: 15000, renewalAmountAgorot: 17550, amountBeforeVatAgorot: 10000,
      vatAmountAgorot: 1700, finalAmountAgorot: 11700, currency: 'ILS' };
    const input = { ...openInput(), paymentMethodId: null, enforceUpgrade: true, kind: BillingObligationKind.CHECKOUT,
      trigger: BillingAttemptTrigger.CHECKOUT, chargeMode: BillingChargeMode.LOW_PROFILE_HOSTED, planChangeSnapshot: snapshot };
    let failEvent = false;
    const prepare = () => {
      manager.findOne.mockReset().mockResolvedValueOnce(sub).mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      manager.find.mockResolvedValue([]);
      manager.save.mockImplementation(async (entity, value) => {
        if (entity === BillingEvent && failEvent) throw new Error('snapshot write failed');
        if (entity === BillingObligation && !value.id) value.id = 11;
        if (entity === BillingAttempt && !value.id) value.id = 21;
        return value;
      });
    };
    prepare();
    const result = await service.createOrGetAttempt(input);
    expect(result.obligation.obligationKey).toContain(':prorated:2:');
    expect(manager.save).toHaveBeenCalledWith(BillingEvent, expect.objectContaining({ billingAttemptId: 21,
      metadata: { policy: PLAN_CHANGE_POLICY, command: 'UPGRADE_RESERVED', snapshot } }));
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    failEvent = true;
    prepare();
    await expect(service.createOrGetAttempt(input)).rejects.toThrow('snapshot write failed');
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
  });

  it('defers due renewal while an unresolved upgrade checkout exists', async () => {
    manager.findOne.mockResolvedValueOnce({ ...subscription(), status: SubscriptionStatus.ACTIVE,
      currentPeriodEnd: new Date('2026-09-01'), nextBillingDate: new Date('2026-09-01') })
      .mockResolvedValueOnce(attempt({ status: BillingAttemptStatus.CAPTURED }));
    manager.find.mockResolvedValueOnce([obligation({ kind: BillingObligationKind.CHECKOUT, activeAttemptId: 21 })]);
    await expect(service.createOrGetAttempt({ ...openInput(), enforceRenewalSchedule: true }))
      .rejects.toThrow('Billing renewal deferred');
    expect(manager.save).not.toHaveBeenCalled();
  });
  it('blocks a stale renewal read under lock when cancellation was requested', async () => {
    manager.findOne.mockResolvedValueOnce({ ...subscription(), status: SubscriptionStatus.ACTIVE,
      currentPeriodEnd: new Date('2026-09-01'), nextBillingDate: new Date('2026-09-01'), canceledAt: new Date('2026-09-01') });
    await expect(service.createOrGetAttempt({ ...openInput(), enforceRenewalSchedule: true })).rejects.toThrow();
    expect(manager.save).not.toHaveBeenCalled();
    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
  });

  it('blocks an initial purchase for a pending checkout on a different date or plan', async () => {
    manager.findOne.mockResolvedValueOnce({ ...subscription(), status: SubscriptionStatus.TRIAL })
      .mockResolvedValueOnce(attempt({ status: BillingAttemptStatus.UNKNOWN }));
    manager.find.mockResolvedValueOnce([obligation({ kind: BillingObligationKind.CHECKOUT, activeAttemptId: 21 })]);
    await expect(service.createOrGetAttempt({ ...openInput(), enforceInitialPurchase: true,
      kind: BillingObligationKind.CHECKOUT, trigger: BillingAttemptTrigger.CHECKOUT,
      chargeMode: BillingChargeMode.LOW_PROFILE_HOSTED })).rejects.toThrow('תהליך תשלום קודם');
    expect(manager.save).not.toHaveBeenCalled();
  });

  it.each([
    { status: 'ACTIVE', nextBillingDate: new Date('2026-09-01') },
    { status: 'PAST_DUE', nextBillingDate: new Date('2026-10-01') },
  ])('rejects stale recovery state under the subscription lock: %s', async fields => {
    manager.findOne.mockResolvedValueOnce({ ...subscription(), ...fields });
    await expect(service.createOrGetAttempt({ ...openInput(), enforceRecoverySchedule: true }))
      .rejects.toThrow('recovery state or period changed');
    expect(manager.findOne).toHaveBeenCalledTimes(1);
    expect(manager.save).not.toHaveBeenCalled();
    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
  });

  it('opens a valid hosted recovery on the original period after declined renewal retries', async () => {
    manager.findOne
      .mockResolvedValueOnce({ ...subscription(), status: 'PAST_DUE', renewalAttempts: 3,
        currentPeriodEnd: new Date('2026-09-01'), nextBillingDate: new Date('2026-09-11') })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    manager.save.mockImplementation(async (entity, value) => {
      if (entity === BillingObligation && !value.id) value.id = 11;
      if (entity === BillingAttempt && !value.id) value.id = 21;
      return value;
    });
    const result = await service.createOrGetAttempt({ ...openInput(),
      trigger: BillingAttemptTrigger.RECOVERY, chargeMode: BillingChargeMode.LOW_PROFILE_HOSTED,
      paymentMethodId: null, enforceRecoverySchedule: true });
    expect(result.created).toBe(true);
    expect(result.obligation.periodStart).toBe('2026-09-01');
    expect(result.attempt.paymentMethodId).toBeNull();
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
  });

  it('rejects a cross-tenant payment method before persisting an attempt', async () => {
    manager.findOne.mockResolvedValueOnce(subscription());

    await expect(
      service.createOrGetAttempt({ ...openInput(), paymentMethodId: 99 }),
    ).rejects.toThrow(ForbiddenException);

    expect(manager.findOne).toHaveBeenCalledTimes(1);
    expect(manager.create).not.toHaveBeenCalledWith(
      BillingAttempt,
      expect.anything(),
    );
    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
  });

  it('rejects a subscription pointer to another owner payment method', async () => {
    manager.findOne
      .mockResolvedValueOnce(subscription())
      .mockResolvedValueOnce(paymentMethod({ firebaseId: 'other-owner' }));

    await expect(service.createOrGetAttempt(openInput())).rejects.toThrow(
      ForbiddenException,
    );

    expect(manager.findOne).toHaveBeenNthCalledWith(2, PaymentMethod, {
      where: { id: 5 },
      lock: { mode: 'pessimistic_write' },
    });
    expect(manager.create).not.toHaveBeenCalledWith(
      BillingAttempt,
      expect.anything(),
    );
    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
  });

  it('returns the existing unresolved attempt on a double submit', async () => {
    const sub = subscription();
    const active = attempt({ status: BillingAttemptStatus.UNKNOWN });
    manager.findOne
      .mockResolvedValueOnce(sub)
      .mockResolvedValueOnce(paymentMethod())
      .mockResolvedValueOnce(obligation({ activeAttemptId: 21 }))
      .mockResolvedValueOnce(active);

    const result = await service.createOrGetAttempt(openInput());

    expect(result).toEqual(
      expect.objectContaining({ attempt: active, created: false }),
    );
    expect(manager.create).not.toHaveBeenCalledWith(
      BillingAttempt,
      expect.anything(),
    );
  });

  it('recovers a concurrent canonical-obligation insert by locking the winning row', async () => {
    const sub = subscription();
    const winningObligation = obligation();
    manager.findOne
      .mockResolvedValueOnce(sub)
      .mockResolvedValueOnce(paymentMethod())
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(winningObligation)
      .mockResolvedValueOnce(null);
    manager.save.mockImplementation(async (entity, value) => {
      if (entity === BillingObligation && !value.id) {
        throw {
          code: 'ER_DUP_ENTRY',
          message: "Duplicate entry for key 'ux_billing_obligation_key'",
        };
      }
      if (entity === BillingAttempt) value.id = 21;
      return value;
    });

    const result = await service.createOrGetAttempt(openInput());

    expect(result.obligation).toBe(winningObligation);
    expect(manager.findOne).toHaveBeenNthCalledWith(4, BillingObligation, {
      where: { obligationKey: 'subscription:7:period:2026-09-01' },
      lock: { mode: 'pessimistic_write' },
    });
  });

  it('deterministically serializes two transactions to one active-attempt winner', async () => {
    const deferred = () => {
      let resolve!: () => void;
      const promise = new Promise<void>((done) => {
        resolve = done;
      });
      return { promise, resolve };
    };
    const firstAtInsert = deferred();
    const allowFirstInsert = deferred();
    const secondWaiting = deferred();
    const lockWaiters: Array<() => void> = [];
    const events: string[] = [];
    let lockHeld = false;
    let storedObligation: BillingObligation | null = null;
    let storedAttempt: BillingAttempt | null = null;
    let attemptSaves = 0;
    let transactionNumber = 0;

    const concurrentDataSource = {
      createQueryRunner: jest.fn(() => {
        const transactionName = `tx${++transactionNumber}`;
        const acquireSubscriptionLock = async () => {
          if (lockHeld) {
            events.push(`${transactionName}:wait`);
            secondWaiting.resolve();
            await new Promise<void>((resolve) => lockWaiters.push(resolve));
          }
          lockHeld = true;
          events.push(`${transactionName}:lock`);
        };
        const releaseSubscriptionLock = () => {
          lockHeld = false;
          lockWaiters.shift()?.();
        };
        const concurrentManager = {
          findOne: jest.fn(async (entity, options) => {
            if (entity === Subscription) {
              await acquireSubscriptionLock();
              return subscription();
            }
            if (entity === PaymentMethod) return paymentMethod();
            if (entity === BillingObligation) return storedObligation;
            if (entity === BillingAttempt) return storedAttempt;
            throw new Error(
              `Unexpected entity ${String(entity)} ${String(options)}`,
            );
          }),
          create: jest.fn((_entity, value) => value),
          save: jest.fn(async (entity, value) => {
            if (entity === BillingObligation) {
              if (!value.id) {
                events.push(`${transactionName}:insert-ready`);
                firstAtInsert.resolve();
                await allowFirstInsert.promise;
                value.id = 11;
              }
              storedObligation = value;
            }
            if (entity === BillingAttempt) {
              attemptSaves += 1;
              value.id = 21;
              storedAttempt = value;
            }
            return value;
          }),
        };
        return {
          manager: concurrentManager,
          connect: jest.fn().mockResolvedValue(undefined),
          startTransaction: jest.fn().mockResolvedValue(undefined),
          commitTransaction: jest.fn(async () => {
            events.push(`${transactionName}:commit`);
            releaseSubscriptionLock();
          }),
          rollbackTransaction: jest.fn(async () => {
            releaseSubscriptionLock();
          }),
          release: jest.fn().mockResolvedValue(undefined),
        };
      }),
    } as unknown as DataSource;
    const concurrentService = new BillingAttemptOrchestrationService(
      concurrentDataSource,
      () => 'bCONCURRENTWINNER000001',
    );

    const first = concurrentService.createOrGetAttempt(openInput());
    await firstAtInsert.promise;
    const second = concurrentService.createOrGetAttempt(openInput());
    await secondWaiting.promise;
    allowFirstInsert.resolve();
    const results = await Promise.all([first, second]);

    expect(results.map((result) => result.created)).toEqual([true, false]);
    expect(results[0].attempt).toBe(results[1].attempt);
    expect(attemptSaves).toBe(1);
    expect(storedObligation?.activeAttemptId).toBe(21);
    expect(events).toEqual([
      'tx1:lock',
      'tx1:insert-ready',
      'tx2:wait',
      'tx1:commit',
      'tx2:lock',
      'tx2:commit',
    ]);
  });

  it('retries only an ExternalUniqTranId unique-key collision', async () => {
    keys = ['bAAAAAAAAAAAAAAAAAAAAAA', 'bBBBBBBBBBBBBBBBBBBBBBB'];
    const sub = subscription();
    manager.findOne
      .mockResolvedValueOnce(sub)
      .mockResolvedValueOnce(paymentMethod())
      .mockResolvedValueOnce(obligation())
      .mockResolvedValueOnce(null);
    let attemptSaveCount = 0;
    manager.save.mockImplementation(async (entity, value) => {
      if (entity === BillingAttempt && attemptSaveCount++ === 0) {
        throw {
          code: 'ER_DUP_ENTRY',
          message: "Duplicate entry for key 'ux_billing_attempt_external_uniq'",
        };
      }
      if (entity === BillingAttempt) value.id = 21;
      return value;
    });

    const result = await service.createOrGetAttempt(openInput());

    expect(result.attempt.cardcomExternalUniqTranId).toBe(
      'bBBBBBBBBBBBBBBBBBBBBBB',
    );
    expect(attemptSaveCount).toBe(2);
  });

  it('claims CREATED exactly once using a state-version CAS contract', async () => {
    const row = attempt();
    manager.findOne.mockResolvedValue(row);
    const first = await service.claimForSubmission(
      row.id,
      'worker-a',
      0,
      new Date('2026-09-17T00:00:00Z'),
    );

    expect(first.claimed).toBe(true);
    expect(row.status).toBe(BillingAttemptStatus.PROCESSING);
    expect(row.stateVersion).toBe(1);

    manager.findOne.mockResolvedValue(row);
    const second = await service.claimForSubmission(
      row.id,
      'worker-b',
      0,
      new Date('2026-09-17T00:00:01Z'),
    );
    expect(second).toEqual(
      expect.objectContaining({ claimed: false, reason: 'NOT_CLAIMABLE' }),
    );
  });

  it('moves an expired PROCESSING lease to UNKNOWN and schedules read-only reconciliation', async () => {
    const now = new Date('2026-09-17T00:01:00Z');
    const row = attempt({
      status: BillingAttemptStatus.PROCESSING,
      stateVersion: 1,
      leaseOwner: 'dead-worker',
      leaseExpiresAt: new Date('2026-09-17T00:00:30Z'),
    });
    manager.findOne.mockResolvedValue(row);

    await service.expireProcessingLeaseToUnknown(row.id, now);

    expect(row.status).toBe(BillingAttemptStatus.UNKNOWN);
    expect(row.leaseOwner).toBeNull();
    expect(row.nextActionAt).toEqual(new Date('2026-09-17T00:02:00Z'));
    expect(row.stateVersion).toBe(2);
  });

  it('records an ambiguous submit as UNKNOWN without opening another attempt', async () => {
    const now = new Date('2026-09-17T00:00:10Z');
    const row = attempt({
      status: BillingAttemptStatus.PROCESSING,
      stateVersion: 1,
      leaseOwner: 'worker-a',
      leaseExpiresAt: new Date('2026-09-17T00:00:30Z'),
    });
    manager.findOne.mockResolvedValue(row);

    await service.applyNormalizedOutcome(
      row.id,
      'worker-a',
      1,
      { kind: 'UNKNOWN', failureCategory: 'TRANSPORT_TIMEOUT' },
      now,
    );

    expect(row.status).toBe(BillingAttemptStatus.UNKNOWN);
    expect(row.unknownSince).toEqual(now);
    expect(row.nextActionAt).toEqual(new Date('2026-09-17T00:01:10Z'));
    expect(row.leaseOwner).toBeNull();
  });

  it('moves unresolved UNKNOWN to MANUAL_REVIEW after the fifth reconciliation', async () => {
    const row = attempt({
      status: BillingAttemptStatus.UNKNOWN,
      stateVersion: 9,
      leaseOwner: 'reconciler',
      leaseExpiresAt: new Date('2026-09-18T00:01:00Z'),
      reconciliationAttempts: 4,
      unknownSince: new Date('2026-09-17T00:00:00Z'),
    });
    manager.findOne.mockResolvedValue(row);

    await service.applyNormalizedOutcome(
      row.id,
      'reconciler',
      9,
      { kind: 'UNKNOWN', failureCategory: 'NOT_FOUND' },
      new Date('2026-09-18T00:00:00Z'),
    );

    expect(row.reconciliationAttempts).toBe(5);
    expect(row.status).toBe(BillingAttemptStatus.MANUAL_REVIEW);
    expect(row.nextActionAt).toBeNull();
  });

  it('uses the approved 1m, 5m, 30m, 2h and 24h reconciliation schedule', () => {
    const from = new Date('2026-09-17T00:00:00Z');
    expect(
      [0, 1, 2, 3, 4, 5].map(
        (completed) =>
          service.nextReconciliationAction(completed, from)?.toISOString() ??
          null,
      ),
    ).toEqual([
      '2026-09-17T00:01:00.000Z',
      '2026-09-17T00:05:00.000Z',
      '2026-09-17T00:30:00.000Z',
      '2026-09-17T02:00:00.000Z',
      '2026-09-18T00:00:00.000Z',
      null,
    ]);
  });

  it('clears the active pointer only after a definite DECLINED outcome', async () => {
    const row = attempt({
      status: BillingAttemptStatus.PROCESSING,
      stateVersion: 1,
      leaseOwner: 'worker-a',
      leaseExpiresAt: new Date('2026-09-17T00:01:00Z'),
    });
    const debt = obligation({ activeAttemptId: row.id });
    manager.findOne.mockResolvedValueOnce(row).mockResolvedValueOnce(debt);

    await service.applyNormalizedOutcome(
      row.id,
      'worker-a',
      1,
      { kind: 'DECLINED', providerResponseCode: 5 },
      new Date('2026-09-17T00:00:00Z'),
    );

    expect(row.status).toBe(BillingAttemptStatus.DECLINED);
    expect(debt.activeAttemptId).toBeNull();
    expect(debt.version).toBe(1);
  });

  it('keeps CAPTURED blocking until a later atomic finalization task completes it', async () => {
    const row = attempt({
      status: BillingAttemptStatus.PROCESSING,
      stateVersion: 1,
      leaseOwner: 'worker-a',
      leaseExpiresAt: new Date('2026-09-17T00:01:00Z'),
    });
    manager.findOne.mockResolvedValue(row);

    await service.applyNormalizedOutcome(
      row.id,
      'worker-a',
      1,
      { kind: 'CAPTURED', cardcomTransactionId: 'deal-77' },
      new Date('2026-09-17T00:00:00Z'),
    );

    expect(row.status).toBe(BillingAttemptStatus.CAPTURED);
    expect(row.cardcomTransactionId).toBe('deal-77');
    expect(
      manager.findOne.mock.calls.some(
        ([entity]) => entity === BillingObligation,
      ),
    ).toBe(false);
  });

  it('rolls back and releases when an atomic state update fails', async () => {
    const row = attempt();
    manager.findOne.mockResolvedValue(row);
    manager.save.mockRejectedValue(new Error('database write failed'));

    await expect(
      service.claimForSubmission(
        row.id,
        'worker-a',
        0,
        new Date('2026-09-17T00:00:00Z'),
      ),
    ).rejects.toThrow('database write failed');
    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });

  it('uses pessimistic MySQL row-lock requests for all mutable aggregate roots', async () => {
    const row = attempt();
    manager.findOne.mockResolvedValue(row);
    await service.claimForSubmission(
      row.id,
      'worker-a',
      0,
      new Date('2026-09-17T00:00:00Z'),
    );
    expect(manager.findOne).toHaveBeenCalledWith(BillingAttempt, {
      where: { id: row.id },
      lock: { mode: 'pessimistic_write' },
    });
  });

  describe('post-capture finalization (KT-038 Task 3)', () => {
    const now = new Date('2026-09-17T00:00:00Z');
    const capturedRow = (overrides: Partial<BillingAttempt> = {}) =>
      attempt({
        status: BillingAttemptStatus.CAPTURED,
        stateVersion: 3,
        cardcomTransactionId: 'deal-77',
        capturedAt: now,
        ...overrides,
      });

    const serveByEntity = (row: BillingAttempt, debt: BillingObligation) =>
      manager.findOne.mockImplementation(async (entity: unknown) =>
        entity === BillingAttempt ? row : debt,
      );

    it('claims a CAPTURED attempt exclusively and never changes its status or provider fields', async () => {
      const row = capturedRow();
      serveByEntity(row, obligation({ activeAttemptId: row.id }));

      const claim = await service.claimForFinalization(
        row.id,
        'renewal-7-2026-09',
        'owner-1',
        now,
      );

      expect(claim.claimed).toBe(true);
      expect(row.status).toBe(BillingAttemptStatus.CAPTURED);
      expect(row.cardcomTransactionId).toBe('deal-77');
      expect(row.leaseOwner).toBe('renewal-7-2026-09');
      expect(row.stateVersion).toBe(4);
    });

    it('records a hosted LowProfile id once and never overwrites it with an unrelated session', async () => {
      const row = attempt({
        status: BillingAttemptStatus.CREATED,
        chargeMode: BillingChargeMode.LOW_PROFILE_HOSTED,
        cardcomLowProfileId: null,
      });
      serveByEntity(row, obligation({ activeAttemptId: row.id }));

      await expect(
        service.recordHostedLowProfileId(row.id, 'lp-1', 'owner-1'),
      ).resolves.toEqual({ recorded: true });
      expect(row.cardcomLowProfileId).toBe('lp-1');
      expect(row.stateVersion).toBe(1); // provider identity change invalidates stale admin decisions

      await expect(
        service.recordHostedLowProfileId(row.id, 'lp-other', 'owner-1'),
      ).resolves.toEqual({ recorded: false, reason: 'ALREADY_SET' });
      expect(row.cardcomLowProfileId).toBe('lp-1');

      await expect(
        service.recordHostedLowProfileId(row.id, 'lp-2', 'other-owner'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('a live lease blocks a concurrent run even when it carries the SAME owner label', async () => {
      const row = capturedRow();
      serveByEntity(row, obligation({ activeAttemptId: row.id }));

      const first = await service.claimForFinalization(
        row.id,
        'renewal-7-2026-09',
        'owner-1',
        now,
      );
      const second = await service.claimForFinalization(
        row.id,
        'renewal-7-2026-09',
        'owner-1',
        new Date(now.getTime() + 1_000),
      );

      expect(first.claimed).toBe(true);
      expect(second).toEqual(
        expect.objectContaining({ claimed: false, reason: 'ALREADY_CLAIMED' }),
      );
      expect(row.stateVersion).toBe(4);
    });

    it('lets a later run take over once the lease has expired', async () => {
      const row = capturedRow({
        leaseOwner: 'dead-worker',
        leaseExpiresAt: new Date(now.getTime() - 1),
      });
      serveByEntity(row, obligation({ activeAttemptId: row.id }));

      const claim = await service.claimForFinalization(
        row.id,
        'worker-b',
        'owner-1',
        now,
      );

      expect(claim.claimed).toBe(true);
      expect(row.leaseOwner).toBe('worker-b');
    });

    it('rejects a subject that does not own the attempt before touching it', async () => {
      const row = capturedRow();
      serveByEntity(row, obligation({ activeAttemptId: row.id }));

      await expect(
        service.claimForFinalization(row.id, 'worker-a', 'intruder', now),
      ).rejects.toThrow(ForbiddenException);
      expect(row.leaseOwner).toBeNull();
      expect(manager.save).not.toHaveBeenCalled();
    });

    it.each([
      [BillingAttemptStatus.COMPLETED, 'ALREADY_COMPLETED'],
      [BillingAttemptStatus.UNKNOWN, 'NOT_CAPTURED'],
      [BillingAttemptStatus.CREATED, 'NOT_CAPTURED'],
    ])('does not claim a %s attempt (%s)', async (status, reason) => {
      const row = capturedRow({ status });
      serveByEntity(row, obligation({ activeAttemptId: row.id }));

      const claim = await service.claimForFinalization(
        row.id,
        'worker-a',
        'owner-1',
        now,
      );

      expect(claim).toEqual(
        expect.objectContaining({ claimed: false, reason }),
      );
      expect(row.leaseOwner).toBeNull();
    });

    it('releases only its own lease version and leaves the attempt CAPTURED', async () => {
      const row = capturedRow({
        leaseOwner: 'worker-a',
        leaseExpiresAt: new Date(now.getTime() + 60_000),
        stateVersion: 4,
      });
      serveByEntity(row, obligation({ activeAttemptId: row.id }));

      await service.releaseFinalizationLease(row.id, 3); // stale holder
      expect(row.leaseOwner).toBe('worker-a');

      await service.releaseFinalizationLease(row.id, 4);
      expect(row.leaseOwner).toBeNull();
      expect(row.leaseExpiresAt).toBeNull();
      expect(row.status).toBe(BillingAttemptStatus.CAPTURED);
    });

    it('completes attempt and obligation together exactly once and clears the lease; repeats are no-ops', async () => {
      const row = capturedRow({
        leaseOwner: 'worker-a',
        leaseExpiresAt: new Date(now.getTime() + 60_000),
      });
      const debt = obligation({ activeAttemptId: row.id });
      serveByEntity(row, debt);

      await service.finalizeCapturedAttempt(row.id, 99, now);
      const versionAfterFirst = row.stateVersion;
      const debtVersionAfterFirst = debt.version;

      expect(row.status).toBe(BillingAttemptStatus.COMPLETED);
      expect(row.receiptDocId).toBe(99);
      expect(row.cardcomTransactionId).toBe('deal-77');
      expect(row.leaseOwner).toBeNull();
      expect(debt.status).toBe(BillingObligationStatus.SATISFIED);
      expect(debt.satisfiedAttemptId).toBe(row.id);
      expect(debt.activeAttemptId).toBeNull();

      const repeat = await service.finalizeCapturedAttempt(row.id, 99, now);
      expect(repeat.status).toBe(BillingAttemptStatus.COMPLETED);
      expect(row.stateVersion).toBe(versionAfterFirst);
      expect(debt.version).toBe(debtVersionAfterFirst);
    });

    it('exposes the settled or active attempt of a period read-only', async () => {
      const settled = capturedRow({ status: BillingAttemptStatus.COMPLETED });
      const debt = obligation({
        status: BillingObligationStatus.SATISFIED,
        satisfiedAttemptId: settled.id,
      });
      serveByEntity(settled, debt);

      const snapshot = await service.findPeriodSnapshot(
        7,
        '2026-09-01',
        'owner-1',
      );

      expect(snapshot?.obligation.status).toBe(
        BillingObligationStatus.SATISFIED,
      );
      expect(snapshot?.attempt?.id).toBe(settled.id);
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('lists only hosted CAPTURED attempts past the grace cut-off, oldest first, with their owner', async () => {
      const cutoff = new Date('2026-09-17T00:00:00Z');
      const stuck = capturedRow({ id: 31, obligationId: 11 });
      manager.find
        .mockResolvedValueOnce([stuck])
        .mockResolvedValueOnce([obligation({ id: 11, subscriptionId: 7 })]);

      const rows = await service.findCapturedHostedAttempts(cutoff, 50);

      expect(rows).toEqual([
        { attemptId: 31, subscriptionId: 7, firebaseId: 'owner-1' },
      ]);
      const query = manager.find.mock.calls[0];
      expect(query[0]).toBe(BillingAttempt);
      expect(query[1].where.status).toBe(BillingAttemptStatus.CAPTURED);
      expect(query[1].where.chargeMode).toBe(
        BillingChargeMode.LOW_PROFILE_HOSTED,
      );
      expect(query[1].where.capturedAt).toBeDefined(); // <= cut-off
      expect(query[1].order).toEqual({ capturedAt: 'ASC' });
      expect(query[1].take).toBe(50);
      expect(manager.save).not.toHaveBeenCalled(); // read-only
    });

    it('returns an empty list without a second query when nothing is stuck', async () => {
      manager.find.mockResolvedValueOnce([]);

      await expect(
        service.findCapturedHostedAttempts(new Date(), 50),
      ).resolves.toEqual([]);
      expect(manager.find).toHaveBeenCalledTimes(1);
    });

    it('returns null for an unknown period and rejects another owner', async () => {
      manager.findOne.mockResolvedValueOnce(null);
      await expect(
        service.findPeriodSnapshot(7, '2026-09-01', 'owner-1'),
      ).resolves.toBeNull();

      manager.findOne.mockResolvedValueOnce(obligation());
      await expect(
        service.findPeriodSnapshot(7, '2026-09-01', 'intruder'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
