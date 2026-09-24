import { CardcomWebhookService } from './cardcom-webhook.service';
import { BillingEventType, SubscriptionStatus } from '../enums/billing.enums';

/**
 * Hosted-checkout (PAST_DUE recovery) webhook for an attempt that is already
 * CAPTURED. The webhook only delegates post-capture completion to
 * BillingHostedCompletionService (activation, receipt, event link and
 * completion are covered by billing-hosted-completion.service.spec.ts): a
 * replayed webhook never verifies against or charges the provider again.
 */
describe('CardcomWebhookService — delegating post-capture completion of a CAPTURED hosted attempt', () => {
  const log = { id: 7, idempotencyKey: 'idem-7' } as any;
  const returnValue = (billingAttemptId: number | null = 44) =>
    JSON.stringify({
      intent: 'CHECKOUT',
      firebaseId: 'owner',
      planId: 2,
      subscriptionId: 9,
      billingAttemptId,
    });

  function make(
    options: {
      duplicate?: boolean;
      attemptId?: number | null;
      withHostedCompletion?: boolean;
    } = {},
  ) {
    const {
      duplicate = true,
      attemptId = 44,
      withHostedCompletion = true,
    } = options;
    const cardcom = { getLowProfileResult: jest.fn() };
    const lifecycle = { applyHostedWebhookOutcome: jest.fn() };
    const hostedCompletion = {
      completeCapturedHostedAttempt: jest.fn().mockResolvedValue('COMPLETED'),
    };
    const billingEventService = {
      logEvent: jest.fn().mockResolvedValue({ id: 1 }),
    };
    const service = new CardcomWebhookService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      cardcom as any,
      billingEventService as any,
      {} as any,
      {} as any,
      {} as any,
      lifecycle as any,
      (withHostedCompletion ? hostedCompletion : undefined) as any,
    );
    (service as any).saveWebhookLog = jest
      .fn()
      .mockResolvedValue(duplicate ? null : log);
    (service as any).markWebhookStatus = jest.fn();
    (service as any).extractLowProfileId = jest.fn().mockReturnValue('lp-1');
    (service as any).extractReturnValue = jest
      .fn()
      .mockReturnValue(returnValue(attemptId));
    (service as any).processVerifiedSuccess = jest.fn();
    return {
      service,
      cardcom,
      lifecycle,
      hostedCompletion,
      billingEventService,
    };
  }

  it('a replayed webhook resumes ONLY local post-capture completion — no verification, no activation by the webhook, no charge', async () => {
    const { service, cardcom, lifecycle, hostedCompletion } = make();

    await service.handleWebhook({ LowProfileId: 'lp-1' });

    expect(
      hostedCompletion.completeCapturedHostedAttempt,
    ).toHaveBeenCalledTimes(1);
    expect(hostedCompletion.completeCapturedHostedAttempt).toHaveBeenCalledWith(
      {
        firebaseId: 'owner',
        subscriptionId: 9,
        billingAttemptId: 44,
      },
    );
    expect(cardcom.getLowProfileResult).not.toHaveBeenCalled();
    expect(lifecycle.applyHostedWebhookOutcome).not.toHaveBeenCalled();
    expect((service as any).processVerifiedSuccess).not.toHaveBeenCalled();
  });

  it('is a no-op for a duplicate webhook that carries no canonical attempt (legacy first-time checkout)', async () => {
    const { service, hostedCompletion } = make({ attemptId: null });

    await service.handleWebhook({ LowProfileId: 'lp-1' });

    expect(
      hostedCompletion.completeCapturedHostedAttempt,
    ).not.toHaveBeenCalled();
  });

  it('swallows an owner/state error from a replay so the webhook still answers normally', async () => {
    const { service, hostedCompletion } = make();
    hostedCompletion.completeCapturedHostedAttempt.mockRejectedValue(
      new Error('forbidden'),
    );

    await expect(
      service.handleWebhook({ LowProfileId: 'lp-1' }),
    ).resolves.toBeUndefined();
  });

  it('is safe when the completion service is not wired', async () => {
    const { service } = make({ withHostedCompletion: false });

    await expect(
      service.handleWebhook({ LowProfileId: 'lp-1' }),
    ).resolves.toBeUndefined();
  });

  describe('first delivery (its own activation transaction already committed)', () => {
    function makeFirst(attemptId: number | null) {
      const made = make({ duplicate: false, attemptId });
      const service = made.service as any;
      // Real processVerifiedSuccess, over a fake transaction.
      service.processVerifiedSuccess =
        CardcomWebhookService.prototype['processVerifiedSuccess' as any];
      const manager = {
        findOne: jest.fn().mockResolvedValue({
          id: 9,
          firebaseId: 'owner',
          status: SubscriptionStatus.PAST_DUE,
          planId: 1,
          paymentMethodId: null,
        }),
        findOneOrFail: jest
          .fn()
          .mockResolvedValue({ name: 'Plan', slug: 'p', modules: [] }),
        update: jest.fn(),
      };
      const queryRunner = {
        connect: jest.fn(),
        startTransaction: jest.fn(),
        commitTransaction: jest.fn(),
        rollbackTransaction: jest.fn(),
        release: jest.fn(),
        manager,
      };
      service.dataSource = { createQueryRunner: () => queryRunner };
      service.generateReceiptAfterPayment = jest
        .fn()
        .mockResolvedValue(undefined);
      return { ...made, service, queryRunner };
    }
    const verified = {
      ResponseCode: 0,
      LowProfileId: 'lp-1',
      TranzactionId: 123,
      TranzactionInfo: { ResponseCode: 0, TranzactionId: 123, Amount: 117 },
    };

    it('routes a canonical attempt through the shared completion service and logs the attempt-keyed success event', async () => {
      const { service, billingEventService, hostedCompletion } = makeFirst(44);

      await service.processVerifiedSuccess('owner', 2, 9, verified, log, 44);

      expect(
        hostedCompletion.completeCapturedHostedAttempt,
      ).toHaveBeenCalledWith({
        firebaseId: 'owner',
        subscriptionId: 9,
        billingAttemptId: 44,
      });
      expect(service.generateReceiptAfterPayment).not.toHaveBeenCalled();
      expect(billingEventService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: BillingEventType.PAYMENT_SUCCESS,
          billingAttemptId: 44,
        }),
      );
    });

    it('a confirmed payment on a PAST_DUE subscription resets renewalAttempts in the same activation update', async () => {
      const { service, queryRunner } = makeFirst(44);
      queryRunner.manager.findOne.mockResolvedValue({
        id: 9,
        firebaseId: 'owner',
        status: SubscriptionStatus.PAST_DUE,
        planId: 1,
        paymentMethodId: null,
        renewalAttempts: 3,
      });

      await service.processVerifiedSuccess('owner', 2, 9, verified, log, 44);

      expect(queryRunner.manager.update).toHaveBeenCalledTimes(1);
      const values = queryRunner.manager.update.mock.calls[0][2];
      expect(values).toEqual(
        expect.objectContaining({
          status: SubscriptionStatus.ACTIVE,
          planId: 2,
          renewalAttempts: 0,
          gracePeriodEndsAt: null,
          canceledAt: null,
          endedAt: null,
        }),
      );
      expect(values.nextBillingDate).toEqual(values.currentPeriodEnd);
      expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    });

    it('does not touch renewalAttempts for a subscription that is not PAST_DUE', async () => {
      const { service, queryRunner } = makeFirst(44);
      queryRunner.manager.findOne.mockResolvedValue({
        id: 9,
        firebaseId: 'owner',
        status: SubscriptionStatus.CANCELED,
        planId: 1,
        paymentMethodId: null,
        renewalAttempts: 3,
      });

      await service.processVerifiedSuccess('owner', 2, 9, verified, log, 44);

      const values = queryRunner.manager.update.mock.calls[0][2];
      expect(values).not.toHaveProperty('renewalAttempts');
    });

    it('keeps a legacy checkout (no attempt) on the original receipt flow', async () => {
      const { service, hostedCompletion } = makeFirst(null);

      await service.processVerifiedSuccess('owner', 2, 9, verified, log, null);

      expect(
        hostedCompletion.completeCapturedHostedAttempt,
      ).not.toHaveBeenCalled();
      expect(service.generateReceiptAfterPayment).toHaveBeenCalledTimes(1);
    });

    it('a failed completion never rolls back activation or throws out of the webhook', async () => {
      const { service, hostedCompletion, queryRunner } = makeFirst(44);
      hostedCompletion.completeCapturedHostedAttempt.mockRejectedValue(
        new Error('db down'),
      );

      await expect(
        service.processVerifiedSuccess('owner', 2, 9, verified, log, 44),
      ).resolves.toBeUndefined();
      expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
      expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
    });
  });
});
