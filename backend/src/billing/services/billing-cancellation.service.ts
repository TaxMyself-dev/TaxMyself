import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager, LessThanOrEqual, Raw } from 'typeorm';
import { BillingEvent } from '../entities/billing-event.entity';
import { BillingObligation } from '../entities/billing-obligation.entity';
import { Subscription } from '../entities/subscription.entity';
import { BillingAccessMode, BillingEventType, BillingObligationStatus, SubscriptionStatus } from '../enums/billing.enums';
import { CancelSubscriptionDto } from '../dtos/cancel-subscription.dto';
import { latestPlanChangeCommand, PLAN_CHANGE_POLICY } from '../domain/billing-plan-change';
import { assertBillingOwnerMutation, BillingMutationActorContext } from './billing-attempt-orchestration.service';

export const CANCELLATION_POLICY = 'CANCEL_AT_PERIOD_END_V1';

/** Logical expiration is enforced on every access check, independently of this sweep. */
export function cancellationIsDue(sub: Subscription, now = new Date()): boolean {
  return sub.billingAccessMode !== BillingAccessMode.COMPLIMENTARY_FULL &&
    sub.status === SubscriptionStatus.ACTIVE && sub.canceledAt != null && sub.canceledAt <= now;
}

@Injectable()
export class BillingCancellationService {
  private readonly logger = new Logger(BillingCancellationService.name);
  constructor(private readonly dataSource: DataSource) {}

  private latest(manager: EntityManager, subscriptionId: number) {
    return manager.findOne(BillingEvent, { where: { subscriptionId, eventType: BillingEventType.SUBSCRIPTION_CANCELED,
      metadata: Raw(alias => `JSON_UNQUOTE(JSON_EXTRACT(${alias}, '$.policy')) = :policy`, { policy: CANCELLATION_POLICY }) },
      order: { id: 'DESC' } });
  }

  private async record(manager: EntityManager, sub: Subscription, command: string, extra: Record<string, unknown> = {}) {
    return manager.save(BillingEvent, manager.create(BillingEvent, { firebaseId: sub.firebaseId, subscriptionId: sub.id,
      eventType: BillingEventType.SUBSCRIPTION_CANCELED, metadata: { policy: CANCELLATION_POLICY, command,
        planId: sub.planId, periodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
        effectiveAt: sub.canceledAt?.toISOString() ?? null, ...extra } }));
  }

  async pending(sub: Subscription, manager = this.dataSource.manager) {
    if (sub.billingAccessMode === BillingAccessMode.COMPLIMENTARY_FULL || sub.status !== SubscriptionStatus.ACTIVE ||
      !sub.canceledAt || sub.canceledAt <= new Date()) return null;
    const event = await this.latest(manager, sub.id);
    if (event?.metadata?.command !== 'REQUEST' || event.metadata.effectiveAt !== sub.canceledAt.toISOString()) return null;
    return { eventId: event.id, effectiveAt: sub.canceledAt.toISOString() };
  }

  private async assertNoPendingPayment(manager: EntityManager, id: number) {
    const debts = await manager.find(BillingObligation, { where: { subscriptionId: id, status: BillingObligationStatus.OPEN },
      order: { id: 'ASC' }, lock: { mode: 'pessimistic_write' } });
    if (debts.some(debt => debt.activeAttemptId != null)) throw new ConflictException(
      'קיים תהליך תשלום שטרם הסתיים. יש להשלים את בירור התשלום לפני ביטול המנוי.');
  }

