import { BillingAttempt } from 'src/billing/entities/billing-attempt.entity';
import { BillingObligation } from 'src/billing/entities/billing-obligation.entity';
import { PaymentMethod } from 'src/billing/entities/payment-method.entity';
import { Subscription } from 'src/billing/entities/subscription.entity';
import { SubscriptionPlan } from 'src/billing/entities/subscription-plan.entity';
import { BillingAttemptStatus, SubscriptionStatus } from 'src/billing/enums/billing.enums';
import { DemoDataService } from './demo-data.service';
import { BILLING_QA_PROFILE } from './profiles/billing-qa.profile';

describe('DemoDataService billing QA scenario', () => {
  const originalKey = process.env.BILLING_TOKEN_ENCRYPTION_KEY;

  beforeAll(() => {
    process.env.BILLING_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 5).toString('base64');
  });

  afterAll(() => {
    if (originalKey === undefined) delete process.env.BILLING_TOKEN_ENCRYPTION_KEY;
    else process.env.BILLING_TOKEN_ENCRYPTION_KEY = originalKey;
  });

  it('creates a declined fixture without invoking a provider dependency', async () => {
    const subscription: any = { id: 41, firebaseId: 'billing-demo' };
    const plan: any = {
      id: 7,
      slug: 'dev-basic-plan-without-a-canonical-slug',
      isActive: true,
      priceMonthlyAgorot: 2950,
      licensedDealerPriceMonthlyAgorot: 5900,
    };
    let nextId = 100;
    const saved: any[] = [];
    const manager = {
      findOne: jest.fn(async (entity: any) => {
        if (entity === Subscription) return subscription;
        if (entity === SubscriptionPlan) return plan;
        return null;
      }),
      query: jest.fn().mockResolvedValue([]),
      create: jest.fn((_entity: any, value: any) => ({ ...value })),
      save: jest.fn(async (entityOrValue: any, maybeValue?: any) => {
        const value = maybeValue ?? entityOrValue;
        if (value.id == null) value.id = nextId++;
        saved.push(value);
        return value;
      }),
    };
    const dataSource = {
      transaction: jest.fn(async (work: any) => work(manager)),
    };
    const service = new DemoDataService(
      dataSource as any,
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
    );

    const result = await (service as any).applyBillingQaScenarioForUser(
      'billing-demo',
      BILLING_QA_PROFILE,
      'DECLINED',
    );

    expect(result).toMatchObject({
      state: 'DECLINED',
      firebaseId: 'billing-demo',
      subscriptionId: 41,
      providerCalled: false,
    });
    expect(subscription.status).toBe(SubscriptionStatus.PAST_DUE);
    expect(manager.findOne).toHaveBeenCalledWith(
      SubscriptionPlan,
      {
        where: { isActive: true, isPublic: true },
        order: { displayOrder: 'ASC', id: 'ASC' },
      },
    );
    expect(saved.some((row) => row.cardBrand === 'DEMO')).toBe(true);
    expect(saved).toContainEqual(
      expect.objectContaining({
        status: BillingAttemptStatus.DECLINED,
        providerResponseCode: 4,
        failureCategory: 'PROVIDER_DECLINED',
      }),
    );
    expect(manager.create).toHaveBeenCalledWith(
      PaymentMethod,
      expect.objectContaining({ last4: '0000' }),
    );
    expect(manager.create).toHaveBeenCalledWith(
      BillingObligation,
      expect.objectContaining({ subscriptionId: 41 }),
    );
    expect(manager.create).toHaveBeenCalledWith(
      BillingAttempt,
      expect.objectContaining({ status: BillingAttemptStatus.DECLINED }),
    );
  });
});
