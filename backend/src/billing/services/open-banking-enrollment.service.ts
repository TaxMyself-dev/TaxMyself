import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager, In, Raw } from 'typeorm';
import { createHash } from 'crypto';
import { ModuleName } from 'src/enum';
import { Subscription } from '../entities/subscription.entity';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { BillingEvent } from '../entities/billing-event.entity';
import { BillingObligation } from '../entities/billing-obligation.entity';
import { PaymentMethod } from '../entities/payment-method.entity';
import { BillingAccessMode, BillingEventType, BillingObligationStatus, SubscriptionStatus } from '../enums/billing.enums';
import { PricingService } from './pricing.service';
import { assertBillingOwnerMutation, BillingMutationActorContext } from './billing-attempt-orchestration.service';
import { billingDate } from '../domain/billing-debt-periods';

export const OPEN_BANKING_ENROLLMENT_POLICY = 'OPEN_BANKING_TRIAL_V1';

/** Mandatory, transactional commands; card storage alone never authorizes billing. */
@Injectable()
export class OpenBankingEnrollmentService {
  private readonly logger = new Logger(OpenBankingEnrollmentService.name);
  constructor(private readonly db: DataSource, private readonly pricing: PricingService) {}

  async latest(subscriptionId: number, manager = this.db.manager) {
    return manager.findOne(BillingEvent, { where: { subscriptionId,
      eventType: BillingEventType.PLAN_CHANGE_REQUESTED,
      metadata: Raw(column => `JSON_UNQUOTE(JSON_EXTRACT(${column}, '$.policy')) = :obPolicy`,
        { obPolicy: OPEN_BANKING_ENROLLMENT_POLICY }) }, order: { id: 'DESC' } });
  }

  private async write(manager: EntityManager, sub: Subscription, command: string, metadata: Record<string, unknown>) {
    return manager.save(BillingEvent, manager.create(BillingEvent, { firebaseId: sub.firebaseId,
      subscriptionId: sub.id, eventType: BillingEventType.PLAN_CHANGE_REQUESTED,
      metadata: { ...metadata, policy: OPEN_BANKING_ENROLLMENT_POLICY, command } }));
  }

  private async lock(manager: EntityManager, firebaseId: string) {
    const sub = await manager.findOne(Subscription, { where: { firebaseId }, lock: { mode: 'pessimistic_write' } });
    if (!sub || sub.billingAccessMode !== BillingAccessMode.STANDARD || sub.canceledAt || sub.endedAt) {
      throw new ConflictException('המנוי אינו מתאים להרשמה זו. יש להסדיר את מצב המנוי.');
    }
    const debts = await manager.find(BillingObligation, { where: { subscriptionId: sub.id,
      status: BillingObligationStatus.OPEN }, lock: { mode: 'pessimistic_write' } });
    if (debts.some(debt => debt.activeAttemptId != null)) throw new ConflictException('קיים תהליך תשלום שטרם הסתיים.');
    return sub;
  }

  async options(firebaseId: string) {
    const sub = await this.db.manager.findOne(Subscription, { where: { firebaseId } });
    if (!sub) throw new ConflictException('לא נמצא מנוי.');
    // Public catalog plus the owner's private/referral banking plan.
    const plans = await this.db.manager.find(SubscriptionPlan, { where: { isActive: true }, order: { displayOrder: 'ASC' } });
    const eligible = plans.filter(plan => plan.modules?.includes(ModuleName.OPEN_BANKING) &&
      (plan.isPublic || plan.id === sub.planId ||
        (plan.slug === 'referral-open-banking' && plans.some(p => p.id === sub.planId && p.slug.startsWith('referral-')))));
    const priced = await Promise.all(eligible.map(async plan => ({ id: plan.id, name: plan.name, modules: plan.modules, features: plan.features,
      badge: plan.badge, recommended: plan.recommended, isPublic: plan.isPublic, notes: plan.notes,
      ...(await this.quote(sub, plan)) })));
    const nonBankingPlans = plans.filter(plan => !plan.modules?.includes(ModuleName.OPEN_BANKING) &&
      (plan.isPublic || (plan.slug === 'referral-basic' && plans.some(p => p.id === sub.planId && p.slug.startsWith('referral-')))))
      .map(plan => ({ id: plan.id, name: plan.name }));
    const command = await this.latest(sub.id);
    const status = sub.status === SubscriptionStatus.TRIAL && sub.trialEnd && sub.trialEnd <= new Date()
      ? SubscriptionStatus.TRIAL_EXPIRED : sub.status;
    return { plans: priced, nonBankingPlans, trialEnd: sub.trialEnd, status, hasSavedCard: !!sub.paymentMethodId,
      complimentary: sub.billingAccessMode === BillingAccessMode.COMPLIMENTARY_FULL,
      enrollment: ['PREPARE', 'READY'].includes(command?.metadata?.command) ? {
        eventId: command!.id, planId: command!.metadata!.planId, status: command!.metadata!.command,
        firstBillingAt: command!.metadata!.trialEnd } : null };
  }

