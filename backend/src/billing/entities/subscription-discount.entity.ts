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
 * Private/manual discount tied to a specific subscription.
 *
 * Use cases:
 *   - Early customer lifetime pricing
 *   - Manual admin-granted discount
 *   - Enterprise deal pricing
 *   - Legacy grandfathered price
 *
 * Validation rules (enforce at DTO/service level):
 *   - PERCENT       → use discount_percent (0–100)
 *   - FIXED_AMOUNT  → use discount_value_agorot
 *   - FIXED_PRICE   → use discount_value_agorot (the final price to charge)
 */
@Entity('subscription_discount')
@Index('ix_subscription_discount_active', ['subscriptionId', 'isActive'])
export class SubscriptionDiscount {
  @PrimaryGeneratedColumn()
  id: number;

  /** FK → subscription.id. */
  @Column({ name: 'subscription_id', type: 'int' })
  subscriptionId: number;

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

  /** Short machine-readable reason code (e.g. 'EARLY_ADOPTER', 'ENTERPRISE_DEAL'). */
  @Column({ name: 'reason_code', type: 'varchar', length: 100, nullable: true, default: null })
  reasonCode: string | null;

  /** Human-readable internal note for admin context. */
  @Column({ type: 'text', nullable: true, default: null })
  note: string | null;

  /** Firebase UID of the admin who created this discount. */
  @Column({ name: 'created_by_firebase_id', type: 'varchar', length: 255, nullable: true, default: null })
  createdByFirebaseId: string | null;

  @Column({ name: 'approved_at', type: 'datetime', nullable: true, default: null })
  approvedAt: Date | null;

  @Column({ name: 'starts_at', type: 'datetime', nullable: true, default: null })
  startsAt: Date | null;

  @Column({ name: 'ends_at', type: 'datetime', nullable: true, default: null })
  endsAt: Date | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt: Date | null;
}
