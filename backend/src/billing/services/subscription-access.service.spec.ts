/**
 * Unit tests: SubscriptionAccessService.resolveModulesAccess —
 * unconditional delegated-access module bypass.
 *
 * Covers: non-delegated access is untouched; delegated access (a real
 * accountant impersonation request backed by an ACTIVE Delegation row)
 * grants every module unconditionally, regardless of the client's own
 * subscription status or plan — including INVOICES/OPEN_BANKING, and
 * including on branches that would otherwise return no access at all
 * (TRIAL_EXPIRED, lapsed CANCELED, expired PAST_DUE grace).
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

  it('delegated access on TRIAL_EXPIRED grants every module unconditionally', () => {
    const sub = makeSubscription({ status: SubscriptionStatus.TRIAL_EXPIRED });
    const access = service.resolveModulesAccess(sub, null, true);
    expect([...access].sort()).toEqual(Object.values(ModuleName).sort());
  });

  it('delegated access on lapsed CANCELED grants every module, including OPEN_BANKING/INVOICES', () => {
    const sub = makeSubscription({
      status: SubscriptionStatus.CANCELED,
      currentPeriodEnd: new Date(Date.now() - 86_400_000),
    });
    const access = service.resolveModulesAccess(sub, null, true);
    expect([...access].sort()).toEqual(Object.values(ModuleName).sort());
  });

  it('delegated access on an expired PAST_DUE grace period still grants every module', () => {
    const sub = makeSubscription({
      status: SubscriptionStatus.PAST_DUE,
      gracePeriodEndsAt: new Date(Date.now() - 86_400_000),
    });
    const access = service.resolveModulesAccess(sub, null, true);
    expect([...access].sort()).toEqual(Object.values(ModuleName).sort());
  });

  it('delegated access ignores the client plan entirely — grants modules the plan excludes', () => {
    const sub = makeSubscription({
      status: SubscriptionStatus.ACTIVE,
      nextBillingDate: new Date(Date.now() + 86_400_000),
    });
    const plan = { modules: [ModuleName.EXPENSES] } as SubscriptionPlan;
    const access = service.resolveModulesAccess(sub, plan, true);
    expect([...access].sort()).toEqual(Object.values(ModuleName).sort());
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
