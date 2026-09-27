import { DataSource, EntityManager } from 'typeorm';
import { AdminBillingService } from './admin-billing.service';
import { Subscription } from '../entities/subscription.entity';
import { BillingAccessMode, BillingEventType, SubscriptionStatus } from '../enums/billing.enums';

describe('AdminBillingService.updateSubscriptionTrialEnd', () => {
  let service: AdminBillingService;
  let manager: { findOne: jest.Mock; update: jest.Mock };

  const makeSubscription = (status: SubscriptionStatus): Subscription => ({
    id: 42,
    firebaseId: 'client-42',
    planId: 7,
    paymentMethodId: 9,
    status,
    billingAccessMode: BillingAccessMode.STANDARD,
    trialStart: new Date('2026-01-01T00:00:00.000Z'),
    trialEnd: new Date('2026-01-15T00:00:00.000Z'),
    currentPeriodStart: new Date('2026-02-01T00:00:00.000Z'),
    currentPeriodEnd: new Date('2026-03-01T00:00:00.000Z'),
    nextBillingDate: new Date('2026-03-01T00:00:00.000Z'),
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

    expect(manager.save).toHaveBeenCalled();
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
