import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Subscription } from './subscription.entity';

@Entity('billing_payer_profile')
@Index('ux_billing_payer_profile_subscription', ['subscriptionId'], { unique: true })
export class BillingPayerProfile {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'subscription_id', type: 'int' })
  subscriptionId: number;

  @OneToOne(() => Subscription, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'subscription_id',
    foreignKeyConstraintName: 'fk_billing_payer_profile_subscription',
  })
  subscription: Subscription;

  @Column({ name: 'full_name', type: 'varchar', length: 255, nullable: true })
  fullName: string | null;

  @Column({ name: 'identity_number', type: 'varchar', length: 32, nullable: true })
  identityNumber: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  phone: string | null;

  @Column({ name: 'business_number', type: 'varchar', length: 32, nullable: true })
  businessNumber: string | null;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ name: 'verified_at', type: 'datetime', nullable: true })
  verifiedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
