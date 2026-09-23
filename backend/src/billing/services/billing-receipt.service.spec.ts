import { BillingEventType } from '../enums/billing.enums';
import {
  BillingReceiptService,
  ReceiptIssuer,
} from './billing-receipt.service';

/**
 * KT-038 Task 3: receipt/journal creation for a canonical attempt is idempotent.
 * createDoc persists document + lines + payments + journal entry in ONE
 * transaction and stores the attempt id on the UNIQUE documents.billing_attempt_id
 * column, so an existing row for the attempt proves the journal work exists.
 */
describe('BillingReceiptService — idempotent post-capture receipt', () => {
  const issuer = {
    systemUserId: 'system',
    issuerBusinessNumber: '999',
    issuerName: 'Keepintax',
  } as unknown as ReceiptIssuer;

  const attempt = {
    id: 21,
    amountAgorot: 11700,
    amountBeforeVatAgorot: 10000,
    vatAmountAgorot: 1700,
    currency: 'ILS',
    cardcomTransactionId: 'tx-original',
  };
  const base = {
    issuer,
    eventType:
      BillingEventType.RENEWAL_SUCCESS as BillingEventType.RENEWAL_SUCCESS,
    attempt,
    firebaseId: 'owner-1',
    subscriptionId: 7,
    planName: 'Plan',
    periodStart: new Date('2026-09-01'),
    periodEnd: new Date('2026-10-01'),
    eventMetadata: { billingPeriod: '2026-09' },
  };

  function build() {
    const documentsService = {
      findBillingReceiptByAttemptId: jest.fn().mockResolvedValue(null),
      createBillingSystemReceipt: jest.fn().mockResolvedValue({
        receiptDocId: 500,
        docNumber: '1001',
        generalDocIndex: '77',
      }),
      finalizeBillingReceipt: jest.fn().mockResolvedValue({}),
    };
    const billingEventService = {
      findSuccessEventForAttempt: jest.fn().mockResolvedValue(null),
      logEvent: jest.fn().mockResolvedValue({ id: 10, receiptDocId: null }),
      updatePaymentEventWithReceipt: jest.fn().mockResolvedValue(undefined),
    };
    const userRepo = {
      findOne: jest
        .fn()
        .mockResolvedValue({ fName: 'A', lName: 'B', email: 'a@b.com' }),
    };
    const service = new BillingReceiptService(
      documentsService as any,
      {} as any,
      billingEventService as any,
      userRepo as any,
    );
    const email = jest
      .spyOn(service, 'sendReceiptEmailForPaymentEvent')
      .mockResolvedValue({ sent: true });
    return { service, documentsService, billingEventService, userRepo, email };
  }

  describe('createReceiptForPayment', () => {
    const params = {
      firebaseId: 'owner-1',
      subscriptionId: 7,
      amountBeforeVatAgorot: 10000,
      vatAmountAgorot: 1700,
      amountIncludingVatAgorot: 11700,
      planName: 'Plan',
      periodStart: new Date('2026-09-01'),
      periodEnd: new Date('2026-10-01'),
      cardcomDealNumber: 'tx-original',
    };

    it('re-uses the existing receipt for an attempt instead of issuing a second document/journal entry', async () => {
      const { service, documentsService, userRepo } = build();
      documentsService.findBillingReceiptByAttemptId.mockResolvedValue({
        receiptDocId: 42,
        docNumber: '900',
        generalDocIndex: '5',
      });

      const result = await service.createReceiptForPayment(issuer, {
        ...params,
        billingAttemptId: 21,
      });

      expect(result.receiptDocId).toBe(42);
      expect(
        documentsService.createBillingSystemReceipt,
      ).not.toHaveBeenCalled();
      expect(userRepo.findOne).not.toHaveBeenCalled();
    });

    it('stamps the attempt id on the created document', async () => {
      const { service, documentsService } = build();

      await service.createReceiptForPayment(issuer, {
        ...params,
        billingAttemptId: 21,
      });

      expect(documentsService.createBillingSystemReceipt).toHaveBeenCalledWith(
        expect.objectContaining({ billingAttemptId: 21 }),
      );
    });

    it('adopts the winner when a concurrent creator takes the UNIQUE attempt key', async () => {
      const { service, documentsService } = build();
      documentsService.createBillingSystemReceipt.mockRejectedValue({
        code: 'ER_DUP_ENTRY',
      });
      documentsService.findBillingReceiptByAttemptId
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          receiptDocId: 77,
          docNumber: '901',
          generalDocIndex: '6',
        });

      const result = await service.createReceiptForPayment(issuer, {
        ...params,
        billingAttemptId: 21,
      });

      expect(result.receiptDocId).toBe(77);
    });

    it('rethrows a duplicate-key error when no receipt exists for the attempt', async () => {
      const { service, documentsService } = build();
      documentsService.createBillingSystemReceipt.mockRejectedValue({
        code: 'ER_DUP_ENTRY',
      });

      await expect(
        service.createReceiptForPayment(issuer, {
          ...params,
          billingAttemptId: 21,
        }),
      ).rejects.toEqual({ code: 'ER_DUP_ENTRY' });
    });

    it('keeps the legacy behavior when no attempt is given (no lookup, no attempt key)', async () => {
      const { service, documentsService } = build();

      await service.createReceiptForPayment(issuer, params);

      expect(
        documentsService.findBillingReceiptByAttemptId,
      ).not.toHaveBeenCalled();
      expect(documentsService.createBillingSystemReceipt).toHaveBeenCalledWith(
        expect.objectContaining({ billingAttemptId: undefined }),
      );
    });
  });

  describe('ensureReceiptForCapturedAttempt', () => {
    it('first run: logs one attempt-keyed success event, creates the receipt, links it, finalizes PDFs and emails', async () => {
      const { service, billingEventService, documentsService, email } = build();

      const result = await service.ensureReceiptForCapturedAttempt(base);

      expect(result).toEqual({ receiptDocId: 500 });
      expect(billingEventService.logEvent).toHaveBeenCalledTimes(1);
      expect(billingEventService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: BillingEventType.RENEWAL_SUCCESS,
          billingAttemptId: 21,
          cardcomDealNumber: 'tx-original',
        }),
      );
      expect(
        billingEventService.updatePaymentEventWithReceipt,
      ).toHaveBeenCalledWith(10, 500);
      expect(documentsService.finalizeBillingReceipt).toHaveBeenCalledWith(
        expect.objectContaining({ docId: 500 }),
      );
      expect(email).toHaveBeenCalledWith(10, 'Keepintax');
    });

    it('uses the attempt snapshot amounts and provider transaction id, never a recomputed price', async () => {
      const { service, documentsService } = build();

      await service.ensureReceiptForCapturedAttempt(base);

      expect(documentsService.createBillingSystemReceipt).toHaveBeenCalledWith(
        expect.objectContaining({
          amountBeforeVatAgorot: 10000,
          vatAmountAgorot: 1700,
          amountIncludingVatAgorot: 11700,
          billingAttemptId: 21,
        }),
      );
    });

    it('retry after a receipt failure re-uses the existing event and creates the receipt once', async () => {
      const { service, billingEventService, documentsService } = build();
      billingEventService.findSuccessEventForAttempt.mockResolvedValue({
        id: 10,
        receiptDocId: null,
        receiptEmailSent: false,
      });

      await service.ensureReceiptForCapturedAttempt(base);

      expect(billingEventService.logEvent).not.toHaveBeenCalled();
      expect(documentsService.createBillingSystemReceipt).toHaveBeenCalledTimes(
        1,
      );
      expect(
        billingEventService.updatePaymentEventWithReceipt,
      ).toHaveBeenCalledWith(10, 500);
    });

    it('retry after the receipt was created but not linked re-finds it instead of duplicating', async () => {
      const { service, billingEventService, documentsService } = build();
      billingEventService.findSuccessEventForAttempt.mockResolvedValue({
        id: 10,
        receiptDocId: null,
        receiptEmailSent: false,
      });
      documentsService.findBillingReceiptByAttemptId.mockResolvedValue({
        receiptDocId: 42,
        docNumber: '900',
        generalDocIndex: '5',
      });

      const result = await service.ensureReceiptForCapturedAttempt(base);

      expect(result).toEqual({ receiptDocId: 42 });
      expect(
        documentsService.createBillingSystemReceipt,
      ).not.toHaveBeenCalled();
      expect(
        billingEventService.updatePaymentEventWithReceipt,
      ).toHaveBeenCalledWith(10, 42);
    });

    it('retry after the event already carries a receipt skips creation and only completes the remaining steps', async () => {
      const { service, billingEventService, documentsService, email } = build();
      billingEventService.findSuccessEventForAttempt.mockResolvedValue({
        id: 10,
        receiptDocId: 42,
        receiptEmailSent: false,
      });

      const result = await service.ensureReceiptForCapturedAttempt(base);

      expect(result).toEqual({ receiptDocId: 42 });
      expect(
        documentsService.findBillingReceiptByAttemptId,
      ).not.toHaveBeenCalled();
      expect(
        documentsService.createBillingSystemReceipt,
      ).not.toHaveBeenCalled();
      expect(
        billingEventService.updatePaymentEventWithReceipt,
      ).not.toHaveBeenCalled();
      expect(documentsService.finalizeBillingReceipt).toHaveBeenCalledWith(
        expect.objectContaining({ docId: 42 }),
      );
      expect(email).toHaveBeenCalledTimes(1);
    });

    it('does not re-send an email that was already sent', async () => {
      const { service, billingEventService, email } = build();
      billingEventService.findSuccessEventForAttempt.mockResolvedValue({
        id: 10,
        receiptDocId: 42,
        receiptEmailSent: true,
      });

      await service.ensureReceiptForCapturedAttempt(base);

      expect(email).not.toHaveBeenCalled();
    });

    it('propagates a failed step (so the attempt stays CAPTURED) without linking a receipt', async () => {
      const { service, billingEventService, documentsService } = build();
      documentsService.createBillingSystemReceipt.mockRejectedValue(
        new Error('journal failed'),
      );

      await expect(
        service.ensureReceiptForCapturedAttempt(base),
      ).rejects.toThrow('journal failed');

      expect(
        billingEventService.updatePaymentEventWithReceipt,
      ).not.toHaveBeenCalled();
      expect(documentsService.finalizeBillingReceipt).not.toHaveBeenCalled();
    });

    it('repeated invocations produce one document even when both race past the lookup (UNIQUE key backstop)', async () => {
      const { service, documentsService } = build();
      // Fake persistence: one row per attempt id, second insert hits the UNIQUE key.
      const rows = new Map<
        number,
        { receiptDocId: number; docNumber: string; generalDocIndex: string }
      >();
      documentsService.findBillingReceiptByAttemptId.mockImplementation(
        async (id: number) => rows.get(id) ?? null,
      );
      documentsService.createBillingSystemReceipt.mockImplementation(
        async (p: { billingAttemptId: number }) => {
          await Promise.resolve();
          if (rows.has(p.billingAttemptId)) throw { code: 'ER_DUP_ENTRY' };
          const row = {
            receiptDocId: 500 + rows.size,
            docNumber: '1',
            generalDocIndex: '1',
          };
          rows.set(p.billingAttemptId, row);
          return row;
        },
      );

      const results = await Promise.all([
        service.ensureReceiptForCapturedAttempt(base),
        service.ensureReceiptForCapturedAttempt(base),
        service.ensureReceiptForCapturedAttempt(base),
      ]);

      expect(rows.size).toBe(1);
      expect(new Set(results.map((r) => r.receiptDocId)).size).toBe(1);
    });
  });
});
