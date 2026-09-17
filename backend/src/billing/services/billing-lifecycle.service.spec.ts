import { BillingAttemptStatus, BillingObligationKind, BillingAttemptTrigger } from '../enums/billing.enums';
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
    const service = new BillingLifecycleService(orchestration as any);

    await service.openRenewal(input);
    await service.openPastDueRecovery(input);

    expect(orchestration.createOrGetAttempt).toHaveBeenNthCalledWith(1,
      expect.objectContaining({
        subscriptionId: 7,
        kind: BillingObligationKind.RECURRING_PERIOD,
        trigger: BillingAttemptTrigger.RENEWAL,
      }),
    );
    expect(orchestration.createOrGetAttempt).toHaveBeenNthCalledWith(2,
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
      applyNormalizedOutcome: jest.fn().mockResolvedValue({ status: BillingAttemptStatus.CAPTURED }),
      finalizeCapturedAttempt: jest.fn().mockResolvedValue({ status: BillingAttemptStatus.COMPLETED }),
    };
    const service = new BillingLifecycleService(orchestration as any);
    const outcome = { kind: 'CAPTURED' as const, cardcomTransactionId: 'tx-1' };

    await service.applyProviderOutcome(3, 'worker-1', 4, outcome);
    await service.finalizeAfterReceipt(3, 99);

    expect(orchestration.applyNormalizedOutcome).toHaveBeenCalledWith(3, 'worker-1', 4, outcome);
    expect(orchestration.finalizeCapturedAttempt).toHaveBeenCalledWith(3, 99);
  });
});
