import { Logger } from '@nestjs/common';
import {
  BillingAttemptStatus,
  BillingObligationKind,
  BillingObligationStatus,
  BillingAttemptTrigger,
} from '../enums/billing.enums';
import {
  BillingLifecycleService,
  PostCaptureDeferredError,
} from './billing-lifecycle.service';

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
    const capturedRow = {
      id: 3,
      stateVersion: 5,
      status: BillingAttemptStatus.CAPTURED,
      cardcomTransactionId: 'tx-1',
      providerTerminalRef: null,
      providerResponseCode: 0,
    };
    const orchestration = {
      assertOwnerMutation: jest.fn(),
      findPeriodSnapshot: jest.fn().mockResolvedValue(null),
      createOrGetAttempt: jest.fn().mockResolvedValue({
        created: true,
        attempt: { id: 3, stateVersion: 4 },
      }),
      claimForFinalization: jest
        .fn()
        .mockResolvedValue({ claimed: true, attempt: capturedRow }),
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
      findPeriodSnapshot: jest.fn().mockResolvedValue(null),
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

  it('denies renewal before provider I/O when the owner context is rejected', async () => {
    const orchestration = {
      assertOwnerMutation: jest.fn().mockImplementation(() => {
        throw new Error('owner-only mutation denied');
      }),
      createOrGetAttempt: jest.fn(),
    };
    const provider = { submitCharge: jest.fn() };
    const receipt = { createReceipt: jest.fn() };
    const service = new BillingLifecycleService(
      orchestration as any,
      provider as any,
    );

    await expect(
      service.executeRenewal(input, receipt, 'worker-1', provider as any),
    ).rejects.toThrow('owner-only mutation denied');
    expect(provider.submitCharge).not.toHaveBeenCalled();
    expect(orchestration.createOrGetAttempt).not.toHaveBeenCalled();
  });
});

/**
 * KT-038 Task 3: an attempt already CAPTURED is never submitted to the provider
 * again; only the post-capture receipt/journal/completion phase is resumed.
 */
