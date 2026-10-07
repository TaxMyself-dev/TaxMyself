import { BillingPlanChangeService } from './billing-plan-change.service';
import { BillingEvent } from '../entities/billing-event.entity';
import { BillingObligation } from '../entities/billing-obligation.entity';
import { Subscription } from '../entities/subscription.entity';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { BillingEventType } from '../enums/billing.enums';
import { PlanChangeSnapshot, PLAN_CHANGE_POLICY } from '../domain/billing-plan-change';

describe('BillingPlanChangeService', () => {
  const owner = { actorFirebaseId: 'owner', subjectFirebaseId: 'owner' };
  let sub: any, paid: any, open: any[], events: any[], manager: any, pricing: any, service: BillingPlanChangeService;
  let failSave: boolean;
  const snapshotOf = (preview: any): PlanChangeSnapshot => {
    const { planChangeQuote, effectiveAt, nextBillingDate, vatRate, expiresAt, ...snapshot } = preview;
    return snapshot;
  };
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-22T09:00:00Z'));
    sub = { id: 7, firebaseId: 'owner', status: 'ACTIVE', billingAccessMode: 'STANDARD', planId: 1,
      currentPeriodStart: new Date('2026-09-07T09:00:00Z'), currentPeriodEnd: new Date('2026-10-07T09:00:00Z'),
      nextBillingDate: new Date('2026-10-07T09:00:00Z'), renewalAttempts: 0 };
    paid = { amountBeforeVatAgorot: 5000, satisfiedAttemptId: 20 };
    open = []; events = []; failSave = false;
    manager = {
      findOne: jest.fn(async (entity, opts) => {
        if (entity === Subscription) return sub;
        if (entity === SubscriptionPlan) return { id: opts.where.id, name: 'Target', isActive: true, currency: 'ILS', priceMonthlyAgorot: 5000 };
        if (entity === BillingObligation) return paid;
        if (entity === BillingEvent) {
          if (opts.where.billingAttemptId) return events.find(e => e.billingAttemptId === opts.where.billingAttemptId) ?? null;
          if (opts.where.eventType === BillingEventType.PLAN_CHANGE_REQUESTED) return [...events].reverse().find(e =>
            e.eventType === BillingEventType.PLAN_CHANGE_REQUESTED && ['SCHEDULE', 'CANCEL', 'APPLY'].includes(e.metadata.command)) ?? null;
          return null;
        }
        return null;
      }),
      find: jest.fn(async () => open), create: jest.fn((_entity, data) => data),
      save: jest.fn(async (_entity, data) => { if (failSave) throw new Error('write failed'); data.id = events.length + 1; events.push(data); return data; }),
      update: jest.fn(async (_entity, _id, patch) => { Object.assign(sub, patch); return { affected: 1 }; }),
    };
    pricing = {
      calculateCheckoutPrice: jest.fn(async (_uid, planId) => {
        const net = planId === 1 ? 5000 : planId === 2 ? 8000 : 3000;
        return { originalAmountAgorot: net, amountBeforeVatAgorot: net, finalAmountAgorot: Math.round(net * 1.18), currency: 'ILS', billingBusinessType: 'EXEMPT' };
      }),
      resolveEffectivePlanPrice: jest.fn(plan => plan.priceMonthlyAgorot),
      calculateBillingAmounts: jest.fn(net => ({ vatRate: 18, vatAmountAgorot: Math.round(net * .18), amountIncludingVatAgorot: net + Math.round(net * .18) })),
    };
    const dataSource: any = { manager, transaction: jest.fn(async callback => {
      const oldSub = { ...sub }, oldEvents = [...events];
      try { return await callback(manager); }
      catch (err) { Object.assign(sub, oldSub); events = oldEvents; throw err; }
    }) };
    service = new BillingPlanChangeService(dataSource, pricing);
  });
  afterEach(() => jest.useRealTimers());

  it('previews a frozen half-period difference and keeps the next billing date', async () => {
    const preview = await service.preview(owner, 2);
    expect(preview.finalAmountAgorot).toBe(1770);
    expect(preview.amountBeforeVatAgorot).toBe(1500);
    expect(preview.nextBillingDate).toBe(sub.nextBillingDate.toISOString());
    expect(preview.renewalAmountAgorot).toBe(9440);
    expect(manager.save).not.toHaveBeenCalled();
    expect(pricing.calculateCheckoutPrice).toHaveBeenCalledWith('owner', 2, sub.currentPeriodEnd);
  });
  it('uses the paid monthly amount when today’s old-plan price has changed', async () => {
    paid.amountBeforeVatAgorot = 4000;
    expect((await service.preview(owner, 2)).amountBeforeVatAgorot).toBe(2000);
  });

  it('can schedule a downgrade even when old paid terms are unavailable', async () => {
    paid = null;
    expect((await service.preview(owner, 3)).action).toBe('DOWNGRADE');
  });

  it('does not turn a cheaper plan into an upgrade when an old discount has expired', async () => {
    paid.amountBeforeVatAgorot = 1000;
    expect((await service.preview(owner, 3)).action).toBe('DOWNGRADE');
  });
  it('uses the full monthly target terms of an earlier prorated upgrade', async () => {
    events.push({ billingAttemptId: 20, metadata: { policy: PLAN_CHANGE_POLICY, command: 'UPGRADE_RESERVED',
      snapshot: { targetMonthlyNetAgorot: 6000 } } });
    expect((await service.preview(owner, 2)).amountBeforeVatAgorot).toBe(1000);
  });
  it.each(['same', 'expired', 'complimentary', 'past-due', 'missing-paid-terms'])('rejects %s', async reason => {
    if (reason === 'expired') jest.setSystemTime(sub.currentPeriodEnd);
    if (reason === 'complimentary') sub.billingAccessMode = 'COMPLIMENTARY_FULL';
    if (reason === 'past-due') sub.status = 'PAST_DUE';
    if (reason === 'missing-paid-terms') paid = null;
    await expect(service.preview(owner, reason === 'same' ? 1 : 2)).rejects.toThrow();
    expect(manager.save).not.toHaveBeenCalled();
  });
  it('rejects expired and future quote timestamps', async () => {
    await expect(service.preview(owner, 2, '2026-09-22T08:00:00Z')).rejects.toThrow();
    await expect(service.preview(owner, 2, '2026-09-23T09:00:00Z')).rejects.toThrow();
  });
  it('schedules without changing current access or billing and can cancel the exact request', async () => {
    const before = { ...sub };
    const preview = await service.preview(owner, 3);
    expect(preview.action).toBe('DOWNGRADE');
    expect(preview.finalAmountAgorot).toBe(0);
    expect(await service.applyLocal(owner, snapshotOf(preview))).toEqual({ status: 'SCHEDULED', effectiveAt: sub.currentPeriodEnd.toISOString() });
    expect(sub).toEqual(before);
    const pending = await service.pending(7);
    expect(pending?.planId).toBe(3);
    await service.cancel(owner, pending!.eventId);
    expect(await service.pending(7)).toBeNull();
    expect(sub).toEqual(before);
  });
  it('rejects a duplicate confirmation and a stale cancellation', async () => {
    const preview = await service.preview(owner, 3);
    await service.applyLocal(owner, snapshotOf(preview));
    await expect(service.applyLocal(owner, snapshotOf(preview))).rejects.toThrow('השתנתה');
    await expect(service.cancel(owner, 999)).rejects.toThrow('השתנתה');
    expect(events).toHaveLength(1);
  });
  it('applies a zero-cost upgrade immediately while preserving every service date', async () => {
    paid.amountBeforeVatAgorot = 8000;
    const original = { ...sub };
    const preview = await service.preview(owner, 2);
    expect(preview.action).toBe('UPGRADE');
    expect(preview.finalAmountAgorot).toBe(0);
    expect((await service.applyLocal(owner, snapshotOf(preview))).status).toBe('APPLIED');
    expect(sub).toEqual({ ...original, planId: 2 });
    expect(events.find(e => e.eventType === BillingEventType.PLAN_CHANGED)?.metadata.withoutCharge).toBe(true);
  });
  it('applies a scheduled downgrade only at the boundary and exactly once', async () => {
    const preview = await service.preview(owner, 3);
    await service.applyLocal(owner, snapshotOf(preview));
    await service.applyDue(7);
    expect(sub.planId).toBe(1);
    jest.setSystemTime(sub.currentPeriodEnd);
    await service.applyDue(7);
    expect(sub.planId).toBe(3);
    expect(sub.currentPeriodEnd.toISOString()).toBe(preview.sourcePeriodEnd);
    await service.applyDue(7);
    expect(events.filter(e => e.eventType === BillingEventType.PLAN_CHANGED)).toHaveLength(1);
  });
  it('does not apply a canceled downgrade at renewal', async () => {
    await service.applyLocal(owner, snapshotOf(await service.preview(owner, 3)));
    await service.cancel(owner, 1);
    jest.setSystemTime(sub.currentPeriodEnd);
    await service.applyDue(7);
    expect(sub.planId).toBe(1);
  });
  it('blocks schedule/renewal switch while a capture remains unresolved', async () => {
    const preview = await service.preview(owner, 3);
    open = [{ activeAttemptId: 9 }];
    await expect(service.applyLocal(owner, snapshotOf(preview))).rejects.toThrow('תהליך תשלום');
    open = [];
    await service.applyLocal(owner, snapshotOf(preview));
    open = [{ activeAttemptId: 9 }];
    jest.setSystemTime(sub.currentPeriodEnd);
    await expect(service.applyDue(7)).rejects.toThrow('תהליך תשלום');
    expect(sub.planId).toBe(1);
  });
  it('rejects represented mutation actors', async () => {
    const actor = { ...owner, actorFirebaseId: 'agent', isDelegatedAccess: true };
    await expect(service.preview(actor, 2)).rejects.toThrow();
    await expect(service.cancel(actor, 1)).rejects.toThrow();
  });
  it('rolls back scheduling on persistence failure instead of returning success', async () => {
    const snapshot = snapshotOf(await service.preview(owner, 3));
    failSave = true;
    await expect(service.applyLocal(owner, snapshot)).rejects.toThrow('write failed');
    expect(events).toHaveLength(0);
    expect(sub.planId).toBe(1);
  });
});
