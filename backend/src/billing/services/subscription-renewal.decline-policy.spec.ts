import { LessThanOrEqual } from 'typeorm';
import {
  BillingAttemptStatus,
  BillingAttemptTrigger,
  BillingChargeMode,
  BillingEventType,
  BillingObligationKind,
  BillingObligationStatus,
  SubscriptionStatus,
} from '../enums/billing.enums';
import { BillingAttempt } from '../entities/billing-attempt.entity';
import { BillingObligation } from '../entities/billing-obligation.entity';
import { PaymentMethod } from '../entities/payment-method.entity';
import { Subscription } from '../entities/subscription.entity';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import {
  BillingAttemptOrchestrationService,
  BillingRenewalDeferredError,
} from './billing-attempt-orchestration.service';
import { BillingEventService } from './billing-event.service';
import { BillingLifecycleService } from './billing-lifecycle.service';
import { BillingProviderRuntimeService } from './billing-provider-runtime.service';
import { SubscriptionRenewalService } from './subscription-renewal.service';

/**
 * KT-038 Task 4B — the bounded renewal-decline policy, end to end (no MySQL, no
 * network). The REAL orchestration, provider runtime, lifecycle and renewal
 * service run over an in-memory database that emulates per-row pessimistic
 * locks, with a mocked CardCom executor. Only the executor is mocked, so every
 * assertion about "no provider call" is a real call count.
 */

// ── In-memory database with row locks ────────────────────────────────────────

type EntityClass = new () => any;

class MemoryDb {
  private tables = new Map<EntityClass, any[]>();
  private sequences = new Map<EntityClass, number>();
  private locks = new Map<
    string,
    { owner: number | null; queue: Array<{ tx: number; resolve: () => void }> }
  >();
  private txCounter = 0;

  rows(entity: EntityClass): any[] {
    let table = this.tables.get(entity);
    if (!table) {
      table = [];
      this.tables.set(entity, table);
    }
    return table;
  }

  seed(entity: EntityClass, values: Record<string, any>): any {
    const row = Object.assign(new entity(), values);
    if (row.id == null) row.id = this.nextId(entity);
    this.rows(entity).push(row);
    return row;
  }

  private nextId(entity: EntityClass): number {
    const next = (this.sequences.get(entity) ?? 100) + 1;
    this.sequences.set(entity, next);
    return next;
  }

  private matches(row: any, where: Record<string, any>): boolean {
    return Object.entries(where).every(([key, value]) =>
      value instanceof Date
        ? row[key] instanceof Date && row[key].getTime() === value.getTime()
        : row[key] === value,
    );
  }

  private clone(entity: EntityClass, row: any): any {
    return Object.assign(new entity(), row);
  }

  private async acquire(key: string, tx: number): Promise<void> {
    let lock = this.locks.get(key);
    if (!lock) {
      lock = { owner: null, queue: [] };
      this.locks.set(key, lock);
    }
    if (lock.owner === tx) return;
    if (lock.owner === null) {
      lock.owner = tx;
      return;
    }
    const held = lock;
    await new Promise<void>((resolve) => held.queue.push({ tx, resolve }));
  }

  private releaseAll(tx: number): void {
    for (const lock of this.locks.values()) {
      if (lock.owner !== tx) continue;
      const next = lock.queue.shift();
      lock.owner = next ? next.tx : null;
      next?.resolve();
    }
  }

  createQueryRunner() {
    const tx = ++this.txCounter;
    const manager = {
      findOne: async (entity: EntityClass, options: any) => {
        const find = () => {
          const found = this.rows(entity).filter((row) =>
            this.matches(row, options.where),
          );
          if (options.order?.attemptNumber === 'DESC') {
            found.sort((a, b) => b.attemptNumber - a.attemptNumber);
          }
          return found[0] ?? null;
        };
        const first = find();
        if (first && options.lock) {
          await this.acquire(`${entity.name}:${first.id}`, tx);
        }
        const row = options.lock ? find() : first;
        return row ? this.clone(entity, row) : null;
      },
      create: (entity: EntityClass, value: any) =>
        Object.assign(new entity(), value),
      save: async (entity: EntityClass, value: any) => {
        if (value.id == null) value.id = this.nextId(entity);
        const table = this.rows(entity);
        const index = table.findIndex((row) => row.id === value.id);
        const stored = this.clone(entity, value);
        if (index === -1) table.push(stored);
        else table[index] = stored;
        return value;
      },
      update: async (entity: EntityClass, id: number, values: any) => {
        const row = this.rows(entity).find((r) => r.id === id);
        if (row) Object.assign(row, values);
        return { affected: row ? 1 : 0 };
      },
    };
    return {
      manager,
      connect: async () => undefined,
      startTransaction: async () => undefined,
      commitTransaction: async () => this.releaseAll(tx),
      rollbackTransaction: async () => this.releaseAll(tx),
      release: async () => this.releaseAll(tx),
    };
  }
}

