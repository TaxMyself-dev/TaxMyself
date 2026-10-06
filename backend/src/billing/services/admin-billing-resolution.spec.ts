import { DataSource } from 'typeorm';
import { BillingAttemptOrchestrationService } from './billing-attempt-orchestration.service';
import { AdminBillingResolutionService } from './admin-billing-resolution.service';
import { AdminBillingController } from '../admin-billing.controller';
import { SubscriptionRenewalService } from './subscription-renewal.service';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { BillingAttempt } from '../entities/billing-attempt.entity';
import { BillingObligation } from '../entities/billing-obligation.entity';
import { BillingAttemptObligation } from '../entities/billing-attempt-obligation.entity';
import { BillingEvent } from '../entities/billing-event.entity';
import { Subscription } from '../entities/subscription.entity';
import { BillingAttemptStatus as Status, BillingChargeMode, BillingObligationStatus } from '../enums/billing.enums';

describe('Admin billing resolution boundaries', () => {
  const now = new Date('2026-10-06T12:00:00Z');
  let row: BillingAttempt, debts: BillingObligation[], manager: any, runner: any;
  let orchestration: BillingAttemptOrchestrationService;
  const decision = (action: 'CONFIRM_NO_CHARGE' | 'CHECK_PROVIDER' | 'COMPLETE_CAPTURED' = 'CONFIRM_NO_CHARGE') => ({
    action, expectedStateVersion: 4, evidence: 'CardCom support reference ABC123: checkout closed without payment',
    confirmedNoChargeAndCheckoutClosed: true,
  });
  beforeEach(() => {
    row = Object.assign(new BillingAttempt(), { id: 10, obligationId: 1, status: Status.MANUAL_REVIEW,
      stateVersion: 4, chargeMode: BillingChargeMode.LOW_PROFILE_HOSTED, cardcomLowProfileId: 'lp-10',
      amountAgorot: 200, amountBeforeVatAgorot: 200, vatAmountAgorot: 0, currency: 'ILS',
      createdAt: new Date('2026-10-05'), capturedAt: null, cardcomTransactionId: null,
      leaseOwner: null, leaseExpiresAt: null });
    debts = [1, 2].map(id => Object.assign(new BillingObligation(), { id, subscriptionId: 7,
      firebaseIdSnapshot: 'owner', status: BillingObligationStatus.OPEN, activeAttemptId: 10,
      amountAgorot: 100, amountBeforeVatAgorot: 100, vatAmountAgorot: 0, currency: 'ILS', version: 0 }));
    manager = { findOne: jest.fn(async (entity, query) => entity === BillingAttempt ? row
      : entity === Subscription ? { id: 7, firebaseId: 'owner' }
      : debts.find(debt => debt.id === query.where.id)),
      find: jest.fn(async entity => entity === BillingAttemptObligation ? [{ obligationId: 1 }, { obligationId: 2 }] : []),
      create: jest.fn((_entity, data) => data), save: jest.fn(async (_entity, data) => data) };
    runner = { manager, connect: jest.fn(), startTransaction: jest.fn(), commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(), release: jest.fn() };
    orchestration = new BillingAttemptOrchestrationService({ createQueryRunner: () => runner } as unknown as DataSource);
  });

  it.each([Status.CREATED, Status.AWAITING_CUSTOMER, Status.PROCESSING, Status.UNKNOWN, Status.MANUAL_REVIEW])(
    'releases all collection debts after a documented no-charge decision from %s', async status => {
      row.status = status;
      await orchestration.prepareAdminResolution(7, 10, 'real-admin', decision(), now);
      expect(row.status).toBe(Status.CANCELED);
      expect(debts.map(debt => debt.activeAttemptId)).toEqual([null, null]);
      expect(manager.save).toHaveBeenCalledWith(BillingEvent, expect.objectContaining({
        metadata: expect.objectContaining({ actorFirebaseId: 'real-admin', action: 'CONFIRM_NO_CHARGE', fromStatus: status }),
      }));
      expect(runner.commitTransaction).toHaveBeenCalledTimes(1);
    });
  it.each(['stale', 'lease', 'captured', 'transaction', 'confirmation', 'membership', 'scope', 'creating'])(
    'rejects unsafe release: %s', async condition => {
      const dto = decision(); let subscriptionId = 7;
      if (condition === 'stale') dto.expectedStateVersion = 3;
      if (condition === 'lease') { row.leaseOwner = 'other'; row.leaseExpiresAt = new Date(now.getTime() + 1000); }
      if (condition === 'captured') row.capturedAt = now;
      if (condition === 'transaction') row.cardcomTransactionId = 'tx';
      if (condition === 'confirmation') dto.confirmedNoChargeAndCheckoutClosed = false;
      if (condition === 'membership') debts[1].activeAttemptId = 11;
      if (condition === 'scope') subscriptionId = 8;
      if (condition === 'creating') { row.status = Status.CREATED; row.createdAt = now; }
      await expect(orchestration.prepareAdminResolution(subscriptionId, 10, 'admin', dto, now)).rejects.toThrow();
      expect(runner.rollbackTransaction).toHaveBeenCalledTimes(1);
      expect(manager.save).not.toHaveBeenCalled();
    });
  it('cannot mark an unverified manual-review payment captured', async () => {
    await expect(orchestration.prepareAdminResolution(7, 10, 'admin', decision('COMPLETE_CAPTURED'), now)).rejects.toThrow();
  });
  it('permits rechecking manual review without releasing debts', async () => {
    await orchestration.prepareAdminResolution(7, 10, 'admin', decision('CHECK_PROVIDER'), now);
    expect(row.status).toBe(Status.UNKNOWN);
    expect(row.nextActionAt).toEqual(now);
    expect(debts.map(debt => debt.activeAttemptId)).toEqual([10, 10]);
  });
  it('requires a recovered hosted identity and cannot overwrite an existing identity', async () => {
    await expect(orchestration.prepareAdminResolution(7, 10, 'admin',
      { ...decision('CHECK_PROVIDER'), lowProfileId: 'other' }, now)).rejects.toThrow();
    row.cardcomLowProfileId = null;
    await expect(orchestration.prepareAdminResolution(7, 10, 'admin', decision('CHECK_PROVIDER'), now)).rejects.toThrow();
  });
  it.each([true, false])('creation failure releases only a definite rejection: %s', async definite => {
    row.status = Status.CREATED; row.cardcomLowProfileId = null;
    await orchestration.recordHostedCreationFailure(10, definite);
    expect(row.status).toBe(definite ? Status.CANCELED : Status.MANUAL_REVIEW);
    expect(debts.map(debt => debt.activeAttemptId)).toEqual(definite ? [null, null] : [10, 10]);
  });
  it('rolls the decision back if the mandatory audit insert fails', async () => {
    manager.save.mockImplementation(async (entity, data) => { if (entity === BillingEvent) throw Error('audit unavailable'); return data; });
    await expect(orchestration.prepareAdminResolution(7, 10, 'admin', decision(), now)).rejects.toThrow('audit unavailable');
    expect(runner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(runner.commitTransaction).not.toHaveBeenCalled();
  });
  it.each([Status.CREATED, Status.AWAITING_CUSTOMER, Status.UNKNOWN, Status.MANUAL_REVIEW])(
    'accepts a verified hosted callback after %s without a new charge', async status => {
      row.status = status;
      const claim = await orchestration.claimForHostedOutcome(10, 'webhook-1', 'owner', now);
      expect(claim.claimed).toBe(true);
      await orchestration.applyNormalizedOutcome(10, 'webhook-1', row.stateVersion,
        { kind: 'CAPTURED', cardcomTransactionId: 'verified-tx' }, now);
      expect(row.status).toBe(Status.CAPTURED);
      expect(debts.map(debt => debt.activeAttemptId)).toEqual([10, 10]);
    });
  it('does not take a webhook lease over a concurrent live operation or released debt', async () => {
    row.leaseOwner = 'admin'; row.leaseExpiresAt = new Date(now.getTime() + 1000);
    expect((await orchestration.claimForHostedOutcome(10, 'webhook', 'owner', now)).claimed).toBe(false);
    row.leaseOwner = null; row.leaseExpiresAt = null; debts[0].activeAttemptId = null;
    expect((await orchestration.claimForHostedOutcome(10, 'webhook', 'owner', now)).claimed).toBe(false);
  });
});

describe('Admin resolution runtime and authorization', () => {
  it.each(['ACTIVE', 'CANCELED'])('resumes only local token completion for a %s subscription', async status => {
    const row = { id: 10, obligationId: 1, planId: 5, status: Status.CAPTURED,
      cardcomTransactionId: 'verified-tx', capturedAt: new Date() };
    const debt = { id: 1, subscriptionId: 7, periodStart: '2026-10-06', periodEnd: '2026-11-06' };
    const sub = { id: 7, firebaseId: 'owner', status, planId: 5, currentPeriodEnd: new Date('2026-10-05'),
      canceledAt: status === 'CANCELED' ? new Date('2026-10-07') : null };
    const tx = { findOneOrFail: jest.fn().mockResolvedValue(sub), update: jest.fn() };
    const ds = { manager: { findOneByOrFail: jest.fn(async entity => entity === BillingAttempt ? row
      : entity === BillingObligation ? debt : { id: 5, name: 'Plan' }) }, transaction: async callback => callback(tx) };
    const cardcom = { chargeByToken: jest.fn() };
    const lifecycle = { resumeCapturedAttempt: jest.fn(async input => {
      await input.activate(row); await input.receipt.createReceipt(row, { kind: 'CAPTURED', cardcomTransactionId: 'verified-tx' });
      return { status: 'COMPLETED' };
    }) };
    const service = new SubscriptionRenewalService({ findOneByOrFail: jest.fn().mockResolvedValue(sub) } as any,
      cardcom as any, {} as any, {} as any, {} as any, {} as any, lifecycle as any, ds as any, {} as any);
    jest.spyOn(service as any, 'createCanonicalRenewalReceipt').mockResolvedValue({ receiptDocId: 99 });
    await expect(service.completeCapturedAttempt(10)).resolves.toBe('COMPLETED');
    expect(cardcom.chargeByToken).not.toHaveBeenCalled();
    expect(tx.update).toHaveBeenCalledWith(Subscription, 7, expect.objectContaining({
      status: status === 'CANCELED' ? 'CANCELED' : 'ACTIVE',
    }));
  });
  it('rejects a delegated non-admin using the real actor before mutation', async () => {
    const users = { isAdmin: jest.fn().mockResolvedValue(false) }, resolution = { resolve: jest.fn() };
    const controller = new AdminBillingController({} as any, users as any, resolution as any);
    await expect(controller.resolveAttempt({ user: { firebaseId: 'admin-client', actorFirebaseId: 'accountant' } } as any,
      7, 10, {} as any)).rejects.toThrow();
    expect(users.isAdmin).toHaveBeenCalledWith('accountant');
    expect(resolution.resolve).not.toHaveBeenCalled();
  });
  it('checks through lookup-only runtime and resumes a verified hosted capture', async () => {
    const row = { id: 10, obligationId: 1, stateVersion: 5, status: Status.UNKNOWN, chargeMode: BillingChargeMode.LOW_PROFILE_HOSTED };
    const orchestration = { prepareAdminResolution: jest.fn().mockResolvedValue(row) };
    const provider = { reconcileCharge: jest.fn().mockResolvedValue({ kind: 'APPLIED', attempt: { ...row, status: Status.CAPTURED } }) };
    const hosted = { completeCapturedHostedAttempt: jest.fn().mockResolvedValue('COMPLETED') };
    const renewal = { completeCapturedAttempt: jest.fn() };
    const ds = { manager: { findOneByOrFail: jest.fn(async entity => entity === BillingObligation
      ? { firebaseIdSnapshot: 'owner' } : { ...row, status: Status.COMPLETED }) } };
    const service = new AdminBillingResolutionService(ds as any, orchestration as any, provider as any, hosted as any, renewal as any);
    await expect(service.resolve(7, 10, 'admin', { action: 'CHECK_PROVIDER' } as any)).resolves.toMatchObject({ status: Status.COMPLETED });
    expect(provider.reconcileCharge).toHaveBeenCalledWith(expect.objectContaining({ attemptId: 10, subscriptionId: 7 }));
    expect(hosted.completeCapturedHostedAttempt).toHaveBeenCalledTimes(1);
    expect(renewal.completeCapturedAttempt).not.toHaveBeenCalled();
  });
});
