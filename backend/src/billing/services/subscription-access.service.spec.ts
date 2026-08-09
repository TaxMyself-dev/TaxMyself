/**
 * Unit tests: SubscriptionAccessService.resolveModulesAccess —
 * delegated-access module guarantee (referral-signup feature, Phase 2).
 *
 * Covers: non-delegated access is untouched; delegated access unions in
 * EXPENSES+ACCOUNTANT even on branches that would otherwise return no access
 * at all (TRIAL_EXPIRED, lapsed CANCELED, expired PAST_DUE grace); INVOICES
 * and OPEN_BANKING are never added by the override, delegated or not.
 */
import { SubscriptionAccessService } from './subscription-access.service';
import { Subscription } from '../entities/subscription.entity';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { SubscriptionStatus } from '../enums/billing.enums';
import { ModuleName } from 'src/enum';

function makeSubscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: 1,
    firebaseId: 'client-1',
    planId: null,
    paymentMethodId: null,
    status: SubscriptionStatus.TRIAL,
    trialStart: null,
    trialEnd: null,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    nextBillingDate: null,
    gracePeriodEndsAt: null,
    renewalAttempts: 0,
    canceledAt: null,
    endedAt: null,
    discountPercent: null,
    discountAmountAgorot: null,
    discountStartDate: null,
    discountEndDate: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Subscription;
}

describe('SubscriptionAccessService.resolveModulesAccess — delegated-access override', () => {
  let service: SubscriptionAccessService;

  beforeEach(() => {
    service = new SubscriptionAccessService();
  });

  it('non-delegated access is completely unaffected (TRIAL_EXPIRED → no access)', () => {
    const sub = makeSubscription({ status: SubscriptionStatus.TRIAL_EXPIRED });
    expect(service.resolveModulesAccess(sub, null, false)).toEqual([]);
  });

  it('default (no third argument) behaves exactly like non-delegated access', () => {
    const sub = makeSubscription({ status: SubscriptionStatus.TRIAL_EXPIRED });
    expect(service.resolveModulesAccess(sub, null)).toEqual([]);
  });

  it('delegated access on TRIAL_EXPIRED grants EXPENSES + ACCOUNTANT only', () => {
    const sub = makeSubscription({ status: SubscriptionStatus.TRIAL_EXPIRED });
    const access = service.resolveModulesAccess(sub, null, true);
    expect([...access].sort()).toEqual([ModuleName.ACCOUNTANT, ModuleName.EXPENSES].sort());
  });

  it('delegated access on lapsed CANCELED grants EXPENSES + ACCOUNTANT, never OPEN_BANKING/INVOICES', () => {
    const sub = makeSubscription({
      status: SubscriptionStatus.CANCELED,
      currentPeriodEnd: new Date(Date.now() - 86_400_000),
    });
    const access = service.resolveModulesAccess(sub, null, true);
    expect(access).toEqual(expect.arrayContaining([ModuleName.EXPENSES, ModuleName.ACCOUNTANT]));
    expect(access).not.toContain(ModuleName.OPEN_BANKING);
    expect(access).not.toContain(ModuleName.INVOICES);
  });

  it('delegated access on an expired PAST_DUE grace period still grants EXPENSES + ACCOUNTANT', () => {
    const sub = makeSubscription({
      status: SubscriptionStatus.PAST_DUE,
      gracePeriodEndsAt: new Date(Date.now() - 86_400_000),
    });
    const access = service.resolveModulesAccess(sub, null, true);
    expect(access).toEqual(expect.arrayContaining([ModuleName.EXPENSES, ModuleName.ACCOUNTANT]));
  });

  it('delegated access does not add INVOICES/OPEN_BANKING when the client plan excludes them', () => {
    const sub = makeSubscription({
      status: SubscriptionStatus.ACTIVE,
      nextBillingDate: new Date(Date.now() + 86_400_000),
    });
    const plan = { modules: [ModuleName.EXPENSES] } as SubscriptionPlan;
    const access = service.resolveModulesAccess(sub, plan, true);
    expect([...access].sort()).toEqual([ModuleName.ACCOUNTANT, ModuleName.EXPENSES].sort());
  });

  it('an active TRIAL already grants everything — delegated flag is a no-op there', () => {
    const sub = makeSubscription({
      status: SubscriptionStatus.TRIAL,
      trialEnd: new Date(Date.now() + 86_400_000),
    });
    const access = service.resolveModulesAccess(sub, null, true);
    expect([...access].sort()).toEqual(Object.values(ModuleName).sort());
  });
});