describe('BillingLifecycleService post-capture recovery', () => {
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
  const capturedRow = () => ({
    id: 3,
    stateVersion: 5,
    status: BillingAttemptStatus.CAPTURED,
    cardcomTransactionId: 'tx-original',
    providerTerminalRef: 'terminal-9',
    providerResponseCode: 0,
  });

  function build(overrides: Record<string, jest.Mock> = {}) {
    const orchestration: Record<string, jest.Mock> = {
      assertOwnerMutation: jest.fn(),
      findPeriodSnapshot: jest.fn().mockResolvedValue(null),
      createOrGetAttempt: jest.fn().mockResolvedValue({
        created: false,
        attempt: {
          id: 3,
          stateVersion: 5,
          status: BillingAttemptStatus.CAPTURED,
        },
      }),
      claimForFinalization: jest
        .fn()
        .mockResolvedValue({ claimed: true, attempt: capturedRow() }),
      releaseFinalizationLease: jest.fn().mockResolvedValue(undefined),
      finalizeCapturedAttempt: jest
        .fn()
        .mockResolvedValue({ status: BillingAttemptStatus.COMPLETED }),
      ...overrides,
    };
    const provider = { submitCharge: jest.fn() };
    const receipt = {
      createReceipt: jest.fn().mockResolvedValue({ receiptDocId: 99 }),
    };
    const service = new BillingLifecycleService(
      orchestration as any,
      provider as any,
    );
    return { service, orchestration, provider, receipt };
  }

  it('resumes an existing CAPTURED attempt without ever calling the provider', async () => {
    const { service, orchestration, provider, receipt } = build();

    const result = await service.executeRenewal(
      input,
      receipt,
      'worker-1',
      provider,
    );

    expect(provider.submitCharge).not.toHaveBeenCalled();
    expect(orchestration.claimForFinalization).toHaveBeenCalledWith(
      3,
      'worker-1',
      'owner-1',
    );
    expect(receipt.createReceipt).toHaveBeenCalledTimes(1);
    expect(orchestration.finalizeCapturedAttempt).toHaveBeenCalledWith(3, 99);
    expect(result).toEqual(
      expect.objectContaining({
        finalized: true,
        resumedCaptured: true,
        submitted: null,
      }),
    );
  });

  it('detects CAPTURED from the period snapshot before opening or re-validating the debt', async () => {
    const { service, orchestration, provider, receipt } = build({
      findPeriodSnapshot: jest.fn().mockResolvedValue({
        obligation: { status: BillingObligationStatus.OPEN },
        attempt: capturedRow(),
      }),
    });

    const result = await service.executeRenewal(
      input,
      receipt,
      'worker-1',
      provider,
    );

    expect(orchestration.createOrGetAttempt).not.toHaveBeenCalled();
    expect(provider.submitCharge).not.toHaveBeenCalled();
    expect(result.finalized).toBe(true);
  });

  it('hands the ORIGINAL provider transaction id and terminal ref to the receipt step', async () => {
    const { service, receipt, provider } = build();

    await service.executeRenewal(input, receipt, 'worker-1', provider);

    expect(receipt.createReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ id: 3, cardcomTransactionId: 'tx-original' }),
      {
        kind: 'CAPTURED',
        cardcomTransactionId: 'tx-original',
        providerTerminalRef: 'terminal-9',
        providerResponseCode: 0,
      },
    );
  });

  it('keeps the attempt CAPTURED and recoverable when receipt creation fails, with a sanitized result', async () => {
    const { service, orchestration, provider, receipt } = build({
      applyNormalizedOutcome: jest.fn(),
    });
    receipt.createReceipt.mockRejectedValue(
      new Error('boom token=4111111111111111 ApiName=secret-api-key'),
    );

    const result = await service.executeRenewal(
      input,
      receipt,
      'worker-1',
      provider,
    );

    expect(result.finalized).toBe(false);
    expect(result.resume).toEqual(
      expect.objectContaining({
        status: 'RECEIPT_PENDING',
        failureCategory: 'RECEIPT_STEP_FAILED',
      }),
    );
    expect(orchestration.finalizeCapturedAttempt).not.toHaveBeenCalled();
    // Lease released with the claimed version so the very next run can retry.
    expect(orchestration.releaseFinalizationLease).toHaveBeenCalledWith(3, 5);
    // The attempt is never pushed to UNKNOWN/DECLINED and the provider is untouched.
    expect(orchestration.applyNormalizedOutcome).not.toHaveBeenCalled();
    expect(provider.submitCharge).not.toHaveBeenCalled();
    const serialized = JSON.stringify(result.resume);
    expect(serialized).not.toContain('4111111111111111');
    expect(serialized).not.toContain('secret-api-key');
  });

  it('masks card-number-like digits and credential values even in the server log line', async () => {
    const logged: string[] = [];
    const spy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation((message: unknown) => {
        logged.push(String(message));
      });
    try {
      const { service, provider, receipt } = build();
      receipt.createReceipt.mockRejectedValue(
        new Error(
          'boom token=abc123SECRET card 4111111111111111 ApiName=secret-api-key',
        ),
      );

      await service.executeRenewal(input, receipt, 'worker-1', provider);
    } finally {
      spy.mockRestore();
    }

    const line = logged.join('\n');
    expect(line).toContain('RECEIPT_STEP_FAILED');
    expect(line).not.toContain('4111111111111111');
    expect(line).not.toContain('abc123SECRET');
    expect(line).not.toContain('secret-api-key');
  });

  it('treats a finalization failure after a created receipt as recoverable too', async () => {
    const { service, orchestration, provider, receipt } = build({
      finalizeCapturedAttempt: jest
        .fn()
        .mockRejectedValue(new Error('db down')),
    });

    const result = await service.executeRenewal(
      input,
      receipt,
      'worker-1',
      provider,
    );

    expect(result.resume).toEqual(
      expect.objectContaining({
        status: 'RECEIPT_PENDING',
        failureCategory: 'FINALIZATION_FAILED',
      }),
    );
    expect(orchestration.releaseFinalizationLease).toHaveBeenCalledWith(3, 5);
  });

  it('a second failure leaves the attempt safely recoverable, and a later success completes it once', async () => {
    const { service, orchestration, provider, receipt } = build();
    receipt.createReceipt
      .mockRejectedValueOnce(new Error('first failure'))
      .mockRejectedValueOnce(new Error('second failure'))
      .mockResolvedValueOnce({ receiptDocId: 99 });

    const first = await service.executeRenewal(
      input,
      receipt,
      'worker-1',
      provider,
    );
    const second = await service.executeRenewal(
      input,
      receipt,
      'worker-1',
      provider,
    );
    const third = await service.executeRenewal(
      input,
      receipt,
      'worker-1',
      provider,
    );

    expect(first.finalized).toBe(false);
    expect(second.finalized).toBe(false);
    expect(third.finalized).toBe(true);
    expect(provider.submitCharge).not.toHaveBeenCalled();
    expect(orchestration.finalizeCapturedAttempt).toHaveBeenCalledTimes(1);
    expect(orchestration.releaseFinalizationLease).toHaveBeenCalledTimes(2);
  });

  it('does nothing when another run holds the finalization lease (no receipt, no finalize)', async () => {
    const { service, orchestration, provider, receipt } = build({
      claimForFinalization: jest.fn().mockResolvedValue({
        claimed: false,
        attempt: capturedRow(),
        reason: 'ALREADY_CLAIMED',
      }),
    });

    const result = await service.executeRenewal(
      input,
      receipt,
      'worker-1',
      provider,
    );

    expect(result.resume?.status).toBe('LEASE_HELD');
    expect(result.finalized).toBe(false);
    expect(receipt.createReceipt).not.toHaveBeenCalled();
    expect(orchestration.finalizeCapturedAttempt).not.toHaveBeenCalled();
    expect(orchestration.releaseFinalizationLease).not.toHaveBeenCalled();
  });

  it('is an idempotent no-op for an attempt that is already COMPLETED', async () => {
    const { service, orchestration, provider, receipt } = build({
      claimForFinalization: jest.fn().mockResolvedValue({
        claimed: false,
        attempt: { ...capturedRow(), status: BillingAttemptStatus.COMPLETED },
        reason: 'ALREADY_COMPLETED',
      }),
    });

    const result = await service.executeRenewal(
      input,
      receipt,
      'worker-1',
      provider,
    );

    expect(result.finalized).toBe(true);
    expect(receipt.createReceipt).not.toHaveBeenCalled();
    expect(orchestration.finalizeCapturedAttempt).not.toHaveBeenCalled();
  });

  it('short-circuits a SATISFIED period without opening, submitting or creating a receipt', async () => {
    const { service, orchestration, provider, receipt } = build({
      findPeriodSnapshot: jest.fn().mockResolvedValue({
        obligation: { status: BillingObligationStatus.SATISFIED },
        attempt: { ...capturedRow(), status: BillingAttemptStatus.COMPLETED },
      }),
    });

    const result = await service.executeRenewal(
      input,
      receipt,
      'worker-1',
      provider,
    );

    expect(result).toEqual(
      expect.objectContaining({ finalized: true, alreadyCompleted: true }),
    );
    expect(orchestration.createOrGetAttempt).not.toHaveBeenCalled();
    expect(provider.submitCharge).not.toHaveBeenCalled();
    expect(receipt.createReceipt).not.toHaveBeenCalled();
  });

  it('never fabricates a receipt for a captured attempt that lost its transaction id', async () => {
    const { service, orchestration, provider, receipt } = build({
      claimForFinalization: jest.fn().mockResolvedValue({
        claimed: true,
        attempt: { ...capturedRow(), cardcomTransactionId: null },
      }),
    });

    const result = await service.executeRenewal(
      input,
      receipt,
      'worker-1',
      provider,
    );

    expect(result.resume).toEqual(
      expect.objectContaining({
        status: 'RECEIPT_PENDING',
        failureCategory: 'MISSING_TRANSACTION_ID',
      }),
    );
    expect(receipt.createReceipt).not.toHaveBeenCalled();
    expect(orchestration.finalizeCapturedAttempt).not.toHaveBeenCalled();
  });

  it('denies post-capture resume before claiming anything when the owner check fails', async () => {
    const { service, orchestration, receipt } = build({
      assertOwnerMutation: jest.fn().mockImplementation(() => {
        throw new Error('owner-only mutation denied');
      }),
    });

    await expect(
      service.resumeCapturedAttempt({
        actor,
        attemptId: 3,
        receipt,
        leaseOwner: 'worker-1',
      }),
    ).rejects.toThrow('owner-only mutation denied');
    expect(orchestration.claimForFinalization).not.toHaveBeenCalled();
    expect(receipt.createReceipt).not.toHaveBeenCalled();
  });
});

