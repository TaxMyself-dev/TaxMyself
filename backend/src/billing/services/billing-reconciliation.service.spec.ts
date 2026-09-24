import { FindOperator } from 'typeorm';
import { CardcomApiError } from './cardcom.service';
import {
  BillingAttemptStatus,
  BillingAttemptTrigger,
  BillingChargeMode,
} from '../enums/billing.enums';
import { BillingAttempt } from '../entities/billing-attempt.entity';
import { BillingObligation } from '../entities/billing-obligation.entity';
import { BillingAttemptOrchestrationService } from './billing-attempt-orchestration.service';
import { BillingCardcomExecutorService } from './billing-cardcom-executor.service';
import { BillingProviderRuntimeService } from './billing-provider-runtime.service';
import { BillingReconciliationService } from './billing-reconciliation.service';

/**
 * KT-038 Task 5A2. The real orchestration (leases, CAS, backoff ladder), the
 * real provider runtime and the real CardCom executor run over an in-memory
 * store; only the database and the CardCom HTTP client are faked. Any charge or
 * checkout call would be a read-only violation.
 */
describe('BillingReconciliationService — read-only reconciliation of UNKNOWN attempts', () => {
  const NOW = new Date('2026-09-10T03:00:00.000Z');
  const MIN = 60_000;
  const TERMINAL = 1234;
  const RETURN_VALUE = (overrides: Record<string, unknown> = {}) =>
    JSON.stringify({
      intent: 'CHECKOUT',
      firebaseId: 'owner',
      subscriptionId: 9,
      planId: 2,
      billingAttemptId: 1,
      ...overrides,
    });
  const hostedResult = (overrides: Record<string, unknown> = {}) => ({
    ResponseCode: 0,
    LowProfileId: 'lp-1',
    TerminalNumber: TERMINAL,
    TranzactionId: 555,
    ReturnValue: RETURN_VALUE(),
    TranzactionInfo: { ResponseCode: 0, TranzactionId: 555, Amount: 117 },
    ...overrides,
  });
  const directResult = (overrides: Record<string, unknown> = {}) => ({
    ResponseCode: 0,
    TranzactionId: 777,
    TerminalNumber: TERMINAL,
    Amount: 117,
    ApprovalNumber: 'ap-777',
    ...overrides,
  });

  /** Evaluates the TypeORM find operators the finders use against a row. */
  const matches = (value: unknown, condition: unknown): boolean => {
    if (!(condition instanceof FindOperator)) return value === condition;
    const op = condition as FindOperator<any>;
    switch (op.type) {
      case 'or':
        return (op.value as FindOperator<any>[]).some((o) => matches(value, o));
      case 'isNull':
        return value === null;
      case 'lessThanOrEqual':
        return value !== null && (value as Date) <= op.value;
      case 'not':
        return op.child ? !matches(value, op.child) : value !== op.value;
      default:
        throw new Error(`unsupported operator ${op.type}`);
    }
  };

  const attempt = (overrides: Record<string, unknown> = {}): any => ({
    id: 1,
    obligationId: 10,
    attemptNumber: 1,
    trigger: BillingAttemptTrigger.RENEWAL,
    chargeMode: BillingChargeMode.TOKEN_TRANSACTION,
    status: BillingAttemptStatus.UNKNOWN,
    paymentMethodId: 5,
    cardcomExternalUniqTranId: 'ext-1',
    cardcomLowProfileId: null,
    planId: 2,
    amountAgorot: 11700,
    currency: 'ILS',
    stateVersion: 3,
    leaseOwner: null,
    leaseExpiresAt: null,
    nextActionAt: new Date(NOW.getTime() - 1000),
    unknownSince: new Date(NOW.getTime() - 3600_000),
    failureCategory: 'TRANSPORT_ERROR',
    reconciliationAttempts: 0,
    lastReconciledAt: null,
    cardcomTransactionId: null,
    providerTerminalRef: null,
    providerResponseCode: null,
    capturedAt: null,
    ...overrides,
  });

  function build(attempts: any[]) {
    const obligation: any = {
      id: 10,
      subscriptionId: 9,
      firebaseIdSnapshot: 'owner',
      activeAttemptId: attempts[0].id,
      version: 0,
    };
    const manager = {
      findOne: jest.fn(async (entity: unknown, options: any) =>
        entity === BillingAttempt
          ? attempts.find((a) => a.id === options.where.id) ?? null
          : entity === BillingObligation
          ? obligation
          : null,
      ),
      find: jest.fn(async (entity: unknown, options: any) =>
        entity === BillingObligation
          ? [obligation]
          : attempts.filter((row) =>
              Object.entries(options.where).every(([key, condition]) =>
                matches(row[key], condition),
              ),
            ),
      ),
      save: jest.fn(async (_entity: unknown, row: unknown) => row),
    };
    const dataSource = {
      createQueryRunner: () => ({
        manager,
        connect: async () => undefined,
        startTransaction: async () => undefined,
        commitTransaction: async () => undefined,
        rollbackTransaction: async () => undefined,
        release: async () => undefined,
      }),
    };
    const cardcom = {
      getTransactionByExternalUniqTran: jest.fn(),
      getLowProfileResult: jest.fn(),
      getApiCredentials: () => ({ terminalNumber: TERMINAL }),
      // Any of these would be a read-only violation.
      chargeByToken: jest.fn(),
      createLowProfileCheckout: jest.fn(),
    };
    const orchestration = new BillingAttemptOrchestrationService(
      dataSource as any,
    );
    const runtime = new BillingProviderRuntimeService(
      orchestration,
      new BillingCardcomExecutorService(cardcom as any, {} as any),
    );
    const hostedCompletion = { completeCapturedHostedAttempt: jest.fn() };
    const service = new BillingReconciliationService(
      orchestration,
      runtime,
      hostedCompletion as any,
    );
    return { service, cardcom, hostedCompletion, obligation, attempts };
  }
  const neverCharged = (cardcom: any) => {
    expect(cardcom.chargeByToken).not.toHaveBeenCalled();
    expect(cardcom.createLowProfileCheckout).not.toHaveBeenCalled();
  };

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

  it.each([
    [
      'a direct lookup that confirms the capture',
      {},
      (c: any) =>
        c.getTransactionByExternalUniqTran.mockResolvedValue(directResult()),
      BillingAttemptStatus.CAPTURED,
      { tx: '777', lookup: 'getTransactionByExternalUniqTran', arg: 'ext-1' },
    ],
    [
      'a hosted result that matches the attempt (capture)',
      {
        chargeMode: BillingChargeMode.LOW_PROFILE_HOSTED,
        trigger: BillingAttemptTrigger.RECOVERY,
        cardcomLowProfileId: 'lp-1',
        paymentMethodId: null,
      },
      (c: any) => c.getLowProfileResult.mockResolvedValue(hostedResult()),
      BillingAttemptStatus.CAPTURED,
      { tx: '555', lookup: 'getLowProfileResult', arg: 'lp-1', hosted: true },
    ],
    [
      'a hosted result that is a verified decline of the attempt',
      {
        chargeMode: BillingChargeMode.LOW_PROFILE_HOSTED,
        trigger: BillingAttemptTrigger.RECOVERY,
        cardcomLowProfileId: 'lp-1',
        paymentMethodId: null,
      },
      (c: any) =>
        c.getLowProfileResult.mockResolvedValue(
          hostedResult({
            ResponseCode: 5033,
            TranzactionId: undefined,
            TranzactionInfo: { ResponseCode: 5033 },
          }),
        ),
      BillingAttemptStatus.DECLINED,
      { tx: null, lookup: 'getLowProfileResult', arg: 'lp-1' },
    ],
  ])(
    '%s is applied once through the state machine, resumes completion and never charges',
    async (_name, overrides, arrange, status, expected: any) => {
      const { service, cardcom, hostedCompletion, obligation, attempts } =
        build([attempt(overrides)]);
      arrange(cardcom);

      const summary = await service.reconcileDueAttempts();

      expect(attempts[0].status).toBe(status);
      expect(attempts[0].cardcomTransactionId).toBe(expected.tx);
      expect(attempts[0].reconciliationAttempts).toBe(1);
      expect(summary).toEqual(
        expect.objectContaining({
          due: 1,
          captured: status === BillingAttemptStatus.CAPTURED ? 1 : 0,
          declined: status === BillingAttemptStatus.DECLINED ? 1 : 0,
          errors: 0,
        }),
      );
      if (status === BillingAttemptStatus.DECLINED) {
        expect(obligation.activeAttemptId).toBeNull();
      }
      expect(cardcom[expected.lookup]).toHaveBeenCalledWith(expected.arg);
      // Hosted captures resume the shared completion path; a token renewal is
      // finalized by the renewal flow, so nothing is completed here.
      expect(
        hostedCompletion.completeCapturedHostedAttempt,
      ).toHaveBeenCalledTimes(expected.hosted ? 1 : 0);
      neverCharged(cardcom);

      // Resolved attempts are never looked up (or completed) again.
      await service.reconcileDueAttempts();
      expect(cardcom[expected.lookup]).toHaveBeenCalledTimes(1);
      expect(
        hostedCompletion.completeCapturedHostedAttempt,
      ).toHaveBeenCalledTimes(expected.hosted ? 1 : 0);
    },
  );

  it.each([
    [
      'direct lookup finds nothing',
      {},
      (c: any) =>
        c.getTransactionByExternalUniqTran.mockResolvedValue({
          ResponseCode: 999,
          Description: 'not found',
        }),
    ],
    [
      'direct lookup amount differs from the attempt',
      {},
      (c: any) =>
        c.getTransactionByExternalUniqTran.mockResolvedValue(
          directResult({ Amount: 1 }),
        ),
    ],
    [
      'direct lookup times out',
      {},
      (c: any) =>
        c.getTransactionByExternalUniqTran.mockRejectedValue(
          new CardcomApiError('timeout ApiPassword=SECRET'),
        ),
    ],
    [
      'hosted result belongs to another attempt',
      {
        chargeMode: BillingChargeMode.LOW_PROFILE_HOSTED,
        cardcomLowProfileId: 'lp-1',
        paymentMethodId: null,
      },
      (c: any) =>
        c.getLowProfileResult.mockResolvedValue(
          hostedResult({ ReturnValue: RETURN_VALUE({ billingAttemptId: 2 }) }),
        ),
    ],
    [
      'hosted result is still pending (no transaction)',
      {
        chargeMode: BillingChargeMode.LOW_PROFILE_HOSTED,
        cardcomLowProfileId: 'lp-1',
        paymentMethodId: null,
      },
      (c: any) =>
        c.getLowProfileResult.mockResolvedValue(
          hostedResult({
            ResponseCode: 500,
            TranzactionId: undefined,
            TranzactionInfo: undefined,
          }),
        ),
    ],
  ])(
    'stays UNKNOWN, advances the backoff and never charges when the %s',
    async (_name, overrides, arrange) => {
      const { service, cardcom, hostedCompletion, obligation, attempts } =
        build([attempt(overrides)]);
      arrange(cardcom);

      const summary = await service.reconcileDueAttempts();

      expect(attempts[0]).toEqual(
        expect.objectContaining({
          status: BillingAttemptStatus.UNKNOWN,
          reconciliationAttempts: 1,
          nextActionAt: new Date(NOW.getTime() + 5 * MIN),
          leaseOwner: null,
          cardcomTransactionId: null,
        }),
      );
      expect(obligation.activeAttemptId).toBe(1); // still blocking: never "no charge"
      expect(summary).toEqual(
        expect.objectContaining({ unresolved: 1, captured: 0, declined: 0 }),
      );
      expect(JSON.stringify(attempts[0])).not.toContain('SECRET');
      expect(
        hostedCompletion.completeCapturedHostedAttempt,
      ).not.toHaveBeenCalled();
      neverCharged(cardcom);
    },
  );

  it('walks the 1m/5m/30m/2h/24h ladder and then escalates to MANUAL_REVIEW without charging', async () => {
    const { service, cardcom, attempts } = build([attempt()]);
    cardcom.getTransactionByExternalUniqTran.mockResolvedValue({
      ResponseCode: 999,
    });
    const delays = [5 * MIN, 30 * MIN, 120 * MIN, 24 * 60 * MIN];

    for (let round = 0; round < 5; round += 1) {
      await service.reconcileDueAttempts();
      expect(attempts[0].reconciliationAttempts).toBe(round + 1);
      if (round < 4) {
        expect(attempts[0].status).toBe(BillingAttemptStatus.UNKNOWN);
        expect(attempts[0].nextActionAt.getTime() - Date.now()).toBe(
          delays[round],
        );
        jest.setSystemTime(attempts[0].nextActionAt);
      }
    }

    expect(attempts[0].status).toBe(BillingAttemptStatus.MANUAL_REVIEW);
    expect(attempts[0].nextActionAt).toBeNull();
    expect(cardcom.getTransactionByExternalUniqTran).toHaveBeenCalledTimes(5);
    await service.reconcileDueAttempts(); // MANUAL_REVIEW is not selected again
    expect(cardcom.getTransactionByExternalUniqTran).toHaveBeenCalledTimes(5);
    neverCharged(cardcom);
  });

  it('moves an expired PROCESSING lease to UNKNOWN (never CREATED), reconciles it when due, and leaves live leases and pre-submission failures alone', async () => {
    const expired = attempt({
      status: BillingAttemptStatus.PROCESSING,
      leaseOwner: 'renewal-9',
      leaseExpiresAt: new Date(NOW.getTime() - 1000),
      nextActionAt: null,
      failureCategory: null,
    });
    const live = attempt({
      id: 2,
      cardcomExternalUniqTranId: 'ext-2',
      status: BillingAttemptStatus.PROCESSING,
      leaseOwner: 'renewal-10',
      leaseExpiresAt: new Date(NOW.getTime() + 10 * MIN),
      nextActionAt: null,
      failureCategory: null,
    });
    const localFailure = attempt({
      id: 3,
      cardcomExternalUniqTranId: 'ext-3',
      failureCategory: 'PRE_SUBMISSION_LOCAL_FAILURE',
    });
    const { service, cardcom, attempts } = build([expired, live, localFailure]);
    cardcom.getTransactionByExternalUniqTran.mockResolvedValue(directResult());
    const liveBefore = JSON.stringify(live);

    const first = await service.reconcileDueAttempts();

    expect(first).toEqual(expect.objectContaining({ expired: 1, due: 0 }));
    expect(expired.status).toBe(BillingAttemptStatus.UNKNOWN);
    expect(expired.leaseOwner).toBeNull();
    expect(expired.nextActionAt).toEqual(new Date(NOW.getTime() + MIN));
    expect(JSON.stringify(live)).toBe(liveBefore);
    expect(cardcom.getTransactionByExternalUniqTran).not.toHaveBeenCalled();

    jest.setSystemTime(new Date(NOW.getTime() + MIN + 1));
    const second = await service.reconcileDueAttempts();

    expect(second).toEqual(expect.objectContaining({ due: 1, captured: 1 }));
    expect(expired.status).toBe(BillingAttemptStatus.CAPTURED);
    expect(cardcom.getTransactionByExternalUniqTran).toHaveBeenCalledTimes(1);
    expect(cardcom.getTransactionByExternalUniqTran).toHaveBeenCalledWith(
      'ext-1',
    );
    expect(live.status).toBe(BillingAttemptStatus.PROCESSING);
    expect(localFailure.status).toBe(BillingAttemptStatus.UNKNOWN);
    expect(attempts.map((a) => a.status)).not.toContain(
      BillingAttemptStatus.CREATED,
    );
    neverCharged(cardcom);
  });

  it('two workers reconciling the same due attempt make exactly one claim and one lookup', async () => {
    const { service, cardcom, attempts } = build([attempt()]);
    cardcom.getTransactionByExternalUniqTran.mockResolvedValue(directResult());

    const [a, b] = await Promise.all([
      service.reconcileDueAttempts(),
      service.reconcileDueAttempts(),
    ]);

    expect(cardcom.getTransactionByExternalUniqTran).toHaveBeenCalledTimes(1);
    expect(attempts[0].status).toBe(BillingAttemptStatus.CAPTURED);
    expect(attempts[0].reconciliationAttempts).toBe(1);
    expect(a.captured + b.captured).toBe(1);
    expect(a.notClaimed + b.notClaimed).toBe(1);
    neverCharged(cardcom);
  });
});
