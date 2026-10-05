import { billingBoundary, billingDate, nextBillingPeriod, nextBillingInstant } from './billing-debt-periods';
import { recoverySubscriptionPatch } from './billing-recovery-state';
import { SubscriptionStatus } from '../enums/billing.enums';

describe('subscription debt calendar and recovery', () => {
  it('clamps February then restores day 31, including leap years', () => {
    expect(nextBillingPeriod('2026-01-31', 31)).toBe('2026-02-28');
    expect(nextBillingPeriod('2026-02-28', 31)).toBe('2026-03-31');
    expect(nextBillingPeriod('2028-01-31', 31)).toBe('2028-02-29');
    expect(nextBillingPeriod('2028-02-29', 31)).toBe('2028-03-31');
    expect(nextBillingPeriod('2026-01-30', 30)).toBe('2026-02-28');
    expect(nextBillingPeriod('2026-02-28', 30)).toBe('2026-03-30');
  });
  it('uses Jerusalem midnight across summer and winter offsets', () => {
    expect(billingBoundary('2026-09-15').toISOString()).toBe('2026-09-14T21:00:00.000Z');
    expect(billingBoundary('2026-11-15').toISOString()).toBe('2026-11-14T22:00:00.000Z');
    expect(billingDate(new Date('2026-09-14T22:00:00Z'))).toBe('2026-09-15');
  });
  it('the renewal after recovery keeps the local anchor rather than the previous UTC day', () => {
    expect(billingDate(nextBillingInstant(billingBoundary('2026-11-15'), 15))).toBe('2026-12-15');
    expect(billingDate(nextBillingInstant(billingBoundary('2026-01-31'), 31))).toBe('2026-02-28');
  });
  const sub: any = { id: 7, planId: 2, status: SubscriptionStatus.PAST_DUE, canceledAt: null };
  const debts: any = [{ subscriptionId: 7, periodStart: '2026-11-15', periodEnd: '2026-12-15' }];
  it('keeps the subscription anchor rather than capture date', () => {
    const result = recoverySubscriptionPatch(sub, debts, new Date('2026-11-20'));
    expect(result.status).toBe(SubscriptionStatus.ACTIVE);
    expect(result.nextBillingDate).toEqual(billingBoundary('2026-12-15'));
  });
  it('leaves the subscription past due if a new period started during checkout', () => {
    expect(recoverySubscriptionPatch(sub, debts, new Date('2026-12-16')).status).toBe(SubscriptionStatus.PAST_DUE);
  });
  it('settlement never restarts a canceled subscription or changes its schedule', () => {
    const canceled: any = { ...sub, status: SubscriptionStatus.CANCELED,
      canceledAt: new Date('2026-11-21'), nextBillingDate: new Date('2026-12-15'), renewalAttempts: 3 };
    const result = recoverySubscriptionPatch(canceled, debts, new Date('2026-11-25'));
    expect(result.status).toBe(SubscriptionStatus.CANCELED);
    expect(result.canceledAt).toEqual(canceled.canceledAt);
    expect(result.nextBillingDate).toEqual(canceled.nextBillingDate);
    expect(result.renewalAttempts).toBe(3);
  });
});
