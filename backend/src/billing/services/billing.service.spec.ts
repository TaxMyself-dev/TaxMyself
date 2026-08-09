/**
 * Unit test: BillingService.getMyBillingState — isDelegatedAccess threading
 * (referral-signup Phase 2 extension).
 *
 * Confirms GET /billing/me's own response reflects the delegated-access
 * module-access override (not just the SubscriptionGuard authorization
 * path), and that a client's own direct (non-delegated) access is passed
 * through unaffected. resolveModulesAccess itself is mocked here — its
 * override logic is covered by subscription-access.service.spec.ts; this
 * test only verifies BillingService correctly forwards the flag end-to-end.
 */
import { SubscriptionStatus } from '../enums/billing.enums';
import { BillingService } from './billing.service';
import { ModuleName } from 'src/enum';

describe('BillingService.getMyBillingState — isDelegatedAccess threading', () => {
  let service: BillingService;
  let subscriptionRepo: { findOne: jest.Mock };
  let subscriptionAccessService: { resolveModulesAccess: jest.Mock; isTrialActive: jest.Mock; isPaymentRequired: jest.Mock; gracePeriodActive: jest.Mock };
  let pricingService: { resolveUserBillingBusinessType: jest.Mock; resolveSubscriptionDiscount: jest.Mock };
  let billingEventService: { findLatestPaymentResultEvent: jest.Mock; findLatestPaymentMethodUpdateResultEvent: jest.Mock };

  const SUBSCRIPTION = {
    id: 1,
    firebaseId: 'client-1',
    planId: null,
    paymentMethodId: null,
    status: SubscriptionStatus.TRIAL_EXPIRED,
    trialStart: null,
    trialEnd: null,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    nextBillingDate: null,
    gracePeriodEndsAt: null,
    canceledAt: null,
    createdAt: new Date(),
  };

  beforeEach(() => {
    subscriptionRepo = { findOne: jest.fn().mockResolvedValue({ ...SUBSCRIPTION }) };
    subscriptionAccessService = {
      resolveModulesAccess: jest.fn().mockReturnValue(['EXPENSES', 'ACCOUNTANT']),
      isTrialActive: jest.fn().mockReturnValue(false),
      isPaymentRequired: jest.fn().mockReturnValue(true),
      gracePeriodActive: jest.fn().mockReturnValue(false),
    };
    pricingService = {
      resolveUserBillingBusinessType: jest.fn().mockResolvedValue('EXEMPT'),
      resolveSubscriptionDiscount: jest.fn().mockReturnValue(null),
    };
    billingEventService = {
      findLatestPaymentResultEvent: jest.fn().mockResolvedValue(null),
      findLatestPaymentMethodUpdateResultEvent: jest.fn().mockResolvedValue(null),
    };
    const webhookLogRepo = { findOne: jest.fn().mockResolvedValue(null) };
    const paymentMethodRepo = { findOne: jest.fn().mockResolvedValue(null) };
    const planRepo = { findOne: jest.fn().mockResolvedValue(null) };
    const userRepo = {};

    service = new BillingService(
      planRepo as any,
      subscriptionRepo as any,
      paymentMethodRepo as any,
      webhookLogRepo as any,
      userRepo as any,
      pricingService as any,
      billingEventService as any,
      {} as any, // billingReceiptService — unused by getMyBillingState
      {} as any, // billingIssuerConfigService — unused by getMyBillingState
      subscriptionAccessService as any,
      {} as any, // cardcomService — unused by getMyBillingState
      {} as any, // documentsService — unused by getMyBillingState
      {} as any, // cardcomWebhookService — unused by getMyBillingState
    );
  });

  it('direct (non-delegated) access: resolveModulesAccess called with isDelegatedAccess=false', async () => {
    await service.getMyBillingState('client-1');
    expect(subscriptionAccessService.resolveModulesAccess).toHaveBeenCalledWith(
      expect.objectContaining({ firebaseId: 'client-1' }),
      null,
      false,
    );
  });

  it('explicit isDelegatedAccess=false behaves identically to the default', async () => {
    await service.getMyBillingState('client-1', false);
    expect(subscriptionAccessService.resolveModulesAccess).toHaveBeenCalledWith(
      expect.objectContaining({ firebaseId: 'client-1' }),
      null,
      false,
    );
  });

  it('delegated access: resolveModulesAccess called with isDelegatedAccess=true', async () => {
    await service.getMyBillingState('client-1', true);
    expect(subscriptionAccessService.resolveModulesAccess).toHaveBeenCalledWith(
      expect.objectContaining({ firebaseId: 'client-1' }),
      null,
      true,
    );
  });

  it('the response access.modulesAccess reflects whatever resolveModulesAccess returned', async () => {
    subscriptionAccessService.resolveModulesAccess.mockReturnValue(['EXPENSES', 'ACCOUNTANT']);
    const result = await service.getMyBillingState('client-1', true);
    expect(result.access.modulesAccess).toEqual(['EXPENSES', 'ACCOUNTANT']);
  });

  it('no subscription row (SUBSCRIPTION_MISSING), non-delegated: short-circuits before resolveModulesAccess with no module access', async () => {
    subscriptionRepo.findOne.mockResolvedValue(null);
    const result = await service.getMyBillingState('client-1', false);
    expect(result.hasSubscription).toBe(false);
    expect(result.access.modulesAccess).toEqual([]);
    expect(result.isDelegatedAccess).toBe(false);
    expect(subscriptionAccessService.resolveModulesAccess).not.toHaveBeenCalled();
  });

  it('no subscription row (SUBSCRIPTION_MISSING), delegated: still short-circuits before resolveModulesAccess, but grants every module directly', async () => {
    subscriptionRepo.findOne.mockResolvedValue(null);
    const result = await service.getMyBillingState('client-1', true);
    expect(result.hasSubscription).toBe(false);
    expect([...result.access.modulesAccess].sort()).toEqual(Object.values(ModuleName).sort());
    expect(result.isDelegatedAccess).toBe(true);
    expect(subscriptionAccessService.resolveModulesAccess).not.toHaveBeenCalled();
  });

  it('normal (subscription exists) response surfaces isDelegatedAccess passed through', async () => {
    const directResult = await service.getMyBillingState('client-1', false);
    expect(directResult.isDelegatedAccess).toBe(false);

    const delegatedResult = await service.getMyBillingState('client-1', true);
    expect(delegatedResult.isDelegatedAccess).toBe(true);
  });
});

