import {
  BillingAttemptStatus,
  BillingObligationKind,
  BillingAttemptTrigger,
} from '../enums/billing.enums';
import { BillingLifecycleService } from './billing-lifecycle.service';

describe('BillingLifecycleService', () => {
  const actor = { actorFirebaseId: 'owner-1', subjectFirebaseId: 'owner-1' };
  const input = {
    actor,
    subscriptionId: 7,
    planId: 2,
    periodStart: '2026-09-01',
    periodEnd: '2026-10-01',
    amountAgorot: 11700,
    amountBeforeVatAgorot: 10000,
    vatAmountAgorot: 1700,
  };

  it('opens renewal and recovery on one canonical period identity', async () => {
    const orchestration = {
      assertOwnerMutation: jest.fn(),
      createOrGetAttempt: jest.fn().mockResolvedValue({ created: true }),
    };
    const service = new BillingLifecycleService(
      orchestration as any,
      {} as any,
    );

    await service.openRenewal(input);
    await service.openPastDueRecovery(input);

    expect(orchestration.createOrGetAttempt).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        subscriptionId: 7,
        kind: BillingObligationKind.RECURRING_PERIOD,
        trigger: BillingAttemptTrigger.RENEWAL,
      }),
    );
    expect(orchestration.createOrGetAttempt).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        kind: BillingObligationKind.RECURRING_PERIOD,
        trigger: BillingAttemptTrigger.RECOVERY,
      }),
    );
    expect(orchestration.assertOwnerMutation).toHaveBeenCalledTimes(2);
  });

  it('delegates normalized outcomes and receipt finalization to canonical coordination', async () => {
    const orchestration = {
      assertOwnerMutation: jest.fn(),
      createOrGetAttempt: jest.fn(),
      applyNormalizedOutcome: jest
        .fn()
        .mockResolvedValue({ status: BillingAttemptStatus.CAPTURED }),
      finalizeCapturedAttempt: jest
        .fn()
        .mockResolvedValue({ status: BillingAttemptStatus.COMPLETED }),
    };
    const service = new BillingLifecycleService(
      orchestration as any,
      {} as any,
    );
    const outcome = { kind: 'CAPTURED' as const, cardcomTransactionId: 'tx-1' };

    await service.applyProviderOutcome(3, 'worker-1', 4, outcome);
    await service.finalizeAfterReceipt(3, 99);

    expect(orchestration.applyNormalizedOutcome).toHaveBeenCalledWith(
      3,
      'worker-1',
      4,
      outcome,
    );
    expect(orchestration.finalizeCapturedAttempt).toHaveBeenCalledWith(3, 99);
  });

  it('runs provider then receipt finalization, never finalizing a non-capture', async () => {
    const orchestration = {
      assertOwnerMutation: jest.fn(),
      createOrGetAttempt: jest.fn().mockResolvedValue({
        created: true,
        attempt: { id: 3, stateVersion: 4 },
      }),
      finalizeCapturedAttempt: jest
        .fn()
        .mockResolvedValue({ status: 'COMPLETED' }),
    };
    const provider = {
      submitCharge: jest.fn().mockResolvedValue({
        kind: 'APPLIED',
        outcome: { kind: 'CAPTURED', cardcomTransactionId: 'tx-1' },
      }),
    };
    const receipt = {
      createReceipt: jest.fn().mockResolvedValue({ receiptDocId: 99 }),
    };
    const service = new BillingLifecycleService(
      orchestration as any,
      provider as any,
    );

    const result = await service.executeRenewal(
      input,
      receipt,
      'worker-1',
      provider,
    );

    expect(provider.submitCharge).toHaveBeenCalledWith({
      actor,
      attemptId: 3,
      expectedStateVersion: 4,
      leaseOwner: 'worker-1',
    });
    expect(receipt.createReceipt).toHaveBeenCalledTimes(1);
    expect(orchestration.finalizeCapturedAttempt).toHaveBeenCalledWith(3, 99);
    expect(result.finalized).toBe(true);
  });

  it('does not create a receipt after decline or UNKNOWN', async () => {
    const orchestration = {
      assertOwnerMutation: jest.fn(),
      createOrGetAttempt: jest.fn().mockResolvedValue({
        created: false,
        attempt: { id: 3, stateVersion: 4 },
      }),
      finalizeCapturedAttempt: jest.fn(),
    };
    const provider = {
      submitCharge: jest.fn().mockResolvedValue({
        kind: 'APPLIED',
        outcome: { kind: 'UNKNOWN', failureCategory: 'TRANSPORT_ERROR' },
      }),
    };
    const receipt = { createReceipt: jest.fn() };
    const service = new BillingLifecycleService(
      orchestration as any,
      provider as any,
    );

    const result = await service.executeRenewal(
      input,
      receipt,
      'worker-1',
      provider,
    );

    expect(result.finalized).toBe(false);
    expect(receipt.createReceipt).not.toHaveBeenCalled();
    expect(orchestration.finalizeCapturedAttempt).not.toHaveBeenCalled();
  });
});
