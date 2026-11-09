import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { billingDate, nextBillingPeriod } from '../domain/billing-debt-periods';
import { BillingEvent } from '../entities/billing-event.entity';
import { BillingObligation } from '../entities/billing-obligation.entity';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { Subscription } from '../entities/subscription.entity';
import {
  BillingEventType,
  BillingObligationKind,
  BillingObligationStatus,
  SubscriptionStatus,
} from '../enums/billing.enums';
import {
  assertBillingOwnerMutation,
  BillingMutationActorContext,
} from './billing-attempt-orchestration.service';
import { PricingService } from './pricing.service';
import { SubscriptionAccessService } from './subscription-access.service';

@Injectable()
export class BillingOverdueRecoveryService {
  private readonly logger = new Logger(BillingOverdueRecoveryService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly pricing: PricingService,
    private readonly access: SubscriptionAccessService,
  ) {}

  /**
   * Converts a silently overdue ACTIVE subscription into canonical recoverable
   * debt. This is bookkeeping only: it never creates an attempt and cannot call
   * CardCom. The existing recovery flow is responsible for the later payment.
   */
  async prepare(actor: BillingMutationActorContext): Promise<{
    status: SubscriptionStatus.PAST_DUE;
    obligationId: number;
    providerCalled: false;
  }> {
    assertBillingOwnerMutation(actor);
    const billingBusinessType = await this.pricing.resolveUserBillingBusinessType(
      actor.subjectFirebaseId,
    );

    const result = await this.dataSource.transaction(async manager => {
      const subscription = await manager.findOne(Subscription, {
        where: { firebaseId: actor.subjectFirebaseId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!subscription) throw new ConflictException('Subscription not found');

      if (subscription.status === SubscriptionStatus.PAST_DUE) {
        const existing = await manager.findOne(BillingObligation, {
          where: {
            subscriptionId: subscription.id,
            kind: BillingObligationKind.RECURRING_PERIOD,
            status: BillingObligationStatus.OPEN,
          },
          order: { periodStart: 'ASC' },
          lock: { mode: 'pessimistic_write' },
        });
        if (!existing) {
          throw new ConflictException('Past-due subscription has no recoverable debt');
        }
        return existing;
      }

      if (
        subscription.status !== SubscriptionStatus.ACTIVE ||
        this.access.paymentBlockReason(subscription) !== 'ACTIVE_OVERDUE'
      ) {
        throw new ConflictException('Subscription is not overdue');
      }
      if (!subscription.planId) throw new ConflictException('Subscription plan is missing');

      const plan = await manager.findOne(SubscriptionPlan, {
        where: { id: subscription.planId },
      });
      if (!plan) throw new ConflictException('Subscription plan is missing');

      const dueAt = subscription.nextBillingDate ?? subscription.currentPeriodEnd;
      if (!dueAt) throw new ConflictException('Subscription billing date is missing');
      const periodStart = billingDate(dueAt);
      const anchorDay = subscription.billingAnchorDay ?? Number(periodStart.slice(8));
      const periodEnd = nextBillingPeriod(periodStart, anchorDay);
      const baseAmount = this.pricing.resolveEffectivePlanPrice(plan, billingBusinessType);
      const discounted = this.pricing.applySubscriptionDiscount(
        baseAmount,
        subscription,
        periodStart,
      );
      const amountBeforeVatAgorot = Math.max(0, Math.round(discounted.finalAmountAgorot));
      const amounts = this.pricing.calculateBillingAmounts(
        amountBeforeVatAgorot,
        dueAt,
      );
      const obligationKey = `subscription:${subscription.id}:period:${periodStart}`;

      let obligation = await manager.findOne(BillingObligation, {
        where: { obligationKey },
        lock: { mode: 'pessimistic_write' },
      });
      if (obligation) {
        const matches =
          obligation.subscriptionId === subscription.id &&
          obligation.kind === BillingObligationKind.RECURRING_PERIOD &&
          obligation.status === BillingObligationStatus.OPEN &&
          obligation.planId === plan.id &&
          obligation.periodStart === periodStart &&
          obligation.periodEnd === periodEnd &&
          obligation.amountAgorot === amounts.amountIncludingVatAgorot &&
          obligation.amountBeforeVatAgorot === amounts.amountBeforeVatAgorot &&
          obligation.vatAmountAgorot === amounts.vatAmountAgorot &&
          obligation.currency === plan.currency;
        if (!matches) throw new ConflictException('Existing debt requires billing review');
      } else {
        obligation = await manager.save(BillingObligation, manager.create(BillingObligation, {
          subscriptionId: subscription.id,
          firebaseIdSnapshot: subscription.firebaseId,
          obligationKey,
          kind: BillingObligationKind.RECURRING_PERIOD,
          status: BillingObligationStatus.OPEN,
          planId: plan.id,
          periodStart,
          periodEnd,
          amountAgorot: amounts.amountIncludingVatAgorot,
          amountBeforeVatAgorot: amounts.amountBeforeVatAgorot,
          vatAmountAgorot: amounts.vatAmountAgorot,
          currency: plan.currency,
          activeAttemptId: null,
          satisfiedAttemptId: null,
          satisfiedAt: null,
          version: 0,
        }));
      }

      subscription.status = SubscriptionStatus.PAST_DUE;
      await manager.save(Subscription, subscription);
      await manager.save(BillingEvent, manager.create(BillingEvent, {
        firebaseId: subscription.firebaseId,
        subscriptionId: subscription.id,
        billingObligationId: obligation.id,
        eventType: BillingEventType.OVERDUE_DEBT_CREATED,
        amountAgorot: obligation.amountAgorot,
        amountBeforeVatAgorot: obligation.amountBeforeVatAgorot,
        vatAmountAgorot: obligation.vatAmountAgorot,
        currency: obligation.currency,
        metadata: {
          reason: 'ACTIVE_OVERDUE',
          providerCalled: false,
          dueDate: dueAt.toISOString(),
        },
      }));
      return obligation;
    });

    this.logger.log(JSON.stringify({
      event: 'billing_overdue_recovery_prepared',
      firebaseIdPrefix: actor.subjectFirebaseId.slice(0, 8),
      obligationId: result.id,
      providerCalled: false,
    }));
    return {
      status: SubscriptionStatus.PAST_DUE,
      obligationId: result.id,
      providerCalled: false,
    };
  }
}
