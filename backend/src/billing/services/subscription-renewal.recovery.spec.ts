import { ConflictException } from '@nestjs/common';
import {
  BillingAttemptStatus,
  BillingEventType,
  BillingObligationStatus,
  SubscriptionStatus,
} from '../enums/billing.enums';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { assertBillingOwnerMutation } from './billing-attempt-orchestration.service';
import { BillingLifecycleService } from './billing-lifecycle.service';
import { BillingProviderRuntimeService } from './billing-provider-runtime.service';
import { BillingEventService } from './billing-event.service';
import { SubscriptionRenewalService } from './subscription-renewal.service';

/**
 * KT-038 Task 3 — end to end (no DB, no network): the REAL lifecycle and
 * provider runtime run over an in-memory fake of the orchestration state
 * machine and a mock CardCom executor. Proves a captured charge whose receipt
 * failed is completed later WITHOUT another provider call, exactly once.
 */
describe('SubscriptionRenewalService — CAPTURED attempt recovery', () => {
  const DUE = new Date('2026-09-01T00:00:00.000Z');
  const NEXT = new Date('2026-10-01T00:00:00.000Z');

  /** Minimal in-memory model of obligation + attempt with the real state rules. */
  class FakeOrchestration {
    obligation: any = null;
    attempt: any = null;
    calls: string[] = [];

    assertOwnerMutation = assertBillingOwnerMutation;

    async findPeriodSnapshot() {
      if (!this.obligation) return null;
      const attempt =
        this.obligation.satisfiedAttemptId != null ||
        this.obligation.activeAttemptId != null
          ? this.attempt
          : null;
      return { obligation: this.obligation, attempt };
    }

    async createOrGetAttempt(input: any) {
      this.calls.push('createOrGetAttempt');
      if (!this.obligation) {
        this.obligation = {
          id: 1,
          status: BillingObligationStatus.OPEN,
          firebaseIdSnapshot: input.actor.subjectFirebaseId,
          planId: input.planId,
          amountAgorot: input.amountAgorot,
          amountBeforeVatAgorot: input.amountBeforeVatAgorot,
          vatAmountAgorot: input.vatAmountAgorot,
          activeAttemptId: null,
          satisfiedAttemptId: null,
        };
      }
      if (this.obligation.status !== BillingObligationStatus.OPEN) {
        throw new ConflictException('obligation not open');
      }
      if (this.obligation.amountAgorot !== input.amountAgorot) {
        throw new ConflictException(
          'Canonical billing obligation does not match the requested debt snapshot',
        );
      }
      if (this.attempt) {
        return {
          obligation: this.obligation,
          attempt: this.attempt,
          created: false,
        };
      }
      this.attempt = {
        id: 21,
        status: BillingAttemptStatus.CREATED,
        stateVersion: 0,
        leaseOwner: null,
        leaseExpiresAt: null,
        cardcomTransactionId: null,
        providerTerminalRef: null,
        providerResponseCode: null,
        paymentMethodId: 5,
        cardcomExternalUniqTranId: 'bKEY',
        amountAgorot: input.amountAgorot,
        amountBeforeVatAgorot: input.amountBeforeVatAgorot,
        vatAmountAgorot: input.vatAmountAgorot,
        currency: 'ILS',
        planId: input.planId,
      };
      this.obligation.activeAttemptId = 21;
      return {
        obligation: this.obligation,
        attempt: this.attempt,
        created: true,
      };
    }

    async claimForSubmission(_id: number, owner: string, version: number) {
      const a = this.attempt;
      if (
        a.status !== BillingAttemptStatus.CREATED ||
        a.stateVersion !== version
      ) {
        return { claimed: false, attempt: a, reason: 'NOT_CLAIMABLE' };
      }
      a.status = BillingAttemptStatus.PROCESSING;
      a.leaseOwner = owner;
      a.leaseExpiresAt = new Date(Date.now() + 30_000);
      a.stateVersion += 1;
      return { claimed: true, attempt: a };
    }

    async applyNormalizedOutcome(
      _id: number,
      _owner: string,
      _v: number,
      outcome: any,
    ) {
      const a = this.attempt;
      if (outcome.kind === 'CAPTURED') {
        a.status = BillingAttemptStatus.CAPTURED;
        a.cardcomTransactionId = outcome.cardcomTransactionId;
        a.providerTerminalRef = outcome.providerTerminalRef ?? null;
        a.providerResponseCode = outcome.providerResponseCode ?? null;
      } else if (outcome.kind === 'DECLINED') {
        a.status = BillingAttemptStatus.DECLINED;
      } else {
        a.status = BillingAttemptStatus.UNKNOWN;
      }
      a.leaseOwner = null;
      a.leaseExpiresAt = null;
      a.stateVersion += 1;
      return a;
    }

    async claimForFinalization(_id: number, owner: string, subject: string) {
      this.calls.push('claimForFinalization');
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
      this.calls.push('finalizeCapturedAttempt');
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
  }

  const PLAN = { id: 3, name: 'Plan' };

  function build(pricingAmount = 11700) {
    const orchestration = new FakeOrchestration();
    const executor = {
      executeCharge: jest.fn().mockResolvedValue({
        success: true,
        responseCode: 0,
        transactionId: 'tx-original',
        terminalRef: 'terminal-9',
      }),
      reconcileCharge: jest.fn(),
    };
    const runtime = new BillingProviderRuntimeService(
      orchestration as any,
      executor as any,
    );
    const lifecycle = new BillingLifecycleService(
      orchestration as any,
      runtime,
    );

    const subscription: any = {
      id: 7,
      firebaseId: 'owner-1',
      status: SubscriptionStatus.ACTIVE,
      planId: PLAN.id,
      nextBillingDate: DUE,
      renewalAttempts: 2,
    };
    const advances = { count: 0 };
    const dueRows = { list: [] as Array<{ id: number }> };
    const subscriptionRepo = {
      find: jest.fn(async () => dueRows.list),
      findOne: jest.fn(async () => ({ ...subscription })),
      // Compare-and-set, as the database would do it.
      update: jest.fn(async (criteria: any, values: any) => {
        if (
          criteria.status !== subscription.status ||
          criteria.nextBillingDate.getTime() !==
            subscription.nextBillingDate.getTime()
        ) {
          return { affected: 0 };
        }
        Object.assign(subscription, values);
        advances.count += 1;
        return { affected: 1 };
      }),
      manager: {
        findOne: jest.fn(async (entity: unknown) =>
          entity === SubscriptionPlan ? PLAN : null,
        ),
      },
    };
    const pricing = { current: pricingAmount };
    const pricingService = {
      calculateCheckoutPrice: jest.fn(async () => ({
        finalAmountAgorot: pricing.current,
        amountBeforeVatAgorot: Math.round(pricing.current / 1.17),
        vatAmountAgorot: pricing.current - Math.round(pricing.current / 1.17),
      })),
    };
    const billingReceiptService = {
      ensureReceiptForCapturedAttempt: jest
        .fn()
        .mockResolvedValue({ receiptDocId: 99 }),
    };
    // Real event service over an in-memory table, so once-per-attempt failure
    // recording is exercised for real.
    const eventRows: any[] = [];
    const eventRepo = {
      create: jest.fn((v) => v),
      save: jest.fn(async (v) => {
        const row = { id: eventRows.length + 1, createdAt: new Date(), ...v };
        eventRows.push(row);
        return row;
      }),
      findOne: jest.fn(
        async ({ where }: any) =>
          eventRows.find((r) =>
            Object.entries(where).every(([k, v]) => r[k] === v),
          ) ?? null,
      ),
    };
    const billingEventService = new BillingEventService(eventRepo as any);
    const billingIssuerConfigService = {
      getKeepintaxIssuer: jest
        .fn()
        .mockResolvedValue({ issuerName: 'Keepintax' }),
    };
    const hostedCompletion = {
      recoverCapturedHostedAttempts: jest
        .fn()
        .mockResolvedValue({ found: 0, completed: 0, pending: 0 }),
    };
    const service = new SubscriptionRenewalService(
      subscriptionRepo as any,
      {} as any,
      billingEventService as any,
      billingReceiptService as any,
      billingIssuerConfigService as any,
      pricingService as any,
      lifecycle,
      {} as any,
      hostedCompletion as any,
    );
    return {
      hostedCompletion,
      eventRows,
      dueRows,
      service,
      orchestration,
      executor,
      subscription,
      advances,
      subscriptionRepo,
      pricing,
      pricingService,
      billingReceiptService,
      billingEventService,
    };
  }

  // Freeze only the wall clock; promises and setImmediate keep running normally.
  beforeEach(() => {
    jest.useFakeTimers({
      now: new Date('2026-09-02T00:00:00.000Z'),
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

  it('initial capture succeeds, receipt fails: the attempt stays CAPTURED and the period does not advance', async () => {
    const {
      service,
      orchestration,
      executor,
      subscription,
      billingReceiptService,
      eventRows,
    } = build();
    billingReceiptService.ensureReceiptForCapturedAttempt.mockRejectedValueOnce(
      new Error('journal failed token=4111111111111111 ApiName=secret-api-key'),
    );

    const result = await service.processSubscriptionById(7);

    expect(executor.executeCharge).toHaveBeenCalledTimes(1);
    expect(result.outcome).toBe('blocked_pending_receipt');
    expect(orchestration.attempt.status).toBe(BillingAttemptStatus.CAPTURED);
    expect(orchestration.attempt.cardcomTransactionId).toBe('tx-original');
    expect(subscription.nextBillingDate).toEqual(DUE);
    expect(orchestration.obligation.status).toBe(BillingObligationStatus.OPEN);

    // Failure is reported (not swallowed), sanitized, and correlated to the attempt.
    expect(eventRows).toEqual([
      expect.objectContaining({
        eventType: BillingEventType.RECEIPT_FAILED,
        billingAttemptId: 21,
        metadata: expect.objectContaining({
          phase: 'POST_CAPTURE_RECOVERY',
          failureCategory: 'RECEIPT_STEP_FAILED',
        }),
      }),
    ]);
    const everything = JSON.stringify([result, eventRows]);
    expect(everything).not.toContain('4111111111111111');
    expect(everything).not.toContain('secret-api-key');
  });

  it('a later run retries receipt/finalization WITHOUT the provider, completes once and advances nextBillingDate once — even if the price drifted', async () => {
    const {
      service,
      orchestration,
      executor,
      subscription,
      pricing,
      pricingService,
      billingReceiptService,
    } = build();
    billingReceiptService.ensureReceiptForCapturedAttempt.mockRejectedValueOnce(
      new Error('receipt failed'),
    );
    await service.processSubscriptionById(7);
    pricing.current = 9900; // discount removed / plan repriced since the capture
    pricingService.calculateCheckoutPrice.mockClear();

    const retry = await service.processSubscriptionById(7);

    expect(retry.outcome).toBe('success');
    expect(executor.executeCharge).toHaveBeenCalledTimes(1);
    expect(pricingService.calculateCheckoutPrice).not.toHaveBeenCalled();
    expect(orchestration.attempt.status).toBe(BillingAttemptStatus.COMPLETED);
    expect(orchestration.obligation.status).toBe(
      BillingObligationStatus.SATISFIED,
    );
    expect(subscription.nextBillingDate).toEqual(NEXT);
    expect(subscription.renewalAttempts).toBe(0);
    expect(
      orchestration.calls.filter((c) => c === 'finalizeCapturedAttempt'),
    ).toHaveLength(1);

    // The receipt step used the captured snapshot (11700), never the drifted price.
    expect(
      billingReceiptService.ensureReceiptForCapturedAttempt,
    ).toHaveBeenLastCalledWith(
      expect.objectContaining({
        eventType: BillingEventType.RENEWAL_SUCCESS,
        attempt: expect.objectContaining({
          id: 21,
          amountAgorot: 11700,
          cardcomTransactionId: 'tx-original',
        }),
      }),
    );
  });

  it('repeating the recovery after success is a no-op (no charge, no receipt, no second advance)', async () => {
    const {
      service,
      executor,
      subscription,
      subscriptionRepo,
      billingReceiptService,
    } = build();
    billingReceiptService.ensureReceiptForCapturedAttempt.mockRejectedValueOnce(
      new Error('x'),
    );
    await service.processSubscriptionById(7);
    await service.processSubscriptionById(7); // completes
    const updatesAfterSuccess = subscriptionRepo.update.mock.calls.length;
    const receiptCallsAfterSuccess =
      billingReceiptService.ensureReceiptForCapturedAttempt.mock.calls.length;

    const again = await service.processSubscriptionById(7);
    const andAgain = await service.processSubscriptionById(7);

    expect(again.outcome).toBe('skipped');
    expect(andAgain.outcome).toBe('skipped');
    expect(executor.executeCharge).toHaveBeenCalledTimes(1);
    expect(subscriptionRepo.update.mock.calls.length).toBe(updatesAfterSuccess);
    expect(
      billingReceiptService.ensureReceiptForCapturedAttempt.mock.calls.length,
    ).toBe(receiptCallsAfterSuccess);
    expect(subscription.nextBillingDate).toEqual(NEXT);
  });

  it('a second receipt failure leaves the attempt recoverable, and the third run completes it', async () => {
    const {
      service,
      orchestration,
      executor,
      subscription,
      billingReceiptService,
      eventRows,
    } = build();
    billingReceiptService.ensureReceiptForCapturedAttempt
      .mockRejectedValueOnce(new Error('first'))
      .mockRejectedValueOnce(new Error('second'));

    const first = await service.processSubscriptionById(7);
    const second = await service.processSubscriptionById(7);
    expect(first.outcome).toBe('blocked_pending_receipt');
    expect(second.outcome).toBe('blocked_pending_receipt');
    expect(orchestration.attempt.status).toBe(BillingAttemptStatus.CAPTURED);
    expect(orchestration.attempt.leaseOwner).toBeNull(); // released, retryable at once

    const third = await service.processSubscriptionById(7);

    expect(third.outcome).toBe('success');
    expect(executor.executeCharge).toHaveBeenCalledTimes(1);
    expect(subscription.nextBillingDate).toEqual(NEXT);
    // Two failed retries of the same attempt leave ONE failure record.
    const failures = eventRows.filter(
      (e) => e.eventType === BillingEventType.RECEIPT_FAILED,
    );
    expect(failures).toHaveLength(1);
  });

  it('concurrent recovery runs cannot duplicate receipt work, lifecycle completion or subscription advancement', async () => {
    const {
      service,
      orchestration,
      executor,
      subscription,
      advances,
      billingReceiptService,
    } = build();
    billingReceiptService.ensureReceiptForCapturedAttempt.mockRejectedValueOnce(
      new Error('x'),
    );
    await service.processSubscriptionById(7); // leaves a CAPTURED attempt
    billingReceiptService.ensureReceiptForCapturedAttempt.mockClear();
    billingReceiptService.ensureReceiptForCapturedAttempt.mockImplementation(
      async () => {
        await new Promise((resolve) => setImmediate(resolve)); // slow receipt work
        return { receiptDocId: 99 };
      },
    );

    const results = await Promise.all([
      service.processSubscriptionById(7),
      service.processSubscriptionById(7),
      service.processSubscriptionById(7),
    ]);

    expect(results.filter((r) => r.outcome === 'success')).toHaveLength(1);
    expect(results.filter((r) => r.outcome === 'skipped')).toHaveLength(2);
    expect(
      billingReceiptService.ensureReceiptForCapturedAttempt,
    ).toHaveBeenCalledTimes(1);
    expect(
      orchestration.calls.filter((c) => c === 'finalizeCapturedAttempt'),
    ).toHaveLength(1);
    expect(executor.executeCharge).toHaveBeenCalledTimes(1);
    expect(subscription.nextBillingDate).toEqual(NEXT);
    expect(advances.count).toBe(1); // the period advanced exactly once
  });

  it('recovers a period that was finalized but whose subscription advance never happened, without a charge or receipt', async () => {
    const {
      service,
      orchestration,
      executor,
      subscription,
      billingReceiptService,
    } = build();
    // State left by a crash between finalization and the subscription update.
    orchestration.obligation = {
      id: 1,
      status: BillingObligationStatus.SATISFIED,
      firebaseIdSnapshot: 'owner-1',
      planId: PLAN.id,
      amountAgorot: 11700,
      amountBeforeVatAgorot: 10000,
      vatAmountAgorot: 1700,
      activeAttemptId: null,
      satisfiedAttemptId: 21,
    };
    orchestration.attempt = { id: 21, status: BillingAttemptStatus.COMPLETED };

    const result = await service.processSubscriptionById(7);

    expect(result.outcome).toBe('success');
    expect(subscription.nextBillingDate).toEqual(NEXT);
    expect(executor.executeCharge).not.toHaveBeenCalled();
    expect(
      billingReceiptService.ensureReceiptForCapturedAttempt,
    ).not.toHaveBeenCalled();
    expect(orchestration.calls).not.toContain('createOrGetAttempt');
  });

  it('a lost compare-and-set (someone already advanced the period) is a skip, not a second advance', async () => {
    const { service, subscription, subscriptionRepo } = build();
    subscriptionRepo.update.mockImplementationOnce(async () => {
      subscription.nextBillingDate = NEXT; // another run advanced it first
      return { affected: 0 };
    });

    const result = await service.processSubscriptionById(7);

    expect(result.outcome).toBe('skipped');
    expect(subscription.nextBillingDate).toEqual(NEXT);
  });

  it('a subscription that is not yet due is skipped before anything is opened or charged', async () => {
    const { service, subscription, orchestration, executor } = build();
    subscription.nextBillingDate = NEXT;

    const result = await service.processSubscriptionById(7);

    expect(result.outcome).toBe('skipped');
    expect(orchestration.calls).toHaveLength(0);
    expect(executor.executeCharge).not.toHaveBeenCalled();
  });

  // KT-038 Task 3B: the existing renewal sweep (03:00 cron and the admin manual
  // trigger share processDueRenewals) is the reliable local caller that finishes
  // hosted captures whose activation or receipt/link failed, with no webhook and
  // no provider involved.
  describe('captured hosted payment recovery sweep', () => {
    it('runs after the renewal batch even when nothing is due', async () => {
      const { service, hostedCompletion, executor, dueRows } = build();
      dueRows.list = [];

      const batch = await service.processDueRenewals();

      expect(batch.totalDue).toBe(0);
      expect(
        hostedCompletion.recoverCapturedHostedAttempts,
      ).toHaveBeenCalledTimes(1);
      expect(executor.executeCharge).not.toHaveBeenCalled();
    });

    it('runs alongside due renewals without changing their result', async () => {
      const { service, hostedCompletion, dueRows } = build();
      dueRows.list = [{ id: 7 }];
      hostedCompletion.recoverCapturedHostedAttempts.mockResolvedValue({
        found: 2,
        completed: 1,
        pending: 1,
      });

      const batch = await service.processDueRenewals();

      expect(batch.totalDue).toBe(1);
      expect(batch.succeeded).toBe(1);
      expect(
        hostedCompletion.recoverCapturedHostedAttempts,
      ).toHaveBeenCalledTimes(1);
      // The admin response shape is unchanged (no new fields).
      expect(Object.keys(batch).sort()).toEqual(
        [
          'blockedPendingReceipt',
          'errors',
          'pastDue',
          'processed',
          'results',
          'retryScheduled',
          'skipped',
          'succeeded',
          'totalDue',
        ].sort(),
      );
    });

    it('a failing sweep can never fail the renewal batch', async () => {
      const { service, hostedCompletion, dueRows } = build();
      dueRows.list = [{ id: 7 }];
      hostedCompletion.recoverCapturedHostedAttempts.mockRejectedValue(
        new Error('db down token=abc123SECRET'),
      );

      await expect(service.processDueRenewals()).resolves.toEqual(
        expect.objectContaining({ totalDue: 1, succeeded: 1, errors: 0 }),
      );
    });
  });
});
