import { AdminBillingService } from './admin-billing.service';
import { PricingService } from './pricing.service';
import { Subscription } from '../entities/subscription.entity';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { BillingEvent } from '../entities/billing-event.entity';
import { BillingAttempt } from '../entities/billing-attempt.entity';
import { BillingObligation } from '../entities/billing-obligation.entity';
import { Business } from 'src/business/business.entity';
import { AdminBillingController } from '../admin-billing.controller';

describe('admin price management', () => {
  let sub: any, plan: any, manager: any, service: AdminBillingService;
  beforeEach(() => {
    sub = { id: 1, firebaseId: 'owner', planId: 7, pricePolicy: 'LIVE', discountPercent: 10, nextBillingDate: null };
    plan = { id: 7, priceMonthlyAgorot: 10000, licensedDealerPriceMonthlyAgorot: 15000, currency: 'ILS', isActive: true };
    manager = { findOne: jest.fn(async entity => entity === Subscription ? sub : entity === SubscriptionPlan ? plan : null),
      find: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0),
      update: jest.fn().mockResolvedValue({ affected: 1 }), save: jest.fn(async (_, value) => value),
      create: jest.fn((_, value) => value), softDelete: jest.fn() };
    const db = { manager, transaction: jest.fn(async fn => fn(manager)) } as any;
    service = new AdminBillingService({ findOneBy: jest.fn(async () => plan), create: jest.fn(x => x) } as any,
      { findOneBy: jest.fn(async () => sub), find: jest.fn(async () => [sub]) } as any,
      db, {} as any, {} as any, {} as any, {} as any, new PricingService({} as any, {} as any, {} as any));
  });
  const terms = { pricePolicy: 'FROZEN' as const, customMonthlyPriceAgorot: 5000, customPriceStartDate: null, customPriceEndDate: null };
  it('freezes business-specific base even while personal price is active and audits before/after', async () => {
    manager.findOne.mockImplementation(async entity => entity === Subscription ? sub : entity === SubscriptionPlan ? plan : entity === Business ? {} : null);
    const result = await service.updateSubscriptionPricing(1, terms, 'admin');
    expect(result).toMatchObject({ frozenMonthlyPriceAgorot: 15000, current: { source: 'CUSTOM', amountBeforeVatAgorot: 5000 } });
    expect(manager.save).toHaveBeenCalledWith(BillingEvent, expect.objectContaining({ metadata: expect.objectContaining({
      actorFirebaseId: 'admin', before: expect.objectContaining({ pricePolicy: 'LIVE' }), after: expect.objectContaining({ frozenMonthlyPriceAgorot: 15000 }) }) }));
  });
  it('preserves snapshot on repeated frozen save, even after catalog change', async () => {
    Object.assign(sub, { pricePolicy: 'FROZEN', frozenPlanId: 7, frozenMonthlyPriceAgorot: 8000 });
    expect((await service.updateSubscriptionPricing(1, terms, 'admin')).frozenMonthlyPriceAgorot).toBe(8000);
  });
  it.each(['2026-02-31', 'invalid', '2026-13-01'])('rejects invalid calendar date %s', async value => {
    await expect(service.updateSubscriptionPricing(1, { ...terms, customPriceEndDate: value }, 'admin')).rejects.toThrow();
    expect(manager.update).not.toHaveBeenCalled();
  });
  it('rejects reversed dates and out-of-range money before a write', async () => {
    await expect(service.updateSubscriptionPricing(1, { ...terms, customPriceStartDate: '2026-11-06', customPriceEndDate: '2026-11-05' }, 'admin')).rejects.toThrow();
    await expect(service.updateSubscriptionPricing(1, { ...terms, customMonthlyPriceAgorot: 100000001 }, 'admin')).rejects.toThrow();
    expect(manager.update).not.toHaveBeenCalled();
  });
  it('accepts zero personal price and clears all custom dates when removed', async () => {
    expect((await service.updateSubscriptionPricing(1, { ...terms, customMonthlyPriceAgorot: 0 }, 'admin')).current?.amountBeforeVatAgorot).toBe(0);
    expect(await service.updateSubscriptionPricing(1, { ...terms, customMonthlyPriceAgorot: null }, 'admin')).toMatchObject({ customPriceStartDate: null, customPriceEndDate: null });
  });
  it('blocks pricing changes while an unresolved payment or approved enrollment exists', async () => {
    manager.findOne.mockImplementation(async entity => entity === Subscription ? sub : entity === BillingAttempt ? { id: 5 } : plan);
    await expect(service.updateSubscriptionPricing(1, terms, 'admin')).rejects.toThrow('תהליך חיוב');
    expect(manager.update).not.toHaveBeenCalled();
    manager.findOne.mockImplementation(async entity => entity === Subscription ? sub : entity === SubscriptionPlan ? plan : null);
    manager.find.mockResolvedValue([{ metadata: { policy: 'OPEN_BANKING_TRIAL_V1', command: 'READY' } }]);
    await expect(service.updateSubscriptionPricing(1, terms, 'admin')).rejects.toThrow('ההצטרפות');
  });
  it('allows an unchanged discount during pending payment but blocks actual price changes', async () => {
    manager.findOne.mockImplementation(async entity => entity === Subscription ? sub : entity === BillingAttempt ? { id: 9 } : null);
    await expect(service.updateSubscriptionDiscount(1, { discountPercent: 10, discountAmountAgorot: null, discountStartDate: null, discountEndDate: null }, 'admin')).resolves.toMatchObject({ discountPercent: 10 });
    expect(manager.update).not.toHaveBeenCalled();
    await expect(service.updateSubscriptionDiscount(1, { discountPercent: 20 }, 'admin')).rejects.toThrow('תהליך חיוב');
    expect(manager.update).not.toHaveBeenCalled();
  });
  it('returns the saved obligation quote instead of repricing an existing debt', async () => {
    sub.nextBillingDate = new Date('2026-11-06');
    manager.find.mockImplementation(async entity => entity === BillingObligation ? [{ kind: 'RENEWAL', amountBeforeVatAgorot: 8000, amountAgorot: 9440, vatAmountAgorot: 1440 }] : []);
    expect((await service.getSubscriptionPricing(1)).next).toMatchObject({ source: 'DEBT', amountIncludingVatAgorot: 9440 });
  });
  it('soft deletion preserves history and audits actor; attached members block it', async () => {
    await expect(service.deletePlan(7, 'admin')).resolves.toEqual({ deleted: true });
    expect(manager.softDelete).toHaveBeenCalledWith(SubscriptionPlan, 7);
    expect(manager.save).toHaveBeenCalledWith(BillingEvent, expect.objectContaining({ metadata: expect.objectContaining({ action: 'DELETE_PLAN', actorFirebaseId: 'admin' }) }));
    manager.count.mockResolvedValueOnce(1);
    await expect(service.deletePlan(7, 'admin')).rejects.toThrow('מנויים');
  });
  it.each(['SCHEDULE', 'PREPARE', 'READY'])('blocks deletion of pending %s target references', async command => {
    manager.find.mockResolvedValue([{ subscriptionId: 2, metadata: { policy: command === 'SCHEDULE' ? 'PRORATED_V1' : 'OPEN_BANKING_TRIAL_V1', command, snapshot: { targetPlanId: 7 }, planId: 7 } }]);
    await expect(service.deletePlan(7, 'admin')).rejects.toThrow('עתידית');
    expect(manager.softDelete).not.toHaveBeenCalled();
  });
  it('keeps only one recommended plan and rejects non-ILS currency', async () => {
    await service.updatePlan(7, { recommended: true }, 'admin');
    expect(manager.update).toHaveBeenCalledWith(SubscriptionPlan, { recommended: true }, { recommended: false });
    await expect(service.updatePlan(7, { currency: 'USD' }, 'admin')).rejects.toThrow('ILS');
  });
  it.each(['subscriptionPricing', 'updatePricing', 'planImpact', 'deletePlan'])('admin-checks %s before data access', async method => {
    const operations = { getSubscriptionPricing: jest.fn(), updateSubscriptionPricing: jest.fn(), planImpact: jest.fn(), deletePlan: jest.fn() };
    const controller = new AdminBillingController(operations as any, { isAdmin: jest.fn().mockResolvedValue(false) } as any);
    await expect((controller as any)[method]({ user: { firebaseId: 'user' } }, 1, terms)).rejects.toThrow();
    Object.values(operations).forEach(fn => expect(fn).not.toHaveBeenCalled());
  });
});
