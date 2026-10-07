import { BillingCancellationService, CANCELLATION_POLICY } from './billing-cancellation.service';
import { BillingEvent } from '../entities/billing-event.entity';
import { BillingObligation } from '../entities/billing-obligation.entity';
import { Subscription } from '../entities/subscription.entity';
import { BillingEventType } from '../enums/billing.enums';

describe('BillingCancellationService', () => {
  const owner = { actorFirebaseId: 'owner', subjectFirebaseId: 'owner' };
  const end = new Date('2026-11-07T07:14:48Z');
  let sub: any, events: any[], open: any[], manager: any, service: BillingCancellationService, failSave: boolean;
  const dto = () => ({ expectedStatus: sub.status, expectedPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null });
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-07T09:00:00Z'));
    sub = { id: 7, firebaseId: 'owner', status: 'ACTIVE', billingAccessMode: 'STANDARD', planId: 5,
      currentPeriodStart: new Date('2026-10-07T06:14:48Z'), currentPeriodEnd: end, nextBillingDate: end,
      canceledAt: null, endedAt: null, renewalAttempts: 0, billingAnchorDay: 7 };
    events = []; open = []; failSave = false;
    manager = {
      findOne: jest.fn(async (entity, opts) => {
        if (entity === Subscription) return sub;
        if (entity === BillingEvent) return [...events].reverse().find(e => e.eventType === opts.where.eventType) ?? null;
        return null;
      }),
      find: jest.fn(async entity => entity === BillingObligation ? open : [{ id: 7 }]),
      create: jest.fn((_entity, value) => value),
      save: jest.fn(async (entity, value) => {
        if (entity === BillingEvent) {
          if (failSave) throw Error('event write failed');
          value.id = events.length + 1; events.push(value);
        }
        return value;
      }),
    };
    const ds: any = { manager, transaction: async work => {
      const previous = { ...sub }, history = [...events];
      try { return await work(manager); }
      catch (err) { Object.assign(sub, previous); events = history; throw err; }
    } };
    service = new BillingCancellationService(ds);
  });
  afterEach(() => jest.useRealTimers());

  it('schedules exactly at paid end, retaining plan, dates and old debts', async () => {
    open = [{ id: 10, activeAttemptId: null, amountAgorot: 5900 }];
    const previous = { ...sub };
    const result = await service.request(owner, dto());
    expect(result).toEqual({ status: 'SCHEDULED', eventId: 1, effectiveAt: end.toISOString() });
    expect(sub).toEqual({ ...previous, canceledAt: end });
    expect(open[0].amountAgorot).toBe(5900);
    expect(await service.pending(sub)).toEqual({ eventId: 1, effectiveAt: end.toISOString() });
    expect(manager.findOne).toHaveBeenCalledWith(Subscription, expect.objectContaining({ lock: { mode: 'pessimistic_write' } }));
    expect(events[0].metadata).toEqual(expect.objectContaining({ policy: CANCELLATION_POLICY, command: 'REQUEST', actorFirebaseId: 'owner' }));
  });
  it('treats a duplicate cancellation as the same request', async () => {
    await service.request(owner, dto());
    await service.request(owner, dto());
    expect(events).toHaveLength(1);
  });
  it('withdraws the exact request before its effective instant and permits a fresh later request', async () => {
    const previous = { ...sub };
    await service.request(owner, dto());
    await service.withdraw(owner, 1);
    expect(sub).toEqual(previous);
    expect(await service.pending(sub)).toBeNull();
    await service.request(owner, dto());
    await expect(service.withdraw(owner, 1)).rejects.toThrow('הבקשה');
    expect(sub.canceledAt).toEqual(end);
  });
  it('does not apply early, then ends once at the boundary and rejects withdrawal', async () => {
    await service.request(owner, dto());
    await service.applyDue(7);
    expect(sub.status).toBe('ACTIVE');
    jest.setSystemTime(end);
    await expect(service.withdraw(owner, 1)).rejects.toThrow('הבקשה');
    await service.applyDue(7);
    expect(sub.status).toBe('CANCELED');
    expect(sub.nextBillingDate).toBeNull();
    expect(sub.endedAt).toEqual(end);
    expect(sub.currentPeriodEnd).toEqual(end);
    await service.applyDue(7);
    expect(events.map(e => e.metadata.command)).toEqual(['REQUEST', 'APPLY']);
  });
  it.each(['TRIAL', 'TRIAL_EXPIRED', 'PAST_DUE'])('ends %s immediately without granting paid access', async status => {
    sub.status = status;
    const before = { ...sub };
    const result = await service.request(owner, dto());
    expect(result.status).toBe('CANCELED');
    expect(sub.canceledAt).toEqual(new Date());
    expect(sub.endedAt).toEqual(new Date());
    expect(sub.currentPeriodEnd).toEqual(before.currentPeriodEnd);
    expect(sub.nextBillingDate).toBeNull();
    await expect(service.withdraw(owner, result.eventId!)).rejects.toThrow();
  });
  it('ends an overdue ACTIVE subscription immediately and preserves its unpaid history', async () => {
    sub.currentPeriodEnd = new Date('2026-09-07'); sub.nextBillingDate = new Date('2026-10-07'); sub.renewalAttempts = 2;
    open = [{ id: 10, activeAttemptId: null }];
    expect((await service.request(owner, dto())).status).toBe('CANCELED');
    expect(open).toEqual([{ id: 10, activeAttemptId: null }]);
  });
  it('supersedes a pending downgrade and never resurrects it after withdrawal', async () => {
    events.push({ id: 1, eventType: BillingEventType.PLAN_CHANGE_REQUESTED,
      metadata: { command: 'SCHEDULE', snapshot: { targetPlanId: 4 } } });
    const result = await service.request(owner, dto());
    expect(events[2].metadata).toEqual(expect.objectContaining({ command: 'CANCEL', reason: 'SUBSCRIPTION_CANCELLATION' }));
    await service.withdraw(owner, result.eventId!);
    expect(events.filter(e => e.metadata.command === 'SCHEDULE')).toHaveLength(1);
    expect(events.filter(e => e.eventType === BillingEventType.PLAN_CHANGE_REQUESTED).slice(-1)[0].metadata.command).toBe('CANCEL');
  });
  it('rejects stale period/status confirmation, complimentary and pending payments', async () => {
    await expect(service.request(owner, { ...dto(), expectedPeriodEnd: '2026-12-07T07:14:48Z' })).rejects.toThrow('השתנה');
    await expect(service.request(owner, { ...dto(), expectedStatus: 'TRIAL' as any })).rejects.toThrow('השתנה');
    sub.billingAccessMode = 'COMPLIMENTARY_FULL';
    await expect(service.request(owner, dto())).rejects.toThrow();
    sub.billingAccessMode = 'STANDARD'; open = [{ activeAttemptId: 99 }];
    await expect(service.request(owner, dto())).rejects.toThrow('תהליך תשלום');
    expect(events).toHaveLength(0);
    expect(sub.canceledAt).toBeNull();
  });
  it.each(['isDelegatedAccess', 'isAdminImpersonation', 'isRepresentedSubject'])('rejects %s for request and withdrawal', async flag => {
    const actor = { ...owner, [flag]: true };
    await expect(service.request(actor, dto())).rejects.toThrow();
    await expect(service.withdraw(actor, 1)).rejects.toThrow();
    expect(manager.save).not.toHaveBeenCalled();
  });
  it('rolls back request and due application if mandatory history cannot persist', async () => {
    failSave = true;
    await expect(service.request(owner, dto())).rejects.toThrow('event write');
    expect(sub.canceledAt).toBeNull();
    failSave = false; await service.request(owner, dto());
    jest.setSystemTime(end); failSave = true;
    await expect(service.applyDue(7)).rejects.toThrow('event write');
    expect(sub.status).toBe('ACTIVE');
    expect(sub.nextBillingDate).toEqual(end);
  });
});