  async request(actor: BillingMutationActorContext, dto: CancelSubscriptionDto): Promise<{ status: string; eventId?: number; effectiveAt?: string }> {
    assertBillingOwnerMutation(actor);
    return this.dataSource.transaction(async manager => {
      const sub = await manager.findOne(Subscription, { where: { firebaseId: actor.subjectFirebaseId }, lock: { mode: 'pessimistic_write' } });
      if (!sub || sub.billingAccessMode === BillingAccessMode.COMPLIMENTARY_FULL) throw new ConflictException('אין מנוי בתשלום שניתן לבטל.');
      if (sub.status !== dto.expectedStatus || (sub.currentPeriodEnd?.toISOString() ?? null) !== (dto.expectedPeriodEnd ?? null)) {
        throw new ConflictException('מצב המנוי השתנה. יש לרענן לפני אישור הביטול.');
      }
      if (sub.status === SubscriptionStatus.CANCELED) return { status: 'CANCELED', effectiveAt: sub.canceledAt?.toISOString() };
      const pending = await this.pending(sub, manager);
      if (pending) return { status: 'SCHEDULED', ...pending };
      if (sub.canceledAt) throw new ConflictException('בקשת הביטול כבר נכנסה לתוקף או דורשת בירור. יש לרענן.');
      await this.assertNoPendingPayment(manager, sub.id);
      const now = new Date();
      const paid = sub.status === SubscriptionStatus.ACTIVE && sub.currentPeriodEnd != null && sub.currentPeriodEnd > now;
      if (paid && (sub.renewalAttempts > 0 || sub.nextBillingDate?.getTime() !== sub.currentPeriodEnd!.getTime())) {
        throw new ConflictException('יש לברר את מצב החידוש לפני ביטול המנוי.');
      }
      const effectiveAt = paid ? sub.currentPeriodEnd! : now;
      const previousStatus = sub.status;
      sub.canceledAt = effectiveAt;
      if (!paid) { sub.status = SubscriptionStatus.CANCELED; sub.nextBillingDate = null; sub.endedAt = now; }
      await manager.save(Subscription, sub);
      const event = await this.record(manager, sub, 'REQUEST', { previousStatus, actorFirebaseId: actor.actorFirebaseId });
      // A canceled subscription must not later switch plans because of an older request.
      const planChange = await latestPlanChangeCommand(manager, sub.id);
      if (planChange?.metadata?.command === 'SCHEDULE') {
        await manager.save(BillingEvent, manager.create(BillingEvent, { firebaseId: sub.firebaseId, subscriptionId: sub.id,
          eventType: BillingEventType.PLAN_CHANGE_REQUESTED, metadata: { policy: PLAN_CHANGE_POLICY, command: 'CANCEL',
            snapshot: planChange.metadata.snapshot, reason: 'SUBSCRIPTION_CANCELLATION' } }));
      }
      return { status: paid ? 'SCHEDULED' : 'CANCELED', eventId: event.id, effectiveAt: effectiveAt.toISOString() };
    });
  }

  async withdraw(actor: BillingMutationActorContext, expectedEventId: number) {
    assertBillingOwnerMutation(actor);
    return this.dataSource.transaction(async manager => {
      const sub = await manager.findOne(Subscription, { where: { firebaseId: actor.subjectFirebaseId }, lock: { mode: 'pessimistic_write' } });
      if (!sub || sub.billingAccessMode === BillingAccessMode.COMPLIMENTARY_FULL) throw new ConflictException('אין בקשת ביטול זמינה.');
      const pending = await this.pending(sub, manager);
      if (!pending || pending.eventId !== expectedEventId || sub.currentPeriodEnd?.getTime() !== sub.canceledAt?.getTime() ||
        sub.nextBillingDate?.getTime() !== sub.currentPeriodEnd?.getTime()) throw new ConflictException('הבקשה השתנתה או שהביטול כבר נכנס לתוקף. יש לרענן.');
      await this.assertNoPendingPayment(manager, sub.id);
      await this.record(manager, sub, 'WITHDRAW', { requestEventId: expectedEventId, actorFirebaseId: actor.actorFirebaseId });
      sub.canceledAt = null;
      await manager.save(Subscription, sub);
      return { status: 'ACTIVE' };
    });
  }

  async applyDue(subscriptionId: number) {
    return this.dataSource.transaction(async manager => {
      const sub = await manager.findOne(Subscription, { where: { id: subscriptionId }, lock: { mode: 'pessimistic_write' } });
      if (!sub || sub.billingAccessMode === BillingAccessMode.COMPLIMENTARY_FULL || !cancellationIsDue(sub)) return;
      sub.status = SubscriptionStatus.CANCELED;
      sub.nextBillingDate = null;
      sub.endedAt = sub.canceledAt;
      await manager.save(Subscription, sub);
      await this.record(manager, sub, 'APPLY');
    });
  }

  async applyDueCancellations() {
    const subs = await this.dataSource.manager.find(Subscription, { where: { status: SubscriptionStatus.ACTIVE,
      billingAccessMode: BillingAccessMode.STANDARD, canceledAt: LessThanOrEqual(new Date()) }, select: ['id'], order: { id: 'ASC' } });
    for (const sub of subs) {
      try { await this.applyDue(sub.id); }
      catch { this.logger.warn(`Cancellation requires review for subscription #${sub.id}`); }
    }
  }
}
