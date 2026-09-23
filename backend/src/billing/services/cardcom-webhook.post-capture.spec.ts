import { CardcomWebhookService } from './cardcom-webhook.service';
import { BillingEventType, SubscriptionStatus } from '../enums/billing.enums';

/**
 * KT-038 Task 3: hosted-checkout (PAST_DUE recovery) webhook coverage for an
 * attempt that is already CAPTURED. A replayed webhook resumes only the
 * post-capture phase from persisted state — it never verifies against or
 * charges the provider again.
 */
describe('CardcomWebhookService — post-capture completion of a CAPTURED hosted attempt', () => {
  const log = { id: 7, idempotencyKey: 'idem-7' } as any;
  const returnValue = (billingAttemptId: number | null = 44) =>
    JSON.stringify({
      intent: 'CHECKOUT',
      firebaseId: 'owner',
      planId: 2,
      subscriptionId: 9,
      billingAttemptId,
    });

  const capturedAttempt = {
    id: 44,
    planId: 2,
    amountAgorot: 11700,
    amountBeforeVatAgorot: 10000,
    vatAmountAgorot: 1700,
    currency: 'ILS',
    cardcomTransactionId: 'tx-original',
  };
  const ACTIVE_SUB = {
    id: 9,
    firebaseId: 'owner',
    status: SubscriptionStatus.ACTIVE,
    currentPeriodStart: new Date('2026-09-01'),
    currentPeriodEnd: new Date('2026-10-01'),
  };

  function make(
    options: {
      duplicate?: boolean;
      attemptId?: number | null;
      subscription?: unknown;
    } = {},
  ) {
    const { duplicate = true, attemptId = 44 } = options;
    const cardcom = { getLowProfileResult: jest.fn() };
    const lifecycle = {
      applyHostedWebhookOutcome: jest.fn(),
      resumeCapturedAttempt: jest
        .fn()
        .mockResolvedValue({ status: 'COMPLETED', attempt: capturedAttempt }),
    };
    const subscriptionRepo = {
      findOne: jest
        .fn()
        .mockResolvedValue(
          options.subscription === undefined
            ? { ...ACTIVE_SUB }
            : options.subscription,
        ),
    };
    const planRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 2, name: 'Plan' }),
    };
    const billingEventService = {
      logEvent: jest.fn().mockResolvedValue({ id: 1 }),
    };
    const billingReceiptService = {
      ensureReceiptForCapturedAttempt: jest
        .fn()
        .mockResolvedValue({ receiptDocId: 99 }),
    };
    const issuerService = {
      getKeepintaxIssuer: jest
        .fn()
        .mockResolvedValue({ issuerName: 'Keepintax' }),
    };
    const service = new CardcomWebhookService(
      {} as any,
      subscriptionRepo as any,
      planRepo as any,
      {} as any,
      {} as any,
      cardcom as any,
      billingEventService as any,
      billingReceiptService as any,
      issuerService as any,
      {} as any,
      lifecycle as any,
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
      subscriptionRepo,
      billingEventService,
      billingReceiptService,
    };
  }

  it('a replayed webhook resumes ONLY post-capture completion — no verification, no activation, no charge', async () => {
    const { service, cardcom, lifecycle } = make();

    await service.handleWebhook({ LowProfileId: 'lp-1' });

    expect(lifecycle.resumeCapturedAttempt).toHaveBeenCalledTimes(1);
    expect(lifecycle.resumeCapturedAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: { actorFirebaseId: 'owner', subjectFirebaseId: 'owner' },
        attemptId: 44,
      }),
    );
    expect(cardcom.getLowProfileResult).not.toHaveBeenCalled();
    expect(lifecycle.applyHostedWebhookOutcome).not.toHaveBeenCalled();
    expect((service as any).processVerifiedSuccess).not.toHaveBeenCalled();
  });

  it('feeds the receipt step the attempt snapshot, the ORIGINAL transaction id and the activated period', async () => {
    const { service, lifecycle, billingReceiptService } = make();
    lifecycle.resumeCapturedAttempt.mockImplementation(async ({ receipt }) => {
      await receipt.createReceipt(capturedAttempt, {
        kind: 'CAPTURED',
        cardcomTransactionId: 'tx-original',
      });
      return { status: 'COMPLETED', attempt: capturedAttempt };
    });

    await service.handleWebhook({ LowProfileId: 'lp-1' });

    expect(
      billingReceiptService.ensureReceiptForCapturedAttempt,
    ).toHaveBeenCalledTimes(1);
    expect(
      billingReceiptService.ensureReceiptForCapturedAttempt,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: BillingEventType.PAYMENT_SUCCESS,
        attempt: expect.objectContaining({
          id: 44,
          amountAgorot: 11700,
          cardcomTransactionId: 'tx-original',
        }),
        firebaseId: 'owner',
        subscriptionId: 9,
        planName: 'Plan',
        periodStart: ACTIVE_SUB.currentPeriodStart,
        periodEnd: ACTIVE_SUB.currentPeriodEnd,
      }),
    );
  });

  it('is a no-op for a duplicate webhook that carries no canonical attempt (legacy first-time checkout)', async () => {
    const { service, lifecycle } = make({ attemptId: null });

    await service.handleWebhook({ LowProfileId: 'lp-1' });

    expect(lifecycle.resumeCapturedAttempt).not.toHaveBeenCalled();
  });

  it.each([
    [
      'still PAST_DUE (activation not done)',
      { ...ACTIVE_SUB, status: SubscriptionStatus.PAST_DUE },
    ],
    ['owned by someone else', { ...ACTIVE_SUB, firebaseId: 'someone-else' }],
    ['missing', null],
  ])(
    'does not finalize while the subscription is %s',
    async (_label, subscription) => {
      const { service, lifecycle } = make({ subscription });

      await service.handleWebhook({ LowProfileId: 'lp-1' });

      expect(lifecycle.resumeCapturedAttempt).not.toHaveBeenCalled();
    },
  );

  it('reports a failed post-capture step with a sanitized event and leaves recovery to the next replay', async () => {
    const { service, lifecycle, billingEventService } = make();
    lifecycle.resumeCapturedAttempt.mockResolvedValue({
      status: 'RECEIPT_PENDING',
      attempt: capturedAttempt,
      failureCategory: 'RECEIPT_STEP_FAILED',
    });

    await service.handleWebhook({ LowProfileId: 'lp-1' });

    expect(billingEventService.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: BillingEventType.RECEIPT_FAILED,
        billingAttemptId: 44,
        metadata: {
          attemptId: 44,
          cardcomDealNumber: 'tx-original',
          phase: 'POST_CAPTURE_RECOVERY',
          failureCategory: 'RECEIPT_STEP_FAILED',
        },
      }),
    );
    const metadata = JSON.stringify(billingEventService.logEvent.mock.calls);
    expect(metadata).not.toMatch(/token|ApiName|stack/i);
  });

  it('swallows an owner/state error from a replay so the webhook still answers normally', async () => {
    const { service, lifecycle } = make();
    lifecycle.resumeCapturedAttempt.mockRejectedValue(new Error('forbidden'));

    await expect(
      service.handleWebhook({ LowProfileId: 'lp-1' }),
    ).resolves.toBeUndefined();
  });

  describe('first delivery (activation phase already committed)', () => {
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
      service.completeCapturedHostedAttempt = jest
        .fn()
        .mockResolvedValue('COMPLETED');
      service.generateReceiptAfterPayment = jest
        .fn()
        .mockResolvedValue(undefined);
      return { ...made, service };
    }
    const verified = {
      ResponseCode: 0,
      LowProfileId: 'lp-1',
      TranzactionId: 123,
      TranzactionInfo: { ResponseCode: 0, TranzactionId: 123, Amount: 117 },
    };

    it('routes a canonical attempt through the shared post-capture path and logs the attempt-keyed success event', async () => {
      const { service, billingEventService } = makeFirst(44);

      await service.processVerifiedSuccess('owner', 2, 9, verified, log, 44);

      expect(service.completeCapturedHostedAttempt).toHaveBeenCalledWith({
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

    it('keeps a legacy checkout (no attempt) on the original receipt flow', async () => {
      const { service } = makeFirst(null);

      await service.processVerifiedSuccess('owner', 2, 9, verified, log, null);

      expect(service.completeCapturedHostedAttempt).not.toHaveBeenCalled();
      expect(service.generateReceiptAfterPayment).toHaveBeenCalledTimes(1);
    });

    it('a failed completion never rolls back activation or throws out of the webhook', async () => {
      const { service } = makeFirst(44);
      service.completeCapturedHostedAttempt.mockRejectedValue(
        new Error('db down'),
      );

      await expect(
        service.processVerifiedSuccess('owner', 2, 9, verified, log, 44),
      ).resolves.toBeUndefined();
    });
  });
});
