import { PricingService } from './pricing.service';
import { Subscription } from '../entities/subscription.entity';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { BusinessType, ModuleName } from 'src/enum';
import { SubscriptionAccessService } from './subscription-access.service';
import { SubscriptionStatus } from '../enums/billing.enums';
import { assertPricingFingerprint, frozenPricePlanPatch, jerusalemDate, pricingFingerprint } from '../domain/subscription-pricing';

describe('subscription pricing policies', () => {
  const plan = { id: 7, name: 'Plan', priceMonthlyAgorot: 10000, licensedDealerPriceMonthlyAgorot: 15000, currency: 'ILS', isActive: true } as SubscriptionPlan;
  const sub = { id: 1, firebaseId: 'owner', planId: 7, discountPercent: 10 } as Subscription;
  const at = new Date('2026-11-05T10:00:00Z');
  const pricing = new PricingService({} as any, {} as any, {} as any);
  it('defaults to current business-specific plan price with legacy discounts', () => {
    expect(pricing.resolveMonthlyPrice(plan, sub, 'EXEMPT', at).amountBeforeVatAgorot).toBe(9000);
    expect(pricing.resolveMonthlyPrice(plan, sub, 'LICENSED', at).amountBeforeVatAgorot).toBe(13500);
  });
  it('preserves frozen base while applying an existing discount', () => {
    expect(pricing.resolveMonthlyPrice(plan, { ...sub, pricePolicy: 'FROZEN', frozenPlanId: 7, frozenMonthlyPriceAgorot: 8000 }, 'LICENSED', at))
      .toMatchObject({ source: 'FROZEN', baseAmountAgorot: 8000, amountBeforeVatAgorot: 7200, amountIncludingVatAgorot: 8496 });
  });
  it.each([0, 7900, 20000])('custom final net %s wins over all price policies and discounts', amount => {
    expect(pricing.resolveMonthlyPrice(plan, { ...sub, pricePolicy: 'FROZEN', frozenPlanId: 7, frozenMonthlyPriceAgorot: 8000,
      customMonthlyPriceAgorot: amount }, 'LICENSED', at)).toMatchObject({ source: 'CUSTOM', amountBeforeVatAgorot: amount,
        amountIncludingVatAgorot: Math.round(amount * 1.18) });
  });
  it('uses inclusive Jerusalem dates and restores frozen discounted price on expiry', () => {
    const terms = { ...sub, pricePolicy: 'FROZEN' as const, frozenPlanId: 7, frozenMonthlyPriceAgorot: 8000,
      customMonthlyPriceAgorot: 5000, customPriceStartDate: '2026-11-05', customPriceEndDate: '2026-11-05' };
    expect(jerusalemDate(new Date('2026-11-04T22:01:00Z'))).toBe('2026-11-05');
    expect(pricing.resolveMonthlyPrice(plan, terms, 'EXEMPT', new Date('2026-11-04T21:59:00Z')).source).toBe('FROZEN');
    expect(pricing.resolveMonthlyPrice(plan, terms, 'EXEMPT', new Date('2026-11-05T21:59:59Z')).source).toBe('CUSTOM');
    expect(pricing.resolveMonthlyPrice(plan, terms, 'EXEMPT', new Date('2026-11-05T22:00:00Z')).amountBeforeVatAgorot).toBe(7200);
  });
  it('does not carry an old frozen snapshot into another plan', () => {
    expect(pricing.resolveMonthlyPrice({ ...plan, id: 8 }, { ...sub, pricePolicy: 'FROZEN', frozenPlanId: 7, frozenMonthlyPriceAgorot: 8000 }, 'EXEMPT', at).source).toBe('PLAN');
  });
  it('same-plan changes preserve snapshot; changing away and back snapshots each new base', async () => {
    const frozen = { ...sub, pricePolicy: 'FROZEN', frozenPlanId: 7, frozenMonthlyPriceAgorot: 8000 } as Subscription;
    const manager = { findOne: jest.fn(async (entity, options) => entity === SubscriptionPlan ? { ...plan, id: options.where.id } : { businessType: BusinessType.LICENSED }) } as any;
    expect(await frozenPricePlanPatch(manager, frozen, 7)).toEqual({});
    expect(manager.findOne).not.toHaveBeenCalled();
    const next = await frozenPricePlanPatch(manager, frozen, 8);
    expect(next).toEqual({ frozenPlanId: 8, frozenMonthlyPriceAgorot: 15000 });
    expect(await frozenPricePlanPatch(manager, { ...frozen, planId: 8, ...next }, 7)).toEqual({ frozenPlanId: 7, frozenMonthlyPriceAgorot: 15000 });
    expect(await frozenPricePlanPatch(manager, frozen, null)).toEqual({ frozenPlanId: null, frozenMonthlyPriceAgorot: null });
  });
  it('does not freeze capabilities: explicit empty plan has no modules', () => {
    expect(new SubscriptionAccessService().resolveModulesAccess({ ...sub, status: SubscriptionStatus.ACTIVE, currentPeriodEnd: new Date('2099-01-01') }, { ...plan, modules: [] })).toEqual([]);
    expect(new SubscriptionAccessService().resolveModulesAccess({ ...sub, status: SubscriptionStatus.ACTIVE, currentPeriodEnd: new Date('2099-01-01') }, { ...plan, modules: [ModuleName.EXPENSES] })).toEqual([ModuleName.EXPENSES]);
  });
  it('allows existing members to price an inactive plan but rejects new joins', async () => {
    const service = new PricingService({ findOne: jest.fn().mockResolvedValue({ ...plan, isActive: false }) } as any,
      { findOne: jest.fn().mockResolvedValue(sub) } as any, { getUserBusinesses: jest.fn().mockResolvedValue([]) } as any);
    expect((await service.calculateCheckoutPrice('owner', 7, at)).amountBeforeVatAgorot).toBe(9000);
    await expect(service.calculateCheckoutPrice('owner', 8, at)).rejects.toThrow('not available');
  });
  it('custom above catalog is an override and never reported as a negative discount', async () => {
    const service = new PricingService({ findOne: jest.fn().mockResolvedValue(plan) } as any,
      { findOne: jest.fn().mockResolvedValue({ ...sub, customMonthlyPriceAgorot: 20000 }) } as any, { getUserBusinesses: jest.fn().mockResolvedValue([]) } as any);
    expect(await service.calculateCheckoutPrice('owner', 7, at)).toMatchObject({ discountAmountAgorot: 0, amountBeforeVatAgorot: 20000, priceSource: 'CUSTOM' });
  });
  it('rechecks policy, business type, catalog and calendar day under the subscription lock', async () => {
    jest.useFakeTimers().setSystemTime(at);
    try {
      const manager = { findOne: jest.fn(async entity => entity === SubscriptionPlan ? plan : null) } as any;
      const fingerprint = pricingFingerprint(sub, plan, 'EXEMPT', '2026-11-05');
      await expect(assertPricingFingerprint(manager, sub, 7, fingerprint)).resolves.toBeUndefined();
      await expect(assertPricingFingerprint(manager, { ...sub, customMonthlyPriceAgorot: 1000 }, 7, fingerprint)).rejects.toThrow('תנאי המחיר השתנו');
      manager.findOne.mockImplementation(async entity => entity === SubscriptionPlan ? plan : {});
      await expect(assertPricingFingerprint(manager, sub, 7, fingerprint)).rejects.toThrow();
      manager.findOne.mockImplementation(async entity => entity === SubscriptionPlan ? plan : null);
      jest.setSystemTime(new Date('2026-11-05T22:00:00Z'));
      await expect(assertPricingFingerprint(manager, sub, 7, fingerprint)).rejects.toThrow();
    } finally { jest.useRealTimers(); }
  });
});
