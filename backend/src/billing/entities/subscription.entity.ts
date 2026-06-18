import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SubscriptionStatus } from '../enums/billing.enums';

/**
 * One record per user. Created automatically on registration/trial start.
 * planId is nullable because during the trial the user may not have selected
 * a paid plan yet. paymentMethodId is nullable until the first payment.
 */
@Entity('subscription')
@Index('ux_subscription_firebase', ['firebaseId'], { unique: true })
@Index('ix_subscription_status_billing', ['status', 'nextBillingDate'])
@Index('ix_subscription_status_trial', ['status', 'trialEnd'])
export class Subscription {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'firebase_id', type: 'varchar', length: 255 })
  firebaseId: string;

  /** FK → subscription_plan.id. Nullable during trial. */
  @Column({ name: 'plan_id', type: 'int', nullable: true, default: null })
  planId: number | null;

  /** FK → payment_method.id. Nullable until first payment. */
  @Column({ name: 'payment_method_id', type: 'int', nullable: true, default: null })
  paymentMethodId: number | null;

  @Column({
    type: 'enum',
    enum: SubscriptionStatus,
    default: SubscriptionStatus.TRIAL,
  })
  status: SubscriptionStatus;

  @Column({ name: 'trial_start', type: 'datetime', nullable: true, default: null })
  trialStart: Date | null;

  @Column({ name: 'trial_end', type: 'datetime', nullable: true, default: null })
  trialEnd: Date | null;

  @Column({ name: 'current_period_start', type: 'datetime', nullable: true, default: null })
  currentPeriodStart: Date | null;

  @Column({ name: 'current_period_end', type: 'datetime', nullable: true, default: null })
  currentPeriodEnd: Date | null;

  @Column({ name: 'next_billing_date', type: 'datetime', nullable: true, default: null })
  nextBillingDate: Date | null;

  @Column({ name: 'grace_period_ends_at', type: 'datetime', nullable: true, default: null })
  gracePeriodEndsAt: Date | null;

  /** Consecutive failed renewal charge attempts for the current billing cycle. Reset to 0 on success. */
  @Column({ name: 'renewal_attempts', type: 'int', default: 0 })
  renewalAttempts: number;

  @Column({ name: 'canceled_at', type: 'datetime', nullable: true, default: null })
  canceledAt: Date | null;

  @Column({ name: 'ended_at', type: 'datetime', nullable: true, default: null })
  endedAt: Date | null;

  /**
   * Per-subscription discount. Mutually exclusive with discountAmountAgorot
   * (enforced in AdminBillingService) — 0-100.
   */
  @Column({ name: 'discount_percent', type: 'int', nullable: true, default: null })
  discountPercent: number | null;

  /**
   * Per-subscription fixed discount in agorot. Mutually exclusive with
   * discountPercent (enforced in AdminBillingService).
   */
  @Column({ name: 'discount_amount_agorot', type: 'int', nullable: true, default: null })
  discountAmountAgorot: number | null;

  /** Discount applies only while NOW() is within [discountStartDate, discountEndDate]. */
  @Column({ name: 'discount_start_date', type: 'date', nullable: true, default: null })
  discountStartDate: Date | null;

  @Column({ name: 'discount_end_date', type: 'date', nullable: true, default: null })
  discountEndDate: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