// ── Fixture ──────────────────────────────────────────────────────────────────

const DUE = new Date('2026-09-01T00:00:00.000Z');
const DAY0 = new Date('2026-09-01T03:00:00.000Z'); // first cron after DUE
const PLAN = { id: 3, name: 'Plan' };

const plusDays = (from: Date, days: number): Date => {
  const result = new Date(from);
  result.setDate(result.getDate() + days);
  return result;
};
const plusMonth = (from: Date): Date => {
  const result = new Date(from);
  result.setMonth(result.getMonth() + 1);
  return result;
};

const DECLINE = {
  success: false,
  responseCode: 51,
  transactionId: null,
  failureCategory: 'PROVIDER_DECLINED',
};
const CAPTURE = {
  success: true,
  responseCode: 0,
  transactionId: 'tx-retry',
  terminalRef: 'terminal-9',
};

function build() {
  const db = new MemoryDb();
  const dataSource = { createQueryRunner: () => db.createQueryRunner() };
  let keySequence = 0;
  const orchestration = new BillingAttemptOrchestrationService(
    dataSource as any,
    () => `bKEY${++keySequence}`,
  );
  const createOrGetAttemptSpy = jest.spyOn(orchestration, 'createOrGetAttempt');

  const executor = {
    executeCharge: jest.fn().mockResolvedValue(DECLINE),
    reconcileCharge: jest.fn(),
  };
  const runtime = new BillingProviderRuntimeService(
    orchestration,
    executor as any,
  );
  const lifecycle = new BillingLifecycleService(orchestration, runtime);

  const subscription = db.seed(Subscription, {
    id: 7,
    firebaseId: 'owner-1',
    status: SubscriptionStatus.ACTIVE,
    planId: PLAN.id,
    paymentMethodId: 5,
    currentPeriodStart: new Date('2026-08-01T00:00:00.000Z'),
    currentPeriodEnd: DUE,
    nextBillingDate: DUE,
    renewalAttempts: 0,
    gracePeriodEndsAt: null,
  });
  db.seed(PaymentMethod, { id: 5, firebaseId: 'owner-1' });

  const advances = { count: 0 };
  const subscriptionRepo = {
    find: jest.fn(async ({ where }: any) =>
      db
        .rows(Subscription)
        .filter(
          (row) =>
            row.status === where.status &&
            row.nextBillingDate &&
            row.nextBillingDate.getTime() <=
              (where.nextBillingDate as any).value.getTime(),
        )
        .map((row) => ({ id: row.id })),
    ),
    findOne: jest.fn(async ({ where }: any) => {
      const row = db.rows(Subscription).find((r) => r.id === where.id);
      return row ? Object.assign(new Subscription(), row) : null;
    }),
    // Compare-and-set, as the database would do it.
    update: jest.fn(async (criteria: any, values: any) => {
      const row = db.rows(Subscription).find((r) => r.id === criteria.id);
      if (
        !row ||
        row.status !== criteria.status ||
        row.nextBillingDate?.getTime() !== criteria.nextBillingDate?.getTime()
      ) {
        return { affected: 0 };
      }
      Object.assign(row, values);
      advances.count += 1;
      return { affected: 1 };
    }),
    manager: {
      findOne: jest.fn(async (entity: unknown) =>
        entity === SubscriptionPlan ? PLAN : null,
      ),
    },
  };

  const pricing = { current: 11700 };
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
  const hostedCompletion = {
    recoverCapturedHostedAttempts: jest
      .fn()
      .mockResolvedValue({ found: 0, completed: 0, pending: 0 }),
  };
  const service = new SubscriptionRenewalService(
    subscriptionRepo as any,
    {} as any,
    new BillingEventService(eventRepo as any) as any,
    billingReceiptService as any,
    {
      getKeepintaxIssuer: jest.fn().mockResolvedValue({ issuerName: 'K' }),
    } as any,
    pricingService as any,
    lifecycle,
    {} as any,
    hostedCompletion as any,
  );

  return {
    db,
    service,
    orchestration,
    createOrGetAttemptSpy,
    executor,
    subscription,
    advances,
    pricing,
    pricingService,
    eventRows,
    subscriptionRepo,
    billingReceiptService,
  };
}

