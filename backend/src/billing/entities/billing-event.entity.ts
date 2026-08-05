import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BillingEventType } from '../enums/billing.enums';

/**
 * Internal audit trail of billing system actions. Rows are append-only except
 * for the receipt columns on PAYMENT_SUCCESS events, which are updated once
 * when BillingReceiptService creates the receipt after the payment commits.
 */
@Entity('billing_event')
@Index('ix_billing_event_subscription', ['subscriptionId', 'createdAt'])
@Index('ix_billing_event_user', ['firebaseId', 'createdAt'])
@Index('ix_billing_event_type', ['eventType'])
@Index('ix_billing_event_receipt_lookup', ['eventType', 'cardcomDealNumber'])
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
