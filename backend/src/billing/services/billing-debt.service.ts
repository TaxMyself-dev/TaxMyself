import { ConflictException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { billingBoundary, billingDate, nextBillingPeriod } from '../domain/billing-debt-periods';
import { renewalPeriodStart } from '../domain/billing-renewal-policy';
import { billingDebtQuote } from '../domain/billing-debt-quote';
import { BillingObligation } from '../entities/billing-obligation.entity';
import { Subscription } from '../entities/subscription.entity';
import { BillingAccessMode, BillingObligationKind, BillingObligationStatus, SubscriptionStatus } from '../enums/billing.enums';
import { assertBillingOwnerMutation, BillingMutationActorContext } from './billing-attempt-orchestration.service';

@Injectable()
export class BillingDebtService {
  private readonly logger = new Logger(BillingDebtService.name);
  constructor(private readonly dataSource: DataSource) {}

  /** Provider-free accrual; no charge and no dependence on login activity. */
  async accrue(subscriptionId: number, now = new Date()): Promise<BillingObligation[]> {
    return this.dataSource.transaction(async manager => {
      const sub = await manager.findOne(Subscription, {
        where: { id: subscriptionId }, lock: { mode: 'pessimistic_write' },
      });
      if (!sub || sub.billingAccessMode === BillingAccessMode.COMPLIMENTARY_FULL ||
        ![SubscriptionStatus.PAST_DUE, SubscriptionStatus.CANCELED].includes(sub.status)) return [];
      const existing = await manager.find(BillingObligation, {
        where: { subscriptionId, kind: BillingObligationKind.RECURRING_PERIOD },
        order: { periodStart: 'ASC' }, lock: { mode: 'pessimistic_write' },
      });
      const first = existing.find(debt => debt.status === BillingObligationStatus.OPEN);
      const due = renewalPeriodStart(sub) ?? sub.currentPeriodEnd;
      if (!due && !existing.length && sub.status === SubscriptionStatus.CANCELED) return [];
      if (!due) throw new ConflictException('Missing original billing period; review required');
      let cursor = first?.periodStart ?? billingDate(due);
      const anchor = sub.billingAnchorDay ?? (sub.currentPeriodStart ? Number(billingDate(sub.currentPeriodStart).slice(8)) : null);
      if (!anchor) throw new ConflictException('Missing original billing anchor; review required');
      if (sub.status === SubscriptionStatus.CANCELED && !sub.canceledAt) {
        throw new ConflictException('Missing effective cancellation time; review required');
      }
      // DATE obligations must not invent a new period at midnight on the day
      // a paid period ends later in the morning. Cancellation at that boundary
      // excludes the whole next service period, while preserving stored debts.
      const cancellationCutoff = sub.canceledAt && sub.currentPeriodEnd?.getTime() === sub.canceledAt.getTime()
        ? billingBoundary(billingDate(sub.canceledAt)) : sub.canceledAt;
      const byPeriod = new Map(existing.map(debt => [debt.periodStart, debt]));
      let count = 0;
      while (billingBoundary(cursor) <= now && (!cancellationCutoff || billingBoundary(cursor) < cancellationCutoff)) {
        if (++count > 120) throw new ConflictException('Debt history exceeds review limit');
        const end = nextBillingPeriod(cursor, anchor);
        if (!byPeriod.has(cursor)) {
          // Elazar approved reusing the first unpaid debt's frozen terms for missing periods.
          if (!first) throw new ConflictException('No original unpaid price snapshot; review required');
          const debt = manager.create(BillingObligation, {
            subscriptionId, firebaseIdSnapshot: sub.firebaseId,
            obligationKey: `subscription:${subscriptionId}:period:${cursor}`,
            kind: BillingObligationKind.RECURRING_PERIOD, status: BillingObligationStatus.OPEN,
            planId: first.planId, periodStart: cursor, periodEnd: end,
            amountAgorot: first.amountAgorot, amountBeforeVatAgorot: first.amountBeforeVatAgorot,
            vatAmountAgorot: first.vatAmountAgorot, currency: first.currency,
            activeAttemptId: null, satisfiedAttemptId: null, satisfiedAt: null, version: 0,
          });
          await manager.save(BillingObligation, debt);
          existing.push(debt);
          byPeriod.set(cursor, debt);
        }
        cursor = end;
      }
      return existing.filter(debt => debt.status === BillingObligationStatus.OPEN)
        .sort((a,b) => a.id-b.id);
    });
  }

  async preview(actor: BillingMutationActorContext, subscriptionId: number) {
    assertBillingOwnerMutation(actor);
    const sub = await this.dataSource.manager.findOne(Subscription, { where: { id: subscriptionId } });
    if (!sub || sub.firebaseId !== actor.subjectFirebaseId) throw new ForbiddenException('Subscription owner mismatch');
    const debts = await this.accrue(subscriptionId);
    if (!debts.length) throw new ConflictException('No outstanding subscription debt');
    if (debts.some(debt => debt.activeAttemptId != null || debt.currency !== 'ILS')) {
      throw new ConflictException({ code: 'BILLING_PAYMENT_PENDING',
        message: 'קיים ניסיון תשלום שממתין להשלמה או לבדיקת התמיכה. אין לשלם שוב עד שהבדיקה תסתיים. אפשר לפנות לתמיכה לבירור מצב התשלום.' });
    }
    const quote = billingDebtQuote(debts);
    return {
      recoveryQuote: quote, obligationIds: debts.map(debt => debt.id),
      planId: debts[0].planId,
      finalAmountAgorot: debts.reduce((sum, debt) => sum+debt.amountAgorot, 0),
      amountBeforeVatAgorot: debts.reduce((sum, debt) => sum+debt.amountBeforeVatAgorot, 0),
      vatAmountAgorot: debts.reduce((sum, debt) => sum+debt.vatAmountAgorot, 0), currency: 'ILS',
      periods: [...debts].sort((a,b) => a.periodStart.localeCompare(b.periodStart))
        .map(debt => ({ periodStart: debt.periodStart, periodEnd: debt.periodEnd, amountAgorot: debt.amountAgorot })),
    };
  }

  async accruePastDue(now = new Date()): Promise<void> {
    const subs = await this.dataSource.manager.find(Subscription, {
      where: { status: In([SubscriptionStatus.PAST_DUE, SubscriptionStatus.CANCELED]) },
      select: ['id'], order: { id: 'ASC' },
    });
    for (const sub of subs) {
      try { await this.accrue(sub.id, now); }
      catch { this.logger.warn(`Debt accrual requires review for subscription #${sub.id}`); }
    }
  }
}
