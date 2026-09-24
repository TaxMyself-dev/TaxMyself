import { BillingEventType } from '../enums/billing.enums';
import { BillingEventService } from './billing-event.service';

/** KT-038 Task 3B: receipt-link result and once-per-attempt failure recording. */
describe('BillingEventService — post-capture recovery support', () => {
  function build() {
    const rows: any[] = [];
    const repo = {
      create: jest.fn((v) => v),
      save: jest.fn(async (v) => {
        const row = { id: rows.length + 1, createdAt: new Date(), ...v };
        rows.push(row);
        return row;
      }),
      findOne: jest.fn(
        async ({ where }: any) =>
          rows.find((r) =>
            Object.entries(where).every(([k, val]) => r[k] === val),
          ) ?? null,
      ),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    return { service: new BillingEventService(repo as any), repo, rows };
  }

  describe('updatePaymentEventWithReceipt', () => {
    it('reports success', async () => {
      const { service, repo } = build();
      await expect(
        service.updatePaymentEventWithReceipt(10, 500),
      ).resolves.toBe(true);
      expect(repo.update).toHaveBeenCalledWith(
        { id: 10 },
        { receiptDocId: 500 },
      );
    });

    it('reports failure instead of swallowing it, and still never throws (legacy callers unchanged)', async () => {
      const { service, repo } = build();
      repo.update.mockRejectedValue(
        new Error('deadlock token=4111111111111111'),
      );

      await expect(
        service.updatePaymentEventWithReceipt(10, 500),
      ).resolves.toBe(false);
    });
  });

  describe('findEventForAttempt', () => {
    it('finds an event by attempt and type, and returns null when the lookup fails', async () => {
      const { service, repo, rows } = build();
      rows.push({
        id: 1,
        billingAttemptId: 21,
        eventType: BillingEventType.PAYMENT_SUCCESS,
      });

      expect(
        (
          await service.findEventForAttempt(
            21,
            BillingEventType.PAYMENT_SUCCESS,
          )
        )?.id,
      ).toBe(1);
      expect(
        await service.findEventForAttempt(22, BillingEventType.PAYMENT_SUCCESS),
      ).toBeNull();

      repo.findOne.mockRejectedValueOnce(new Error('db down'));
      expect(
        await service.findEventForAttempt(21, BillingEventType.PAYMENT_SUCCESS),
      ).toBeNull();
    });
  });

  describe('logReceiptFailureOncePerAttempt', () => {
    const input = {
      firebaseId: 'owner-1',
      subscriptionId: 7,
      billingAttemptId: 21,
      metadata: { failureCategory: 'RECEIPT_STEP_FAILED' },
    };

    it('records the first failure and re-uses it on every later retry', async () => {
      const { service, rows } = build();

      const first = await service.logReceiptFailureOncePerAttempt(input);
      const second = await service.logReceiptFailureOncePerAttempt(input);
      const third = await service.logReceiptFailureOncePerAttempt({
        ...input,
        metadata: { failureCategory: 'ACTIVATION_FAILED' },
      });

      expect(
        rows.filter((r) => r.eventType === BillingEventType.RECEIPT_FAILED),
      ).toHaveLength(1);
      expect(second?.id).toBe(first?.id);
      expect(third?.id).toBe(first?.id);
      expect(first).toEqual(
        expect.objectContaining({
          eventType: BillingEventType.RECEIPT_FAILED,
          billingAttemptId: 21,
        }),
      );
    });

    it('keeps failures of different attempts separate', async () => {
      const { service, rows } = build();

      await service.logReceiptFailureOncePerAttempt(input);
      await service.logReceiptFailureOncePerAttempt({
        ...input,
        billingAttemptId: 22,
      });

      expect(
        rows.filter((r) => r.eventType === BillingEventType.RECEIPT_FAILED),
      ).toHaveLength(2);
    });
  });
});
