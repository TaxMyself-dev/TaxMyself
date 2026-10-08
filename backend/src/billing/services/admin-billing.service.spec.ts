import { NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { AdminBillingService } from './admin-billing.service';
import { Subscription } from '../entities/subscription.entity';
import { BillingAttempt } from '../entities/billing-attempt.entity';
import { BillingEvent } from '../entities/billing-event.entity';
import { BillingAccessMode, BillingEventType, BillingAttemptStatus, SubscriptionStatus } from '../enums/billing.enums';

describe('AdminBillingService.updateSubscriptionTrialEnd', () => {
  let service: AdminBillingService;
  let manager: { findOne: jest.Mock; update: jest.Mock };

  const makeSubscription = (status: SubscriptionStatus): Subscription => ({
    id: 42,
    firebaseId: 'client-42',
    planId: 7,
    paymentMethodId: 9,
    activePaymentMethodUpdateAttemptId: null,
    activePaymentMethodUpdateAttempt: null,
    status,
    billingAccessMode: BillingAccessMode.STANDARD,
    trialStart: new Date('2026-01-01T00:00:00.000Z'),
    trialEnd: new Date('2026-01-15T00:00:00.000Z'),
    currentPeriodStart: new Date('2026-02-01T00:00:00.000Z'),
    currentPeriodEnd: new Date('2026-03-01T00:00:00.000Z'),
    nextBillingDate: new Date('2026-03-01T00:00:00.000Z'),
    billingAnchorDay: 1,
    gracePeriodEndsAt: new Date('2026-03-08T00:00:00.000Z'),
    renewalAttempts: 2,
    canceledAt: new Date('2026-02-10T00:00:00.000Z'),
    endedAt: new Date('2026-02-11T00:00:00.000Z'),
    discountPercent: 10,
    discountAmountAgorot: null,
    discountStartDate: new Date('2026-01-01T00:00:00.000Z'),
    discountEndDate: new Date('2026-12-31T00:00:00.000Z'),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  });

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-04T09:00:00.000Z'));
    manager = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const dataSource = {
      transaction: jest.fn(async callback =>
        callback(manager as unknown as EntityManager),
      ),
    } as unknown as DataSource;

    service = new AdminBillingService(
      {} as any,
      {} as any,
      dataSource,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  afterEach(() => jest.useRealTimers());

  it('atomically restores TRIAL_EXPIRED to TRIAL when trialEnd is in the future', async () => {
    manager.findOne.mockResolvedValue(makeSubscription(SubscriptionStatus.TRIAL_EXPIRED));

    const result = await service.updateSubscriptionTrialEnd(42, {
      trialEnd: '2026-09-10',
    });

    expect(manager.findOne).toHaveBeenCalledWith(Subscription, {
      where: { id: 42 },
      lock: { mode: 'pessimistic_write' },
    });
    expect(manager.update).toHaveBeenCalledWith(Subscription, 42, {
      trialEnd: new Date('2026-09-10'),
      status: SubscriptionStatus.TRIAL,
    });
    expect(result).toEqual({
      subscriptionId: 42,
      trialEnd: new Date('2026-09-10'),
      status: SubscriptionStatus.TRIAL,
    });
  });

  it.each([
    ['a null date on an expired trial', SubscriptionStatus.TRIAL_EXPIRED, null],
    ['a past date on an expired trial', SubscriptionStatus.TRIAL_EXPIRED, '2026-09-03'],
    ['a date equal to now on an expired trial', SubscriptionStatus.TRIAL_EXPIRED, '2026-09-04T09:00:00.000Z'],
    ['ACTIVE', SubscriptionStatus.ACTIVE, '2026-09-10'],
    ['PAST_DUE', SubscriptionStatus.PAST_DUE, '2026-09-10'],
    ['CANCELED', SubscriptionStatus.CANCELED, '2026-09-10'],
    ['an already-TRIAL subscription', SubscriptionStatus.TRIAL, '2026-09-10'],
  ])('updates only trialEnd for %s', async (_case, status, trialEnd) => {
    manager.findOne.mockResolvedValue(makeSubscription(status));

    const result = await service.updateSubscriptionTrialEnd(42, { trialEnd });

    expect(result.status).toBe(status);
    expect(manager.update).toHaveBeenCalledWith(Subscription, 42, {
      trialEnd: trialEnd ? new Date(trialEnd) : null,
    });
  });
});

describe('AdminBillingService.updateSubscriptionBillingAccessMode', () => {
  const makeSubscription = (): Subscription => ({
    activePaymentMethodUpdateAttemptId: null,
    activePaymentMethodUpdateAttempt: null,
    billingAnchorDay: null,
    id: 42,
    firebaseId: 'client-42',
    planId: 7,
    paymentMethodId: 9,
    status: SubscriptionStatus.ACTIVE,
    billingAccessMode: BillingAccessMode.STANDARD,
    trialStart: null,
    trialEnd: null,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    nextBillingDate: new Date('2026-10-01T00:00:00.000Z'),
    gracePeriodEndsAt: null,
    renewalAttempts: 1,
    canceledAt: null,
    endedAt: null,
    discountPercent: null,
    discountAmountAgorot: null,
    discountStartDate: null,
    discountEndDate: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  function createService(subscription: Subscription) {
    const manager = {
      findOne: jest.fn().mockResolvedValue(subscription),
      save: jest.fn(async value => value),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const dataSource = {
      transaction: jest.fn(async callback => callback(manager as unknown as EntityManager)),
    } as unknown as DataSource;
    const billingEventService = { logEvent: jest.fn().mockResolvedValue(null) };
    const service = new AdminBillingService(
      {} as any,
      {} as any,
      dataSource,
      {} as any,
      billingEventService as any,
      {} as any,
      {} as any,
      {} as any,
    );
    return { service, manager, billingEventService };
  }

  it('grants full no-charge access, removes the plan and clears future charging', async () => {
    const sub = makeSubscription();
    const { service, manager, billingEventService } = createService(sub);

    const result = await service.updateSubscriptionBillingAccessMode(
      42,
      { billingAccessMode: BillingAccessMode.COMPLIMENTARY_FULL, reason: 'internal account' },
      'admin-1',
    );

    expect(manager.update).toHaveBeenCalledWith(Subscription, 42, {
      billingAccessMode: BillingAccessMode.COMPLIMENTARY_FULL,
      planId: null,
      nextBillingDate: null,
      gracePeriodEndsAt: null,
      renewalAttempts: 0,
      status: SubscriptionStatus.ACTIVE,
    });
    expect(manager.save).not.toHaveBeenCalled();
    expect(sub.planId).toBeNull();
    expect(sub.nextBillingDate).toBeNull();
    expect(sub.paymentMethodId).toBe(9);
    expect(result.billingAccessMode).toBe(BillingAccessMode.COMPLIMENTARY_FULL);
    expect(billingEventService.logEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: BillingEventType.BILLING_EXEMPTION_GRANTED,
      metadata: expect.objectContaining({ actorFirebaseId: 'admin-1' }),
    }));
  });

  it('revokes the exemption into TRIAL_EXPIRED without charging or deleting the card', async () => {
    const sub = makeSubscription();
    sub.billingAccessMode = BillingAccessMode.COMPLIMENTARY_FULL;
    sub.planId = null;
    const { service, billingEventService } = createService(sub);

    const result = await service.updateSubscriptionBillingAccessMode(
      42,
      { billingAccessMode: BillingAccessMode.STANDARD },
      'admin-1',
    );

    expect(result.status).toBe(SubscriptionStatus.TRIAL_EXPIRED);
    expect(sub.paymentMethodId).toBe(9);
    expect(billingEventService.logEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: BillingEventType.BILLING_EXEMPTION_REVOKED,
    }));
  });
});

describe('AdminBillingService.findAllSubscriptions', () => {
  const queryBuilder = (rows: any[]) => {
    const builder: any = {
      select: jest.fn(),
      addSelect: jest.fn(),
      from: jest.fn(),
      leftJoin: jest.fn(),
      where: jest.fn(),
      orderBy: jest.fn(),
      getRawMany: jest.fn().mockResolvedValue(rows),
    };
    Object.keys(builder)
      .filter(key => key !== 'getRawMany')
      .forEach(key => builder[key].mockReturnValue(builder));
    return builder;
  };

  it('includes open-banking and latest-login user details in subscription rows', async () => {
    const lastLoginAt = new Date('2026-09-21T17:45:00.000Z');
    const subscriptionQuery = queryBuilder([{
      subscriptionId: 42,
      firebaseId: 'client-42',
      status: SubscriptionStatus.TRIAL,
      billingAccessMode: BillingAccessMode.STANDARD,
      planId: null,
      nextBillingDate: null,
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
      cardLast4: null,
    }]);
    const userQuery = queryBuilder([{
      firebaseId: 'client-42',
      userId: 7,
      fName: 'Test',
      lName: 'User',
      email: 'test@example.com',
      hasOpenBanking: 1,
      lastLoginAt,
    }]);
    const businessQuery = queryBuilder([]);
    const dataSource = {
      createQueryBuilder: jest.fn()
        .mockReturnValueOnce(subscriptionQuery)
        .mockReturnValueOnce(userQuery)
        .mockReturnValueOnce(businessQuery),
    } as unknown as DataSource;
    const service = new AdminBillingService(
      {} as any,
      {} as any,
      dataSource,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const [result] = await service.findAllSubscriptions();

    expect(result.hasOpenBanking).toBe(true);
    expect(result.lastLoginAt).toEqual(lastLoginAt);
    expect(userQuery.addSelect).toHaveBeenCalledWith('u.hasOpenBanking', 'hasOpenBanking');
    expect(userQuery.addSelect).toHaveBeenCalledWith('u.lastLoginAt', 'lastLoginAt');
  });
});

describe('AdminBillingService unresolved billing attempts (read-only)', () => {
  /** Chainable query-builder stub that answers by the entity passed to `.from()`. */
  const makeDataSource = (rowsByEntity: Map<unknown, any[]>) => {
    const builders: { entity: unknown; selects: string[]; wheres: unknown[][] }[] = [];
    const createQueryBuilder = jest.fn(() => {
      const record = { entity: undefined as unknown, selects: [] as string[], wheres: [] as unknown[][] };
      builders.push(record);
      const qb: any = {};
      for (const method of ['leftJoin', 'innerJoin', 'orderBy', 'addOrderBy', 'groupBy', 'setParameter', 'limit']) {
        qb[method] = jest.fn(() => qb);
      }
      qb.select = jest.fn((column: string) => (record.selects.push(column), qb));
      qb.addSelect = jest.fn((column: string) => (record.selects.push(column), qb));
      qb.where = jest.fn((...args: unknown[]) => (record.wheres.push(args), qb));
      qb.andWhere = jest.fn((...args: unknown[]) => (record.wheres.push(args), qb));
      qb.from = jest.fn((entity: unknown) => ((record.entity = entity), qb));
      qb.getRawMany = jest.fn(async () => rowsByEntity.get(record.entity) ?? []);
      return qb;
    });
    return { dataSource: { createQueryBuilder } as unknown as DataSource, createQueryBuilder, builders };
  };

  const makeService = (dataSource: DataSource, subscriptionRepo: unknown = {}) =>
    new AdminBillingService({} as any, subscriptionRepo as any, dataSource, {} as any, {} as any, {} as any, {} as any, {} as any);

  const subscriptionRow = (subscriptionId: number) => ({
    subscriptionId,
    firebaseId: `client-${subscriptionId}`,
    status: 'ACTIVE',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    nextBillingDate: null,
  });

  it('adds a compact unresolved indicator to the list with one grouped query', async () => {
    const { dataSource, createQueryBuilder } = makeDataSource(
      new Map<unknown, any[]>([
        [Subscription, [subscriptionRow(1), subscriptionRow(2), subscriptionRow(3)]],
        [BillingAttempt, [
          { subscriptionId: '1', unresolvedCount: '2', manualReviewCount: '1' },
          { subscriptionId: '2', unresolvedCount: '1', manualReviewCount: '0' },
        ]],
      ]),
    );

    const list = await makeService(dataSource).findAllSubscriptions();

    expect(list.map(s => [s.subscriptionId, s.unresolvedBillingAttemptCount, s.mostSevereUnresolvedAttemptStatus])).toEqual([
      [1, 2, BillingAttemptStatus.MANUAL_REVIEW],
      [2, 1, BillingAttemptStatus.UNKNOWN],
      [3, 0, null],
    ]);
    // subscriptions, users, businesses, ONE grouped indicator query — no per-row lookups.
    expect(createQueryBuilder).toHaveBeenCalledTimes(4);
  });

  it('returns only sanitized unresolved attempts for the selected subscription', async () => {
    const attemptRow = (attemptId: number, status: string, failureCategory: string | null) => ({
      attemptId, status, chargeMode: 'TOKEN_TRANSACTION', amountAgorot: 11700, currency: 'ILS',
      createdAt: new Date('2026-09-01T00:00:00.000Z'), capturedAt: null, unknownSince: null,
      reconciliationAttempts: 5, lastReconciledAt: null, nextActionAt: null, failureCategory,
      cardcomTransactionId: attemptId === 11 ? 'TX-11' : null, cardcomLowProfileId: null,
      // A driver row must never leak these even if a query change ever selected them.
      cardcomToken: 'tok-SECRET', encryptedToken: 'enc-SECRET', cardNumber: '4580000011112222', rawResponse: '{"raw":1}',
      cardcomExternalUniqTranId: 'EXT-KEY', leaseOwner: 'worker-1', providerResponseCode: 500,
    });
    const { dataSource, builders } = makeDataSource(
      new Map<unknown, any[]>([
        [BillingAttempt, [attemptRow(11, 'MANUAL_REVIEW', 'UNVERIFIED_LOOKUP_RESULT'), attemptRow(9, 'UNKNOWN', 'TRANSPORT_ERROR')]],
        [BillingEvent, [{ billingAttemptId: 11, metadata: { cardTokenStored: true, note: 'x' } }]],
      ]),
    );
    const subscriptionRepo = { findOne: jest.fn().mockResolvedValue({ id: 42 }) };

    const result = await makeService(dataSource, subscriptionRepo).findUnresolvedBillingAttempts(42);

    const attemptsQuery = builders.find(b => b.entity === BillingAttempt) as (typeof builders)[number];
    expect(attemptsQuery.wheres[0]).toEqual(['o.subscriptionId = :subscriptionId', { subscriptionId: 42 }]);
    expect(attemptsQuery.wheres).toHaveLength(1); // history includes resolved attempts, scoped to this subscription
    expect(attemptsQuery.selects.join(' ')).not.toMatch(/token|response|leaseOwner|ExternalUniq|cardNumber/i);
    expect(result.map(a => a.attemptId)).toEqual([11, 9]);
    expect(result[0]).toEqual({
      attemptId: 11, stateVersion: 0, status: 'MANUAL_REVIEW', chargeMode: 'TOKEN_TRANSACTION', amountAgorot: 11700, currency: 'ILS',
      createdAt: new Date('2026-09-01T00:00:00.000Z'), capturedAt: null, unknownSince: null,
      reconciliationAttempts: 5, lastReconciledAt: null, nextActionAt: null,
      failureCategory: 'RECONCILIATION_EXHAUSTED', requiredAction: 'INTERNAL_REVIEW',
      cardcomTransactionId: 'TX-11', cardcomLowProfileId: null, cardTokenRecovered: true,
    });
    expect(result[1]).toEqual(expect.objectContaining({
      failureCategory: 'PROVIDER_OUTCOME_UNKNOWN', requiredAction: 'AUTOMATIC_CHECK', cardTokenRecovered: false,
    }));
    expect(JSON.stringify(result)).not.toMatch(/SECRET|4580000011112222|EXT-KEY|worker-1|TRANSPORT_ERROR|UNVERIFIED/);

    subscriptionRepo.findOne.mockResolvedValue(null);
    await expect(makeService(dataSource, subscriptionRepo).findUnresolvedBillingAttempts(7)).rejects.toThrow(NotFoundException);
  });
});
