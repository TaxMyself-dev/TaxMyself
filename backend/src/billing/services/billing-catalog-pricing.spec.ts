import { BillingService } from './billing.service';
import { PricingService } from './pricing.service';

// The real price resolver is used here: card display must agree with the
// subscription price policy while raw catalog prices remain available.
describe('authenticated plan catalog personal pricing', () => {
  let subscription: any;
  let service: BillingService;
  beforeEach(() => {
    subscription = { id: 1, firebaseId: 'owner', planId: 1, pricePolicy: 'LIVE' };
    const plans = [1, 2].map(id => ({ id, slug: `public-${id}`, name: `Plan ${id}`,
      priceMonthlyAgorot: id * 10000, licensedDealerPriceMonthlyAgorot: id * 15000,
      currency: 'ILS', isActive: true, isPublic: true }));
    const planRepo = { find: jest.fn(async () => plans), findOne: jest.fn(async () => plans[0]) };
    const subscriptionRepo = { findOne: jest.fn(async () => subscription) };
    const pricing = new PricingService(planRepo as any, subscriptionRepo as any,
      { getUserBusinesses: jest.fn(async () => []) } as any);
    service = new BillingService(planRepo as any, subscriptionRepo as any, {} as any, {} as any,
      {} as any, pricing, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
  });
  it.each([0, 7900, 30000])('shows personal net price %s for every selectable plan', async amount => {
    subscription.customMonthlyPriceAgorot = amount;
    const cards = await service.getPlans('owner');
    expect(cards.map(card => card.effectivePriceMonthlyAgorot)).toEqual([amount, amount]);
    expect(cards.map(card => card.priceMonthlyAgorot)).toEqual([10000, 20000]);
  });
  it('shows a saved price for the current plan and the new base for another plan', async () => {
    Object.assign(subscription, { pricePolicy: 'FROZEN', frozenPlanId: 1, frozenMonthlyPriceAgorot: 8000 });
    expect((await service.getPlans('owner')).map(card => card.effectivePriceMonthlyAgorot)).toEqual([8000, 20000]);
  });
  it('restores ordinary plan prices after the personal window expires', async () => {
    Object.assign(subscription, { customMonthlyPriceAgorot: 7900, customPriceEndDate: '2000-01-01' });
    expect((await service.getPlans('owner')).map(card => card.effectivePriceMonthlyAgorot)).toEqual([10000, 20000]);
  });
});