/**
 * KT-038 Task 3B: an activation step runs after the lease and BEFORE the
 * receipt and completion; any failure keeps the attempt CAPTURED.
 */
describe('BillingLifecycleService post-capture activation step', () => {
  const actor = { actorFirebaseId: 'owner-1', subjectFirebaseId: 'owner-1' };
  const capturedRow = () => ({
    id: 3,
    stateVersion: 5,
    status: BillingAttemptStatus.CAPTURED,
    cardcomTransactionId: 'tx-original',
    providerTerminalRef: null,
    providerResponseCode: 0,
  });

  function build() {
    const order: string[] = [];
    const orchestration = {
      assertOwnerMutation: jest.fn(),
      claimForFinalization: jest.fn(async () => {
        order.push('claim');
        return { claimed: true, attempt: capturedRow() };
      }),
      releaseFinalizationLease: jest.fn().mockResolvedValue(undefined),
      finalizeCapturedAttempt: jest.fn(async () => {
        order.push('finalize');
        return { status: BillingAttemptStatus.COMPLETED };
      }),
      findCapturedHostedAttempts: jest.fn().mockResolvedValue([]),
    };
    const receipt = {
      createReceipt: jest.fn(async () => {
        order.push('receipt');
        return { receiptDocId: 99 };
      }),
    };
    const activate = jest.fn(async () => {
      order.push('activate');
    });
    const service = new BillingLifecycleService(
      orchestration as any,
      {} as any,
    );
    const run = (overrides: Record<string, unknown> = {}) =>
      service.resumeCapturedAttempt({
        actor,
        attemptId: 3,
        receipt,
        leaseOwner: 'hosted-recovery-3',
        activate,
        ...overrides,
      });
    return { service, orchestration, receipt, activate, order, run };
  }

  it('activates first, then creates the receipt, then completes', async () => {
    const { run, order } = build();

    const result = await run();

    expect(result.status).toBe('COMPLETED');
    expect(order).toEqual(['claim', 'activate', 'receipt', 'finalize']);
  });

  it('hands the persisted CAPTURED attempt (original transaction id) to the activation step', async () => {
    const { run, activate } = build();

    await run();

    expect(activate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 3, cardcomTransactionId: 'tx-original' }),
    );
  });

  it('keeps the attempt CAPTURED and skips receipt and completion when activation fails, with a sanitized category', async () => {
    const { run, orchestration, receipt, activate } = build();
    activate.mockRejectedValue(
      new Error('deadlock token=abc123SECRET 4111111111111111'),
    );

    const result = await run();

    expect(result).toEqual(
      expect.objectContaining({
        status: 'RECEIPT_PENDING',
        failureCategory: 'ACTIVATION_FAILED',
      }),
    );
    expect(receipt.createReceipt).not.toHaveBeenCalled();
    expect(orchestration.finalizeCapturedAttempt).not.toHaveBeenCalled();
    expect(orchestration.releaseFinalizationLease).toHaveBeenCalledWith(3, 5);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('abc123SECRET');
    expect(serialized).not.toContain('4111111111111111');
  });

  it('a deferred activation is reported as deferred (a warning, not an error) and nothing else runs', async () => {
    const { run, orchestration, receipt, activate } = build();
    activate.mockRejectedValue(
      new PostCaptureDeferredError('webhook may still be running'),
    );
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    try {
      const result = await run();

      expect(result).toEqual(
        expect.objectContaining({
          status: 'RECEIPT_PENDING',
          failureCategory: 'ACTIVATION_DEFERRED',
        }),
      );
      expect(warn).toHaveBeenCalledTimes(1);
      expect(error).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
      error.mockRestore();
    }
    expect(receipt.createReceipt).not.toHaveBeenCalled();
    expect(orchestration.finalizeCapturedAttempt).not.toHaveBeenCalled();
    expect(orchestration.releaseFinalizationLease).toHaveBeenCalledWith(3, 5);
  });

  it('a later run after a failed activation retries the whole post-capture phase and completes once', async () => {
    const { run, orchestration, receipt, activate } = build();
    activate
      .mockRejectedValueOnce(new Error('first failure'))
      .mockResolvedValue(undefined);

    const first = await run();
    const second = await run();

    expect(first.status).toBe('RECEIPT_PENDING');
    expect(second.status).toBe('COMPLETED');
    expect(activate).toHaveBeenCalledTimes(2);
    expect(receipt.createReceipt).toHaveBeenCalledTimes(1);
    expect(orchestration.finalizeCapturedAttempt).toHaveBeenCalledTimes(1);
  });

  it('does not run activation when another run holds the lease', async () => {
    const { run, orchestration, activate } = build();
    orchestration.claimForFinalization.mockResolvedValue({
      claimed: false,
      reason: 'ALREADY_CLAIMED',
      attempt: capturedRow(),
    } as any);

    const result = await run();

    expect(result.status).toBe('LEASE_HELD');
    expect(activate).not.toHaveBeenCalled();
  });

  it('is unchanged when no activation step is supplied (renewal path)', async () => {
    const { run, order } = build();

    await run({ activate: undefined });

    expect(order).toEqual(['claim', 'receipt', 'finalize']);
  });

  it('exposes the system read of stuck hosted captures for the recovery sweep', async () => {
    const { service, orchestration } = build();
    const cutoff = new Date('2026-09-01T00:00:00Z');
    orchestration.findCapturedHostedAttempts.mockResolvedValue([
      { attemptId: 3, subscriptionId: 7, firebaseId: 'owner-1' },
    ]);

    await expect(
      service.findCapturedHostedAttempts(cutoff, 50),
    ).resolves.toHaveLength(1);
    expect(orchestration.findCapturedHostedAttempts).toHaveBeenCalledWith(
      cutoff,
      50,
    );
  });
});
