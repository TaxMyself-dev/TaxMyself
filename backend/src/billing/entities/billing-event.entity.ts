import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BillingEventType } from '../enums/billing.enums';
import { BillingAttempt } from './billing-attempt.entity';
import { BillingObligation } from './billing-obligation.entity';
import { PaymentMethodUpdateAttempt } from './payment-method-update-attempt.entity';

/**
 * Internal audit trail of billing system actions. Rows are append-only except
 * for the receipt columns on PAYMENT_SUCCESS events, which are updated once
 * when BillingReceiptService creates the receipt after the payment commits.
 * PRORATED_V1 plan-change snapshots and CANCEL_AT_PERIOD_END_V1 commands are mandatory
 * transactional operational records; their persistence failure must roll back.
 */
@Entity('billing_event')
@Index('ix_billing_event_subscription', ['subscriptionId', 'createdAt'])
@Index('ix_billing_event_user', ['firebaseId', 'createdAt'])
@Index('ix_billing_event_type', ['eventType'])
@Index('ix_billing_event_receipt_lookup', ['eventType', 'cardcomDealNumber'])
@Index('ix_billing_event_obligation', ['billingObligationId', 'createdAt'])
@Index('ix_billing_event_attempt', ['billingAttemptId', 'createdAt'])
@Index('ix_billing_event_payment_method_update', ['paymentMethodUpdateAttemptId', 'createdAt'])
export class BillingEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'firebase_id', type: 'varchar', length: 255 })
  firebaseId: string;

  /** FK → subscription.id. */
  @Column({ name: 'subscription_id', type: 'int', nullable: true, default: null })
  subscriptionId: number | null;

  /** FK → payment_method.id. */
  @Column({ name: 'payment_method_id', type: 'int', nullable: true, default: null })
  paymentMethodId: number | null;

  /** Optional audit correlation only; operational coordination lives in the aggregate tables. */
  @Column({ name: 'billing_obligation_id', type: 'int', nullable: true, default: null })
  billingObligationId: number | null;

  @ManyToOne(() => BillingObligation, { nullable: true, onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'billing_obligation_id', foreignKeyConstraintName: 'fk_billing_event_obligation' })
  billingObligation: BillingObligation | null;

  @Column({ name: 'billing_attempt_id', type: 'int', nullable: true, default: null })
  billingAttemptId: number | null;

  @ManyToOne(() => BillingAttempt, { nullable: true, onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'billing_attempt_id', foreignKeyConstraintName: 'fk_billing_event_attempt' })
  billingAttempt: BillingAttempt | null;

  @Column({ name: 'payment_method_update_attempt_id', type: 'int', nullable: true, default: null })
  paymentMethodUpdateAttemptId: number | null;

  @ManyToOne(() => PaymentMethodUpdateAttempt, { nullable: true, onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'payment_method_update_attempt_id',
    foreignKeyConstraintName: 'fk_billing_event_payment_method_update',
  })
  paymentMethodUpdateAttempt: PaymentMethodUpdateAttempt | null;

  @Column({
    name: 'event_type',
    type: 'enum',
    enum: BillingEventType,
  })
  eventType: BillingEventType;

  /**
   * Total charged amount in agorot, VAT-inclusive.
   * This is the canonical "what the customer paid" figure and matches CardCom's
   * TranzactionInfo.Amount × 100 on PAYMENT_SUCCESS rows.
   */
  @Column({ name: 'amount_agorot', type: 'int', nullable: true, default: null })
  amountAgorot: number | null;

  /**
   * Pre-VAT base amount in agorot (plan price after discounts, before VAT).
   * Set at CHECKOUT_CREATED time from PricingService.calculateBillingAmounts().
   * Copied to PAYMENT_SUCCESS so receipt generation never needs to recalculate.
   */
  @Column({ name: 'amount_before_vat_agorot', type: 'int', nullable: true, default: null })
  amountBeforeVatAgorot: number | null;

  /** VAT component in agorot. amountBeforeVatAgorot + vatAmountAgorot === amountAgorot. */
  @Column({ name: 'vat_amount_agorot', type: 'int', nullable: true, default: null })
  vatAmountAgorot: number | null;

  @Column({ type: 'varchar', length: 3, default: 'ILS' })
  currency: string;

  /** CardCom transaction/deal ID. Primary idempotency anchor for receipt creation. */
  @Column({ name: 'cardcom_deal_number', type: 'varchar', length: 255, nullable: true, default: null })
  cardcomDealNumber: string | null;

  /**
   * FK → documents.id. Set by BillingReceiptService after a receipt is created
   * for this payment. Non-null means receipt already exists — skip re-creation.
   * Join to documents to get docNumber, file paths, and all other receipt fields.
   */
  @Column({ name: 'receipt_doc_id', type: 'int', nullable: true, default: null })
  receiptDocId: number | null;

  /** True once the receipt email was successfully delivered to the customer. */
  @Column({ name: 'receipt_email_sent', type: 'boolean', default: false })
  receiptEmailSent: boolean;

  /** Arbitrary extra data relevant to this specific event type. */
  @Column({ type: 'json', nullable: true, default: null })
  metadata: Record<string, any> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
