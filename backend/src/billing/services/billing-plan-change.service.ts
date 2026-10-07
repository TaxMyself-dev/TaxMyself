import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { DataSource, EntityManager, In, Raw } from 'typeorm';
import { BillingEvent } from '../entities/billing-event.entity';
import { BillingObligation } from '../entities/billing-obligation.entity';
import { Subscription } from '../entities/subscription.entity';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { BillingAccessMode, BillingEventType, BillingObligationStatus, SubscriptionStatus } from '../enums/billing.enums';
import { billingDate } from '../domain/billing-debt-periods';
import { latestPlanChangeCommand, matchesPlanChangeSource, PLAN_CHANGE_POLICY, PLAN_CHANGE_QUOTE_TTL_MS,
  PlanChangeSnapshot, planChangeQuote, proratedDifference, reservedUpgradeSnapshot } from '../domain/billing-plan-change';
import { assertBillingOwnerMutation, BillingMutationActorContext } from './billing-attempt-orchestration.service';
import { PricingService } from './pricing.service';

@Injectable()
export class BillingPlanChangeService {
  constructor(private readonly dataSource: DataSource, private readonly pricing: PricingService) {}

  private assertEligible(sub: Subscription, now = new Date()): void {
    if (sub.billingAccessMode === BillingAccessMode.COMPLIMENTARY_FULL || sub.status !== SubscriptionStatus.ACTIVE ||
      !sub.planId || !sub.currentPeriodStart || !sub.currentPeriodEnd || !sub.nextBillingDate ||
      sub.currentPeriodEnd <= now || sub.nextBillingDate <= now ||
      sub.nextBillingDate.getTime() !== sub.currentPeriodEnd.getTime() || sub.renewalAttempts > 0) {
      throw new ConflictException('יש להשלים את החידוש או הסדרת החוב לפני שינוי תוכנית.');
    }
  }

