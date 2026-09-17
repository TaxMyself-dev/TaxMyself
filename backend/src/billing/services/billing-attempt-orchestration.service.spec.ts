import { ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  BillingAttemptStatus,
  BillingAttemptTrigger,
  BillingChargeMode,
  BillingObligationKind,
  BillingObligationStatus,
} from '../enums/billing.enums';
import { BillingAttempt } from '../entities/billing-attempt.entity';
import { BillingObligation } from '../entities/billing-obligation.entity';
import { PaymentMethod } from '../entities/payment-method.entity';
import { Subscription } from '../entities/subscription.entity';
import {
  BillingAttemptOrchestrationService,
  OpenBillingAttemptInput,
} from './billing-attempt-orchestration.service';

describe('BillingAttemptOrchestrationService', () => {
  let manager: {
    findOne: jest.Mock;
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
});