  private async quote(sub: Subscription, plan: SubscriptionPlan) {
    const amounts = await this.pricing.calculateCheckoutPrice(sub.firebaseId, plan.id, sub.trialEnd ?? new Date());
    if (amounts.currency !== 'ILS' || !Number.isSafeInteger(amounts.finalAmountAgorot) || amounts.finalAmountAgorot <= 0) {
      throw new ConflictException('התוכנית אינה נתמכת במסלול הרשמה זה.');
    }
    const snapshot = { planId: plan.id, trialEnd: sub.trialEnd?.toISOString() ?? null,
      amountAgorot: amounts.finalAmountAgorot, amountBeforeVatAgorot: amounts.amountBeforeVatAgorot,
      vatAmountAgorot: amounts.vatAmountAgorot, currency: amounts.currency };
    return { ...snapshot, quote: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex') };
  }

  async prepare(actor: BillingMutationActorContext, planId: number, quote: string) {
    assertBillingOwnerMutation(actor);
    return this.db.transaction(async manager => {
      const sub = await this.lock(manager, actor.subjectFirebaseId);
      if (sub.status !== SubscriptionStatus.TRIAL || !sub.trialEnd || sub.trialEnd <= new Date()) {
        throw new ConflictException('תקופת הניסיון הסתיימה. יש לרכוש מנוי דרך עמוד התוכניות.');
      }
      const options = await this.options(sub.firebaseId);
      if (!options.plans.some(plan => plan.id === planId)) throw new ConflictException('יש לבחור תוכנית הכוללת בנקאות פתוחה.');
      const plan = await manager.findOneOrFail(SubscriptionPlan, { where: { id: planId, isActive: true } });
      const snapshot = await this.quote(sub, plan);
      if (snapshot.quote !== quote) throw new ConflictException('פרטי התוכנית השתנו. יש לרענן ולאשר מחדש.');
      const previous = await this.latest(sub.id, manager);
      if (['PREPARE', 'READY'].includes(previous?.metadata?.command) && previous?.metadata?.quote === quote) {
        return { eventId: previous!.id, status: previous!.metadata!.command };
      }
      const event = await this.write(manager, sub, 'PREPARE', { ...snapshot,
        actorFirebaseId: actor.actorFirebaseId, termsVersion: 1 });
      await manager.update(Subscription, sub.id, { nextBillingDate: null });
      return { eventId: event.id, status: 'PREPARE' };
    });
  }

  /** Called only after server-side Feezback verification, never from browser return. */
  async connectionVerified(firebaseId: string) {
    return this.db.transaction(async manager => {
      const sub = await manager.findOne(Subscription, { where: { firebaseId }, lock: { mode: 'pessimistic_write' } });
      if (!sub || sub.billingAccessMode !== BillingAccessMode.STANDARD || sub.canceledAt || sub.endedAt) return;
      const request = await this.latest(sub.id, manager);
      if (request?.metadata?.command !== 'PREPARE') return;
      if (![SubscriptionStatus.TRIAL, SubscriptionStatus.TRIAL_EXPIRED].includes(sub.status) ||
        !sub.paymentMethodId || sub.currentPeriodStart || sub.currentPeriodEnd ||
        sub.trialEnd?.toISOString() !== request.metadata.trialEnd) return;
      const debts = await manager.find(BillingObligation, { where: { subscriptionId: sub.id,
        status: BillingObligationStatus.OPEN }, lock: { mode: 'pessimistic_write' } });
      if (debts.some(debt => debt.activeAttemptId != null)) return;
      const plan = await manager.findOne(SubscriptionPlan, { where: { id: request.metadata.planId, isActive: true } });
      if (!plan?.modules?.includes(ModuleName.OPEN_BANKING)) throw new ConflictException('התוכנית אינה זמינה.');
      await manager.update(Subscription, sub.id, { planId: plan.id, nextBillingDate: sub.trialEnd });
      await this.write(manager, sub, 'READY', { ...request.metadata, requestEventId: request.id });
    });
  }

  async assertCanConnect(actor: BillingMutationActorContext) {
    assertBillingOwnerMutation(actor);
    return this.db.transaction(async manager => {
      const exempt = await manager.findOne(Subscription, { where: { firebaseId: actor.subjectFirebaseId }, lock: { mode: 'pessimistic_write' } });
      if (exempt?.billingAccessMode === BillingAccessMode.COMPLIMENTARY_FULL) return;
      const plan = exempt?.planId ? await manager.findOne(SubscriptionPlan, { where: { id: exempt.planId } }) : null;
      if (exempt?.status === SubscriptionStatus.ACTIVE && (!exempt.canceledAt || exempt.canceledAt > new Date()) &&
        plan?.modules?.includes(ModuleName.OPEN_BANKING)) return;
      const sub = await this.lock(manager, actor.subjectFirebaseId);
      const request = await this.latest(sub.id, manager);
      if (sub.status !== SubscriptionStatus.TRIAL || !sub.trialEnd || sub.trialEnd <= new Date() ||
        !['PREPARE', 'READY'].includes(request?.metadata?.command) ||
        sub.trialEnd.toISOString() !== request?.metadata?.trialEnd) {
        throw new ConflictException('יש לבחור תוכנית ולאשר את תנאי ההרשמה לבנקאות פתוחה.');
      }
      const card = sub.paymentMethodId ? await manager.findOne(PaymentMethod, { where: { id: sub.paymentMethodId, firebaseId: sub.firebaseId } }) : null;
      if (!card?.cardcomToken || !card.cardExpiryYear || !card.cardExpiryMonth ||
        new Date(card.cardExpiryYear, card.cardExpiryMonth, 1) <= new Date()) {
        throw new ConflictException('יש לשמור כרטיס תקין לפני המעבר לפיזבק.');
      }
    });
  }

  async cancel(actor: BillingMutationActorContext, expectedEventId: number, planId: number) {
    assertBillingOwnerMutation(actor);
    return this.db.transaction(async manager => {
      const sub = await this.lock(manager, actor.subjectFirebaseId);
      const request = await this.latest(sub.id, manager);
      const neverActivated = request?.metadata?.command === 'PREPARE' &&
        [SubscriptionStatus.TRIAL, SubscriptionStatus.TRIAL_EXPIRED].includes(sub.status);
      if ((!neverActivated && (sub.status !== SubscriptionStatus.TRIAL || !sub.trialEnd || sub.trialEnd <= new Date())) ||
        request?.id !== expectedEventId || !['PREPARE', 'READY'].includes(request.metadata?.command)) {
        throw new ConflictException('מצב ההרשמה השתנה. יש לרענן.');
      }
      const options = await this.options(sub.firebaseId);
      if (!options.nonBankingPlans.some(plan => plan.id === planId)) throw new ConflictException('יש לבחור תוכנית ללא בנקאות פתוחה.');
      await manager.update(Subscription, sub.id, { nextBillingDate: null, planId });
      await this.write(manager, sub, 'CANCEL', { requestEventId: request.id, planId, actorFirebaseId: actor.actorFirebaseId });
      return { status: 'CANCELED' };
    });
  }

  /** Promote only approved, connected trials at their original boundary; canonical renewal charges afterwards. */
  async activateDue(subscriptionId: number) {
    return this.db.transaction(async manager => {
      const sub = await manager.findOne(Subscription, { where: { id: subscriptionId }, lock: { mode: 'pessimistic_write' } });
      if (!sub || sub.billingAccessMode !== BillingAccessMode.STANDARD || sub.canceledAt || sub.endedAt ||
        ![SubscriptionStatus.TRIAL, SubscriptionStatus.TRIAL_EXPIRED].includes(sub.status) ||
        !sub.trialEnd || sub.trialEnd > new Date()) return false;
      const ready = await this.latest(sub.id, manager);
      if (ready?.metadata?.command !== 'READY' || ready.metadata.trialEnd !== sub.trialEnd.toISOString() ||
        ready.metadata.planId !== sub.planId || !sub.paymentMethodId) return false;
      const plan = await manager.findOne(SubscriptionPlan, { where: { id: sub.planId!, isActive: true } });
      if (!plan?.modules?.includes(ModuleName.OPEN_BANKING)) return false;
      const pending = await manager.find(BillingObligation, { where: { subscriptionId: sub.id,
        status: BillingObligationStatus.OPEN }, lock: { mode: 'pessimistic_write' } });
      if (pending.some(debt => debt.activeAttemptId != null)) return false;
      await manager.update(Subscription, sub.id, { status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: null, currentPeriodEnd: sub.trialEnd, nextBillingDate: sub.trialEnd,
        billingAnchorDay: Number(billingDate(sub.trialEnd).slice(8)), renewalAttempts: 0 });
      await this.write(manager, sub, 'ACTIVATE', { ...ready.metadata, readyEventId: ready.id });
      return true;
    });
  }

  async activateDueTrials() {
    const trials = await this.db.manager.find(Subscription, { where: {
      status: In([SubscriptionStatus.TRIAL, SubscriptionStatus.TRIAL_EXPIRED]) }, select: ['id', 'trialEnd'] });
    for (const sub of trials) if (sub.trialEnd && sub.trialEnd <= new Date()) {
      try { await this.activateDue(sub.id); }
      catch { this.logger.error(`Trial activation requires review: subscription=${sub.id}`); }
    }
  }

  async firstPeriodPrice(sub: Subscription, periodStart: Date) {
    if (sub.currentPeriodStart) return null;
    const event = await this.latest(sub.id);
    const data = event?.metadata;
    if (data?.command !== 'ACTIVATE' || data.planId !== sub.planId || data.trialEnd !== periodStart.toISOString()) return null;
    return { finalAmountAgorot: data.amountAgorot as number,
      amountBeforeVatAgorot: data.amountBeforeVatAgorot as number, vatAmountAgorot: data.vatAmountAgorot as number };
  }

  /** Bounded recovery window for a missed webhook; abandoned token-only enrollments never charge. */
  async pendingConnectionChecks() {
    const candidates = await this.db.manager.find(Subscription, { where: {
      status: In([SubscriptionStatus.TRIAL, SubscriptionStatus.TRIAL_EXPIRED]), billingAccessMode: BillingAccessMode.STANDARD },
      select: ['id', 'firebaseId', 'trialEnd', 'paymentMethodId', 'canceledAt', 'endedAt'] });
    const ids: string[] = [];
    for (const sub of candidates) {
      if (!sub.paymentMethodId || sub.canceledAt || sub.endedAt || !sub.trialEnd ||
        sub.trialEnd.getTime() + 7 * 86400000 < Date.now()) continue;
      const command = await this.latest(sub.id);
      if (command?.metadata?.command === 'PREPARE' && command.metadata.trialEnd === sub.trialEnd.toISOString()) ids.push(sub.firebaseId);
    }
    return ids;
  }
}
