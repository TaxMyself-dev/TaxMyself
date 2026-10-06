import { BillingAttemptOrchestrationService } from './billing-attempt-orchestration.service';
import { BillingAttempt } from '../entities/billing-attempt.entity';
import { BillingAttemptObligation } from '../entities/billing-attempt-obligation.entity';
import { BillingObligation } from '../entities/billing-obligation.entity';
import { Subscription } from '../entities/subscription.entity';
import { BillingAccessMode, BillingAttemptStatus, BillingObligationKind, BillingObligationStatus, SubscriptionStatus } from '../enums/billing.enums';

describe('one attempt for several period debts', () => {
  const actor = { actorFirebaseId: 'owner', subjectFirebaseId: 'owner' };
  function make() {
    const sub: any = { id: 7, firebaseId: 'owner', status: SubscriptionStatus.PAST_DUE };
    const debts: any[] = [1,2,3].map(id => ({ id, subscriptionId: 7, firebaseIdSnapshot: 'owner',
      kind: BillingObligationKind.RECURRING_PERIOD, status: BillingObligationStatus.OPEN,
      planId: 2, periodStart: `2026-0${id+6}-15`, periodEnd: `2026-0${id+7}-15`,
      amountAgorot: 11800, amountBeforeVatAgorot: 10000, vatAmountAgorot: 1800,
      currency: 'ILS', activeAttemptId: null, satisfiedAttemptId: null, version: 0 }));
    const attempts: any[] = [], links: any[] = [];
    const manager: any = {
      find: jest.fn(async (entity: any, options: any) => {
        if (entity === BillingAttemptObligation) return links.filter(link => link.attemptId === options.where.attemptId);
        if (entity === BillingObligation) return debts.filter(debt => debt.status === options.where.status);
        return [];
      }),
      findOne: jest.fn(async (entity: any, options: any) => {
        if (entity === Subscription) return sub;
        if (entity === BillingObligation) return debts.find(debt => debt.id === options.where.id);
        if (entity === BillingAttempt) return options.where.id
          ? attempts.find(attempt => attempt.id === options.where.id)
          : [...attempts].reverse().find(attempt => attempt.obligationId === options.where.obligationId) ?? null;
      }),
      create: (_entity: any, value: any) => value,
      save: jest.fn(async (entity: any, value: any) => {
        if (entity === BillingAttempt && !value.id) { value.id = attempts.length+21; attempts.push(value); }
        if (entity === BillingAttemptObligation) links.push(value);
        return value;
      }),
    };
    // Serial transactions model the subscription lock; every provider operation stays outside.
    let tail = Promise.resolve();
    const ds: any = { manager, createQueryRunner: () => {
      let release: () => void;
      return { manager, connect: async () => {},
        startTransaction: async () => { const prior = tail; tail = new Promise(resolve => { release = resolve; }); await prior; },
        commitTransaction: async () => release(), rollbackTransaction: async () => release(), release: async () => {},
      };
    }};
    let counter = 0;
    return { sub, debts, attempts, links, manager,
      service: new BillingAttemptOrchestrationService(ds, () => `billing-key-${++counter}`) };
  }
  it('reserves all debts, freezes membership and uses one summed amount', async () => {
    const { service, debts, links } = make();
    const result = await service.createRecoveryCollection(actor, 7, [1,2,3]);
    expect(result.attempt.amountAgorot).toBe(35400);
    expect(links.map(link => link.obligationId)).toEqual([1,2,3]);
    expect(debts.every(debt => debt.activeAttemptId === result.attempt.id)).toBe(true);
  });
  it('refuses debt checkout when full complimentary access was granted', async () => {
    const { service, sub, attempts, links } = make();
    sub.billingAccessMode = BillingAccessMode.COMPLIMENTARY_FULL;
    await expect(service.createRecoveryCollection(actor, 7, [1,2,3])).rejects.toThrow('Recovery state changed');
    expect(attempts).toHaveLength(0);
    expect(links).toHaveLength(0);
  });
  it('two concurrent submissions cannot create overlapping attempts', async () => {
    const { service, attempts } = make();
    const result = await Promise.allSettled([service.createRecoveryCollection(actor, 7, [1,2,3]),
      service.createRecoveryCollection(actor, 7, [1,2,3])]);
    expect(result.filter(item => item.status === 'fulfilled')).toHaveLength(1);
    expect(attempts).toHaveLength(1);
  });
  it('refuses a changed balance before allocating a provider key', async () => {
    const { service, attempts } = make();
    await expect(service.createRecoveryCollection(actor, 7, [1,2])).rejects.toThrow('changed');
    expect(attempts).toHaveLength(0);
  });
  it.each([BillingAttemptStatus.UNKNOWN, BillingAttemptStatus.CAPTURED, BillingAttemptStatus.PROCESSING])(
    'never opens a second collection while a %s attempt reserves a member', async status => {
      const { service, debts, attempts } = make();
      debts[1].activeAttemptId = 99;
      attempts.push({ id: 99, status });
      await expect(service.createRecoveryCollection(actor, 7, [1,2,3])).rejects.toThrow('reserved');
      expect(attempts).toHaveLength(1);
    });
  it('decline releases every member but retains the attempt links for history', async () => {
    const { service, debts, links } = make();
    const opened = await service.createRecoveryCollection(actor, 7, [1,2,3]);
    const claim = await service.claimForSubmission(opened.attempt.id, 'webhook', 0);
    await service.applyNormalizedOutcome(opened.attempt.id, 'webhook', claim.attempt.stateVersion, { kind: 'DECLINED' });
    expect(debts.every(debt => debt.activeAttemptId === null && debt.status === BillingObligationStatus.OPEN)).toBe(true);
    expect(links).toHaveLength(3);
    const retry = await service.createRecoveryCollection(actor, 7, [1,2,3]);
    expect(retry.attempt.id).not.toBe(opened.attempt.id);
    expect(links).toHaveLength(6);
  });
  it('one receipt closes exactly the captured membership, leaving newer debt open', async () => {
    const { service, debts } = make();
    const opened = await service.createRecoveryCollection(actor, 7, [1,2,3]);
    const claim = await service.claimForSubmission(opened.attempt.id, 'webhook', 0);
    await service.applyNormalizedOutcome(opened.attempt.id, 'webhook', claim.attempt.stateVersion,
      { kind: 'CAPTURED', cardcomTransactionId: 'verified-charge' });
    debts.push({ ...debts[0], id: 4, activeAttemptId: null, satisfiedAttemptId: null });
    await service.finalizeCapturedAttempt(opened.attempt.id, 500);
    expect(debts.slice(0,3).every(debt => debt.satisfiedAttemptId === opened.attempt.id && debt.status === BillingObligationStatus.SATISFIED)).toBe(true);
    expect(debts[3].status).toBe(BillingObligationStatus.OPEN);
    expect((await service.finalizeCapturedAttempt(opened.attempt.id, 500)).receiptDocId).toBe(500);
    await expect(service.finalizeCapturedAttempt(opened.attempt.id, 501)).rejects.toThrow();
  });
  it('refuses finalization when any member is no longer owned by the capture', async () => {
    const { service, debts } = make();
    const opened = await service.createRecoveryCollection(actor, 7, [1,2,3]);
    opened.attempt.status = BillingAttemptStatus.CAPTURED;
    debts[2].activeAttemptId = 99;
    await expect(service.finalizeCapturedAttempt(opened.attempt.id, 500)).rejects.toThrow();
    expect(debts.every(debt => debt.status === BillingObligationStatus.OPEN)).toBe(true);
    expect(opened.attempt.status).toBe(BillingAttemptStatus.CAPTURED);
  });
  it('rejects cross-subscription membership before any attempt is saved', async () => {
    const { service, debts, attempts } = make();
    debts[1].firebaseIdSnapshot = 'other';
    await expect(service.createRecoveryCollection(actor, 7, [1,2,3])).rejects.toThrow();
    expect(attempts).toHaveLength(0);
  });
});
