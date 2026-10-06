import { BillingController } from './billing.controller';
import { BillingService } from './services/billing.service';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { FirebaseAuthGuard } from 'src/guards/firebase-auth.guard';

/**
 * Unit tests: BillingController's owner-mutation actor context (KT-038
 * Task 2). Proves the controller boundary never lets a rewritten
 * request.user.firebaseId (set by FirebaseAuthGuard during accountant
 * delegation or admin impersonation) stand in for the real caller — it
 * must always read request.user.actorFirebaseId separately and forward the
 * delegation/impersonation flags, so BillingService.assertBillingOwnerMutation
 * can actually catch the bypass.
 */
describe('BillingController — owner-mutation actor context', () => {
  let controller: BillingController;
  let billingService: {
    createCheckout: jest.Mock;
    changePaymentMethod: jest.Mock;
    upgradeToReferralOpenBankingPlan: jest.Mock;
  };

  beforeEach(() => {
    billingService = {
      createCheckout: jest.fn().mockResolvedValue({ paymentUrl: 'url' }),
      changePaymentMethod: jest
        .fn()
        .mockResolvedValue({ paymentUrl: 'url', lowProfileId: 'lp' }),
      upgradeToReferralOpenBankingPlan: jest
        .fn()
        .mockResolvedValue({ planId: 1 }),
    };
    controller = new BillingController(
      billingService as unknown as BillingService,
    );
  });

  it.each(['previewCheckout', 'createCheckout', 'changePaymentMethod', 'getChangePaymentMethodStatus'])(
    'keeps %s authenticated but free of subscription module gates for blocked owners', method => {
      expect(Reflect.getMetadata(GUARDS_METADATA, BillingController)).toBeUndefined();
      expect(Reflect.getMetadata(GUARDS_METADATA, BillingController.prototype[method])).toEqual([FirebaseAuthGuard]);
    });

  describe('createCheckout', () => {
    it('passes the real actor id, subject id, and delegation flag separately — never collapses them to the rewritten id', async () => {
      // FirebaseAuthGuard rewrote firebaseId to the client's id for delegated
      // access; actorFirebaseId is the accountant's own, untouched id.
      const request = {
        user: { firebaseId: 'client-1', actorFirebaseId: 'accountant-1' },
        isDelegatedAccess: true,
        isAdminImpersonation: false,
      } as any;

      await controller.createCheckout(request, { planId: 1 } as any);

      expect(billingService.createCheckout).toHaveBeenCalledWith(
        {
          actorFirebaseId: 'accountant-1',
          subjectFirebaseId: 'client-1',
          isDelegatedAccess: true,
          isAdminImpersonation: false,
        },
        { planId: 1 },
      );
    });

    it('passes isAdminImpersonation through for an admin acting on a client', async () => {
      const request = {
        user: { firebaseId: 'client-1', actorFirebaseId: 'admin-1' },
        isDelegatedAccess: false,
        isAdminImpersonation: true,
      } as any;

      await controller.createCheckout(request, { planId: 1 } as any);

      expect(billingService.createCheckout).toHaveBeenCalledWith(
        expect.objectContaining({
          actorFirebaseId: 'admin-1',
          subjectFirebaseId: 'client-1',
          isAdminImpersonation: true,
        }),
        { planId: 1 },
      );
    });

    it('a genuine owner (no rewrite) has actorFirebaseId === subjectFirebaseId and no impersonation flags', async () => {
      const request = {
        user: { firebaseId: 'client-1', actorFirebaseId: 'client-1' },
      } as any;

      await controller.createCheckout(request, { planId: 1 } as any);

      expect(billingService.createCheckout).toHaveBeenCalledWith(
        {
          actorFirebaseId: 'client-1',
          subjectFirebaseId: 'client-1',
          isDelegatedAccess: false,
          isAdminImpersonation: false,
        },
        { planId: 1 },
      );
    });
  });

  describe('changePaymentMethod', () => {
    it('forwards the real actor context, not just the rewritten firebaseId', async () => {
      const request = {
        user: { firebaseId: 'client-1', actorFirebaseId: 'accountant-1' },
        isDelegatedAccess: true,
      } as any;

      await controller.changePaymentMethod(request);

      expect(billingService.changePaymentMethod).toHaveBeenCalledWith({
        actorFirebaseId: 'accountant-1',
        subjectFirebaseId: 'client-1',
        isDelegatedAccess: true,
        isAdminImpersonation: false,
      });
    });
  });

  describe('upgradeToOpenBanking', () => {
    it('forwards the real actor context', async () => {
      const request = {
        user: { firebaseId: 'client-1', actorFirebaseId: 'admin-1' },
        isAdminImpersonation: true,
      } as any;

      await controller.upgradeToOpenBanking(request);

      expect(
        billingService.upgradeToReferralOpenBankingPlan,
      ).toHaveBeenCalledWith({
        actorFirebaseId: 'admin-1',
        subjectFirebaseId: 'client-1',
        isDelegatedAccess: false,
        isAdminImpersonation: true,
      });
    });
  });
});
