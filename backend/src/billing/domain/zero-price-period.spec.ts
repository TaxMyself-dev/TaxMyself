import { applyZeroPricePeriod } from './zero-price-period';
import { pricingFingerprint, jerusalemDate } from './subscription-pricing';
import { Subscription } from '../entities/subscription.entity';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { BillingEvent } from '../entities/billing-event.entity';
import { BillingAttempt } from '../entities/billing-attempt.entity';
import { BillingObligation } from '../entities/billing-obligation.entity';
import { BillingAccessMode, SubscriptionStatus } from '../enums/billing.enums';
import { BillingPlanChangeService } from '../services/billing-plan-change.service';
describe('zero-price service periods', () => {
  const now = new Date('2026-11-05T10:00:00Z'), start = new Date('2026-10-01T09:00:00Z'), end = new Date('2026-11-01T09:00:00Z');
  let sub: any, plan: any, manager: any;
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
    sub = { id: 1, firebaseId: 'owner', planId: 7, status: SubscriptionStatus.ACTIVE, billingAccessMode: BillingAccessMode.STANDARD,
      nextBillingDate: start, currentPeriodEnd: start, currentPeriodStart: new Date('2026-09-01T09:00:00Z'), customMonthlyPriceAgorot: 0 };
    plan = { id: 7, priceMonthlyAgorot: 10000, currency: 'ILS', isActive: true };
    manager = { findOne: jest.fn(async entity => entity === Subscription ? sub : entity === SubscriptionPlan ? plan : null),
      find: jest.fn().mockResolvedValue([]), update: jest.fn().mockResolvedValue({ affected: 1 }), create: jest.fn((_, data) => data), save: jest.fn() };
  });
  afterEach(() => jest.useRealTimers());
  const input = () => ({ subscriptionId: 1, planId: 7, start, end, anchor: 1, initial: false, actorFirebaseId: 'owner',
    fingerprint: pricingFingerprint(sub, plan, 'EXEMPT', jerusalemDate(now)) });
  it('advances without a payment attempt, captured event or accounting work', async () => {
    await expect(applyZeroPricePeriod(manager, input())).resolves.toBe(true);
    expect(manager.update).toHaveBeenCalledWith(Subscription, 1, expect.objectContaining({ currentPeriodStart: start, currentPeriodEnd: end, nextBillingDate: end }));
    expect(manager.save).toHaveBeenCalledWith(BillingEvent, expect.objectContaining({ metadata: expect.objectContaining({ policy: 'ZERO_PRICE_PERIOD_V1', monthlyNetAgorot: 0 }) }));
    expect(manager.save.mock.calls.every(call => call[0] === BillingEvent)).toBe(true);
  });
  it('rejects stale overlapping overdue renewal even when the new due date remains in the past', async () => {
    const request = input();
    sub.currentPeriodStart = start; sub.currentPeriodEnd = end; sub.nextBillingDate = end;
    await expect(applyZeroPricePeriod(manager, request)).resolves.toBe(false);
    expect(manager.update).not.toHaveBeenCalled();
  });
  it.each(['PREPARE', 'READY'])('cannot bypass %s enrollment for an initial free period', async command => {
    Object.assign(sub, { status: SubscriptionStatus.TRIAL, currentPeriodStart: null, currentPeriodEnd: null });
    manager.find.mockResolvedValue([{ metadata: { policy: 'OPEN_BANKING_TRIAL_V1', command } }]);
    await expect(applyZeroPricePeriod(manager, { ...input(), initial: true })).rejects.toThrow('ההצטרפות');
    expect(manager.update).not.toHaveBeenCalled();
  });
  it.each([BillingObligation, BillingAttempt])('cannot bypass unpaid debt or pending payment %s', blocked => {
    manager.findOne.mockImplementation(async entity => entity === Subscription ? sub : entity === SubscriptionPlan ? plan : entity === blocked ? {} : null);
    return expect(applyZeroPricePeriod(manager, input())).rejects.toThrow('חיוב קיים');
  });
  it('honors a saved zero enrollment agreement after catalog/custom prices change, without repricing', async () => {
    Object.assign(sub, { currentPeriodStart: null, customMonthlyPriceAgorot: 9900 });
    manager.find.mockResolvedValue([{ id: 11, metadata: { policy: 'OPEN_BANKING_TRIAL_V1', command: 'ACTIVATE',
      planId: 7, trialEnd: start.toISOString(), amountAgorot: 0, amountBeforeVatAgorot: 0, vatAmountAgorot: 0, currency: 'ILS' } }]);
    await expect(applyZeroPricePeriod(manager, { ...input(), fingerprint: undefined, agreementEventId: 11 })).resolves.toBe(true);
    await expect(applyZeroPricePeriod(manager, { ...input(), fingerprint: undefined, agreementEventId: 12 })).rejects.toThrow('ההצטרפות');
  });
  it('uses durable zero-period evidence for a subsequent prorated upgrade', async () => {
    const event = { metadata: { policy: 'ZERO_PRICE_PERIOD_V1', monthlyNetAgorot: 0 } };
    manager.findOne.mockImplementation(async entity => entity === BillingEvent ? event : null);
    const service = new BillingPlanChangeService({ manager } as any, {} as any);
    expect(await (service as any).paidMonthlyNet(manager, sub)).toBe(0);
  });
});