/** Seeds an in-flight token-renewal attempt (and its canonical obligation). */
function seedAttempt(
  db: MemoryDb,
  status: BillingAttemptStatus,
  overrides: Record<string, any> = {},
) {
  const obligation = db.seed(BillingObligation, {
    id: 1,
    subscriptionId: 7,
    firebaseIdSnapshot: 'owner-1',
    obligationKey: 'subscription:7:period:2026-09-01',
    kind: BillingObligationKind.RECURRING_PERIOD,
    status: BillingObligationStatus.OPEN,
    planId: PLAN.id,
    periodStart: '2026-09-01',
    periodEnd: '2026-10-01',
    amountAgorot: 11700,
    amountBeforeVatAgorot: 10000,
    vatAmountAgorot: 1700,
    currency: 'ILS',
    activeAttemptId: 21,
    satisfiedAttemptId: null,
    version: 0,
    satisfiedAt: null,
  });
  const attempt = db.seed(BillingAttempt, {
    id: 21,
    obligationId: 1,
    attemptNumber: 1,
    trigger: BillingAttemptTrigger.RENEWAL,
    chargeMode: BillingChargeMode.TOKEN_TRANSACTION,
    status,
    paymentMethodId: 5,
    cardcomExternalUniqTranId: 'bSEEDED',
    planId: PLAN.id,
    amountAgorot: 11700,
    amountBeforeVatAgorot: 10000,
    vatAmountAgorot: 1700,
    currency: 'ILS',
    leaseOwner: null,
    leaseExpiresAt: null,
    stateVersion: 3,
    nextActionAt: null,
    unknownSince: null,
    reconciliationAttempts: 0,
    ...overrides,
  });
  return { obligation, attempt };
}

