import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ModuleName } from 'src/enum';

@Entity('subscription_plan')
@Index('ux_subscription_plan_slug', ['slug'], { unique: true })
@Index('ix_subscription_plan_listing', ['isActive', 'isPublic', 'displayOrder'])
export class SubscriptionPlan {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100 })
  slug: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true, default: null })
  description: string | null;

  /** Monthly price in agorot (integer). Example: ₪54.00 = 5400. */
  @Column({ name: 'price_monthly_agorot', type: 'int' })
  priceMonthlyAgorot: number;

  @Column({ type: 'varchar', length: 3, default: 'ILS' })
  currency: string;

  /** List of ModuleName values included in this plan. */
  @Column({ name: 'modules', type: 'simple-json', nullable: true, default: null })
  modules: ModuleName[] | null;

  @Column({ name: 'trial_days', type: 'int', default: 14 })
  trialDays: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'is_public', type: 'boolean', default: true })
  isPublic: boolean;

  @Column({ name: 'display_order', type: 'int', default: 0 })
  displayOrder: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt: Date | null;
}
