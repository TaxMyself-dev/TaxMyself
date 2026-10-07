import { OpenBankingEnrollmentService } from './open-banking-enrollment.service';
import { Subscription } from '../entities/subscription.entity';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { PaymentMethod } from '../entities/payment-method.entity';
import { BillingObligation } from '../entities/billing-obligation.entity';
import { BillingEvent } from '../entities/billing-event.entity';
import { ModuleName } from 'src/enum';

describe('Open banking trial enrollment', () => {
  const owner = { actorFirebaseId: 'owner', subjectFirebaseId: 'owner' };
  const end = new Date('2026-11-07T07:14:48Z');
  let sub: any, events: any[], debts: any[], manager: any, service: OpenBankingEnrollmentService, failWrite: boolean;
  const plans = [{ id: 5, name: 'Banking', isPublic: true, isActive: true, slug: 'banking', modules: [ModuleName.OPEN_BANKING] },
    { id: 4, name: 'Basic', isPublic: true, isActive: true, slug: 'basic', modules: [ModuleName.EXPENSES] }];
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-07T09:00:00Z'));
    sub = { id: 7, firebaseId: 'owner', status: 'TRIAL', billingAccessMode: 'STANDARD', trialEnd: end,
      trialStart: new Date('2026-09-23'), planId: null, paymentMethodId: null,
      currentPeriodStart: null, currentPeriodEnd: null, nextBillingDate: null, canceledAt: null, endedAt: null };
    events = []; debts = []; failWrite = false;
    manager = {
      findOne: jest.fn(async (entity, opts) => {
        if (entity === Subscription) return sub;
        if (entity === BillingEvent) return events.at(-1) ?? null;
        if (entity === SubscriptionPlan) return plans.find(p => p.id === opts.where.id) ?? null;
        if (entity === PaymentMethod) return { cardcomToken: 'encrypted', cardExpiryYear: 2030, cardExpiryMonth: 12 };
        return null;
      }),
      findOneOrFail: jest.fn(async (_entity, opts) => plans.find(p => p.id === opts.where.id)),
      find: jest.fn(async entity => entity === BillingObligation ? debts : entity === SubscriptionPlan ? plans : [sub]),
      update: jest.fn(async (_entity, _id, patch) => Object.assign(sub, patch)),
      create: jest.fn((_entity, value) => value),
      save: jest.fn(async (_entity, value) => {
        if (failWrite) throw Error('write failed');
        value.id = events.length + 1; events.push(value); return value;
      }),
    };
    const db: any = { manager, transaction: async work => {
      const before = { ...sub }, previous = [...events];
      try { return await work(manager); }
      catch (error) { Object.assign(sub, before); events = previous; throw error; }
    } };
    service = new OpenBankingEnrollmentService(db, { calculateCheckoutPrice: jest.fn(async () => ({
      finalAmountAgorot: 6372, amountBeforeVatAgorot: 5400, vatAmountAgorot: 972, currency: 'ILS' })) } as any);
  });
  afterEach(() => jest.useRealTimers());
  async function prepare() {
    const options = await service.options('owner');
    return service.prepare(owner, 5, options.plans[0].quote);
  }
  it('shows only banking plans and rejects a non-banking plan on the server', async () => {
    const options = await service.options('owner');
    expect(options.plans.map(p => p.id)).toEqual([5]);
    await expect(service.prepare(owner, 4, options.plans[0].quote)).rejects.toThrow('בנקאות');
  });
  it('does not activate, select a paid plan, schedule or create debt merely by saving a card', async () => {
    sub.paymentMethodId = 1;
    await prepare(); jest.setSystemTime(end);
    expect(await service.activateDue(7)).toBe(false);
    expect(sub.status).toBe('TRIAL'); expect(sub.planId).toBeNull(); expect(sub.nextBillingDate).toBeNull();
    expect(debts).toEqual([]);
  });
  it('requires a card before entering Feezback and does not trust only a prepared event', async () => {
    await prepare(); await expect(service.assertCanConnect(owner)).rejects.toThrow('כרטיס');
    sub.paymentMethodId = 1; await service.assertCanConnect(owner);
    expect(sub.status).toBe('TRIAL');
  });
  it('deduplicates approval and verified connection, preserving the original trial end', async () => {
    sub.paymentMethodId = 1; await prepare(); await prepare();
    await service.connectionVerified('owner'); await service.connectionVerified('owner');
    expect(events.map(e => e.metadata.command)).toEqual(['PREPARE', 'READY']);
    expect(sub.status).toBe('TRIAL'); expect(sub.nextBillingDate).toEqual(end); expect(sub.trialEnd).toEqual(end);
    expect(await service.activateDue(7)).toBe(false);
  });
  it('promotes once at the exact boundary and retains approved first-period pricing', async () => {
    sub.paymentMethodId = 1; await prepare(); await service.connectionVerified('owner');
    jest.setSystemTime(end); await service.activateDue(7); await service.activateDue(7);
    expect(sub.status).toBe('ACTIVE'); expect(sub.nextBillingDate).toEqual(end);
    expect(sub.currentPeriodStart).toBeNull(); expect(sub.currentPeriodEnd).toEqual(end);
    expect(events.map(e => e.metadata.command)).toEqual(['PREPARE', 'READY', 'ACTIVATE']);
    expect(await service.firstPeriodPrice(sub, end)).toEqual({ finalAmountAgorot: 6372,
      amountBeforeVatAgorot: 5400, vatAmountAgorot: 972 });
  });
  it('canceling before the boundary picks a non-banking plan without ending or extending trial', async () => {
    sub.paymentMethodId = 1; await prepare(); await service.connectionVerified('owner');
    await service.cancel(owner, 2, 4); jest.setSystemTime(end);
    expect(await service.activateDue(7)).toBe(false); expect(sub.planId).toBe(4);
    expect(sub.status).toBe('TRIAL'); expect(sub.trialEnd).toEqual(end); expect(sub.nextBillingDate).toBeNull();
    expect(sub.paymentMethodId).toBe(1);
  });
  it('rejects a stale cancel or banking target and refuses cancel at the charge boundary', async () => {
    sub.paymentMethodId = 1; await prepare(); await service.connectionVerified('owner');
    await expect(service.cancel(owner, 1, 4)).rejects.toThrow('השתנה');
    await expect(service.cancel(owner, 2, 5)).rejects.toThrow('ללא');
    jest.setSystemTime(end); await expect(service.cancel(owner, 2, 4)).rejects.toThrow('השתנה');
  });
  it('mandatory event failure rolls back the scheduled state', async () => {
    sub.paymentMethodId = 1; await prepare(); failWrite = true;
    await expect(service.connectionVerified('owner')).rejects.toThrow('write failed');
    expect(sub.planId).toBeNull(); expect(sub.nextBillingDate).toBeNull(); expect(events).toHaveLength(1);
  });
  it('does not re-arm canceled subscriptions from late provider events', async () => {
    sub.paymentMethodId = 1; await prepare(); sub.status = 'CANCELED'; sub.endedAt = new Date();
    await service.connectionVerified('owner'); jest.setSystemTime(end);
    expect(await service.activateDue(7)).toBe(false); expect(events).toHaveLength(1);
  });
  it('rejects delegated enrollment before reading or writing subscription state', async () => {
    await expect(service.prepare({ ...owner, actorFirebaseId: 'other', isDelegatedAccess: true }, 5, 'a'.repeat(64)))
      .rejects.toThrow(); expect(events).toEqual([]);
  });
  it('does not promote or prepare while a payment remains unresolved', async () => {
    sub.paymentMethodId = 1; await prepare(); await service.connectionVerified('owner');
    debts = [{ activeAttemptId: 33 }]; jest.setSystemTime(end);
    expect(await service.activateDue(7)).toBe(false); expect(sub.status).toBe('TRIAL');
  });
  it('rejects a stale price quote or modified trial end', async () => {
    const options = await service.options('owner'); sub.trialEnd = new Date('2026-11-08T07:14:48Z');
    await expect(service.prepare(owner, 5, options.plans[0].quote)).rejects.toThrow('השתנו');
  });
  it('rechecks a saved-card pending connection, but not an abandoned old enrollment', async () => {
    sub.paymentMethodId = 1; await prepare();
    expect(await service.pendingConnectionChecks()).toEqual(['owner']);
    jest.setSystemTime(new Date('2026-11-15T07:14:48Z'));
    expect(await service.pendingConnectionChecks()).toEqual([]);
  });
  it('allows an abandoned, never-connected enrollment to be withdrawn after trial expiry', async () => {
    sub.paymentMethodId = 1; await prepare();
    jest.setSystemTime(new Date('2026-11-15T07:14:48Z')); sub.status = 'TRIAL_EXPIRED';
    await service.cancel(owner, 1, 4);
    expect(sub.status).toBe('TRIAL_EXPIRED'); expect(sub.nextBillingDate).toBeNull();
    expect(events.at(-1).metadata.command).toBe('CANCEL');
  });
});
