import { BillingEvent } from '../entities/billing-event.entity';
import { BillingObligation } from '../entities/billing-obligation.entity';
import { SubscriptionPlan } from '../entities/subscription-plan.entity';
import { Subscription } from '../entities/subscription.entity';
import {
  BillingEventType,
  BillingObligationStatus,
  SubscriptionStatus,
} from '../enums/billing.enums';
import { BillingOverdueRecoveryService } from './billing-overdue-recovery.service';

describe('BillingOverdueRecoveryService', () => {
  const owner = { actorFirebaseId: 'owner-1', subjectFirebaseId: 'owner-1' };
  let subscription: any;
  let obligations: any[];
  let events: any[];
  let manager: any;
  let service: BillingOverdueRecoveryService;

  beforeEach(() => {
    subscription = {
      id: 7,
      firebaseId: 'owner-1',
      status: SubscriptionStatus.ACTIVE,
      planId: 3,
      nextBillingDate: new Date('2026-09-27T06:00:00.000Z'),
      currentPeriodEnd: new Date('2026-09-27T06:00:00.000Z'),
      currentPeriodStart: new Date('2026-08-27T06:00:00.000Z'),
      billingAnchorDay: 27,
      renewalAttempts: 0,
      discountPercent: null,
      discountAmountAgorot: null,
      discountStartDate: null,
      discountEndDate: null,
    };
    const plan = {
      id: 3,
      priceMonthlyAgorot: 2500,
      licensedDealerPriceMonthlyAgorot: null,
      currency: 'ILS',
    };
    obligations = [];
    events = [];
    manager = {
      findOne: jest.fn(async (entity, options) => {
        if (entity === Subscription) return subscription;
        if (entity === SubscriptionPlan) return plan;
        if (entity === BillingObligation) {
          if (options.where.obligationKey) {
            return obligations.find(row => row.obligationKey === options.where.obligationKey) ?? null;
          }
          return obligations.find(row =>
            row.subscriptionId === options.where.subscriptionId &&
            row.status === options.where.status,
          ) ?? null;
        }
        return null;
      }),
      create: jest.fn((_entity, value) => value),
      save: jest.fn(async (entity, value) => {
        if (entity === BillingObligation && !value.id) {
          value.id = obligations.length + 11;
          obligations.push(value);
        }
        if (entity === BillingEvent) {
          value.id = events.length + 1;
          events.push(value);
        }
        return value;
      }),
    };
    const dataSource: any = { transaction: (work: any) => work(manager) };
    const pricing: any = {
      resolveUserBillingBusinessType: jest.fn().mockResolvedValue('EXEMPT'),
      resolveEffectivePlanPrice: jest.fn().mockReturnValue(2500),
      applySubscriptionDiscount: jest.fn().mockReturnValue({ finalAmountAgorot: 2500 }),
      calculateBillingAmounts: jest.fn().mockReturnValue({
        amountBeforeVatAgorot: 2500,
        vatAmountAgorot: 450,
        amountIncludingVatAgorot: 2950,
      }),
    };
    const access: any = { paymentBlockReason: jest.fn().mockReturnValue('ACTIVE_OVERDUE') };
    service = new BillingOverdueRecoveryService(dataSource, pricing, access);
  });

  it('creates one frozen debt and moves ACTIVE_OVERDUE to PAST_DUE without a provider attempt', async () => {
    const result = await service.prepare(owner);

    expect(result).toEqual({
      status: SubscriptionStatus.PAST_DUE,
      obligationId: 11,
      providerCalled: false,
    });
    expect(subscription.status).toBe(SubscriptionStatus.PAST_DUE);
    expect(subscription.renewalAttempts).toBe(0);
    expect(obligations).toHaveLength(1);
    expect(obligations[0]).toEqual(expect.objectContaining({
      status: BillingObligationStatus.OPEN,
      periodStart: '2026-09-27',
      periodEnd: '2026-10-27',
      amountAgorot: 2950,
      activeAttemptId: null,
    }));
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(expect.objectContaining({
      eventType: BillingEventType.OVERDUE_DEBT_CREATED,
      billingObligationId: 11,
      metadata: expect.objectContaining({ providerCalled: false }),
    }));
  });

  it('is idempotent after the subscription is already PAST_DUE', async () => {
    subscription.status = SubscriptionStatus.PAST_DUE;
    obligations.push({
      id: 19,
      subscriptionId: 7,
      status: BillingObligationStatus.OPEN,
    });

    await expect(service.prepare(owner)).resolves.toEqual({
      status: SubscriptionStatus.PAST_DUE,
      obligationId: 19,
      providerCalled: false,
    });
    expect(events).toHaveLength(0);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('rejects a direct action by an impersonating actor', async () => {
    await expect(service.prepare({
      actorFirebaseId: 'admin-1',
      subjectFirebaseId: 'owner-1',
      isAdminImpersonation: true,
    })).rejects.toThrow('subscription owner');
    expect(manager.findOne).not.toHaveBeenCalled();
  });
});
