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
      TranzactionInfo: { ResponseCode: 0, TranzactionId: 123, Amount: 117 },
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
      findAttemptObligations: jest.fn().mockResolvedValue([{ subscriptionId: 9, firebaseIdSnapshot: 'owner' }]),
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
      { manager: { findOne: jest.fn().mockResolvedValue({ id: 44, planId: 2, cardcomLowProfileId: 'lp-1', amountAgorot: 11700 }) } } as any,
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

  it('completes a verified initial purchase through canonical completion instead of legacy activation', async () => {
    const { service, lifecycle } = makeService();
    lifecycle.findAttemptObligations.mockResolvedValue([{ subscriptionId: 9, firebaseIdSnapshot: 'owner', kind: 'CHECKOUT' }] as any);
    const completion = { completeCapturedHostedAttempt: jest.fn().mockResolvedValue('COMPLETED') };
    (service as any).hostedCompletion = completion;
    await service.handleWebhook({ LowProfileId: 'lp-1', ReturnValue: 'ignored' });
    expect(completion.completeCapturedHostedAttempt).toHaveBeenCalledWith(expect.objectContaining({ firebaseId: 'owner', subscriptionId: 9, billingAttemptId: 44, verifiedResult: expect.any(Object) }));
    expect((service as any).processVerifiedSuccess).not.toHaveBeenCalled();
  });

  it('proceeds to activation when a verified success carries a transaction id', async () => {
    const { service } = makeService();
    await service.handleWebhook({
      LowProfileId: 'lp-1',
      ReturnValue: 'ignored',
    });
    expect((service as any).processVerifiedSuccess).toHaveBeenCalledWith(
      'owner',
      2,
      9,
      expect.objectContaining({
        TranzactionInfo: { ResponseCode: 0, TranzactionId: 123, Amount: 117 },
      }),
      log,
      44,
    );
  });

  it('applies DECLINED only for a definitive rejected transaction and never finalizes it', async () => {
    const { service, lifecycle } = makeService({
      ResponseCode: 12,
      LowProfileId: 'lp-1',
      TranzactionInfo: { ResponseCode: 51 },
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

  it('maps a verified success without a transaction id to UNKNOWN without activation', async () => {
    const { service, lifecycle } = makeService({
      ResponseCode: 0,
      LowProfileId: 'lp-1',
      ReturnValue: JSON.stringify({
        intent: 'CHECKOUT',
        firebaseId: 'owner',
        planId: 2,
        subscriptionId: 9,
        billingAttemptId: 44,
      }),
      TranzactionInfo: { ResponseCode: 0 },
    });
    await service.handleWebhook({ LowProfileId: 'lp-1' });
    expect(lifecycle.applyHostedWebhookOutcome).toHaveBeenCalledWith(
      expect.anything(),
      44,
      expect.objectContaining({
        kind: 'UNKNOWN',
        failureCategory: 'MISSING_TRANSACTION_ID',
      }),
      'webhook-7',
    );
    expect((service as any).processVerifiedSuccess).not.toHaveBeenCalled();
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

  // The former "keeps canonical attempt blocking when receipt creation fails"
  // case is superseded by cardcom-webhook.post-capture.spec.ts: canonical
  // attempts no longer use generateReceiptAfterPayment, they go through the
  // shared lifecycle.resumeCapturedAttempt path, which is what that spec covers.
});
