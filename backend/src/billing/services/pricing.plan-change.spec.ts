import { PricingService } from './pricing.service';

describe('PricingService future plan-change estimate', () => {
  it('uses the renewal date to exclude a discount that expires during the current period', async () => {
    const pricing = new PricingService(
      { findOne: jest.fn().mockResolvedValue({ id: 2, name: 'Plan', priceMonthlyAgorot: 8000, currency: 'ILS' }) } as any,
      { findOne: jest.fn().mockResolvedValue({ discountPercent: 50, discountAmountAgorot: null,
        discountStartDate: '2026-09-01', discountEndDate: '2026-09-30' }) } as any,
      { getUserBusinesses: jest.fn().mockResolvedValue([]) } as any,
    );
    const now = await pricing.calculateCheckoutPrice('owner', 2, new Date('2026-09-15T09:00:00Z'));
    const next = await pricing.calculateCheckoutPrice('owner', 2, new Date('2026-10-07T09:00:00Z'));
    expect(now.amountBeforeVatAgorot).toBe(4000);
    expect(next.amountBeforeVatAgorot).toBe(8000);
    expect(next.finalAmountAgorot).toBe(9440);
    expect(next.amountBeforeVatAgorot + next.vatAmountAgorot).toBe(next.finalAmountAgorot);
  });
});
