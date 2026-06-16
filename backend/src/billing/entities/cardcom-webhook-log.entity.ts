import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WebhookLogStatus } from '../enums/billing.enums';

/**
 * Dedicated log for all inbound CardCom webhook calls.
 *
 * idempotency_key strategy (choose the most specific available):
 *   1. CardCom event ID (if CardCom provides one)
 *   2. LowProfileId (unique per checkout attempt)
 *   3. DealNumber (unique per successful charge)
 *   4. SHA256(payload) as a last-resort fallback
 *
 * Service logic for choosing and computing the key lives in the webhook handler —
 * this entity just stores whatever key is derived.
 */
@Entity('cardcom_webhook_log')
@Index('ux_webhook_idempotency', ['idempotencyKey'], { unique: true })
export class CardcomWebhookLog {
  @PrimaryGeneratedColumn()
  id: number;

  /** Extracted from ReturnValue JSON — firebase user identifier. */
  @Column({ name: 'firebase_id', type: 'varchar', length: 255, nullable: true, default: null })
  firebaseId: string | null;

  /** Extracted from ReturnValue JSON — subscription plan id. */
  @Column({ name: 'plan_id', type: 'int', nullable: true, default: null })
  planId: number | null;

  /** Extracted from ReturnValue JSON — subscription row id. */
  @Column({ name: 'subscription_id', type: 'int', nullable: true, default: null })
  subscriptionId: number | null;

  /** CardCom LowProfileId from webhook payload — used for GetLpResult verification. */
  @Column({ name: 'cardcom_low_profile_id', type: 'varchar', length: 255, nullable: true, default: null })
  cardcomLowProfileId: string | null;

  /** CardCom TranzactionId from webhook payload — deal identifier. */
  @Column({ name: 'cardcom_transaction_id', type: 'varchar', length: 128, nullable: true, default: null })
  cardcomTransactionId: string | null;

  /** Top-level ResponseCode from the webhook payload. */
  @Column({ name: 'response_code', type: 'int', nullable: true, default: null })
  responseCode: number | null;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 512 })
  idempotencyKey: string;

  @Column({ name: 'event_type', type: 'varchar', length: 128, nullable: true, default: null })
  eventType: string | null;

  @Column({ type: 'json' })
  payload: Record<string, any>;

  @Column({
    type: 'enum',
    enum: WebhookLogStatus,
    default: WebhookLogStatus.RECEIVED,
  })
  status: WebhookLogStatus;

  @Column({ name: 'processed_at', type: 'datetime', nullable: true, default: null })
  processedAt: Date | null;

  @Column({ name: 'error_message', type: 'text', nullable: true, default: null })
  errorMessage: string | null;

  /** Timestamp the HTTP request arrived, set by the caller before persisting. */
  @Column({ name: 'received_at', type: 'datetime' })
  receivedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
