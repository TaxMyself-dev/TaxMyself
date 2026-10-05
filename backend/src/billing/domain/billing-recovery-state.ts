import { billingBoundary } from './billing-debt-periods';
import { BillingObligation } from '../entities/billing-obligation.entity';
import { Subscription } from '../entities/subscription.entity';
import { SubscriptionStatus } from '../enums/billing.enums';

export function recoverySubscriptionPatch(sub: Subscription, debts: BillingObligation[], now = new Date()): Partial<Subscription> {
  if (!debts.length || debts.some(debt => debt.subscriptionId !== sub.id)) throw new Error('Recovery membership mismatch');
  if (sub.status === SubscriptionStatus.CANCELED || sub.canceledAt) return {
    status: SubscriptionStatus.CANCELED, planId: sub.planId,
    currentPeriodStart: sub.currentPeriodStart, currentPeriodEnd: sub.currentPeriodEnd,
    nextBillingDate: sub.nextBillingDate, renewalAttempts: sub.renewalAttempts,
    gracePeriodEndsAt: sub.gracePeriodEndsAt, canceledAt: sub.canceledAt, endedAt: sub.endedAt,
  };
  if (![SubscriptionStatus.PAST_DUE, SubscriptionStatus.ACTIVE].includes(sub.status)) throw new Error('Recovery state requires review');
  const last = [...debts].sort((a,b) => a.periodStart.localeCompare(b.periodStart))[debts.length - 1];
  const end = billingBoundary(last.periodEnd);
  return {
    status: end > now ? SubscriptionStatus.ACTIVE : SubscriptionStatus.PAST_DUE,
    planId: sub.planId,
    currentPeriodStart: billingBoundary(last.periodStart), currentPeriodEnd: end, nextBillingDate: end,
    renewalAttempts: 0, gracePeriodEndsAt: null,
    canceledAt: null, endedAt: null,
  };
}
