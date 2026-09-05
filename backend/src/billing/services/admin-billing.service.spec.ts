import { DataSource, EntityManager } from 'typeorm';
import { AdminBillingService } from './admin-billing.service';
import { Subscription } from '../entities/subscription.entity';
import { SubscriptionStatus } from '../enums/billing.enums';

describe('AdminBillingService.updateSubscriptionTrialEnd', () => {
  let service: AdminBillingService;
  let manager: { findOne: jest.Mock; update: jest.Mock };

  const makeSubscription = (status: SubscriptionStatus): Subscription => ({
    id: 42,
    firebaseId: 'client-42',
    planId: 7,
    paymentMethodId: 9,
    status,
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
