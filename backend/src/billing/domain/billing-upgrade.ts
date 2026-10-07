import { Subscription } from '../entities/subscription.entity';

/** Immutable source period in the existing obligation identity; no new schema. */
export function upgradeKey(subscription: Subscription, targetPlanId: number, amount: number): string {
  return `subscription:${subscription.id}:upgrade:${subscription.planId}:${subscription.currentPeriodStart!.getTime()}:${subscription.currentPeriodEnd!.getTime()}:to:${targetPlanId}:amount:${amount}`;
}

export function upgradeSource(key: string): { planId: number; start: number; end: number } | null {
  const match = /^subscription:\d+:upgrade:(\d+):(\d+):(\d+):to:\d+:amount:\d+$/.exec(key ?? '');
  return match ? { planId: Number(match[1]), start: Number(match[2]), end: Number(match[3]) } : null;
}
