import { CardcomWebhookService } from './cardcom-webhook.service';

describe('CardcomWebhookService hosted recovery routing', () => {
  const log = { id: 7, idempotencyKey: 'idem-7' } as any;
  const makeService = (
    result: Record<string, any> | Error = {
      ResponseCode: 0,
      LowProfileId: 'lp-1',
      ReturnValue: JSON.stringify({
        intent: 'CHECKOUT',
        firebaseId: 'owner',
        planId: 2,
        subscriptionId: 9,
        billingAttemptId: 44,
      }),
      TranzactionInfo: { ResponseCode: 0, TranzactionId: 123 },
    },
  ) => {
    const cardcom = {
      getLowProfileResult: jest
        .fn()
        .mockRejectedValue(result instanceof Error ? result : undefined),
    };
    if (!(result instanceof Error))
      cardcom.getLowProfileResult.mockResolvedValue(result);
    const lifecycle = {
      applyHostedWebhookOutcome: jest.fn().mockResolvedValue({}),
      finalizeAfterReceipt: jest.fn(),
    };
    const service = new CardcomWebhookService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      cardcom as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      lifecycle as any,
    );
    (service as any).saveWebhookLog = jest.fn().mockResolvedValue(log);
    (service as any).markWebhookStatus = jest.fn();
    (service as any).extractLowProfileId = jest.fn().mockReturnValue('lp-1');
    (service as any).extractReturnValue = jest.fn().mockReturnValue(
      JSON.stringify({
        intent: 'CHECKOUT',
        firebaseId: 'owner',
        planId: 2,
        subscriptionId: 9,
        billingAttemptId: 44,
      }),
    );
    (service as any).processVerifiedSuccess = jest.fn();
    (service as any).processVerifiedFailure = jest.fn();
    return { service, cardcom, lifecycle };
  };

  it('applies CAPTURED to a verified hosted recovery attempt', async () => {
    const { service, lifecycle } = makeService();
    await service.handleWebhook({
      LowProfileId: 'lp-1',
      ReturnValue: 'ignored',
    });
    expect(lifecycle.applyHostedWebhookOutcome).toHaveBeenCalledWith(
      { actorFirebaseId: 'owner', subjectFirebaseId: 'owner' },
      44,
      expect.objectContaining({
        kind: 'CAPTURED',
        cardcomTransactionId: '123',
      }),
      'webhook-7',
    );
  });

  it('applies DECLINED and never finalizes on a failed verified result', async () => {
    const { service, lifecycle } = makeService({
      ResponseCode: 12,
      LowProfileId: 'lp-1',
      ReturnValue: JSON.stringify({
        intent: 'CHECKOUT',
        firebaseId: 'owner',
        planId: 2,
        subscriptionId: 9,
        billingAttemptId: 44,
      }),
    });
    await service.handleWebhook({ LowProfileId: 'lp-1' });
    expect(lifecycle.applyHostedWebhookOutcome).toHaveBeenCalledWith(
      expect.anything(),
      44,
      expect.objectContaining({ kind: 'DECLINED' }),
      'webhook-7',
    );
    expect(lifecycle.finalizeAfterReceipt).not.toHaveBeenCalled();
  });

  it('maps GetLpResult transport failure to UNKNOWN without replay', async () => {
    const { service, lifecycle, cardcom } = makeService(new Error('timeout'));
    await service.handleWebhook({ LowProfileId: 'lp-1' });
    expect(cardcom.getLowProfileResult).toHaveBeenCalledTimes(1);
    expect(lifecycle.applyHostedWebhookOutcome).toHaveBeenCalledWith(
      expect.anything(),
      44,
      expect.objectContaining({ kind: 'UNKNOWN' }),
      'webhook-7',
    );
    expect(cardcom.getLowProfileResult).toHaveBeenCalledTimes(1);
  });

  it('stops duplicate webhook replay at the idempotency gate', async () => {
    const { service, lifecycle } = makeService();
    (service as any).saveWebhookLog.mockResolvedValue(null);
    await service.handleWebhook({ LowProfileId: 'lp-1' });
    expect(lifecycle.applyHostedWebhookOutcome).not.toHaveBeenCalled();
  });

  it('keeps canonical attempt blocking when receipt creation fails', async () => {
    const { service, lifecycle } = makeService();
    (service as any).billingReceiptService.createReceiptForPayment = jest
      .fn()
      .mockRejectedValue(new Error('receipt failed'));
    (service as any).billingEventService.logEvent = jest
      .fn()
      .mockResolvedValue({ id: 10 });
    (service as any).billingEventService.findCheckoutBreakdown = jest
      .fn()
      .mockResolvedValue({
        amountBeforeVatAgorot: 1000,
        vatAmountAgorot: 170,
        amountIncludingVatAgorot: 1170,
      });
    await (service as any).generateReceiptAfterPayment({
      firebaseId: 'owner',
      subscriptionId: 9,
      planName: 'plan',
      periodStart: new Date('2026-09-01'),
      periodEnd: new Date('2026-10-01'),
      cardcomDealNumber: '123',
      paymentSuccessEvent: { id: 10 },
      billingAttemptId: 44,
    });
    expect(lifecycle.finalizeAfterReceipt).not.toHaveBeenCalled();
  });
});
