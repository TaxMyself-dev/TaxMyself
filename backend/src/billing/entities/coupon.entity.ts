import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DiscountType, DurationType } from '../enums/billing.enums';

/**
 * User-entered coupon codes applied at checkout.
 *
 * Validation rules (enforce at DTO/service level):
 *   - PERCENT       → use discount_percent (0–100)
 *   - FIXED_AMOUNT  → use discount_value_agorot
 *   - FIXED_PRICE   → use discount_value_agorot (the final price to charge)
 */
@Entity('coupon')
@Index('ux_coupon_code', ['code'], { unique: true })
export class Coupon {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100 })
  code: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true, default: null })
  description: string | null;

  @Column({
    name: 'discount_type',
    type: 'enum',
    enum: DiscountType,
  })
  discountType: DiscountType;

  /** Discount amount in agorot. Used for FIXED_AMOUNT and FIXED_PRICE types. */
  @Column({ name: 'discount_value_agorot', type: 'int', nullable: true, default: null })
  discountValueAgorot: number | null;

  /** Discount percentage (0–100). Used for PERCENT type only. */
  @Column({ name: 'discount_percent', type: 'int', nullable: true, default: null })
  discountPercent: number | null;

  @Column({
    name: 'duration_type',
    type: 'enum',
    enum: DurationType,
  })
  durationType: DurationType;

  /** Number of billing cycles the discount applies. Relevant when duration_type = REPEATING. */
  @Column({ name: 'duration_months', type: 'int', nullable: true, default: null })
  durationMonths: number | null;

  @Column({ name: 'starts_at', type: 'datetime', nullable: true, default: null })
  startsAt: Date | null;

  @Column({ name: 'ends_at', type: 'datetime', nullable: true, default: null })
  endsAt: Date | null;

  @Column({ name: 'max_redemptions', type: 'int', nullable: true, default: null })
  maxRedemptions: number | null;

  @Column({ name: 'current_redemptions', type: 'int', default: 0 })
  currentRedemptions: number;

  /** Maximum times a single user may redeem this coupon. Default 1. */
  @Column({ name: 'max_redemptions_per_user', type: 'int', default: 1 })
  maxRedemptionsPerUser: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt: Date | null;
}
