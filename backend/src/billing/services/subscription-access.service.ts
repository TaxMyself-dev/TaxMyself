import { Injectable } from '@nestjs/common';
import { ModuleName } from 'src/enum';
import { Subscription } from '../entities/subscription.entity';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { SubscriptionStatus } from '../enums/billing.enums';

@Injectable()
export class SubscriptionAccessService {
  /**
   * Resolves which modules the user has access to based on their subscription
   * status and plan.
   *
   * Rules:
   *   TRIAL              → all available modules
   *   ACTIVE             → modules defined in subscription_plan.modules
   *   PAST_DUE (grace)   → keep plan modules until grace period expires
   *   PAST_DUE (expired) → no access
   *   CANCELED           → plan modules if still within currentPeriodEnd, else no access
   *   TRIAL_EXPIRED      → no access
   */
  resolveModulesAccess(
    subscription: Subscription,
    plan?: SubscriptionPlan | null,
  ): ModuleName[] {
    const now = new Date();
    const allModules = Object.values(ModuleName);

    switch (subscription.status) {
      case SubscriptionStatus.TRIAL:
        return allModules;

      case SubscriptionStatus.ACTIVE:
        return plan?.modules?.length ? plan.modules : allModules;

      case SubscriptionStatus.PAST_DUE: {
        const graceActive =
          subscription.gracePeriodEndsAt != null &&
          subscription.gracePeriodEndsAt > now;
        if (graceActive) {
          return plan?.modules?.length ? plan.modules : allModules;
        }
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
    if (subscription.status !== SubscriptionStatus.TRIAL) return false;
    if (!subscription.trialEnd) return true;
    return subscription.trialEnd > new Date();
  }

  /**
   * Returns true when the user must provide a payment method to continue.
   * Note: PAST_DUE users may still have access during their grace period but
   * are still considered "payment required".
   */
  isPaymentRequired(subscription: Subscription): boolean {
    return (
      subscription.status === SubscriptionStatus.TRIAL_EXPIRED ||
      subscription.status === SubscriptionStatus.PAST_DUE
    );
  }

  gracePeriodActive(subscription: Subscription): boolean {
    if (subscription.status !== SubscriptionStatus.PAST_DUE) return false;
    if (!subscription.gracePeriodEndsAt) return false;
    return subscription.gracePeriodEndsAt > new Date();
  }
}
