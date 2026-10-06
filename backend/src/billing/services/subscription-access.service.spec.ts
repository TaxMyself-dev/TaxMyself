/**
 * Unit tests: SubscriptionAccessService.resolveModulesAccess —
 * unconditional professional-access module bypass.
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
import { decideRenewalDecline } from '../domain/billing-renewal-policy';

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

describe('SubscriptionAccessService.resolveModulesAccess — professional-access override', () => {
  let service: SubscriptionAccessService;

  beforeEach(() => {
    service = new SubscriptionAccessService();
  });

  it.each([null, new Date('2099-01-01'), new Date('2000-01-01')])(
    'blocks direct PAST_DUE access regardless of the stored grace date %s', gracePeriodEndsAt => {
      const sub = makeSubscription({ status: SubscriptionStatus.PAST_DUE, renewalAttempts: 3, gracePeriodEndsAt });
      expect(service.resolveModulesAccess(sub, { modules: [ModuleName.EXPENSES] } as SubscriptionPlan)).toEqual([]);
      expect(service.isPaymentRequired(sub)).toBe(true);
      expect(service.gracePeriodActive(sub)).toBe(false);
    });

  it('keeps access during the first two decline retries and blocks on the third', () => {
    const now = new Date();
    const sub = makeSubscription({ status: SubscriptionStatus.ACTIVE, nextBillingDate: now });
    const plan = { modules: [ModuleName.EXPENSES] } as SubscriptionPlan;
    for (let previous = 0; previous < 3; previous++) {
      const decision = decideRenewalDecline(previous, now);
      sub.renewalAttempts = decision.attemptNumber;
      if (decision.kind === 'PAST_DUE') {
        sub.status = SubscriptionStatus.PAST_DUE;
        sub.gracePeriodEndsAt = decision.gracePeriodEndsAt;
      } else sub.nextBillingDate = decision.retryAt;
      expect(service.resolveModulesAccess(sub, plan)).toEqual(previous < 2 ? plan.modules : []);
    }
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

  it('admin impersonation on TRIAL_EXPIRED grants every module while direct access stays blocked', () => {
    const sub = makeSubscription({ status: SubscriptionStatus.TRIAL_EXPIRED });
    const adminAccess = service.resolveModulesAccess(sub, null, false, true);
    const directAccess = service.resolveModulesAccess(sub, null, false, false);
    expect([...adminAccess].sort()).toEqual(Object.values(ModuleName).sort());
    expect(directAccess).toEqual([]);
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
