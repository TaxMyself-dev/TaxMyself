import {
  BillingAttemptStatus,
  BillingChargeMode,
  BillingEventType,
  BillingObligationStatus,
  BillingObligationKind,
  SubscriptionStatus,
} from '../enums/billing.enums';
import { PaymentMethod } from '../entities/payment-method.entity';
import { Subscription } from '../entities/subscription.entity';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { BillingObligation } from '../entities/billing-obligation.entity';
import { assertBillingOwnerMutation } from './billing-attempt-orchestration.service';
import { BillingEventService } from './billing-event.service';
import { BillingHostedCompletionService } from './billing-hosted-completion.service';
import { BillingLifecycleService } from './billing-lifecycle.service';
import { decryptCardcomToken } from '../utils/billing-token-encryption.util';
import { billingBoundary } from '../domain/billing-debt-periods';
import { upgradeKey } from '../domain/billing-upgrade';

/**
 * KT-038 Task 3B — a hosted payment whose CardCom capture is already confirmed
 * locally is completed WITHOUT any provider dependency: this service is not
 * even constructed with one. The real lifecycle and real event service run over
 * an in-memory fake of the attempt state machine, and a serializing fake
 * transaction stands in for the subscription row lock.
 */
describe('BillingHostedCompletionService — local recovery of a CAPTURED hosted attempt', () => {
  const NOW = new Date('2026-09-10T12:00:00.000Z');
  const CAPTURED_AT = new Date('2026-09-10T11:50:00.000Z'); // 10 min ago
  const PLAN = { id: 2, name: 'Plan' };
  const ATTEMPT_OPENED_AT = new Date('2026-09-10T11:00:00.000Z');

  class FakeOrchestration {
    calls: string[] = [];
    obligation: any = {
      id: 1,
      subscriptionId: 9,
      firebaseIdSnapshot: 'owner',
      status: BillingObligationStatus.OPEN,
      activeAttemptId: 44,
      satisfiedAttemptId: null,
      planId: 2, periodStart: '2026-09-01', periodEnd: '2026-10-01',
      amountAgorot: 11700, amountBeforeVatAgorot: 10000, vatAmountAgorot: 1700,
    };
    attempt: any = {
      id: 44,
      obligationId: 1,
      chargeMode: BillingChargeMode.LOW_PROFILE_HOSTED,
      status: BillingAttemptStatus.CAPTURED,
      stateVersion: 3,
      leaseOwner: null,
      leaseExpiresAt: null,
      cardcomTransactionId: 'tx-original',
      providerTerminalRef: 'terminal-9',
      providerResponseCode: 0,
      planId: PLAN.id,
      amountAgorot: 11700,
      amountBeforeVatAgorot: 10000,
      vatAmountAgorot: 1700,
      currency: 'ILS',
      capturedAt: CAPTURED_AT,
      cardcomLowProfileId: 'lp-44',
      createdAt: ATTEMPT_OPENED_AT,
    };
    assertOwnerMutation = assertBillingOwnerMutation;
    async findAttemptObligations() { return [this.obligation]; }

    async claimForFinalization(_id: number, owner: string, subject: string) {
      this.calls.push('claim');
      const a = this.attempt;
      if (this.obligation.firebaseIdSnapshot !== subject)
        throw new Error('forbidden');
      if (a.status === BillingAttemptStatus.COMPLETED)
        return { claimed: false, attempt: a, reason: 'ALREADY_COMPLETED' };
      if (a.status !== BillingAttemptStatus.CAPTURED)
        return { claimed: false, attempt: a, reason: 'NOT_CAPTURED' };
      if (a.leaseOwner && a.leaseExpiresAt > new Date())
        return { claimed: false, attempt: a, reason: 'ALREADY_CLAIMED' };
      a.leaseOwner = owner;
      a.leaseExpiresAt = new Date(Date.now() + 300_000);
      a.stateVersion += 1;
      return { claimed: true, attempt: a };
    }
    async releaseFinalizationLease(_id: number, version: number) {
      const a = this.attempt;
      if (
        a.status !== BillingAttemptStatus.CAPTURED ||
        a.stateVersion !== version
      )
        return;
      a.leaseOwner = null;
      a.leaseExpiresAt = null;
    }
    async finalizeCapturedAttempt(_id: number, receiptDocId: number) {
      this.calls.push('finalize');
      const a = this.attempt;
      if (a.status === BillingAttemptStatus.COMPLETED) return a;
      a.status = BillingAttemptStatus.COMPLETED;
      a.receiptDocId = receiptDocId;
      a.leaseOwner = null;
      a.leaseExpiresAt = null;
      a.stateVersion += 1;
      this.obligation.status = BillingObligationStatus.SATISFIED;
      this.obligation.satisfiedAttemptId = a.id;
      this.obligation.activeAttemptId = null;
      return a;
    }
    listed: Array<{
      attemptId: number;
      subscriptionId: number;
      firebaseId: string;
    }> = [{ attemptId: 44, subscriptionId: 9, firebaseId: 'owner' }];
    lastCutoff: Date | null = null;
    listError: Error | null = null;
    async findCapturedHostedAttempts(cutoff: Date) {
      this.lastCutoff = cutoff;
      if (this.listError) throw this.listError;
      return this.listed;
    }
  }

  function build(cardcom?: { getLowProfileResult: jest.Mock }) {
    const orchestration = new FakeOrchestration();
    const lifecycle = new BillingLifecycleService(
      orchestration as any,
      {} as any,
    );

    const sub: any = {
      id: 9,
      firebaseId: 'owner',
      status: SubscriptionStatus.PAST_DUE,
      planId: PLAN.id,
      paymentMethodId: 5,
      currentPeriodStart: new Date('2026-08-01'),
      currentPeriodEnd: new Date('2026-09-01'),
      nextBillingDate: new Date('2026-09-01'),
      renewalAttempts: 3,
      gracePeriodEndsAt: new Date('2026-09-15'),
      canceledAt: null,
      endedAt: null,
    };
    const updates = { count: 0, values: [] as any[] };
    // The saved card the subscription used before the attempt opened.
    const pm: any = {
      id: 5,
      firebaseId: 'owner',
      cardcomToken: 'old-encrypted',
      last4: '0000',
      cardBrand: 'OLD',
      cardExpiryMonth: 1,
      cardExpiryYear: 2026,
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    };
    const created: any[] = [];
    const manager = {
      findOne: jest.fn(async (entity: unknown) => {
        if (entity === Subscription) return { ...sub };
        if (entity === SubscriptionPlan) return PLAN;
        if (entity === PaymentMethod) return pm;
        return null;
      }),
      create: jest.fn((_entity: unknown, values: any) => ({
        id: 6,
        ...values,
      })),
      save: jest.fn(async (_entity: unknown, row: any) => {
        if (row !== pm) created.push(row);
        return row;
      }),
      update: jest.fn(async (_entity: unknown, _id: number, values: any) => {
        if (_entity === BillingObligation) {
          Object.assign(orchestration.obligation, values);
          return;
        }
        Object.assign(sub, values);
        updates.count += 1;
        updates.values.push(values);
      }),
    };
    // Serializes transactions like the pessimistic_write row lock does.
    let lock: Promise<void> = Promise.resolve();
    const dataSource = {
      transaction: jest.fn(
        async (work: (m: typeof manager) => Promise<unknown>) => {
          const previous = lock;
          let release!: () => void;
          lock = new Promise<void>((resolve) => (release = resolve));
          await previous;
          try {
            return await work(manager);
          } finally {
            release();
          }
        },
      ),
    };

    const rows: any[] = [];
    const eventRepo = {
      create: jest.fn((v) => v),
      save: jest.fn(async (v) => {
        const row = { id: rows.length + 1, createdAt: new Date(), ...v };
        rows.push(row);
        return row;
      }),
      findOne: jest.fn(
        async ({ where }: any) =>
          rows.find((r) =>
            Object.entries(where).every(([k, v]) => r[k] === v),
          ) ?? null,
      ),
      find: jest.fn(async ({ where }: any) =>
        rows.filter((r) => Object.entries(where).every(([k, v]) => r[k] === v)),
      ),
    };
    const events = new BillingEventService(eventRepo as any);

    const receipts = {
      ensureReceiptForCapturedAttempt: jest
        .fn()
        .mockResolvedValue({ receiptDocId: 99 }),
    };
    const issuer = {
      getKeepintaxIssuer: jest
        .fn()
        .mockResolvedValue({ issuerName: 'Keepintax' }),
    };
    const subscriptionRepo = { findOne: jest.fn(async () => ({ ...sub })) };
    const planRepo = { findOne: jest.fn(async () => PLAN) };

    const service = new BillingHostedCompletionService(
      dataSource as any,
      subscriptionRepo as any,
      planRepo as any,
      lifecycle,
      receipts as any,
      issuer as any,
      events,
      cardcom as any,
    );
    const params = {
      firebaseId: 'owner',
      subscriptionId: 9,
      billingAttemptId: 44,
    };
    return {
      service,
      orchestration,
      sub,
      updates,
      manager,
      dataSource,
      rows,
      receipts,
      params,
      pm,
      created,
    };
  }

  const failuresOf = (rows: any[]) =>
    rows.filter((r) => r.eventType === BillingEventType.RECEIPT_FAILED);

  it('activates an initial purchase at capture rather than checkout creation and completes it only once', async () => {
    const f = build();
    f.orchestration.obligation.kind = BillingObligationKind.CHECKOUT;
    Object.assign(f.sub, { status: SubscriptionStatus.TRIAL_EXPIRED,
      currentPeriodStart: null, currentPeriodEnd: null, nextBillingDate: null });
    expect(await f.service.completeCapturedHostedAttempt(f.params)).toBe('COMPLETED');
    expect(f.sub.currentPeriodStart).toEqual(CAPTURED_AT);
    expect(f.sub.billingAnchorDay).toBe(10);
    const receipt = f.receipts.ensureReceiptForCapturedAttempt.mock.calls[0][0];
    expect(receipt.periods[0].periodStart).toEqual(CAPTURED_AT);
    expect(receipt.periods[0].periodEnd).toEqual(f.sub.currentPeriodEnd);
    const end = f.sub.currentPeriodEnd;
    expect(await f.service.completeCapturedHostedAttempt(f.params)).toBe('ALREADY_COMPLETED');
    expect(f.sub.currentPeriodEnd).toEqual(end);
    expect(f.receipts.ensureReceiptForCapturedAttempt).toHaveBeenCalledTimes(1);
  });

  it('applies a captured upgrade once and resumes a failed receipt without extending service', async () => {
    const f = build();
    Object.assign(f.sub, { status: SubscriptionStatus.ACTIVE, planId: 1, billingAnchorDay: 1 });
    f.orchestration.obligation.kind = BillingObligationKind.CHECKOUT;
    f.orchestration.obligation.obligationKey = upgradeKey(f.sub, PLAN.id, 11700);
    f.receipts.ensureReceiptForCapturedAttempt.mockRejectedValueOnce(new Error('receipt unavailable'));
    expect(await f.service.completeCapturedHostedAttempt(f.params)).toBe('RECEIPT_PENDING');
    expect(f.sub.planId).toBe(PLAN.id);
    expect(f.sub.currentPeriodStart).toEqual(CAPTURED_AT);
    expect(f.sub.billingAnchorDay).toBe(1);
    const end = f.sub.currentPeriodEnd;
    expect(await f.service.completeCapturedHostedAttempt(f.params)).toBe('COMPLETED');
    expect(f.sub.currentPeriodEnd).toEqual(end);
    expect(await f.service.completeCapturedHostedAttempt(f.params)).toBe('ALREADY_COMPLETED');
  });

  it('does not overwrite a source subscription changed after the upgrade opened', async () => {
    const f = build();
    Object.assign(f.sub, { status: SubscriptionStatus.ACTIVE, planId: 1 });
    f.orchestration.obligation.kind = BillingObligationKind.CHECKOUT;
    f.orchestration.obligation.obligationKey = upgradeKey(f.sub, PLAN.id, 11700);
    f.sub.currentPeriodEnd = new Date('2026-10-01');
    expect(await f.service.completeCapturedHostedAttempt(f.params)).toBe('RECEIPT_PENDING');
    expect(f.sub.planId).toBe(1);
    expect(f.receipts.ensureReceiptForCapturedAttempt).not.toHaveBeenCalled();
  });

  it('keeps a captured initial purchase pending when its subscription was canceled', async () => {
    const f = build();
    f.orchestration.obligation.kind = BillingObligationKind.CHECKOUT;
    f.sub.status = SubscriptionStatus.CANCELED;
    expect(await f.service.completeCapturedHostedAttempt(f.params)).toBe('RECEIPT_PENDING');
    expect(f.sub.status).toBe(SubscriptionStatus.CANCELED);
    expect(f.receipts.ensureReceiptForCapturedAttempt).not.toHaveBeenCalled();
  });

  it('resumes a failed initial receipt without extending the captured service period', async () => {
    const f = build();
    f.orchestration.obligation.kind = BillingObligationKind.CHECKOUT;
    f.orchestration.attempt.capturedAt = NOW; // initial purchase has no recovery grace delay
    Object.assign(f.sub, { status: SubscriptionStatus.TRIAL, currentPeriodStart: null, currentPeriodEnd: null });
    f.receipts.ensureReceiptForCapturedAttempt.mockRejectedValueOnce(new Error('receipt unavailable'));
    expect(await f.service.completeCapturedHostedAttempt(f.params)).toBe('RECEIPT_PENDING');
    expect(f.orchestration.attempt.status).toBe(BillingAttemptStatus.CAPTURED);
    expect(f.sub.status).toBe(SubscriptionStatus.ACTIVE);
    const end = f.sub.currentPeriodEnd;
    expect(await f.service.completeCapturedHostedAttempt(f.params)).toBe('COMPLETED');
    expect(f.sub.currentPeriodStart).toEqual(NOW);
    expect(f.sub.currentPeriodEnd).toEqual(end);
  });

  beforeEach(() => {
    jest.useFakeTimers({
      now: NOW,
      doNotFake: [
        'nextTick',
        'setImmediate',
        'clearImmediate',
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'queueMicrotask',
        'hrtime',
        'performance',
      ],
    });
  });
  afterEach(() => jest.useRealTimers());

  it('capture confirmed but activation fails: the attempt stays CAPTURED with nothing else done and the failure is recorded once', async () => {
    const { service, orchestration, dataSource, receipts, rows, params, sub } =
      build();
    dataSource.transaction.mockRejectedValueOnce(
      new Error('deadlock token=abc123SECRET card 4111111111111111'),
    );

    const status = await service.completeCapturedHostedAttempt(params);

    expect(status).toBe('RECEIPT_PENDING');
    expect(orchestration.attempt.status).toBe(BillingAttemptStatus.CAPTURED);
    expect(orchestration.attempt.cardcomTransactionId).toBe('tx-original');
    expect(orchestration.obligation.status).toBe(BillingObligationStatus.OPEN);
    expect(orchestration.calls).not.toContain('finalize');
    expect(receipts.ensureReceiptForCapturedAttempt).not.toHaveBeenCalled();
    expect(sub.status).toBe(SubscriptionStatus.PAST_DUE);
    expect(sub.renewalAttempts).toBe(3); // retry state untouched
    expect(sub.gracePeriodEndsAt).toEqual(new Date('2026-09-15'));
    expect(orchestration.attempt.leaseOwner).toBeNull(); // retryable at once

    expect(failuresOf(rows)).toHaveLength(1);
    expect(failuresOf(rows)[0]).toEqual(
      expect.objectContaining({
        billingAttemptId: 44,
        metadata: expect.objectContaining({
          phase: 'POST_CAPTURE_RECOVERY',
          failureCategory: 'ACTIVATION_FAILED',
        }),
      }),
    );
    const everything = JSON.stringify([status, rows]);
    expect(everything).not.toContain('abc123SECRET');
    expect(everything).not.toContain('4111111111111111');
  });

  it('a later local retry activates the subscription once and completes the remaining post-capture work', async () => {
    const {
      service,
      orchestration,
      dataSource,
      receipts,
      rows,
      params,
      sub,
      updates,
    } = build();
    dataSource.transaction.mockRejectedValueOnce(new Error('db down'));
    await service.completeCapturedHostedAttempt(params);

    const status = await service.completeCapturedHostedAttempt(params);

    expect(status).toBe('COMPLETED');
    expect(updates.count).toBe(1);
    const periodEnd = billingBoundary('2026-10-01');
    expect(updates.values[0]).toEqual({
      status: SubscriptionStatus.ACTIVE,
      planId: PLAN.id,
      currentPeriodStart: billingBoundary('2026-09-01'),
      currentPeriodEnd: periodEnd,
      nextBillingDate: periodEnd,
      renewalAttempts: 0,
      gracePeriodEndsAt: null,
      canceledAt: null,
      endedAt: null,
      billingAnchorDay: 1,
    });
    expect(sub.paymentMethodId).toBe(5); // untouched: no token is available locally
    expect(orchestration.calls.filter((c) => c === 'finalize')).toHaveLength(1);
    expect(orchestration.attempt.status).toBe(BillingAttemptStatus.COMPLETED);
    expect(orchestration.obligation.status).toBe(
      BillingObligationStatus.SATISFIED,
    );
    expect(receipts.ensureReceiptForCapturedAttempt).toHaveBeenCalledTimes(1);
    expect(
      rows.filter(
        (r) => r.eventType === BillingEventType.SUBSCRIPTION_ACTIVATED,
      ),
    ).toEqual([
      expect.objectContaining({
        billingAttemptId: 44,
        metadata: expect.objectContaining({
          recoveredLocally: true,
          cardTokenStored: false,
        }),
      }),
    ]);
  });

  it('feeds the receipt step the captured snapshot, the ORIGINAL transaction id and the activated period', async () => {
    const { service, receipts, params } = build();

    await service.completeCapturedHostedAttempt(params);

    const periodEnd = billingBoundary('2026-10-01');
    expect(receipts.ensureReceiptForCapturedAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: BillingEventType.PAYMENT_SUCCESS,
        attempt: {
          id: 44,
          amountAgorot: 11700,
          amountBeforeVatAgorot: 10000,
          vatAmountAgorot: 1700,
          currency: 'ILS',
          cardcomTransactionId: 'tx-original',
        },
        planName: 'Plan',
        periodStart: billingBoundary('2026-09-01'),
        periodEnd,
      }),
    );
  });

  it('activation completes BEFORE the receipt and the attempt is completed only after both', async () => {
    const { service, orchestration, receipts, updates, params } = build();
    const order: string[] = [];
    const original = orchestration.finalizeCapturedAttempt.bind(orchestration);
    orchestration.finalizeCapturedAttempt = async (id: number, doc: number) => {
      order.push(`finalize(after activation=${updates.count})`);
      return original(id, doc);
    };
    receipts.ensureReceiptForCapturedAttempt.mockImplementation(async () => {
      order.push(`receipt(after activation=${updates.count})`);
      return { receiptDocId: 99 };
    });

    await service.completeCapturedHostedAttempt(params);

    expect(order).toEqual([
      'receipt(after activation=1)',
      'finalize(after activation=1)',
    ]);
  });

  it('a receipt/journal or event-link failure after activation keeps the attempt CAPTURED; the retry does not re-activate', async () => {
    const { service, orchestration, receipts, updates, rows, params } = build();
    receipts.ensureReceiptForCapturedAttempt
      .mockRejectedValueOnce(
        new Error('Failed to link the receipt to its billing event'),
      )
      .mockRejectedValueOnce(
        new Error('Failed to link the receipt to its billing event'),
      )
      .mockResolvedValueOnce({ receiptDocId: 99 });

    const first = await service.completeCapturedHostedAttempt(params);
    const second = await service.completeCapturedHostedAttempt(params);
    expect(first).toBe('RECEIPT_PENDING');
    expect(second).toBe('RECEIPT_PENDING');
    expect(orchestration.attempt.status).toBe(BillingAttemptStatus.CAPTURED);
    expect(orchestration.calls).not.toContain('finalize');

    const third = await service.completeCapturedHostedAttempt(params);

    expect(third).toBe('COMPLETED');
    expect(updates.count).toBe(1); // activated exactly once across all three runs
    expect(receipts.ensureReceiptForCapturedAttempt).toHaveBeenCalledTimes(3);
    expect(orchestration.calls.filter((c) => c === 'finalize')).toHaveLength(1);
    // Two failed retries, one failure record.
    expect(failuresOf(rows)).toHaveLength(1);
    expect(failuresOf(rows)[0].metadata.failureCategory).toBe(
      'RECEIPT_STEP_FAILED',
    );
  });

  it('a confirmed recovery resets the retry state but keeps the recovered period, next billing date and payment method', async () => {
    const { service, sub, updates, params } = build();

    await service.completeCapturedHostedAttempt(params);

    const periodEnd = billingBoundary('2026-10-01');
    expect(sub.status).toBe(SubscriptionStatus.ACTIVE);
    expect(sub.renewalAttempts).toBe(0);
    expect(sub.gracePeriodEndsAt).toBeNull();
    expect(sub.currentPeriodStart).toEqual(billingBoundary('2026-09-01'));
    expect(sub.currentPeriodEnd).toEqual(periodEnd);
    expect(sub.nextBillingDate).toEqual(periodEnd);
    expect(sub.paymentMethodId).toBe(5);
    expect(updates.count).toBe(1);
  });

  it('an already-active subscription is an idempotent no-op for activation; receipt and completion still run', async () => {
    const {
      service,
      sub,
      updates,
      receipts,
      orchestration,
      params,
      dataSource,
    } = build();
    sub.status = SubscriptionStatus.ACTIVE; // first delivery's transaction had succeeded
    sub.currentPeriodStart = new Date('2026-09-10T11:50:03.000Z');
    sub.renewalAttempts = 1; // a later cycle's decline: a replay must not reset it

    const status = await service.completeCapturedHostedAttempt(params);

    expect(status).toBe('COMPLETED');
    expect(updates.count).toBe(0);
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(sub.currentPeriodStart).toEqual(
      new Date('2026-09-10T11:50:03.000Z'),
    ); // not overwritten
    expect(sub.renewalAttempts).toBe(1);
    expect(receipts.ensureReceiptForCapturedAttempt).toHaveBeenCalledTimes(1);
    expect(orchestration.attempt.status).toBe(BillingAttemptStatus.COMPLETED);
  });

  it('repeating after completion is a no-op: no activation, receipt or second completion', async () => {
    const { service, updates, receipts, orchestration, params } = build();
    await service.completeCapturedHostedAttempt(params);

    const again = await service.completeCapturedHostedAttempt(params);
    const andAgain = await service.completeCapturedHostedAttempt(params);

    expect(again).toBe('ALREADY_COMPLETED');
    expect(andAgain).toBe('ALREADY_COMPLETED');
    expect(updates.count).toBe(1);
    expect(receipts.ensureReceiptForCapturedAttempt).toHaveBeenCalledTimes(1);
    expect(orchestration.calls.filter((c) => c === 'finalize')).toHaveLength(1);
  });

  it('concurrent runs activate exactly once and complete once (lease + row lock)', async () => {
    const { service, orchestration, updates, receipts, params } = build();

    const statuses = await Promise.all([
      service.completeCapturedHostedAttempt(params),
      service.completeCapturedHostedAttempt(params),
      service.completeCapturedHostedAttempt(params),
    ]);

    expect(statuses.filter((s) => s === 'COMPLETED')).toHaveLength(1);
    expect(updates.count).toBe(1);
    expect(receipts.ensureReceiptForCapturedAttempt).toHaveBeenCalledTimes(1);
    expect(orchestration.calls.filter((c) => c === 'finalize')).toHaveLength(1);
  });

  it('even if the lease were lost, the row lock still lets only one activation write through', async () => {
    const { service, orchestration, updates, params } = build();
    // Every run "wins" the lease (e.g. an expired lease): only the lock protects activation.
    orchestration.claimForFinalization = async () =>
      ({
        claimed: true,
        attempt: orchestration.attempt,
      } as any);

    await Promise.all([
      service.completeCapturedHostedAttempt(params),
      service.completeCapturedHostedAttempt(params),
    ]);

    expect(updates.count).toBe(1);
  });

  it('never overwrites a subscription that is neither PAST_DUE nor ACTIVE, and leaves the attempt CAPTURED', async () => {
    const { service, sub, updates, receipts, orchestration, rows, params } =
      build();
    sub.status = SubscriptionStatus.TRIAL_EXPIRED;

    const status = await service.completeCapturedHostedAttempt(params);

    expect(status).toBe('RECEIPT_PENDING');
    expect(updates.count).toBe(0);
    expect(sub.status).toBe(SubscriptionStatus.TRIAL_EXPIRED);
    expect(sub.renewalAttempts).toBe(3);
    expect(receipts.ensureReceiptForCapturedAttempt).not.toHaveBeenCalled();
    expect(orchestration.attempt.status).toBe(BillingAttemptStatus.CAPTURED);
    expect(failuresOf(rows)[0].metadata.failureCategory).toBe(
      'ACTIVATION_FAILED',
    );
  });

  it('does not activate for another owner, and never touches the attempt', async () => {
    const { service, updates, orchestration, params } = build();

    await expect(
      service.completeCapturedHostedAttempt({
        ...params,
        firebaseId: 'someone-else',
      }),
    ).rejects.toThrow('forbidden');

    expect(updates.count).toBe(0);
    expect(orchestration.attempt.status).toBe(BillingAttemptStatus.CAPTURED);
  });

  it('defers (without recording a failure) while the original webhook may still be storing the card token', async () => {
    const { service, orchestration, updates, receipts, rows, params } = build();
    orchestration.attempt.capturedAt = new Date(NOW.getTime() - 30_000); // 30 s ago

    const status = await service.completeCapturedHostedAttempt(params);

    expect(status).toBe('RECEIPT_PENDING');
    expect(updates.count).toBe(0);
    expect(receipts.ensureReceiptForCapturedAttempt).not.toHaveBeenCalled();
    expect(failuresOf(rows)).toHaveLength(0);
    expect(orchestration.attempt.status).toBe(BillingAttemptStatus.CAPTURED);
    expect(orchestration.attempt.leaseOwner).toBeNull();
  });

  it('does not defer an already-active subscription just because the capture is recent (first delivery)', async () => {
    const { service, orchestration, sub, updates, params } = build();
    orchestration.attempt.capturedAt = new Date(NOW.getTime() - 5_000);
    sub.status = SubscriptionStatus.ACTIVE;

    const status = await service.completeCapturedHostedAttempt(params);

    expect(status).toBe('COMPLETED');
    expect(updates.count).toBe(0);
  });

  describe('card-token recovery from a lookup-only LowProfile result (Task 5A1)', () => {
    const RAW_TOKEN = 'tok-11111111-2222-3333-4444-555555555555';
    const returnValue = (overrides: Record<string, unknown> = {}) =>
      JSON.stringify({
        intent: 'CHECKOUT',
        firebaseId: 'owner',
        planId: PLAN.id,
        subscriptionId: 9,
        billingAttemptId: 44,
        ...overrides,
      });
    const lpResult = (overrides: Record<string, unknown> = {}): any => ({
      ResponseCode: 0,
      LowProfileId: 'lp-44',
      TranzactionId: 'tx-original',
      ReturnValue: returnValue(),
      TokenInfo: { Token: RAW_TOKEN, CardMonth: 11, CardYear: 2030 },
      TranzactionInfo: {
        ResponseCode: 0,
        TranzactionId: 'tx-original',
        Amount: 117,
        Last4CardDigitsString: '4242',
        Brand: 'VISA',
      },
      ...overrides,
    });
    // Any charge/checkout entry point would be a lookup-only violation.
    const cardcomWith = (impl: jest.Mock) => ({
      getLowProfileResult: impl,
      chargeByToken: jest.fn(),
      createLowProfileCheckout: jest.fn(),
    });
    const activatedMetadata = (rows: any[]) =>
      rows.find((r) => r.eventType === BillingEventType.SUBSCRIPTION_ACTIVATED)
        .metadata;

    beforeAll(() => {
      process.env.BILLING_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString(
        'base64',
      );
    });

    it('stores the initial purchase card from the verified webhook without another provider lookup', async () => {
      const cardcom = cardcomWith(jest.fn());
      const f = build(cardcom);
      f.orchestration.obligation.kind = BillingObligationKind.CHECKOUT;
      f.orchestration.attempt.capturedAt = NOW;
      Object.assign(f.sub, { status: SubscriptionStatus.TRIAL_EXPIRED,
        currentPeriodStart: null, currentPeriodEnd: null });
      expect(await f.service.completeCapturedHostedAttempt({ ...f.params, verifiedResult: lpResult() })).toBe('COMPLETED');
      expect(decryptCardcomToken(f.pm.cardcomToken)).toBe(RAW_TOKEN);
      expect(cardcom.getLowProfileResult).not.toHaveBeenCalled();
      expect(cardcom.chargeByToken).not.toHaveBeenCalled();
      expect(cardcom.createLowProfileCheckout).not.toHaveBeenCalled();
      expect(JSON.stringify(f.rows)).not.toContain(RAW_TOKEN);
    });

    it('stores a verified matching token encrypted, with last-four/expiry metadata, and never records it in events', async () => {
      const cardcom = cardcomWith(jest.fn().mockResolvedValue(lpResult()));
      const { service, pm, rows, params } = build(cardcom);

      const status = await service.completeCapturedHostedAttempt(params);

      expect(status).toBe('COMPLETED');
      expect(cardcom.getLowProfileResult).toHaveBeenCalledTimes(1);
      expect(cardcom.getLowProfileResult).toHaveBeenCalledWith('lp-44');
      expect(pm.cardcomToken).not.toBe(RAW_TOKEN);
      expect(decryptCardcomToken(pm.cardcomToken)).toBe(RAW_TOKEN);
      expect(pm).toEqual(
        expect.objectContaining({
          last4: '4242',
          cardBrand: 'VISA',
          cardExpiryMonth: 11,
          cardExpiryYear: 2030,
        }),
      );
      expect(activatedMetadata(rows).cardTokenStored).toBe(true);
      expect(JSON.stringify(rows)).not.toContain(RAW_TOKEN);
    });

    it('a transaction, amount or ReturnValue mismatch never stores the token; activation, receipt and completion still finish', async () => {
      const mismatches: Array<[Record<string, unknown>, string]> = [
        [{ TranzactionId: 'tx-other' }, 'TRANSACTION_MISMATCH'],
        [
          {
            TranzactionInfo: {
              ResponseCode: 0,
              TranzactionId: 'tx-original',
              Amount: 1,
              Last4CardDigitsString: '4242',
            },
          },
          'AMOUNT_MISMATCH',
        ],
        [
          { ReturnValue: returnValue({ firebaseId: 'someone-else' }) },
          'RETURN_VALUE_MISMATCH',
        ],
        [
          { ReturnValue: returnValue({ billingAttemptId: 45 }) },
          'RETURN_VALUE_MISMATCH',
        ],
      ];
      for (const [override, reason] of mismatches) {
        const cardcom = cardcomWith(
          jest.fn().mockResolvedValue(lpResult(override)),
        );
        const { service, pm, created, rows, orchestration, params } =
          build(cardcom);

        expect(await service.completeCapturedHostedAttempt(params)).toBe(
          'COMPLETED',
        );

        expect(orchestration.attempt.status).toBe(
          BillingAttemptStatus.COMPLETED,
        );
        expect(pm.cardcomToken).toBe('old-encrypted');
        expect(created).toHaveLength(0);
        expect(activatedMetadata(rows)).toEqual(
          expect.objectContaining({
            cardTokenStored: false,
            tokenRecoveryReason: reason,
          }),
        );
        expect(JSON.stringify(rows)).not.toContain(RAW_TOKEN);
      }
    });

    it('never overwrites a payment method that changed after the attempt opened', async () => {
      const cardcom = cardcomWith(jest.fn().mockResolvedValue(lpResult()));
      const { service, pm, rows, params } = build(cardcom);
      pm.cardcomToken = 'customer-newer-card';
      pm.updatedAt = new Date('2026-09-10T11:30:00.000Z'); // after the attempt opened

      expect(await service.completeCapturedHostedAttempt(params)).toBe(
        'COMPLETED',
      );

      expect(pm.cardcomToken).toBe('customer-newer-card');
      expect(pm.last4).toBe('0000');
      expect(activatedMetadata(rows)).toEqual(
        expect.objectContaining({
          cardTokenStored: false,
          tokenRecoveryReason: 'PAYMENT_METHOD_NEWER',
        }),
      );
    });

    it('a missing LowProfile id, failed lookup, missing token or malformed response still finishes local post-capture work and never charges', async () => {
      const scenarios: Array<[string, (a: any, attempt: any) => void]> = [
        [
          'NO_LOW_PROFILE_ID',
          (_a, attempt) => (attempt.cardcomLowProfileId = null),
        ],
        [
          'LOOKUP_FAILED',
          (a) =>
            a.getLowProfileResult.mockRejectedValue(
              new Error('timeout token=SECRET'),
            ),
        ],
        [
          'NO_TOKEN',
          (a) =>
            a.getLowProfileResult.mockResolvedValue(
              lpResult({ TokenInfo: undefined }),
            ),
        ],
        [
          'MALFORMED_RESULT',
          (a) => a.getLowProfileResult.mockResolvedValue('<html>'),
        ],
      ];
      for (const [reason, arrange] of scenarios) {
        const cardcom = cardcomWith(jest.fn());
        const { service, pm, rows, orchestration, receipts, params } =
          build(cardcom);
        arrange(cardcom, orchestration.attempt);

        expect(await service.completeCapturedHostedAttempt(params)).toBe(
          'COMPLETED',
        );

        expect(orchestration.attempt.status).toBe(
          BillingAttemptStatus.COMPLETED,
        );
        expect(receipts.ensureReceiptForCapturedAttempt).toHaveBeenCalledTimes(
          1,
        );
        expect(pm.cardcomToken).toBe('old-encrypted');
        expect(activatedMetadata(rows)).toEqual(
          expect.objectContaining({
            cardTokenStored: false,
            tokenRecoveryReason: reason,
          }),
        );
        expect(cardcom.chargeByToken).not.toHaveBeenCalled();
        expect(cardcom.createLowProfileCheckout).not.toHaveBeenCalled();
        expect(JSON.stringify(rows)).not.toContain('SECRET');
      }
    });

    it('a repeated recovery is idempotent: one lookup, one token write and no provider charge', async () => {
      const cardcom = cardcomWith(jest.fn().mockResolvedValue(lpResult()));
      const { service, manager, orchestration, pm, rows, params } =
        build(cardcom);
      expect(await service.completeCapturedHostedAttempt(params)).toBe(
        'COMPLETED',
      );
      const savedToken = pm.cardcomToken;
      orchestration.attempt.status = BillingAttemptStatus.CAPTURED; // re-run as if finalization was lost

      expect(await service.completeCapturedHostedAttempt(params)).toBe(
        'COMPLETED',
      );

      expect(cardcom.getLowProfileResult).toHaveBeenCalledTimes(1);
      expect(manager.save).toHaveBeenCalledTimes(1);
      expect(pm.cardcomToken).toBe(savedToken);
      expect(
        rows.filter(
          (r) => r.eventType === BillingEventType.SUBSCRIPTION_ACTIVATED,
        ),
      ).toHaveLength(1);
      expect(cardcom.chargeByToken).not.toHaveBeenCalled();
      expect(cardcom.createLowProfileCheckout).not.toHaveBeenCalled();
    });
  });

  describe('token crash window: attempt still CAPTURED but the subscription is already ACTIVE (Task 5A2)', () => {
    const RAW_TOKEN = 'tok-11111111-2222-3333-4444-555555555555';
    const lookupResult = {
      ResponseCode: 0,
      LowProfileId: 'lp-44',
      TranzactionId: 'tx-original',
      ReturnValue: JSON.stringify({
        intent: 'CHECKOUT',
        firebaseId: 'owner',
        planId: PLAN.id,
        subscriptionId: 9,
        billingAttemptId: 44,
      }),
      TokenInfo: { Token: RAW_TOKEN, CardMonth: 11, CardYear: 2030 },
      TranzactionInfo: {
        ResponseCode: 0,
        TranzactionId: 'tx-original',
        Amount: 117,
        Last4CardDigitsString: '4242',
        Brand: 'VISA',
      },
    };
    beforeAll(() => {
      process.env.BILLING_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString(
        'base64',
      );
    });

    it.each([
      [
        'finishes the missing token storage exactly once',
        () => undefined,
        true,
      ],
      [
        'never overwrites a payment method changed after the attempt opened',
        (pm: any) => {
          pm.cardcomToken = 'customer-newer-card';
          pm.updatedAt = new Date('2026-09-10T11:30:00.000Z');
        },
        false,
      ],
    ])(
      'a crash after activation: %s, and receipt/completion still finish',
      async (_name, arrange, stored) => {
        const cardcom = {
          getLowProfileResult: jest.fn().mockResolvedValue(lookupResult),
          chargeByToken: jest.fn(),
          createLowProfileCheckout: jest.fn(),
        };
        const {
          service,
          sub,
          pm,
          rows,
          updates,
          orchestration,
          receipts,
          params,
        } = build(cardcom);
        sub.status = SubscriptionStatus.ACTIVE; // activated by the run that crashed
        arrange(pm);

        expect(await service.completeCapturedHostedAttempt(params)).toBe(
          'COMPLETED',
        );

        expect(cardcom.getLowProfileResult).toHaveBeenCalledTimes(1);
        expect(updates.count).toBe(0); // no second activation
        expect(receipts.ensureReceiptForCapturedAttempt).toHaveBeenCalledTimes(
          1,
        );
        const activated = rows.filter(
          (r) => r.eventType === BillingEventType.SUBSCRIPTION_ACTIVATED,
        );
        expect(activated).toHaveLength(1);
        expect(activated[0].metadata.cardTokenStored).toBe(stored);
        if (stored) {
          expect(decryptCardcomToken(pm.cardcomToken)).toBe(RAW_TOKEN);
          expect(pm.last4).toBe('4242');
        } else {
          expect(pm.cardcomToken).toBe('customer-newer-card');
          expect(activated[0].metadata.tokenRecoveryReason).toBe(
            'PAYMENT_METHOD_NEWER',
          );
        }
        expect(JSON.stringify(rows)).not.toContain(RAW_TOKEN);

        if (stored) {
          // Success is remembered: a re-run neither looks up nor stores again.
          orchestration.attempt.status = BillingAttemptStatus.CAPTURED;
          await service.completeCapturedHostedAttempt(params);
          expect(cardcom.getLowProfileResult).toHaveBeenCalledTimes(1);
        }
        expect(cardcom.chargeByToken).not.toHaveBeenCalled();
        expect(cardcom.createLowProfileCheckout).not.toHaveBeenCalled();
      },
    );
  });

  describe('recovery sweep (no provider, no webhook)', () => {
    it('completes a stuck hosted capture from local state alone, using the grace cut-off', async () => {
      const { service, orchestration, updates, params } = build();
      void params;

      const summary = await service.recoverCapturedHostedAttempts(NOW);

      expect(summary).toEqual({ found: 1, completed: 1, pending: 0 });
      expect(orchestration.lastCutoff).toEqual(
        new Date(NOW.getTime() - 5 * 60_000),
      );
      expect(orchestration.attempt.status).toBe(BillingAttemptStatus.COMPLETED);
      expect(updates.count).toBe(1);
    });

    it('a repeated sweep afterwards does nothing more', async () => {
      const { service, updates, receipts } = build();
      await service.recoverCapturedHostedAttempts(NOW);

      const again = await service.recoverCapturedHostedAttempts(NOW);

      expect(again).toEqual({ found: 1, completed: 1, pending: 0 }); // ALREADY_COMPLETED counts as done
      expect(updates.count).toBe(1);
      expect(receipts.ensureReceiptForCapturedAttempt).toHaveBeenCalledTimes(1);
    });

    it('counts a still-failing attempt as pending and keeps sweeping the rest', async () => {
      const { service, orchestration, dataSource } = build();
      orchestration.listed = [
        { attemptId: 44, subscriptionId: 9, firebaseId: 'owner' },
        { attemptId: 44, subscriptionId: 9, firebaseId: 'someone-else' }, // throws (owner mismatch)
      ];
      dataSource.transaction.mockRejectedValueOnce(new Error('db down'));

      const summary = await service.recoverCapturedHostedAttempts(NOW);

      expect(summary).toEqual({ found: 2, completed: 0, pending: 2 });
    });

    it('never throws when the listing itself fails', async () => {
      const { service, orchestration } = build();
      orchestration.listError = new Error('db down');

      await expect(service.recoverCapturedHostedAttempts(NOW)).resolves.toEqual(
        {
          found: 0,
          completed: 0,
          pending: 0,
        },
      );
    });

    it('handles nothing stuck', async () => {
      const { service, orchestration } = build();
      orchestration.listed = [];

      await expect(service.recoverCapturedHostedAttempts(NOW)).resolves.toEqual(
        {
          found: 0,
          completed: 0,
          pending: 0,
        },
      );
    });
  });
});