/**
 * Unit tests: BillingService.getPlans — exclusivity for non-public assigned plans.
 *
 * Confirms a user whose Subscription.planId points at a non-public plan
 * (e.g. referral-basic) sees ONLY that plan in GET /billing/plans — the
 * general public catalog is never fetched, so they can't accidentally check
 * out on a full-price public plan. A normal public-plan (or no-plan) user's
 * result is completely unaffected.
 */
describe('BillingService.getPlans — exclusivity for non-public assigned plans', () => {
  let service: BillingService;
  let planRepo: { find: jest.Mock; findOne: jest.Mock };
  let subscriptionRepo: { findOne: jest.Mock };
  let pricingService: { resolveUserBillingBusinessType: jest.Mock; resolveEffectivePlanPrice: jest.Mock };

  const PUBLIC_PLANS = [
    { id: 1, slug: 'consumer-basic', displayOrder: 0, isPublic: true },
    { id: 2, slug: 'consumer-plus', displayOrder: 1, isPublic: true },
  ];
  const REFERRAL_PLAN = { id: 99, slug: 'referral-basic', displayOrder: 100, isPublic: false, isActive: true };
  const PLANS_BY_ID: Record<number, any> = {
    1: PUBLIC_PLANS[0],
    2: PUBLIC_PLANS[1],
    99: REFERRAL_PLAN,
  };

  beforeEach(() => {
    planRepo = {
      find: jest.fn().mockResolvedValue(PUBLIC_PLANS.map(p => ({ ...p }))),
      findOne: jest.fn().mockImplementation(({ where }: { where: { id: number } }) =>
        Promise.resolve(PLANS_BY_ID[where.id] ? { ...PLANS_BY_ID[where.id] } : null),
      ),
    };
    subscriptionRepo = { findOne: jest.fn().mockResolvedValue(null) };
    pricingService = {
      resolveUserBillingBusinessType: jest.fn().mockResolvedValue('EXEMPT'),
      resolveEffectivePlanPrice: jest.fn().mockReturnValue(0),
    };

    service = new BillingService(
      planRepo as any,
      subscriptionRepo as any,
      {} as any, // paymentMethodRepo — unused by getPlans
      {} as any, // webhookLogRepo — unused by getPlans
      {} as any, // userRepo — unused by getPlans
      pricingService as any,
      {} as any, // billingEventService — unused by getPlans
      {} as any, // billingReceiptService — unused by getPlans
      {} as any, // billingIssuerConfigService — unused by getPlans
      {} as any, // subscriptionAccessService — unused by getPlans
      {} as any, // cardcomService — unused by getPlans
      {} as any, // documentsService — unused by getPlans
      {} as any, // cardcomWebhookService — unused by getPlans
    );
  });

  it('user with no subscription row sees the public catalog; never looks up a current plan', async () => {
    const result = await service.getPlans('client-1');
    expect(result.map(p => p.slug)).toEqual(['consumer-basic', 'consumer-plus']);
    expect(planRepo.findOne).not.toHaveBeenCalled();
  });

  it('user whose plan is already public sees the public catalog', async () => {
    subscriptionRepo.findOne.mockResolvedValue({ planId: 1 }); // consumer-basic, already public
    const result = await service.getPlans('client-1');
    expect(result.map(p => p.slug)).toEqual(['consumer-basic', 'consumer-plus']);
    expect(planRepo.findOne).toHaveBeenCalledWith({ where: { id: 1, isActive: true } });
  });

  it('referral-track user (planId points at a non-public plan) sees ONLY that plan — public catalog never fetched', async () => {
    subscriptionRepo.findOne.mockResolvedValue({ planId: 99 }); // referral-basic, non-public
    const result = await service.getPlans('client-1');
    expect(result.map(p => p.slug)).toEqual(['referral-basic']);
    expect(planRepo.findOne).toHaveBeenCalledWith({ where: { id: 99, isActive: true } });
    expect(planRepo.find).not.toHaveBeenCalled();
  });

  it('referral-track user whose plan no longer exists/is inactive falls back to the public catalog', async () => {
    subscriptionRepo.findOne.mockResolvedValue({ planId: 42 }); // not found -> findOne resolves null
    const result = await service.getPlans('client-1');
    expect(result.map(p => p.slug)).toEqual(['consumer-basic', 'consumer-plus']);
    expect(planRepo.find).toHaveBeenCalled();
  });
});

