import { Injectable } from '@nestjs/common';
import {
  DataSource,
  EntitySubscriberInterface,
  InsertEvent,
  UpdateEvent,
} from 'typeorm';
import { BillingEvent } from '../../billing/entities/billing-event.entity';
import { SubscriptionPlan } from '../../billing/entities/subscription-plan.entity';
import { Subscription } from '../../billing/entities/subscription.entity';
import { enqueueLifecycle } from './feezback-lifecycle.service';

/** Queue within billing's transaction: rollback also rolls back pending work. */
@Injectable()
export class FeezbackLifecycleSubscriber implements EntitySubscriberInterface {
  constructor(db: DataSource) {
    db.subscribers.push(this);
  }
  async afterInsert(event: InsertEvent<any>) {
    if (event.metadata.target === BillingEvent && event.entity?.firebaseId)
      await enqueueLifecycle(event.manager, event.entity.firebaseId);
  }
  async afterUpdate(event: UpdateEvent<any>) {
    if (process.env.FEEZBACK_LIFECYCLE_ENABLED !== 'true') return;
    if (event.metadata.target === Subscription) {
      const relevant = [
        'planId',
        'status',
        'billingAccessMode',
        'trialEnd',
        'canceledAt',
        'endedAt',
        'nextBillingDate',
        'currentPeriodEnd',
      ];
      if (
        !relevant.some((key) =>
          Object.prototype.hasOwnProperty.call(event.entity ?? {}, key),
        )
      )
        return;
      const firebaseId =
        event.entity?.firebaseId ?? event.databaseEntity?.firebaseId;
      if (firebaseId) return enqueueLifecycle(event.manager, firebaseId);
      const id = event.entity?.id ?? event.databaseEntity?.id;
      if (id) {
        const sub = await event.manager.findOne(Subscription, {
          where: { id },
        });
        if (sub) return enqueueLifecycle(event.manager, sub.firebaseId);
      }
    } else if (event.metadata.target !== SubscriptionPlan) return;
    // Bulk updates can omit ids; invalidate all plan memberships rather than miss an entitlement change.
    await event.manager
      .query(`INSERT INTO feezback_lifecycle (firebase_id,next_check_at,generation,attempts,disconnect_requested)
      SELECT firebase_id,UTC_TIMESTAMP(),1,0,0 FROM subscription WHERE firebase_id IS NOT NULL
      ON DUPLICATE KEY UPDATE next_check_at=UTC_TIMESTAMP(),generation=generation+1`);
  }
}
