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

  it('no subscription row (SUBSCRIPTION_MISSING) short-circuits before resolveModulesAccess, delegated or not', async () => {
    subscriptionRepo.findOne.mockResolvedValue(null);
    const result = await service.getMyBillingState('client-1', true);
    expect(result.hasSubscription).toBe(false);
    expect(result.access.modulesAccess).toEqual([]);
    expect(subscriptionAccessService.resolveModulesAccess).not.toHaveBeenCalled();
  });
});