/**
 * Unit tests: BillingService.autoUpgradeReferralOpenBankingIfEligible —
 * automatic referral-basic -> referral-open-banking upgrade on Feezback
 * open-banking consent completion (see FeezbackService.refreshUserSources).
 */
describe('BillingService.autoUpgradeReferralOpenBankingIfEligible', () => {
  let service: BillingService;
  let planRepo: { findOne: jest.Mock };
  let subscriptionRepo: { findOne: jest.Mock; save: jest.Mock };

  const TARGET_PLAN = { id: 99, slug: 'referral-open-banking', isActive: true };

  beforeEach(() => {
    planRepo = { findOne: jest.fn() };
    subscriptionRepo = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation(async (s) => s),
    };

    service = new BillingService(
      planRepo as any,
      subscriptionRepo as any,
      {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
    );
  });

  it('no subscription row at all: no-op, no writes', async () => {
    subscriptionRepo.findOne.mockResolvedValue(null);
    const result = await service.autoUpgradeReferralOpenBankingIfEligible('client-1');
    expect(result).toBe(false);
    expect(subscriptionRepo.save).not.toHaveBeenCalled();
  });

  it('subscription has no planId at all (never assigned a plan): no-op', async () => {
    subscriptionRepo.findOne.mockResolvedValue({ firebaseId: 'client-1', planId: null });
    const result = await service.autoUpgradeReferralOpenBankingIfEligible('client-1');
    expect(result).toBe(false);
    expect(subscriptionRepo.save).not.toHaveBeenCalled();
  });

  it('non-referral user (public plan) is completely untouched', async () => {
    subscriptionRepo.findOne.mockResolvedValue({ firebaseId: 'client-1', planId: 1 });
    planRepo.findOne.mockResolvedValue({ id: 1, slug: 'consumer-plus' });
    const result = await service.autoUpgradeReferralOpenBankingIfEligible('client-1');
    expect(result).toBe(false);
    expect(subscriptionRepo.save).not.toHaveBeenCalled();
  });

  it('already on referral-open-banking: idempotent no-op, not a duplicate upgrade', async () => {
    subscriptionRepo.findOne.mockResolvedValue({ firebaseId: 'client-1', planId: 99 });
    planRepo.findOne.mockResolvedValue({ id: 99, slug: 'referral-open-banking' });
    const result = await service.autoUpgradeReferralOpenBankingIfEligible('client-1');
    expect(result).toBe(false);
    expect(subscriptionRepo.save).not.toHaveBeenCalled();
  });

  it('on referral-basic: upgrades to referral-open-banking, planId swap only (no status/charge fields touched)', async () => {
    const subscription = { firebaseId: 'client-1', planId: 2, status: 'TRIAL' };
    subscriptionRepo.findOne.mockResolvedValue(subscription);
    planRepo.findOne
      .mockResolvedValueOnce({ id: 2, slug: 'referral-basic' }) // current plan lookup
      .mockResolvedValueOnce(TARGET_PLAN); // target plan lookup
    const result = await service.autoUpgradeReferralOpenBankingIfEligible('client-1');
    expect(result).toBe(true);
    expect(subscriptionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ planId: 99, status: 'TRIAL' }), // status untouched — never forced to ACTIVE
    );
  });

  it('on referral-basic but target plan missing/inactive: no-op, does not throw', async () => {
    subscriptionRepo.findOne.mockResolvedValue({ firebaseId: 'client-1', planId: 2 });
    planRepo.findOne
      .mockResolvedValueOnce({ id: 2, slug: 'referral-basic' })
      .mockResolvedValueOnce(null); // referral-open-banking not found
    const result = await service.autoUpgradeReferralOpenBankingIfEligible('client-1');
    expect(result).toBe(false);
    expect(subscriptionRepo.save).not.toHaveBeenCalled();
  });
});
