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
 * Unit tests: BillingService.getPlans — exclusivity + live referral-plan resolution.
 *
 * Confirms a user whose Subscription.planId points at a non-public plan
 * (e.g. referral-basic) sees ONLY a referral plan in GET /billing/plans — the
 * general public catalog is never fetched, so they can't accidentally check
 * out on a full-price public plan. WHICH referral plan is resolved live from
 * User.hasOpenBanking (resolveReferralEffectivePlan), never from whichever
 * referral plan happens to be stored — the stored planId can lag reality if
 * the consent-webhook auto-upgrade hasn't run yet or failed. A normal
 * public-plan (or no-plan) user's result is completely unaffected.
 */
describe('BillingService.getPlans — exclusivity for non-public assigned plans', () => {
  let service: BillingService;
  let planRepo: { find: jest.Mock; findOne: jest.Mock };
  let subscriptionRepo: { findOne: jest.Mock };
  let userRepo: { findOne: jest.Mock };
  let pricingService: { resolveUserBillingBusinessType: jest.Mock; resolveEffectivePlanPrice: jest.Mock };

  const PUBLIC_PLANS = [
    { id: 1, slug: 'consumer-basic', displayOrder: 0, isPublic: true },
    { id: 2, slug: 'consumer-plus', displayOrder: 1, isPublic: true },
  ];
  const REFERRAL_BASIC = { id: 99, slug: 'referral-basic', displayOrder: 100, isPublic: false, isActive: true };
  const REFERRAL_OPEN_BANKING = { id: 100, slug: 'referral-open-banking', displayOrder: 101, isPublic: false, isActive: true };
  const ALL_PLANS = [...PUBLIC_PLANS, REFERRAL_BASIC, REFERRAL_OPEN_BANKING];

  beforeEach(() => {
    planRepo = {
      find: jest.fn().mockResolvedValue(PUBLIC_PLANS.map(p => ({ ...p }))),
      findOne: jest.fn().mockImplementation(({ where }: { where: { id?: number; slug?: string } }) => {
        const match = where.id != null
          ? ALL_PLANS.find(p => p.id === where.id)
          : ALL_PLANS.find(p => p.slug === where.slug);
        return Promise.resolve(match ? { ...match } : null);
      }),
    };
    subscriptionRepo = { findOne: jest.fn().mockResolvedValue(null) };
    userRepo = { findOne: jest.fn().mockResolvedValue({ hasOpenBanking: false }) };
    pricingService = {
      resolveUserBillingBusinessType: jest.fn().mockResolvedValue('EXEMPT'),
      resolveEffectivePlanPrice: jest.fn().mockReturnValue(0),
    };

    service = new BillingService(
      planRepo as any,
      subscriptionRepo as any,
      {} as any, // paymentMethodRepo — unused by getPlans
      {} as any, // webhookLogRepo — unused by getPlans
      userRepo as any,
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
    expect(userRepo.findOne).not.toHaveBeenCalled();
  });

  it('user whose plan is already public sees the public catalog', async () => {
    subscriptionRepo.findOne.mockResolvedValue({ planId: 1 }); // consumer-basic, already public
    const result = await service.getPlans('client-1');
    expect(result.map(p => p.slug)).toEqual(['consumer-basic', 'consumer-plus']);
    expect(planRepo.findOne).toHaveBeenCalledWith({ where: { id: 1, isActive: true } });
    expect(userRepo.findOne).not.toHaveBeenCalled();
  });

  it('referral-track user WITHOUT open banking sees referral-basic, resolved live — public catalog never fetched', async () => {
    subscriptionRepo.findOne.mockResolvedValue({ planId: 99 }); // stored: referral-basic
    userRepo.findOne.mockResolvedValue({ hasOpenBanking: false });
    const result = await service.getPlans('client-1');
    expect(result.map(p => p.slug)).toEqual(['referral-basic']);
    expect(planRepo.findOne).toHaveBeenCalledWith({ where: { slug: 'referral-basic', isActive: true } });
    expect(planRepo.find).not.toHaveBeenCalled();
  });

  it('referral-track user WITH open banking sees referral-open-banking, even though the STORED planId is still referral-basic', async () => {
    subscriptionRepo.findOne.mockResolvedValue({ planId: 99 }); // stored: referral-basic (stale/lagging)
    userRepo.findOne.mockResolvedValue({ hasOpenBanking: true });
    const result = await service.getPlans('client-1');
    expect(result.map(p => p.slug)).toEqual(['referral-open-banking']);
    expect(planRepo.findOne).toHaveBeenCalledWith({ where: { slug: 'referral-open-banking', isActive: true } });
  });

  it('referral-track user whose stored plan no longer exists/is inactive falls back to the public catalog', async () => {
    subscriptionRepo.findOne.mockResolvedValue({ planId: 42 }); // not found -> findOne resolves null
    const result = await service.getPlans('client-1');
    expect(result.map(p => p.slug)).toEqual(['consumer-basic', 'consumer-plus']);
    expect(planRepo.find).toHaveBeenCalled();
    expect(userRepo.findOne).not.toHaveBeenCalled(); // never reached the referral branch
  });

  it('referral-track user whose live-resolved target plan is missing/inactive falls back to the stored plan', async () => {
    subscriptionRepo.findOne.mockResolvedValue({ planId: 99 }); // stored: referral-basic
    userRepo.findOne.mockResolvedValue({ hasOpenBanking: true }); // wants referral-open-banking
    planRepo.findOne.mockImplementation(({ where }: { where: { id?: number; slug?: string } }) => {
      if (where.id === 99) return Promise.resolve({ ...REFERRAL_BASIC });
      return Promise.resolve(null); // referral-open-banking deactivated/missing
    });
    const result = await service.getPlans('client-1');
    expect(result.map(p => p.slug)).toEqual(['referral-basic']);
  });
});

/**
 * Unit tests: BillingService.createCheckout — referral plan live resolution.
 *
 * Mirrors getPlans(): when the client requests checkout on a referral plan,
 * the actual plan charged/persisted is resolved live from
 * User.hasOpenBanking via resolveReferralEffectivePlan, not trusted blindly
 * from dto.planId — closing the race where the browser rendered a
 * stale/cached plan option. Public-plan checkouts are completely unaffected.
 */
describe('BillingService.createCheckout — referral plan live resolution', () => {
  let service: BillingService;
  let planRepo: { findOne: jest.Mock };
  let subscriptionRepo: { findOne: jest.Mock; save: jest.Mock };
  let userRepo: { findOne: jest.Mock };
  let pricingService: { calculateCheckoutPrice: jest.Mock };
  let billingEventService: { getUnresolvedReceiptFailure: jest.Mock; logEvent: jest.Mock };
  let cardcomService: { createLowProfileCheckout: jest.Mock };

  const SUBSCRIPTION = { id: 500, firebaseId: 'client-1', planId: 99 };
  const PUBLIC_PLAN = { id: 1, slug: 'consumer-basic', name: 'בקטנה', isPublic: true, isActive: true };
  const REFERRAL_BASIC = { id: 99, slug: 'referral-basic', name: 'הפניית רואה חשבון — בסיסי', isPublic: false, isActive: true };
  const REFERRAL_OPEN_BANKING = { id: 100, slug: 'referral-open-banking', name: 'הפניית רואה חשבון — כולל חיבור בנקאי פתוח', isPublic: false, isActive: true };
  const ALL_PLANS = [PUBLIC_PLAN, REFERRAL_BASIC, REFERRAL_OPEN_BANKING];
  const PRICING = { finalAmountAgorot: 5900, currency: 'ILS', amountBeforeVatAgorot: 5000, vatAmountAgorot: 900, billingBusinessType: 'EXEMPT', explanation: 'x' };

  beforeEach(() => {
    planRepo = {
      findOne: jest.fn().mockImplementation(({ where }: { where: { id?: number; slug?: string } }) => {
        const match = where.id != null
          ? ALL_PLANS.find(p => p.id === where.id)
          : ALL_PLANS.find(p => p.slug === where.slug);
        return Promise.resolve(match ? { ...match } : null);
      }),
    };
    subscriptionRepo = {
      findOne: jest.fn().mockResolvedValue({ ...SUBSCRIPTION }),
      save: jest.fn().mockImplementation(s => Promise.resolve(s)),
    };
    userRepo = { findOne: jest.fn().mockResolvedValue({ hasOpenBanking: false, email: 'a@b.com', fName: 'A', lName: 'B', phone: '050' }) };
    pricingService = { calculateCheckoutPrice: jest.fn().mockResolvedValue({ ...PRICING }) };
    billingEventService = {
      getUnresolvedReceiptFailure: jest.fn().mockResolvedValue(null),
      logEvent: jest.fn().mockResolvedValue(undefined),
    };
    cardcomService = {
      createLowProfileCheckout: jest.fn().mockResolvedValue({
        lowProfileId: 'lp-1', paymentUrl: 'https://cardcom.example/pay', rawResponse: {},
      }),
    };

    service = new BillingService(
      planRepo as any,
      subscriptionRepo as any,
      {} as any, // paymentMethodRepo — unused by createCheckout
      {} as any, // webhookLogRepo — unused by createCheckout
      userRepo as any,
      pricingService as any,
      billingEventService as any,
      {} as any, // billingReceiptService — unused by createCheckout
      {} as any, // billingIssuerConfigService — unused by createCheckout
      {} as any, // subscriptionAccessService — unused by createCheckout
      cardcomService as any,
      {} as any, // documentsService — unused by createCheckout
      {} as any, // cardcomWebhookService — unused by createCheckout
    );
  });

  it('referral checkout requested with a stale plan (basic) while the user already has open banking: overrides to open-banking and persists planId', async () => {
    userRepo.findOne.mockResolvedValue({ hasOpenBanking: true, email: 'a@b.com', fName: 'A', lName: 'B', phone: '050' });

    await service.createCheckout('client-1', { planId: 99 } as any);

    expect(pricingService.calculateCheckoutPrice).toHaveBeenCalledWith('client-1', 100);
    expect(subscriptionRepo.save).toHaveBeenCalledWith(expect.objectContaining({ planId: 100 }));
    expect(cardcomService.createLowProfileCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ planName: 'הפניית רואה חשבון — כולל חיבור בנקאי פתוח' }),
    );
    const returnValue = JSON.parse(cardcomService.createLowProfileCheckout.mock.calls[0][0].returnValue);
    expect(returnValue.planId).toBe(100);
  });

  it('referral checkout where the live resolution matches what was already stored: no redundant save', async () => {
    userRepo.findOne.mockResolvedValue({ hasOpenBanking: false, email: 'a@b.com', fName: 'A', lName: 'B', phone: '050' });

    await service.createCheckout('client-1', { planId: 99 } as any); // stored planId is already 99 (referral-basic)

    expect(subscriptionRepo.save).not.toHaveBeenCalled();
    expect(pricingService.calculateCheckoutPrice).toHaveBeenCalledWith('client-1', 99);
  });

  it('public plan checkout: no live resolution, no planId mutation — unaffected by the referral logic', async () => {
    await service.createCheckout('client-1', { planId: 1 } as any); // consumer-basic, public

    expect(subscriptionRepo.save).not.toHaveBeenCalled();
    expect(pricingService.calculateCheckoutPrice).toHaveBeenCalledWith('client-1', 1);
    // userRepo.findOne is still called once, for customer info — but never for a slug-based referral lookup
    expect(planRepo.findOne).not.toHaveBeenCalledWith({ where: { slug: expect.anything(), isActive: true } });
  });

  it('referral checkout whose live-resolved target plan is missing/inactive: falls back to the originally requested plan, does not throw', async () => {
    userRepo.findOne.mockResolvedValue({ hasOpenBanking: true, email: 'a@b.com', fName: 'A', lName: 'B', phone: '050' });
    planRepo.findOne.mockImplementation(({ where }: { where: { id?: number; slug?: string } }) => {
      if (where.id === 99) return Promise.resolve({ ...REFERRAL_BASIC });
      return Promise.resolve(null); // referral-open-banking deactivated/missing
    });

    await expect(service.createCheckout('client-1', { planId: 99 } as any)).resolves.toBeDefined();

    expect(pricingService.calculateCheckoutPrice).toHaveBeenCalledWith('client-1', 99);
    expect(subscriptionRepo.save).not.toHaveBeenCalled();
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