  private async assertNoPendingPayment(manager: EntityManager, subscriptionId: number): Promise<void> {
    const open = await manager.find(BillingObligation, {
      where: { subscriptionId, status: BillingObligationStatus.OPEN }, order: { id: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });
    if (open.some(debt => debt.activeAttemptId != null)) {
      throw new ConflictException('קיים תהליך תשלום שטרם הסתיים. יש להשלים אותו לפני שינוי תוכנית.');
    }
  }

  /** Paid terms, never today's repricing of service already purchased. */
  private async paidMonthlyNet(manager: EntityManager, sub: Subscription): Promise<number> {
    const paid = await manager.findOne(BillingObligation, {
      where: { subscriptionId: sub.id, status: BillingObligationStatus.SATISFIED, planId: sub.planId,
        periodStart: billingDate(sub.currentPeriodStart!), periodEnd: billingDate(sub.currentPeriodEnd!) },
      order: { id: 'DESC' },
    });
    if (paid) {
      const upgrade = paid.satisfiedAttemptId ? await reservedUpgradeSnapshot(manager, paid.satisfiedAttemptId) : null;
      if (paid.obligationKey?.includes(':prorated:') && !upgrade) throw new ConflictException('Missing paid upgrade terms; review required');
      return upgrade?.targetMonthlyNetAgorot ?? paid.amountBeforeVatAgorot;
    }
    // Zero-charge upgrades carry the continuing monthly terms in their atomic event.
    const free = await manager.findOne(BillingEvent, {
      where: { subscriptionId: sub.id, eventType: BillingEventType.PLAN_CHANGED,
        metadata: Raw(alias => `JSON_UNQUOTE(JSON_EXTRACT(${alias}, '$.policy')) = :policy AND JSON_EXTRACT(${alias}, '$.snapshot.targetPlanId') = :planId AND JSON_UNQUOTE(JSON_EXTRACT(${alias}, '$.snapshot.sourcePeriodStart')) = :start`,
          { policy: PLAN_CHANGE_POLICY, planId: sub.planId, start: sub.currentPeriodStart!.toISOString() }) }, order: { id: 'DESC' },
    });
    if (free?.metadata?.snapshot?.targetMonthlyNetAgorot != null) return free.metadata.snapshot.targetMonthlyNetAgorot;
    // Legacy paid subscriptions can use their saved successful-payment VAT breakdown.
    const legacy = await manager.findOne(BillingEvent, {
      where: { subscriptionId: sub.id, eventType: In([BillingEventType.PAYMENT_SUCCESS, BillingEventType.RENEWAL_SUCCESS]),
        metadata: Raw(alias => `JSON_EXTRACT(${alias}, '$.planId') = :planId`, { planId: sub.planId }) },
      order: { id: 'DESC' },
    });
    if (legacy?.amountBeforeVatAgorot != null && legacy.createdAt >= sub.currentPeriodStart! && legacy.createdAt < sub.currentPeriodEnd!) {
      return legacy.amountBeforeVatAgorot;
    }
    throw new ConflictException('חסרים תנאי התשלום של התקופה הנוכחית. יש לפנות לתמיכה לפני שינוי תוכנית.');
  }

  async preview(actor: BillingMutationActorContext, planId: number, quotedAt?: string) {
    assertBillingOwnerMutation(actor);
    const sub = await this.dataSource.manager.findOne(Subscription, { where: { firebaseId: actor.subjectFirebaseId } });
    if (!sub) throw new ConflictException('Subscription not found');
    this.assertEligible(sub);
    if (sub.planId === planId) throw new ConflictException('זו התוכנית הנוכחית שלך.');
    const at = quotedAt ? new Date(quotedAt) : new Date();
    if (!Number.isFinite(at.getTime()) || at.getTime() > Date.now() || Date.now() - at.getTime() > PLAN_CHANGE_QUOTE_TTL_MS) {
      throw new ConflictException('הצעת שינוי התוכנית פגה. יש לרענן את הפירוט.');
    }
    const [target, current, command] = await Promise.all([
      this.pricing.calculateCheckoutPrice(sub.firebaseId, planId),
      this.dataSource.manager.findOne(SubscriptionPlan, { where: { id: sub.planId } }),
      latestPlanChangeCommand(this.dataSource.manager, sub.id),
    ]);
    if (!current || target.currency !== current.currency || target.currency !== 'ILS') throw new ConflictException('Unsupported plan currency');
    const currentBase = this.pricing.resolveEffectivePlanPrice(current, target.billingBusinessType);
    const action = target.originalAmountAgorot >= currentBase
      ? 'UPGRADE' as const : 'DOWNGRADE' as const;
    // A scheduled downgrade grants no credit and therefore needs no old-price reconstruction.
    const sourceNet = action === 'UPGRADE' ? await this.paidMonthlyNet(this.dataSource.manager, sub) : 0;
    const net = action === 'UPGRADE' ? proratedDifference(sourceNet, target.amountBeforeVatAgorot,
      sub.currentPeriodStart!, sub.currentPeriodEnd!, at) : 0;
    const amounts = this.pricing.calculateBillingAmounts(net);
    const renewal = await this.pricing.calculateCheckoutPrice(sub.firebaseId, planId, sub.currentPeriodEnd!);
    const snapshot: PlanChangeSnapshot = {
      policy: PLAN_CHANGE_POLICY, action, sourcePlanId: sub.planId, targetPlanId: planId,
      sourcePeriodStart: sub.currentPeriodStart!.toISOString(), sourcePeriodEnd: sub.currentPeriodEnd!.toISOString(),
      quotedAt: at.toISOString(), scheduleEventId: command?.id ?? null,
      sourceMonthlyNetAgorot: sourceNet, targetMonthlyNetAgorot: target.amountBeforeVatAgorot,
      renewalAmountAgorot: renewal.finalAmountAgorot, amountBeforeVatAgorot: net,
      vatAmountAgorot: amounts.vatAmountAgorot, finalAmountAgorot: amounts.amountIncludingVatAgorot, currency: 'ILS',
    };
    return { ...snapshot, planChangeQuote: planChangeQuote(snapshot),
      effectiveAt: action === 'UPGRADE' ? at.toISOString() : snapshot.sourcePeriodEnd,
      nextBillingDate: snapshot.sourcePeriodEnd, vatRate: amounts.vatRate,
      expiresAt: new Date(at.getTime() + PLAN_CHANGE_QUOTE_TTL_MS).toISOString() };
  }

  async pending(subscriptionId: number, manager = this.dataSource.manager) {
    const command = await latestPlanChangeCommand(manager, subscriptionId);
    if (command?.metadata?.command !== 'SCHEDULE') return null;
    const snapshot = command.metadata.snapshot as PlanChangeSnapshot;
    const sub = await manager.findOne(Subscription, { where: { id: subscriptionId } });
    if (!sub || sub.billingAccessMode === BillingAccessMode.COMPLIMENTARY_FULL ||
      sub.status !== SubscriptionStatus.ACTIVE || !matchesPlanChangeSource(sub, snapshot)) return null;
    const plan = await manager.findOne(SubscriptionPlan, { where: { id: snapshot.targetPlanId } });
    return { eventId: command.id, planId: snapshot.targetPlanId, planName: plan?.name ?? 'תוכנית',
      effectiveAt: snapshot.sourcePeriodEnd, estimatedRenewalAmountAgorot: snapshot.renewalAmountAgorot };
  }

  async applyLocal(actor: BillingMutationActorContext, snapshot: PlanChangeSnapshot) {
    assertBillingOwnerMutation(actor);
    return this.dataSource.transaction(async manager => {
      const sub = await manager.findOne(Subscription, { where: { firebaseId: actor.subjectFirebaseId }, lock: { mode: 'pessimistic_write' } });
      if (!sub) throw new ForbiddenException('Subscription owner mismatch');
      this.assertEligible(sub);
      if (Date.now() - new Date(snapshot.quotedAt).getTime() > PLAN_CHANGE_QUOTE_TTL_MS) throw new ConflictException('הפירוט פג. יש לרענן.');
      if (!matchesPlanChangeSource(sub, snapshot)) throw new ConflictException('מצב המנוי השתנה. יש לרענן את הפירוט.');
      const command = await latestPlanChangeCommand(manager, sub.id);
      if ((command?.id ?? null) !== snapshot.scheduleEventId) throw new ConflictException('בקשת שינוי התוכנית השתנתה. יש לרענן.');
      await this.assertNoPendingPayment(manager, sub.id);
      if (snapshot.action === 'UPGRADE' && snapshot.finalAmountAgorot !== 0) throw new ConflictException('Payment required');
      await this.writeCommand(manager, sub, snapshot.action === 'DOWNGRADE' ? 'SCHEDULE' : 'APPLY', snapshot);
      if (snapshot.action === 'UPGRADE') {
        await manager.update(Subscription, sub.id, { planId: snapshot.targetPlanId });
        await manager.save(BillingEvent, manager.create(BillingEvent, { firebaseId: sub.firebaseId, subscriptionId: sub.id,
          eventType: BillingEventType.PLAN_CHANGED, metadata: { policy: PLAN_CHANGE_POLICY, snapshot, withoutCharge: true } }));
      }
      return { status: snapshot.action === 'DOWNGRADE' ? 'SCHEDULED' : 'APPLIED', effectiveAt: snapshot.action === 'DOWNGRADE'
        ? snapshot.sourcePeriodEnd : snapshot.quotedAt };
    });
  }

  async cancel(actor: BillingMutationActorContext, expectedEventId: number) {
    assertBillingOwnerMutation(actor);
    return this.dataSource.transaction(async manager => {
      const sub = await manager.findOne(Subscription, { where: { firebaseId: actor.subjectFirebaseId }, lock: { mode: 'pessimistic_write' } });
      if (!sub) throw new ForbiddenException('Subscription owner mismatch');
      this.assertEligible(sub);
      const command = await latestPlanChangeCommand(manager, sub.id);
      if (command?.id !== expectedEventId || command.metadata?.command !== 'SCHEDULE') throw new ConflictException('בקשת השנמוך השתנתה. יש לרענן.');
      await this.assertNoPendingPayment(manager, sub.id);
      await this.writeCommand(manager, sub, 'CANCEL', command.metadata.snapshot);
      return { status: 'CANCELED' };
    });
  }

  async applyDue(subscriptionId: number): Promise<void> {
    await this.dataSource.transaction(async manager => {
      const sub = await manager.findOne(Subscription, { where: { id: subscriptionId }, lock: { mode: 'pessimistic_write' } });
      if (!sub || sub.status !== SubscriptionStatus.ACTIVE || sub.billingAccessMode === BillingAccessMode.COMPLIMENTARY_FULL) return;
      const command = await latestPlanChangeCommand(manager, sub.id);
      if (command?.metadata?.command !== 'SCHEDULE') return;
      const snapshot = command.metadata.snapshot as PlanChangeSnapshot;
      if (new Date(snapshot.sourcePeriodEnd) > new Date()) return;
      if (!matchesPlanChangeSource(sub, snapshot)) {
        await this.writeCommand(manager, sub, 'CANCEL', snapshot);
        return;
      }
      await this.assertNoPendingPayment(manager, sub.id);
      const target = await manager.findOne(SubscriptionPlan, { where: { id: snapshot.targetPlanId, isActive: true } });
      if (!target) throw new ConflictException('Scheduled plan is unavailable; manual review required');
      await manager.update(Subscription, sub.id, { planId: target.id });
      await this.writeCommand(manager, sub, 'APPLY', snapshot);
      await manager.save(BillingEvent, manager.create(BillingEvent, { firebaseId: sub.firebaseId, subscriptionId: sub.id,
        eventType: BillingEventType.PLAN_CHANGED, metadata: { policy: PLAN_CHANGE_POLICY, snapshot, scheduled: true } }));
    });
  }

  private async writeCommand(manager: EntityManager, sub: Subscription, command: string, snapshot: PlanChangeSnapshot) {
    await manager.save(BillingEvent, manager.create(BillingEvent, { firebaseId: sub.firebaseId, subscriptionId: sub.id,
      eventType: BillingEventType.PLAN_CHANGE_REQUESTED, metadata: { policy: PLAN_CHANGE_POLICY, command, snapshot } }));
  }
}
