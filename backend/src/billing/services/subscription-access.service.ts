import { Injectable } from '@nestjs/common';
import { ModuleName } from 'src/enum';
import { Subscription } from '../entities/subscription.entity';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { BillingAccessMode, SubscriptionStatus } from '../enums/billing.enums';

/**
 * Slack allowed past `nextBillingDate`/`currentPeriodEnd` before an ACTIVE
 * subscription's access is cut. Exists purely to absorb normal timing (the
 * renewal cron runs once daily) — it is NOT meant to give a real grace
 * period for PAST_DUE, which blocks immediately. If billing genuinely
 * stalls (cron down, or a payment blocked pending a manual receipt fix —
 * see BillingEventService.getUnresolvedReceiptFailure), access lapses here
 * instead of continuing forever with no independent check.
 */
const ACTIVE_BILLING_GRACE_DAYS = 3;

@Injectable()
export class SubscriptionAccessService {
  /**
   * Resolves which modules the user has access to based on their subscription
   * status and plan.
   *
   * Rules:
   *   TRIAL              → all available modules
   *   ACTIVE             → modules defined in subscription_plan.modules
   *   PAST_DUE           → no access immediately after the third confirmed decline
   *   CANCELED           → plan modules if still within currentPeriodEnd, else no access
   *   TRIAL_EXPIRED      → no access
   *
   * Delegated accountant access and verified admin impersonation each grant
   * every module unconditionally, ignoring the client's own status entirely.
   * These are request-scoped authorization rules, not subscription state, and
   * therefore never change what the client can access directly.
   */
  resolveModulesAccess(
    subscription: Subscription,
    plan?: SubscriptionPlan | null,
    isDelegatedAccess = false,
    isAdminImpersonation = false,
  ): ModuleName[] {
    if (isDelegatedAccess || isAdminImpersonation) return Object.values(ModuleName);
    return this.resolveOwnModulesAccess(subscription, plan);
  }

  private resolveOwnModulesAccess(
    subscription: Subscription,
    plan?: SubscriptionPlan | null,
  ): ModuleName[] {
    const now = new Date();
    const allModules = Object.values(ModuleName);

    if (subscription.billingAccessMode === BillingAccessMode.COMPLIMENTARY_FULL) {
      return allModules;
    }

    switch (subscription.status) {
      case SubscriptionStatus.TRIAL:
        if (subscription.trialEnd !== null && subscription.trialEnd < now) {
          return [];
        }
        return allModules;

      case SubscriptionStatus.ACTIVE: {
        // Guard against indefinite free access if billing has silently
        // stalled (renewal cron down, or intentionally blocked pending a
        // manual receipt fix) — ACTIVE alone is not proof the subscription
        // is actually current.
        const dueDate = subscription.nextBillingDate ?? subscription.currentPeriodEnd;
        if (dueDate != null) {
          const graceLimit = new Date(dueDate);
          graceLimit.setDate(graceLimit.getDate() + ACTIVE_BILLING_GRACE_DAYS);
          if (graceLimit < now) return [];
        }
        return plan?.modules?.length ? plan.modules : allModules;
      }

      case SubscriptionStatus.PAST_DUE: {
        return [];
      }

      case SubscriptionStatus.CANCELED: {
        const stillInPeriod =
          subscription.currentPeriodEnd != null &&
          subscription.currentPeriodEnd > now;
        if (stillInPeriod) {
          return plan?.modules?.length ? plan.modules : allModules;
        }
        return [];
      }

      case SubscriptionStatus.TRIAL_EXPIRED:
      default:
        return [];
    }
  }

  /**
   * Returns true if the trial is currently active (status = TRIAL and not
   * yet past the trialEnd date).
   */
  isTrialActive(subscription: Subscription): boolean {
    if (subscription.billingAccessMode === BillingAccessMode.COMPLIMENTARY_FULL) return false;
    if (subscription.status !== SubscriptionStatus.TRIAL) return false;
    if (!subscription.trialEnd) return true;
    return subscription.trialEnd > new Date();
  }

  /**
   * Returns true when the user must provide a payment method to continue.
   * PAST_DUE blocks direct module access immediately; authenticated billing
   * recovery and payment-method endpoints remain available separately.
   */
  isPaymentRequired(subscription: Subscription): boolean {
    if (subscription.billingAccessMode === BillingAccessMode.COMPLIMENTARY_FULL) return false;
    return (
      subscription.status === SubscriptionStatus.TRIAL_EXPIRED ||
      subscription.status === SubscriptionStatus.PAST_DUE
    );
  }

  gracePeriodActive(_subscription: Subscription): boolean {
    // Keep the response contract and stored legacy dates, but no PAST_DUE
    // access grace is granted under the approved immediate-block policy.
    return false;
  }
}
