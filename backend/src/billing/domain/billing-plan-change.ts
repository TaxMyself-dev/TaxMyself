import { createHash } from 'crypto';
import { EntityManager, Raw } from 'typeorm';
import { BillingEvent } from '../entities/billing-event.entity';
import { Subscription } from '../entities/subscription.entity';
import { BillingEventType } from '../enums/billing.enums';

export const PLAN_CHANGE_POLICY = 'PRORATED_V1';
export const PLAN_CHANGE_QUOTE_TTL_MS = 10 * 60_000;

export interface PlanChangeSnapshot {
  policy: typeof PLAN_CHANGE_POLICY;
  action: 'UPGRADE' | 'DOWNGRADE';
  sourcePlanId: number;
  targetPlanId: number;
  sourcePeriodStart: string;
  sourcePeriodEnd: string;
  quotedAt: string;
  scheduleEventId: number | null;
  sourceMonthlyNetAgorot: number;
  targetMonthlyNetAgorot: number;
  renewalAmountAgorot: number;
  amountBeforeVatAgorot: number;
  vatAmountAgorot: number;
  finalAmountAgorot: number;
  currency: string;
}

export function proratedDifference(source: number, target: number, start: Date, end: Date, at: Date): number {
  const duration = end.getTime() - start.getTime();
  if (!Number.isFinite(duration) || !Number.isFinite(at.getTime()) || duration <= 0 || at < start || at >= end ||
    !Number.isSafeInteger(source) || !Number.isSafeInteger(target) || source < 0 || target < 0) {
    throw new Error('Invalid paid period for proration');
  }
  return Math.round(Math.max(0, target - source) * (end.getTime() - at.getTime()) / duration);
}

export function planChangeQuote(snapshot: PlanChangeSnapshot): string {
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
}

export function matchesPlanChangeSource(sub: Subscription, snapshot: PlanChangeSnapshot): boolean {
  return sub.planId === snapshot.sourcePlanId &&
    sub.currentPeriodStart?.toISOString() === snapshot.sourcePeriodStart &&
    sub.currentPeriodEnd?.toISOString() === snapshot.sourcePeriodEnd;
}

/** Schedule commands form an append-only stream, serialized by the subscription lock. */
export async function latestPlanChangeCommand(manager: EntityManager, subscriptionId: number): Promise<BillingEvent | null> {
  return manager.findOne(BillingEvent, {
    where: { subscriptionId, eventType: BillingEventType.PLAN_CHANGE_REQUESTED,
      metadata: Raw(alias => `JSON_UNQUOTE(JSON_EXTRACT(${alias}, '$.policy')) = :policy AND JSON_UNQUOTE(JSON_EXTRACT(${alias}, '$.command')) IN ('SCHEDULE', 'CANCEL', 'APPLY')`,
        { policy: PLAN_CHANGE_POLICY }) },
    order: { id: 'DESC' },
  });
}

export async function reservedUpgradeSnapshot(manager: EntityManager, attemptId: number): Promise<PlanChangeSnapshot | null> {
  const event = await manager.findOne(BillingEvent, {
    where: { billingAttemptId: attemptId, eventType: BillingEventType.PLAN_CHANGE_REQUESTED },
    order: { id: 'ASC' },
  });
  return event?.metadata?.policy === PLAN_CHANGE_POLICY && event.metadata.command === 'UPGRADE_RESERVED'
    ? event.metadata.snapshot as PlanChangeSnapshot : null;
}
