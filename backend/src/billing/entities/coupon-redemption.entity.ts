import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Records each coupon usage event.
 *
 * The unique index on (coupon_id, firebase_id) enforces max_redemptions_per_user = 1
 * at the database level. If the business requirement changes to allow more than one
 * redemption per user, drop the unique index and enforce the limit in service logic.
 */
@Entity('coupon_redemption')
@Index('ux_coupon_redemption_user', ['couponId', 'firebaseId'], { unique: true })
@Index('ix_coupon_redemption_subscription', ['subscriptionId'])
export class CouponRedemption {
  @PrimaryGeneratedColumn()
  id: number;

  /** FK → coupon.id. */
  @Column({ name: 'coupon_id', type: 'int' })
  couponId: number;

  @Column({ name: 'firebase_id', type: 'varchar', length: 255 })
  firebaseId: string;

  /** FK → subscription.id. */
  @Column({ name: 'subscription_id', type: 'int' })
  subscriptionId: number;

  /** FK → cardcom_checkout_session.id. */
  @Column({ name: 'checkout_session_id', type: 'int', nullable: true, default: null })
  checkoutSessionId: number | null;

  /** Actual discount amount applied for this redemption, in agorot. */
  @Column({ name: 'redeemed_amount_agorot', type: 'int' })
  redeemedAmountAgorot: number;

  @Column({ name: 'redeemed_at', type: 'datetime' })
  redeemedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
