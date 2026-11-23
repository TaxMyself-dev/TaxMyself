import { FeezbackLifecycleSubscriber } from './feezback-lifecycle.subscriber';
import { BillingEvent } from '../../billing/entities/billing-event.entity';
import { Subscription } from '../../billing/entities/subscription.entity';
import { SubscriptionPlan } from '../../billing/entities/subscription-plan.entity';

describe('Feezback billing invalidation', () => {
  let subscriber: FeezbackLifecycleSubscriber, manager: any;
  beforeEach(() => {
    process.env.FEEZBACK_LIFECYCLE_ENABLED = 'true';
    manager = { query: jest.fn(), findOne: jest.fn() };
    subscriber = new FeezbackLifecycleSubscriber({ subscribers: [] } as any);
  });
  afterEach(() => delete process.env.FEEZBACK_LIFECYCLE_ENABLED);
  it('queues enrollment commands in their own transaction even without a subscription update', async () => {
    await subscriber.afterInsert({
      metadata: { target: BillingEvent },
      entity: { firebaseId: 'owner' },
      manager,
    } as any);
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO feezback_lifecycle'),
      ['owner', 0, null, null],
    );
  });
  it('queues direct subscription entitlement updates', async () => {
    await subscriber.afterUpdate({
      metadata: { target: Subscription },
      entity: { planId: 1, firebaseId: 'owner' },
      manager,
    } as any);
    expect(manager.query).toHaveBeenCalledWith(expect.any(String), [
      'owner',
      0,
      null,
      null,
    ]);
  });
  it('repairs membership changes even when TypeORM bulk update omitted the identity', async () => {
    await subscriber.afterUpdate({
      metadata: { target: Subscription },
      entity: { status: 'PAST_DUE' },
      manager,
    } as any);
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT firebase_id'),
    );
  });
  it('queues plan-module changes and ignores unrelated entities and price-only subscription patches', async () => {
    await subscriber.afterUpdate({
      metadata: { target: SubscriptionPlan },
      entity: { modules: [] },
      manager,
    } as any);
    expect(manager.query).toHaveBeenCalledTimes(1);
    await subscriber.afterUpdate({
      metadata: { target: Subscription },
      entity: { discountPercent: 5 },
      manager,
    } as any);
    await subscriber.afterUpdate({
      metadata: { target: 'unrelated' },
      entity: {},
      manager,
    } as any);
    expect(manager.query).toHaveBeenCalledTimes(1);
  });
  it('does not depend on the new table before activation', async () => {
    delete process.env.FEEZBACK_LIFECYCLE_ENABLED;
    await subscriber.afterUpdate({
      metadata: { target: SubscriptionPlan },
      entity: {},
      manager,
    } as any);
    expect(manager.query).not.toHaveBeenCalled();
  });
});
