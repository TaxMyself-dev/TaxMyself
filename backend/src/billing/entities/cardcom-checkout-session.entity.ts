import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CheckoutSessionStatus } from '../enums/billing.enums';

@Entity('cardcom_checkout_session')
@Index('ix_checkout_status_expires', ['status', 'expiresAt'])
@Index('ix_checkout_low_profile', ['cardcomLowProfileId'])
@Index('ix_checkout_deal_number', ['cardcomDealNumber'])
export class CardcomCheckoutSession {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'firebase_id', type: 'varchar', length: 255 })
  firebaseId: string;

  /** FK → subscription.id. NOT NULL — subscription is always created at trial/signup. */
  @Column({ name: 'subscription_id', type: 'int' })
  subscriptionId: number;

  /** FK → subscription_plan.id. NOT NULL — a plan must be selected to initiate checkout. */
  @Column({ name: 'plan_id', type: 'int' })
  planId: number;

  @Column({
    type: 'enum',
    enum: CheckoutSessionStatus,
    default: CheckoutSessionStatus.PENDING,
  })
  status: CheckoutSessionStatus;

  /** Original price before any discounts, in agorot. */
  @Column({ name: 'original_amount_agorot', type: 'int' })
  originalAmountAgorot: number;

  /** Total discount amount in agorot (coupon + promotion + manual discount combined). */
  @Column({ name: 'discount_amount_agorot', type: 'int', default: 0 })
  discountAmountAgorot: number;

  /** Final charged amount in agorot (original − discount). */
  @Column({ name: 'final_amount_agorot', type: 'int' })
  finalAmountAgorot: number;

  @Column({ type: 'varchar', length: 3, default: 'ILS' })
  currency: string;

  /** FK → coupon.id. */
  @Column({ name: 'coupon_id', type: 'int', nullable: true, default: null })
  couponId: number | null;

  /** FK → promotion.id. */
  @Column({ name: 'promotion_id', type: 'int', nullable: true, default: null })
  promotionId: number | null;

  /** FK → subscription_discount.id. */
  @Column({ name: 'subscription_discount_id', type: 'int', nullable: true, default: null })
  subscriptionDiscountId: number | null;

  /** LowProfileId returned by CardCom when creating the hosted payment page. */
  @Column({ name: 'cardcom_low_profile_id', type: 'varchar', length: 255, nullable: true, default: null })
  cardcomLowProfileId: string | null;

  /** DealNumber returned by CardCom after a successful charge. */
  @Column({ name: 'cardcom_deal_number', type: 'varchar', length: 255, nullable: true, default: null })
  cardcomDealNumber: string | null;

  /** Document number from CardCom (receipt/invoice reference). */
  @Column({ name: 'cardcom_document_number', type: 'varchar', length: 255, nullable: true, default: null })
  cardcomDocumentNumber: string | null;

  /** Document type code from CardCom (e.g. receipt, tax invoice). */
  @Column({ name: 'cardcom_document_type', type: 'varchar', length: 100, nullable: true, default: null })
  cardcomDocumentType: string | null;

  /** Public URL to the CardCom-generated document. */
  @Column({ name: 'cardcom_document_url', type: 'varchar', length: 2048, nullable: true, default: null })
  cardcomDocumentUrl: string | null;

  @Column({ name: 'paid_at', type: 'datetime', nullable: true, default: null })
  paidAt: Date | null;

  @Column({ name: 'webhook_received_at', type: 'datetime', nullable: true, default: null })
  webhookReceivedAt: Date | null;

  @Column({ name: 'verified_at', type: 'datetime', nullable: true, default: null })
  verifiedAt: Date | null;

  @Column({ name: 'expires_at', type: 'datetime' })
  expiresAt: Date;

  /** Raw CardCom webhook/response payload stored for debugging and auditing. */
  @Column({ name: 'raw_cardcom_response', type: 'json', nullable: true, default: null })
  rawCardcomResponse: Record<string, any> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
