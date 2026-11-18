import { Subscription } from '../entities/subscription.entity';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { Business } from 'src/business/business.entity';
import { BusinessType } from 'src/enum';
import { ConflictException } from '@nestjs/common';
import { EntityManager } from 'typeorm';

export type PriceSource = 'PLAN' | 'FROZEN' | 'CUSTOM';
export function jerusalemDate(at: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at);
  const value = (key: string) => parts.find(p => p.type === key)!.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}
export function dateOnly(value: Date | string | null | undefined): string | null {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value ?? null;
}
export function resolveSubscriptionBase(planId: number, planBase: number, sub: Partial<Subscription> | null, today: string): { source: PriceSource; baseAmountAgorot: number } {
  const start = dateOnly(sub?.customPriceStartDate), end = dateOnly(sub?.customPriceEndDate);
  if (sub?.customMonthlyPriceAgorot != null && (!start || today >= start) && (!end || today <= end)) {
    return { source: 'CUSTOM', baseAmountAgorot: sub.customMonthlyPriceAgorot };
  }
  if (sub?.pricePolicy === 'FROZEN' && sub.frozenPlanId === planId && sub.frozenMonthlyPriceAgorot != null) {
    return { source: 'FROZEN', baseAmountAgorot: sub.frozenMonthlyPriceAgorot };
  }
  return { source: 'PLAN', baseAmountAgorot: planBase };
}
export function pricingFingerprint(sub: Partial<Subscription> | null, plan: Partial<SubscriptionPlan>, businessType: string, day: string): string {
  return JSON.stringify([sub?.planId ?? null, sub?.pricePolicy ?? 'LIVE', sub?.frozenPlanId ?? null,
    sub?.frozenMonthlyPriceAgorot ?? null, sub?.customMonthlyPriceAgorot ?? null,
    dateOnly(sub?.customPriceStartDate), dateOnly(sub?.customPriceEndDate), sub?.discountPercent ?? null,
    sub?.discountAmountAgorot ?? null, dateOnly(sub?.discountStartDate), dateOnly(sub?.discountEndDate),
    plan.id, plan.priceMonthlyAgorot, plan.licensedDealerPriceMonthlyAgorot ?? null, plan.currency,
    plan.isActive !== false, businessType, day]);
}
export async function assertPricingFingerprint(manager: EntityManager, sub: Subscription, planId: number, expected?: string): Promise<void> {
  if (!expected) return; // Frozen debt and historical in-flight commands have no new-price assertion.
  const plan = await manager.findOne(SubscriptionPlan, { where: { id: planId }, lock: { mode: 'pessimistic_read' } });
  const licensed = await manager.findOne(Business, { where: { firebaseId: sub.firebaseId, businessType: BusinessType.LICENSED } });
  if (!plan || pricingFingerprint(sub, plan, licensed ? 'LICENSED' : 'EXEMPT', jerusalemDate(new Date())) !== expected) {
    throw new ConflictException('תנאי המחיר השתנו. יש לרענן את הפירוט לפני המשך התשלום.');
  }
}
/** Must be composed into the same narrow UPDATE as the actual plan transition. */
export async function frozenPricePlanPatch(manager: EntityManager, sub: Subscription, targetPlanId: number | null): Promise<Partial<Subscription>> {
  if (sub.planId === targetPlanId || sub.pricePolicy !== 'FROZEN') return {};
  if (targetPlanId == null) return { frozenPlanId: null, frozenMonthlyPriceAgorot: null };
  const plan = await manager.findOne(SubscriptionPlan, { where: { id: targetPlanId } });
  if (!plan) throw new Error('Target plan missing while preserving price policy');
  const licensed = await manager.findOne(Business, { where: { firebaseId: sub.firebaseId, businessType: BusinessType.LICENSED } });
  return { frozenPlanId: targetPlanId, frozenMonthlyPriceAgorot: licensed && plan.licensedDealerPriceMonthlyAgorot != null
    ? plan.licensedDealerPriceMonthlyAgorot : plan.priceMonthlyAgorot };
}
