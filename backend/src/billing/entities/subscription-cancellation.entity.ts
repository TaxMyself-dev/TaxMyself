import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CancellationReason } from '../enums/billing.enums';

/**
 * Records cancellation analytics when a user cancels their subscription.
 * Append-only — no soft delete, no update.
 */
@Entity('subscription_cancellation')
@Index('ix_subscription_cancellation_sub', ['subscriptionId'])
export class SubscriptionCancellation {
  @PrimaryGeneratedColumn()
  id: number;

  /** FK → subscription.id. */
  @Column({ name: 'subscription_id', type: 'int' })
  subscriptionId: number;

  @Column({ name: 'firebase_id', type: 'varchar', length: 255 })
  firebaseId: string;

  @Column({
    name: 'reason_code',
    type: 'enum',
    enum: CancellationReason,
  })
  reasonCode: CancellationReason;

  @Column({ name: 'feedback_text', type: 'text', nullable: true, default: null })
  feedbackText: string | null;

  @Column({ name: 'canceled_at', type: 'datetime' })
  canceledAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
