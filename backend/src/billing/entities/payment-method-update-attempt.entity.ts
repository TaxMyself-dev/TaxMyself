import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PaymentMethodUpdateAttemptStatus } from '../enums/billing.enums';
import { PaymentMethod } from './payment-method.entity';
import { Subscription } from './subscription.entity';

@Entity('payment_method_update_attempt')
@Index('ux_payment_method_update_public_token', ['publicToken'], {
  unique: true,
})
@Index('ux_payment_method_update_low_profile', ['cardcomLowProfileId'], {
  unique: true,
})
@Index('ux_payment_method_update_result', ['resultPaymentMethodId'], {
  unique: true,
})
@Index('ix_payment_method_update_subscription_status', [
  'subscriptionId',
  'status',
])
@Index('ix_payment_method_update_status_action', ['status', 'nextActionAt'])
export class PaymentMethodUpdateAttempt {
  @PrimaryGeneratedColumn()
  id: number;

  /** Opaque browser-safe handle; never encodes user, subscription or card data. */
  @Column({ name: 'public_token', type: 'varchar', length: 191 })
  publicToken: string;

  @Column({ name: 'subscription_id', type: 'int' })
  subscriptionId: number;

  @ManyToOne(() => Subscription, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'subscription_id',
    foreignKeyConstraintName: 'fk_payment_method_update_subscription',
  })
  subscription: Subscription;

  @Column({ name: 'firebase_id_snapshot', type: 'varchar', length: 255 })
  firebaseIdSnapshot: string;

  @Column({
    type: 'enum',
    enum: PaymentMethodUpdateAttemptStatus,
    default: PaymentMethodUpdateAttemptStatus.CREATED,
  })
  status: PaymentMethodUpdateAttemptStatus;

  @Column({
    name: 'cardcom_low_profile_id',
    type: 'varchar',
    length: 255,
    nullable: true,
    default: null,
  })
  cardcomLowProfileId: string | null;

  @Column({ name: 'return_value_version', type: 'smallint', default: 1 })
  returnValueVersion: number;

  @Column({
    name: 'previous_payment_method_id',
    type: 'int',
    nullable: true,
    default: null,
  })
  previousPaymentMethodId: number | null;

  @ManyToOne(() => PaymentMethod, {
    nullable: true,
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({
    name: 'previous_payment_method_id',
    foreignKeyConstraintName: 'fk_payment_method_update_previous_method',
  })
  previousPaymentMethod: PaymentMethod | null;

  @Column({
    name: 'result_payment_method_id',
    type: 'int',
    nullable: true,
    default: null,
  })
  resultPaymentMethodId: number | null;

  @ManyToOne(() => PaymentMethod, {
    nullable: true,
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({
    name: 'result_payment_method_id',
    foreignKeyConstraintName: 'fk_payment_method_update_result_method',
  })
  resultPaymentMethod: PaymentMethod | null;

  @Column({
    name: 'provider_response_code',
    type: 'int',
    nullable: true,
    default: null,
  })
  providerResponseCode: number | null;

  @Column({
    name: 'failure_category',
    type: 'varchar',
    length: 64,
    nullable: true,
    default: null,
  })
  failureCategory: string | null;

  @Column({
    name: 'lease_owner',
    type: 'varchar',
    length: 191,
    nullable: true,
    default: null,
  })
  leaseOwner: string | null;

  @Column({
    name: 'lease_expires_at',
    type: 'datetime',
    nullable: true,
    default: null,
  })
  leaseExpiresAt: Date | null;

  @Column({ name: 'state_version', type: 'int', default: 0 })
  stateVersion: number;

  @Column({
    name: 'next_action_at',
    type: 'datetime',
    nullable: true,
    default: null,
  })
  nextActionAt: Date | null;

  @Column({ name: 'verification_attempts', type: 'int', default: 0 })
  verificationAttempts: number;

  /** CardCom TokenExDate: provider token deletion date, not card expiry. */
  @Column({
    name: 'token_delete_at',
    type: 'datetime',
    nullable: true,
    default: null,
  })
  tokenDeleteAt: Date | null;

  @Column({
    name: 'completed_at',
    type: 'datetime',
    nullable: true,
    default: null,
  })
  completedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
