import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  BillingObligationKind,
  BillingObligationStatus,
} from '../enums/billing.enums';
import { BillingAttempt } from './billing-attempt.entity';
import { SubscriptionPlan } from './subscription-plan.entity';
import { Subscription } from './subscription.entity';

@Entity('billing_obligation')
@Index('ux_billing_obligation_key', ['obligationKey'], { unique: true })
@Index('ix_billing_obligation_active_attempt', ['activeAttemptId'])
@Index('ix_billing_obligation_satisfied_attempt', ['satisfiedAttemptId'])
@Index('ix_billing_obligation_subscription_status', [
  'subscriptionId',
  'status',
])
@Index('ix_billing_obligation_status_updated', ['status', 'updatedAt'])
@Check('ck_billing_obligation_period', '`period_end` > `period_start`')
@Check(
  'ck_billing_obligation_amounts',
  '`amount_agorot` >= 0 AND `amount_before_vat_agorot` >= 0 AND `vat_amount_agorot` >= 0 AND `amount_before_vat_agorot` + `vat_amount_agorot` = `amount_agorot`',
)
export class BillingObligation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'subscription_id', type: 'int' })
  subscriptionId: number;

  @ManyToOne(() => Subscription, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'subscription_id',
    foreignKeyConstraintName: 'fk_billing_obligation_subscription',
  })
  subscription: Subscription;

  /** Audit snapshot only; authorization continues to resolve through subscription. */
  @Column({ name: 'firebase_id_snapshot', type: 'varchar', length: 255 })
  firebaseIdSnapshot: string;

  @Column({ name: 'obligation_key', type: 'varchar', length: 191 })
  obligationKey: string;

  @Column({ type: 'enum', enum: BillingObligationKind })
  kind: BillingObligationKind;

  @Column({
    type: 'enum',
    enum: BillingObligationStatus,
    default: BillingObligationStatus.OPEN,
  })
  status: BillingObligationStatus;

  @Column({ name: 'plan_id', type: 'int' })
  planId: number;

  @ManyToOne(() => SubscriptionPlan, {
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({
    name: 'plan_id',
    foreignKeyConstraintName: 'fk_billing_obligation_plan',
  })
  plan: SubscriptionPlan;

  /** Inclusive service-period boundary, calculated in Asia/Jerusalem. */
  @Column({ name: 'period_start', type: 'date' })
  periodStart: string;

  /** Exclusive service-period boundary. */
  @Column({ name: 'period_end', type: 'date' })
  periodEnd: string;

  @Column({ name: 'amount_agorot', type: 'int' })
  amountAgorot: number;

  @Column({ name: 'amount_before_vat_agorot', type: 'int' })
  amountBeforeVatAgorot: number;

  @Column({ name: 'vat_amount_agorot', type: 'int' })
  vatAmountAgorot: number;

  @Column({ type: 'char', length: 3, default: 'ILS' })
  currency: string;

  @Column({
    name: 'active_attempt_id',
    type: 'int',
    nullable: true,
    default: null,
  })
  activeAttemptId: number | null;

  @ManyToOne(() => BillingAttempt, {
    nullable: true,
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({
    name: 'active_attempt_id',
    foreignKeyConstraintName: 'fk_billing_obligation_active_attempt',
  })
  activeAttempt: BillingAttempt | null;

  @Column({
    name: 'satisfied_attempt_id',
    type: 'int',
    nullable: true,
    default: null,
  })
  satisfiedAttemptId: number | null;

  @ManyToOne(() => BillingAttempt, {
    nullable: true,
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({
    name: 'satisfied_attempt_id',
    foreignKeyConstraintName: 'fk_billing_obligation_satisfied_attempt',
  })
  satisfiedAttempt: BillingAttempt | null;

  @Column({ type: 'int', default: 0 })
  version: number;

  @OneToMany(() => BillingAttempt, (attempt) => attempt.obligation)
  attempts: BillingAttempt[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({
    name: 'satisfied_at',
    type: 'datetime',
    nullable: true,
    default: null,
  })
  satisfiedAt: Date | null;
}
