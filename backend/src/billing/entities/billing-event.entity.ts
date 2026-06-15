import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BillingEventType } from '../enums/billing.enums';

/**
 * Immutable internal audit trail of everything the billing system does.
 * Append-only — no update, no soft delete.
 */
@Entity('billing_event')
@Index('ix_billing_event_subscription', ['subscriptionId', 'createdAt'])
@Index('ix_billing_event_user', ['firebaseId', 'createdAt'])
@Index('ix_billing_event_type', ['eventType'])
export class BillingEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'firebase_id', type: 'varchar', length: 255 })
  firebaseId: string;

  /** FK → subscription.id. */
  @Column({ name: 'subscription_id', type: 'int', nullable: true, default: null })
  subscriptionId: number | null;

  /** FK → cardcom_checkout_session.id. */
  @Column({ name: 'checkout_session_id', type: 'int', nullable: true, default: null })
  checkoutSessionId: number | null;

  /** FK → payment_method.id. */
  @Column({ name: 'payment_method_id', type: 'int', nullable: true, default: null })
  paymentMethodId: number | null;

  @Column({
    name: 'event_type',
    type: 'enum',
    enum: BillingEventType,
  })
  eventType: BillingEventType;

  /** Amount involved in this event, in agorot. */
  @Column({ name: 'amount_agorot', type: 'int', nullable: true, default: null })
  amountAgorot: number | null;

  @Column({ type: 'varchar', length: 3, default: 'ILS' })
  currency: string;

  @Column({ name: 'cardcom_deal_number', type: 'varchar', length: 255, nullable: true, default: null })
  cardcomDealNumber: string | null;

  @Column({ name: 'cardcom_document_number', type: 'varchar', length: 255, nullable: true, default: null })
  cardcomDocumentNumber: string | null;

  @Column({ name: 'cardcom_document_type', type: 'varchar', length: 100, nullable: true, default: null })
  cardcomDocumentType: string | null;

  @Column({ name: 'cardcom_document_url', type: 'varchar', length: 2048, nullable: true, default: null })
  cardcomDocumentUrl: string | null;

  /** Arbitrary extra data relevant to this specific event type. */
  @Column({ type: 'json', nullable: true, default: null })
  metadata: Record<string, any> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
