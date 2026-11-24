import { Subscription } from '../../billing/entities/subscription.entity';
import { SubscriptionPlan } from '../../billing/entities/subscription-plan.entity';
import {
  BillingAccessMode,
  SubscriptionStatus,
} from '../../billing/enums/billing.enums';
import { ModuleName } from '../../enum';
import {
  ProviderEvidence,
  IdentityEvidence,
} from './feezback-lifecycle.entity';
export const terminalStatuses = new Set([
  'terminatedbytpp',
  'revokedbypsu',
  'expired',
  'rejected',
  'noanswer',
]);
export const emptyIdentity = (): IdentityEvidence => ({
  consents: [],
  checkedAt: null,
  error: null,
});
export const emptyEvidence = (): ProviderEvidence => ({
  primary: emptyIdentity(),
  spouse: emptyIdentity(),
});

/** Cost depends on consent, not completed bank/card discovery. Unknown states never prove no cost. */
export function identityUnits(
  identity: IdentityEvidence,
  now = new Date(),
): 0 | 1 | null {
  if (!identity.checkedAt || identity.error) return null;
  let uncertain = false;
  for (const consent of identity.consents) {
    const status = consent.status.toLowerCase();
    const expiry = consent.validUntil
      ? new Date(consent.validUntil).getTime()
      : null;
    if (expiry !== null && !Number.isFinite(expiry)) {
      uncertain = true;
      continue;
    }
    if (
      terminalStatuses.has(status) ||
      (expiry !== null && expiry <= now.getTime())
    )
      continue;
    if (status === 'valid') return 1;
    uncertain = true;
  }
  return uncertain ? null : 0;
}
export interface BankingEntitlement {
  eligible: boolean | null;
  reason: string;
  until: Date | null;
}
export function bankingEntitlement(
  sub: Subscription | null,
  plan: SubscriptionPlan | null,
  enrollment: Record<string, any> | null,
  ownModules: ModuleName[],
  now = new Date(),
): BankingEntitlement {
  if (!sub) return { eligible: null, reason: 'NO_SUBSCRIPTION', until: null };
  if (sub.billingAccessMode === BillingAccessMode.COMPLIMENTARY_FULL)
    return { eligible: true, reason: 'COMPLIMENTARY', until: null };
  if (sub.status === SubscriptionStatus.TRIAL) {
    if (!sub.trialEnd)
      return { eligible: null, reason: 'TRIAL_END_UNKNOWN', until: null };
    const approved =
      ['PREPARE', 'READY'].includes(enrollment?.command) &&
      enrollment?.trialEnd === sub.trialEnd.toISOString();
    if (approved && enrollment?.command === 'READY' && sub.trialEnd <= now)
      return {
        eligible: null,
        reason: 'BILLING_ACTIVATION_PENDING',
        until: sub.trialEnd,
      };
    return {
      eligible: sub.trialEnd > now && approved,
      reason: approved ? 'TRIAL' : 'TRIAL_NOT_ENROLLED',
      until: sub.trialEnd,
    };
  }
  if (
    sub.status === SubscriptionStatus.TRIAL_EXPIRED &&
    enrollment?.command === 'READY' &&
    enrollment?.trialEnd === sub.trialEnd?.toISOString()
  ) {
    return {
      eligible: null,
      reason: 'BILLING_ACTIVATION_PENDING',
      until: sub.trialEnd,
    };
  }
  if (
    [SubscriptionStatus.ACTIVE, SubscriptionStatus.CANCELED].includes(
      sub.status,
    ) &&
    !plan
  )
    return { eligible: null, reason: 'PLAN_UNKNOWN', until: null };
  const eligible = ownModules.includes(ModuleName.OPEN_BANKING);
  return {
    eligible,
    reason: eligible ? 'PLAN' : 'NO_ENTITLEMENT',
    until: sub.canceledAt ?? sub.currentPeriodEnd ?? null,
  };
}
