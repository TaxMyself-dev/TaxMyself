import { renewalPeriodStart } from './billing-renewal-policy';
import { ConflictException } from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import { Subscription } from '../entities/subscription.entity';
import { BillingAttempt } from '../entities/billing-attempt.entity';
import { BillingObligation } from '../entities/billing-obligation.entity';
import { BillingEvent } from '../entities/billing-event.entity';
import { BillingAccessMode, BillingAttemptStatus, BillingEventType, BillingObligationStatus, SubscriptionStatus } from '../enums/billing.enums';
import { assertPricingFingerprint, frozenPricePlanPatch } from './subscription-pricing';
/** A free service period is not a captured payment: no provider, receipt or journal entry. */
export async function applyZeroPricePeriod(manager: EntityManager, input: { subscriptionId: number; planId: number;
  start: Date; end: Date; anchor: number; fingerprint?: string; agreementEventId?: number; initial: boolean; actorFirebaseId: string }): Promise<boolean> {
  const sub = await manager.findOne(Subscription, { where: { id: input.subscriptionId }, lock: { mode: 'pessimistic_write' } });
  if (!sub || sub.firebaseId !== input.actorFirebaseId || sub.billingAccessMode === BillingAccessMode.COMPLIMENTARY_FULL || sub.canceledAt) {
    throw new ConflictException('מצב המנוי השתנה. יש לרענן.');
  }
  if (!input.initial && (sub.nextBillingDate && sub.nextBillingDate > new Date() ||
    (renewalPeriodStart(sub) ?? sub.nextBillingDate)?.getTime() !== input.start.getTime())) return false;
  if (input.initial) {
    const commands = await manager.find(BillingEvent, { where: { subscriptionId: sub.id,
      eventType: BillingEventType.PLAN_CHANGE_REQUESTED }, order: { id: 'DESC' } });
    const enrollment = commands.find(e => e.metadata?.policy === 'OPEN_BANKING_TRIAL_V1');
    if (['PREPARE', 'READY'].includes(enrollment?.metadata?.command)) throw new ConflictException('יש לבטל את ההצטרפות העתידית לפני בחירת תוכנית אחרת');
  }
  if (input.initial ? ![SubscriptionStatus.TRIAL, SubscriptionStatus.TRIAL_EXPIRED].includes(sub.status) || !!sub.currentPeriodStart || !!sub.currentPeriodEnd
    : sub.status !== SubscriptionStatus.ACTIVE || sub.planId !== input.planId || !sub.nextBillingDate) {
    throw new ConflictException('מצב המנוי אינו מאפשר פתיחת תקופה ללא חיוב');
  }
  if (input.agreementEventId != null) {
    const events = await manager.find(BillingEvent, { where: { subscriptionId: sub.id,
      eventType: BillingEventType.PLAN_CHANGE_REQUESTED }, order: { id: 'DESC' } });
    const agreement = events.find(e => e.metadata?.policy === 'OPEN_BANKING_TRIAL_V1');
    const data = agreement?.metadata;
    if (input.initial || sub.currentPeriodStart || agreement?.id !== input.agreementEventId || data?.command !== 'ACTIVATE' ||
      data.planId !== input.planId || data.trialEnd !== input.start.toISOString() ||
      data.amountAgorot !== 0 || data.amountBeforeVatAgorot !== 0 || data.vatAmountAgorot !== 0 || data.currency !== 'ILS') {
      throw new ConflictException('תנאי ההצטרפות המאושרים השתנו. יש לפנות לתמיכה.');
    }
  } else {
    if (!input.fingerprint) throw new ConflictException('חסרה הצעת מחיר מאומתת לתקופה ללא חיוב');
    await assertPricingFingerprint(manager, sub, input.planId, input.fingerprint);
  }
  const debt = await manager.findOne(BillingObligation, { where: { subscriptionId: sub.id, status: BillingObligationStatus.OPEN } });
  const pending = await manager.findOne(BillingAttempt, { where: { obligation: { subscriptionId: sub.id },
    status: In([BillingAttemptStatus.CREATED, BillingAttemptStatus.AWAITING_CUSTOMER, BillingAttemptStatus.PROCESSING,
      BillingAttemptStatus.UNKNOWN, BillingAttemptStatus.MANUAL_REVIEW, BillingAttemptStatus.CAPTURED]) } });
  if (debt || pending) throw new ConflictException('יש להסדיר חיוב קיים לפני פתיחת תקופה ללא חיוב');
  await manager.update(Subscription, sub.id, { status: SubscriptionStatus.ACTIVE, planId: input.planId,
    ...await frozenPricePlanPatch(manager, sub, input.planId), currentPeriodStart: input.start,
    currentPeriodEnd: input.end, nextBillingDate: input.end, billingAnchorDay: input.anchor,
    renewalAttempts: 0, gracePeriodEndsAt: null, endedAt: null });
  await manager.save(BillingEvent, manager.create(BillingEvent, { firebaseId: sub.firebaseId, subscriptionId: sub.id,
    eventType: BillingEventType.PLAN_CHANGED, metadata: { policy: 'ZERO_PRICE_PERIOD_V1', actorFirebaseId: input.actorFirebaseId,
      planId: input.planId, periodStart: input.start.toISOString(), periodEnd: input.end.toISOString(), monthlyNetAgorot: 0 } }));
  return true;
}