describe('SubscriptionRenewalService — bounded renewal-decline policy', () => {
  // Freeze only the wall clock; promises and setImmediate keep running.
  const at = (date: Date) => jest.setSystemTime(date);
  beforeEach(() => {
    jest.useFakeTimers({
      now: DAY0,
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

  const eventsOf = (rows: any[], type: BillingEventType) =>
    rows.filter((row) => row.eventType === type);

  describe('confirmed declines', () => {
    it('1st decline schedules the first retry (+3 days), keeps the subscription ACTIVE and the period unchanged', async () => {
      const { service, executor, subscription, db, eventRows } = build();

      const result = await service.processSubscriptionById(7);

      expect(executor.executeCharge).toHaveBeenCalledTimes(1);
      expect(result.outcome).toBe('retry_scheduled');
      expect(result.attemptNumber).toBe(1);
      expect(subscription.status).toBe(SubscriptionStatus.ACTIVE);
      expect(subscription.renewalAttempts).toBe(1);
      expect(subscription.nextBillingDate).toEqual(plusDays(DAY0, 3));
      // The billing period itself is untouched: only the retry date moved.
      expect(subscription.currentPeriodEnd).toEqual(DUE);
      expect(result.nextBillingDate).toEqual(plusDays(DAY0, 3));
      expect(db.rows(BillingAttempt)[0].status).toBe(
        BillingAttemptStatus.DECLINED,
      );
      expect(
        eventsOf(eventRows, BillingEventType.RETRY_SCHEDULED),
      ).toHaveLength(1);
      expect(eventRows[0].metadata).toEqual(
        expect.objectContaining({
          attemptNumber: 1,
          maxAttempts: 3,
          cardcomResponseCode: 51,
          retryScheduledFor: plusDays(DAY0, 3).toISOString(),
        }),
      );
    });

    it('the daily cron before the retry date performs no provider call and no writes', async () => {
      const {
        service,
        executor,
        subscription,
        db,
        createOrGetAttemptSpy,
        subscriptionRepo,
      } = build();
      await service.processSubscriptionById(7); // 1st decline
      executor.executeCharge.mockClear();
      createOrGetAttemptSpy.mockClear();
      const updatesBefore = subscriptionRepo.update.mock.calls.length;
      const snapshot = JSON.stringify(subscription);
      const attemptRows = db.rows(BillingAttempt).length;

      for (const day of [1, 2]) {
        at(plusDays(DAY0, day));
        const batch = await service.processDueRenewals();
        expect(batch.totalDue).toBe(0); // not even selected
        // Even a forced/stale call is a no-op skip, before anything is opened.
        const forced = await service.processSubscriptionById(7);
        expect(forced.outcome).toBe('skipped');
      }
      at(new Date(plusDays(DAY0, 3).getTime() - 1)); // 1 ms before the retry
      expect((await service.processSubscriptionById(7)).outcome).toBe(
        'skipped',
      );

      expect(executor.executeCharge).not.toHaveBeenCalled();
      expect(createOrGetAttemptSpy).not.toHaveBeenCalled();
      expect(subscriptionRepo.update.mock.calls.length).toBe(updatesBefore);
      expect(JSON.stringify(subscription)).toBe(snapshot);
      expect(db.rows(BillingAttempt)).toHaveLength(attemptRows);
    });

    it('runs the full 3 / 7 day schedule, goes PAST_DUE exactly once, and never charges again', async () => {
      const {
        service,
        executor,
        subscription,
        db,
        eventRows,
        createOrGetAttemptSpy,
      } = build();

      // Attempt 1 — first cron after the due date.
      expect((await service.processDueRenewals()).retryScheduled).toBe(1);
      const retry1At = plusDays(DAY0, 3);
      expect(subscription.nextBillingDate).toEqual(retry1At);

      // Attempt 2 — only when the first retry date is due (+3 days).
      at(retry1At);
      const second = await service.processDueRenewals();
      expect(second.totalDue).toBe(1);
      expect(second.retryScheduled).toBe(1);
      expect(executor.executeCharge).toHaveBeenCalledTimes(2);
      const retry2At = plusDays(retry1At, 7);
      expect(subscription.renewalAttempts).toBe(2);
      expect(subscription.nextBillingDate).toEqual(retry2At);
      expect(subscription.status).toBe(SubscriptionStatus.ACTIVE);

      // Not before the second retry date (+7 days).
      at(new Date(retry2At.getTime() - 1));
      expect((await service.processDueRenewals()).totalDue).toBe(0);
      expect(executor.executeCharge).toHaveBeenCalledTimes(2);

      // Attempt 3 — the final allowed confirmed decline.
      at(retry2At);
      const third = await service.processDueRenewals();
      expect(third.pastDue).toBe(1);
      expect(executor.executeCharge).toHaveBeenCalledTimes(3);
      expect(subscription.status).toBe(SubscriptionStatus.PAST_DUE);
      expect(subscription.renewalAttempts).toBe(3);
      expect(subscription.gracePeriodEndsAt).toEqual(plusDays(retry2At, 14));

      // Exactly one PAST_DUE transition (one RENEWAL_FAILED event).
      expect(eventsOf(eventRows, BillingEventType.RENEWAL_FAILED)).toHaveLength(
        1,
      );
      expect(
        eventsOf(eventRows, BillingEventType.RETRY_SCHEDULED),
      ).toHaveLength(2);

      // Every later daily cron and forced run: no token charge, no new attempt.
      createOrGetAttemptSpy.mockClear();
      for (let day = 1; day <= 40; day += 1) {
        at(plusDays(retry2At, day));
        expect((await service.processDueRenewals()).totalDue).toBe(0);
        expect((await service.processSubscriptionById(7)).outcome).toBe(
          'skipped',
        );
      }
      expect(executor.executeCharge).toHaveBeenCalledTimes(3); // hard bound
      expect(createOrGetAttemptSpy).not.toHaveBeenCalled();
      expect(subscription.status).toBe(SubscriptionStatus.PAST_DUE);
      expect(eventsOf(eventRows, BillingEventType.RENEWAL_FAILED)).toHaveLength(
        1,
      );

      // All retries stayed on the SAME billing period / canonical obligation.
      const obligations = db.rows(BillingObligation);
      const attempts = db.rows(BillingAttempt);
      expect(obligations).toHaveLength(1);
      expect(obligations[0].periodStart).toBe('2026-09-01');
      expect(obligations[0].obligationKey).toBe(
        'subscription:7:period:2026-09-01',
      );
      expect(obligations[0].status).toBe(BillingObligationStatus.OPEN);
      expect(obligations[0].activeAttemptId).toBeNull();
      expect(attempts.map((a) => a.attemptNumber)).toEqual([1, 2, 3]);
      expect(attempts.every((a) => a.obligationId === obligations[0].id)).toBe(
        true,
      );
      expect(
        attempts.every((a) => a.status === BillingAttemptStatus.DECLINED),
      ).toBe(true);
      // Each attempt has its own immutable provider key; a retry never reuses one.
      expect(
        new Set(attempts.map((a) => a.cardcomExternalUniqTranId)).size,
      ).toBe(3);
    });

    it('a retry is not re-priced: a drifted price cannot strand the retries on a snapshot conflict', async () => {
      const { service, executor, pricing, pricingService } = build();
      await service.processSubscriptionById(7); // 1st decline at 117.00
      pricing.current = 9900; // discount removed / plan repriced since
      pricingService.calculateCheckoutPrice.mockClear();
      executor.executeCharge.mockResolvedValue(CAPTURE);

      at(plusDays(DAY0, 3));
      const retry = await service.processSubscriptionById(7);

      expect(retry.outcome).toBe('success');
      expect(pricingService.calculateCheckoutPrice).not.toHaveBeenCalled();
      expect(executor.executeCharge).toHaveBeenLastCalledWith(
        expect.objectContaining({ amountAgorot: 11700 }),
      );
    });

    it('a stale renewalAttempts counter (e.g. after PAST_DUE recovery) still allows only ONE more charge before PAST_DUE', async () => {
      const { service, executor, subscription } = build();
      subscription.renewalAttempts = 3; // recovery activation does not reset it

      const result = await service.processSubscriptionById(7);

      expect(executor.executeCharge).toHaveBeenCalledTimes(1);
      expect(result.outcome).toBe('past_due');
      expect(subscription.status).toBe(SubscriptionStatus.PAST_DUE);
      at(plusDays(DAY0, 1));
      expect((await service.processSubscriptionById(7)).outcome).toBe(
        'skipped',
      );
      expect(executor.executeCharge).toHaveBeenCalledTimes(1);
    });
  });

  describe('successful retry', () => {
    it('completes the SAME obligation, advances the period once from the original due date and resets the retry state', async () => {
      const {
        service,
        executor,
        subscription,
        db,
        advances,
        billingReceiptService,
      } = build();
      await service.processSubscriptionById(7); // 1st decline
      expect(subscription.renewalAttempts).toBe(1);
      executor.executeCharge.mockResolvedValue(CAPTURE);
      at(plusDays(DAY0, 3));

      const retry = await service.processSubscriptionById(7);

      expect(retry.outcome).toBe('success');
      expect(executor.executeCharge).toHaveBeenCalledTimes(2);
      const obligations = db.rows(BillingObligation);
      const attempts = db.rows(BillingAttempt);
      expect(obligations).toHaveLength(1);
      expect(obligations[0].status).toBe(BillingObligationStatus.SATISFIED);
      expect(obligations[0].satisfiedAttemptId).toBe(attempts[1].id);
      expect(attempts.map((a) => a.status)).toEqual([
        BillingAttemptStatus.DECLINED,
        BillingAttemptStatus.COMPLETED,
      ]);
      expect(attempts[1].cardcomTransactionId).toBe('tx-retry');
      // Receipt/finalization still ran through the shared post-capture path.
      expect(
        billingReceiptService.ensureReceiptForCapturedAttempt,
      ).toHaveBeenCalledTimes(1);
      // The period advanced exactly once, from the ORIGINAL due date (no drift).
      expect(advances.count).toBe(1);
      expect(subscription.currentPeriodStart).toEqual(DUE);
      expect(subscription.currentPeriodEnd).toEqual(plusMonth(DUE));
      expect(subscription.nextBillingDate).toEqual(plusMonth(DUE));
      expect(subscription.renewalAttempts).toBe(0);
      expect(subscription.gracePeriodEndsAt).toBeNull();
      expect(subscription.status).toBe(SubscriptionStatus.ACTIVE);

      // Repeating the cron the next day is a no-op.
      at(plusDays(DAY0, 4));
      expect((await service.processSubscriptionById(7)).outcome).toBe(
        'skipped',
      );
      expect(executor.executeCharge).toHaveBeenCalledTimes(2);
      expect(advances.count).toBe(1);
    });
  });

  describe('uncertain outcomes never enter the decline policy and are never replayed', () => {
    const uncertain: Array<[string, () => any]> = [
      [
        'transport failure / timeout',
        () => Promise.reject(new Error('ETIMEDOUT')),
      ],
      [
        'malformed provider response',
        () => Promise.resolve({ responseCode: 'not-a-number' }),
      ],
      [
        'success without a transaction id',
        () => Promise.resolve({ success: true, responseCode: 0 }),
      ],
      [
        'conflicting success flag and response code',
        () => Promise.resolve({ success: false, responseCode: 0 }),
      ],
      ['empty response', () => Promise.resolve({})],
    ];

    it.each(uncertain)(
      '%s → UNKNOWN: no retry schedule, no PAST_DUE, and the next cron does not call the provider',
      async (_name, respond) => {
        const { service, executor, subscription, db, eventRows } = build();
        executor.executeCharge.mockImplementation(respond);

        const first = await service.processSubscriptionById(7);

        expect(first.outcome).toBe('error');
        expect(executor.executeCharge).toHaveBeenCalledTimes(1);
        expect(db.rows(BillingAttempt)[0].status).toBe(
          BillingAttemptStatus.UNKNOWN,
        );
        // Decline-policy state is untouched.
        expect(subscription.status).toBe(SubscriptionStatus.ACTIVE);
        expect(subscription.renewalAttempts).toBe(0);
        expect(subscription.nextBillingDate).toEqual(DUE);
        expect(subscription.gracePeriodEndsAt).toBeNull();
        expect(
          eventsOf(eventRows, BillingEventType.RETRY_SCHEDULED),
        ).toHaveLength(0);
        expect(
          eventsOf(eventRows, BillingEventType.RENEWAL_FAILED),
        ).toHaveLength(0);

        // The subscription stays due, so every daily cron revisits it — and
        // must never replay the charge or open a second attempt.
        for (let day = 1; day <= 10; day += 1) {
          at(plusDays(DAY0, day));
          const revisit = await service.processSubscriptionById(7);
          expect(revisit.outcome).toBe('skipped');
        }
        expect(executor.executeCharge).toHaveBeenCalledTimes(1);
        expect(db.rows(BillingAttempt)).toHaveLength(1);
        expect(subscription.renewalAttempts).toBe(0);
        expect(subscription.status).toBe(SubscriptionStatus.ACTIVE);
      },
    );

    it('an expired PROCESSING lease becomes UNKNOWN (never CREATED, never a decline) and is not replayed', async () => {
      const { service, executor, subscription, db } = build();
      seedAttempt(db, BillingAttemptStatus.PROCESSING, {
        leaseOwner: 'crashed-worker',
        leaseExpiresAt: new Date(DAY0.getTime() - 60_000),
        submittedAt: new Date(DAY0.getTime() - 90_000),
      });

      const result = await service.processSubscriptionById(7);

      expect(result.outcome).toBe('skipped');
      expect(executor.executeCharge).not.toHaveBeenCalled();
      const attempt = db.rows(BillingAttempt)[0];
      expect(attempt.status).toBe(BillingAttemptStatus.UNKNOWN);
      expect(attempt.leaseOwner).toBeNull();
      expect(db.rows(BillingAttempt)).toHaveLength(1);
      expect(subscription.renewalAttempts).toBe(0);
      expect(subscription.status).toBe(SubscriptionStatus.ACTIVE);
      expect(subscription.nextBillingDate).toEqual(DUE);

      at(plusDays(DAY0, 1));
      await service.processSubscriptionById(7);
      expect(executor.executeCharge).not.toHaveBeenCalled();
    });

    it('a live PROCESSING lease, UNKNOWN and MANUAL_REVIEW attempts are never submitted', async () => {
      for (const [status, overrides] of [
        [
          BillingAttemptStatus.PROCESSING,
          {
            leaseOwner: 'other-worker',
            leaseExpiresAt: new Date(DAY0.getTime() + 30_000),
          },
        ],
        [BillingAttemptStatus.UNKNOWN, { unknownSince: DAY0 }],
        [BillingAttemptStatus.MANUAL_REVIEW, { unknownSince: DAY0 }],
      ] as Array<[BillingAttemptStatus, Record<string, any>]>) {
        const { service, executor, subscription, db } = build();
        seedAttempt(db, status, overrides);

        const result = await service.processSubscriptionById(7);

        expect(result.outcome).toBe('skipped');
        expect(executor.executeCharge).not.toHaveBeenCalled();
        expect(db.rows(BillingAttempt)).toHaveLength(1);
        expect(subscription.renewalAttempts).toBe(0);
        expect(subscription.status).toBe(SubscriptionStatus.ACTIVE);
      }
    });
  });

  describe('concurrency', () => {
    it('two concurrent cron runs consume the first attempt once', async () => {
      const { service, executor, subscription, db, eventRows } = build();
      executor.executeCharge.mockImplementation(async () => {
        await new Promise((resolve) => setImmediate(resolve)); // slow provider
        return DECLINE;
      });

      const results = await Promise.all([
        service.processSubscriptionById(7),
        service.processSubscriptionById(7),
        service.processSubscriptionById(7),
      ]);

      expect(executor.executeCharge).toHaveBeenCalledTimes(1);
      expect(
        results.filter((r) => r.outcome === 'retry_scheduled'),
      ).toHaveLength(1);
      expect(db.rows(BillingAttempt)).toHaveLength(1);
      expect(subscription.renewalAttempts).toBe(1);
      expect(subscription.nextBillingDate).toEqual(plusDays(DAY0, 3));
      expect(
        eventsOf(eventRows, BillingEventType.RETRY_SCHEDULED),
      ).toHaveLength(1);
    });

    it('two concurrent cron runs on the retry day consume that retry once (never two, never the next one)', async () => {
      const { service, executor, subscription, db } = build();
      await service.processSubscriptionById(7); // attempt 1 declined
      executor.executeCharge.mockClear();
      executor.executeCharge.mockImplementation(async () => {
        await new Promise((resolve) => setImmediate(resolve));
        return DECLINE;
      });
      at(plusDays(DAY0, 3));

      await Promise.all([
        service.processSubscriptionById(7),
        service.processSubscriptionById(7),
      ]);

      expect(executor.executeCharge).toHaveBeenCalledTimes(1);
      expect(db.rows(BillingAttempt)).toHaveLength(2);
      expect(subscription.renewalAttempts).toBe(2);
      expect(subscription.status).toBe(SubscriptionStatus.ACTIVE);
      expect(subscription.nextBillingDate).toEqual(
        plusDays(plusDays(DAY0, 3), 7),
      );
    });

    it('a run holding a STALE read cannot open the next attempt after another run already declined: the authoritative gate re-checks under the lock', async () => {
      const { service, executor, orchestration, db } = build();
      await service.processSubscriptionById(7); // attempt 1 declined, retry in 3 days
      executor.executeCharge.mockClear();

      // What a slow cron run would still hold from before the decline.
      const staleOpen = () =>
        orchestration.createOrGetAttempt({
          actor: { actorFirebaseId: 'owner-1', subjectFirebaseId: 'owner-1' },
          subscriptionId: 7,
          kind: BillingObligationKind.RECURRING_PERIOD,
          trigger: BillingAttemptTrigger.RENEWAL,
          chargeMode: BillingChargeMode.TOKEN_TRANSACTION,
          planId: PLAN.id,
          periodStart: '2026-09-01',
          periodEnd: '2026-10-01',
          amountAgorot: 11700,
          amountBeforeVatAgorot: 10000,
          vatAmountAgorot: 1700,
          enforceRenewalSchedule: true,
        });

      await expect(staleOpen()).rejects.toEqual(
        expect.objectContaining({
          name: 'BillingRenewalDeferredError',
          reason: 'NOT_DUE',
        }),
      );
      expect(db.rows(BillingAttempt)).toHaveLength(1);
      expect(executor.executeCharge).not.toHaveBeenCalled();
    });
  });

  describe('gate and policy boundaries', () => {
    const input = (overrides: Record<string, any> = {}) => ({
      actor: { actorFirebaseId: 'owner-1', subjectFirebaseId: 'owner-1' },
      subscriptionId: 7,
      kind: BillingObligationKind.RECURRING_PERIOD,
      trigger: BillingAttemptTrigger.RENEWAL,
      chargeMode: BillingChargeMode.TOKEN_TRANSACTION,
      planId: PLAN.id,
      periodStart: '2026-09-01',
      periodEnd: '2026-10-01',
      amountAgorot: 11700,
      amountBeforeVatAgorot: 10000,
      vatAmountAgorot: 1700,
      enforceRenewalSchedule: true,
      ...overrides,
    });

    it('the gate rejects a non-ACTIVE subscription, a period mismatch and a not-yet-due date without persisting anything', async () => {
      const { orchestration, subscription, db } = build();

      subscription.status = SubscriptionStatus.PAST_DUE;
      await expect(orchestration.createOrGetAttempt(input())).rejects.toEqual(
        expect.objectContaining({ reason: 'NOT_ACTIVE' }),
      );
      subscription.status = SubscriptionStatus.ACTIVE;

      await expect(
        orchestration.createOrGetAttempt(
          input({ periodStart: '2026-09-15', periodEnd: '2026-10-15' }),
        ),
      ).rejects.toEqual(expect.objectContaining({ reason: 'PERIOD_MISMATCH' }));

      subscription.nextBillingDate = plusDays(DAY0, 1);
      await expect(
        orchestration.createOrGetAttempt(input()),
      ).rejects.toBeInstanceOf(BillingRenewalDeferredError);
      expect(db.rows(BillingObligation)).toHaveLength(0);
      expect(db.rows(BillingAttempt)).toHaveLength(0);
    });

    it('without the opt-in flag the opener is unchanged (hosted recovery and other callers keep their behaviour)', async () => {
      const { orchestration, subscription, db } = build();
      subscription.nextBillingDate = plusDays(DAY0, 30); // would be NOT_DUE if gated

      const opened = await orchestration.createOrGetAttempt(
        input({ enforceRenewalSchedule: undefined }),
      );

      expect(opened.created).toBe(true);
      expect(db.rows(BillingAttempt)).toHaveLength(1);
    });

    it('the decline policy never rewrites a CANCELED subscription, a hosted attempt, or an attempt of another period', async () => {
      const cases: Array<[string, (ctx: ReturnType<typeof build>) => void]> = [
        [
          'CANCELED subscription',
          ({ subscription }) => {
            subscription.status = SubscriptionStatus.CANCELED;
          },
        ],
        [
          'hosted attempt',
          ({ db }) => {
            db.rows(BillingAttempt)[0].chargeMode =
              BillingChargeMode.LOW_PROFILE_HOSTED;
            db.rows(BillingAttempt)[0].trigger = BillingAttemptTrigger.RECOVERY;
          },
        ],
        [
          'attempt of a different period',
          ({ db }) => {
            db.rows(BillingObligation)[0].periodStart = '2026-08-01';
          },
        ],
      ];
      for (const [, mutate] of cases) {
        const ctx = build();
        seedAttempt(ctx.db, BillingAttemptStatus.PROCESSING, {
          leaseOwner: 'w',
          leaseExpiresAt: new Date(DAY0.getTime() + 30_000),
        });
        mutate(ctx);
        const before = {
          status: ctx.subscription.status,
          renewalAttempts: ctx.subscription.renewalAttempts,
          nextBillingDate: ctx.subscription.nextBillingDate,
        };

        await ctx.orchestration.applyNormalizedOutcome(
          21,
          'w',
          3,
          { kind: 'DECLINED', providerResponseCode: 51 },
          DAY0,
          { renewalDeclinePolicy: true },
        );

        expect({
          status: ctx.subscription.status,
          renewalAttempts: ctx.subscription.renewalAttempts,
          nextBillingDate: ctx.subscription.nextBillingDate,
        }).toEqual(before);
        expect(ctx.db.rows(BillingAttempt)[0].status).toBe(
          BillingAttemptStatus.DECLINED,
        );
      }
    });

    it('UNKNOWN through the policy-enabled path never touches the subscription', async () => {
      const ctx = build();
      seedAttempt(ctx.db, BillingAttemptStatus.PROCESSING, {
        leaseOwner: 'w',
        leaseExpiresAt: new Date(DAY0.getTime() + 30_000),
      });

      await ctx.orchestration.applyNormalizedOutcome(
        21,
        'w',
        3,
        { kind: 'UNKNOWN', failureCategory: 'TRANSPORT_ERROR' },
        DAY0,
        { renewalDeclinePolicy: true },
      );

      expect(ctx.subscription.renewalAttempts).toBe(0);
      expect(ctx.subscription.nextBillingDate).toEqual(DUE);
      expect(ctx.subscription.status).toBe(SubscriptionStatus.ACTIVE);
      expect(ctx.db.rows(BillingAttempt)[0].status).toBe(
        BillingAttemptStatus.UNKNOWN,
      );
    });

    it('owner-only rules are unchanged: a delegated/impersonated actor cannot reach the provider', async () => {
      const { orchestration, executor } = build();
      const runtime = new BillingProviderRuntimeService(
        orchestration,
        executor as any,
      );

      await expect(
        runtime.submitCharge({
          actor: {
            actorFirebaseId: 'accountant',
            subjectFirebaseId: 'owner-1',
            isDelegatedAccess: true,
          },
          attemptId: 21,
          expectedStateVersion: 0,
          leaseOwner: 'x',
        }),
      ).rejects.toThrow('subscription owner');
      expect(executor.executeCharge).not.toHaveBeenCalled();
    });
  });
});

// Keeps the FindOperator import honest for the cron-selection contract the
// service relies on (LessThanOrEqual exposes its bound as `.value`).
describe('cron selection contract', () => {
  it('LessThanOrEqual exposes the bound the in-memory repository compares against', () => {
    const bound = new Date('2026-09-01T00:00:00.000Z');
    expect((LessThanOrEqual(bound) as any).value).toEqual(bound);
  });
});
