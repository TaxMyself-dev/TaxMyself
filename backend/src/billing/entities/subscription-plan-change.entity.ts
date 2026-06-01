import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PlanChangeType, PlanChangeStatus } from '../enums/billing.enums';

/** Records upgrade/downgrade requests and their lifecycle. */
@Entity('subscription_plan_change')
@Index('ix_plan_change_subscription_status', ['subscriptionId', 'status'])
@Index('ix_plan_change_status_scheduled', ['status', 'scheduledFor'])
export class SubscriptionPlanChange {
  @PrimaryGeneratedColumn()
  id: number;

  /** FK → subscription.id. */
  @Column({ name: 'subscription_id', type: 'int' })
  subscriptionId: number;

  /** FK → subscription_plan.id — the plan the user is changing from. */
  @Column({ name: 'from_plan_id', type: 'int' })
  fromPlanId: number;

  /** FK → subscription_plan.id — the plan the user is changing to. */
  @Column({ name: 'to_plan_id', type: 'int' })
  toPlanId: number;

  @Column({
    name: 'change_type',
    type: 'enum',
    enum: PlanChangeType,
  })
  changeType: PlanChangeType;

  @Column({
    type: 'enum',
    enum: PlanChangeStatus,
    default: PlanChangeStatus.PENDING,
  })
  status: PlanChangeStatus;

  /** When the change should take effect (e.g. end of current billing period). */
  @Column({ name: 'scheduled_for', type: 'datetime', nullable: true, default: null })
  scheduledFor: Date | null;

  @Column({ name: 'requested_at', type: 'datetime' })
  requestedAt: Date;

  @Column({ name: 'applied_at', type: 'datetime', nullable: true, default: null })
  appliedAt: Date | null;

  @Column({ type: 'text', nullable: true, default: null })
  reason: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
