import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Documents } from '../../documents/documents.entity';
import {
  BillingAttemptStatus,
  BillingAttemptTrigger,
  BillingChargeMode,
} from '../enums/billing.enums';
import { BillingObligation } from './billing-obligation.entity';
import { PaymentMethod } from './payment-method.entity';
import { SubscriptionPlan } from './subscription-plan.entity';

@Entity('billing_attempt')
@Index('ux_billing_attempt_number', ['obligationId', 'attemptNumber'], {
  unique: true,
})
@Index('ux_billing_attempt_external_uniq', ['cardcomExternalUniqTranId'], {
  unique: true,
})
@Index('ux_billing_attempt_low_profile', ['cardcomLowProfileId'], {
  unique: true,
})
@Index('ux_billing_attempt_receipt', ['receiptDocId'], { unique: true })
@Index('ix_billing_attempt_status_action', ['status', 'nextActionAt'])
@Index('ix_billing_attempt_lease_status', ['leaseExpiresAt', 'status'])
@Index('ix_billing_attempt_obligation_status', ['obligationId', 'status'])
@Check('ck_billing_attempt_number', '`attempt_number` > 0')
@Check(
  'ck_billing_attempt_amounts',
  '`amount_agorot` >= 0 AND `amount_before_vat_agorot` >= 0 AND `vat_amount_agorot` >= 0 AND `amount_before_vat_agorot` + `vat_amount_agorot` = `amount_agorot`',
)
export class BillingAttempt {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'obligation_id', type: 'int' })
  obligationId: number;

  @ManyToOne(() => BillingObligation, (obligation) => obligation.attempts, {
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({
    name: 'obligation_id',
    foreignKeyConstraintName: 'fk_billing_attempt_obligation',
  })
  obligation: BillingObligation;

  @Column({ name: 'attempt_number', type: 'int' })
  attemptNumber: number;

  @Column({ type: 'enum', enum: BillingAttemptTrigger })
  trigger: BillingAttemptTrigger;

  @Column({ name: 'charge_mode', type: 'enum', enum: BillingChargeMode })
  chargeMode: BillingChargeMode;

  @Column({
    type: 'enum',
    enum: BillingAttemptStatus,
    default: BillingAttemptStatus.CREATED,
  })
  status: BillingAttemptStatus;

  @Column({
    name: 'payment_method_id',
    type: 'int',
    nullable: true,
    default: null,
  })
  paymentMethodId: number | null;

  @ManyToOne(() => PaymentMethod, {
    nullable: true,
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({
    name: 'payment_method_id',
    foreignKeyConstraintName: 'fk_billing_attempt_payment_method',
  })
  paymentMethod: PaymentMethod | null;

  /** CardCom ExternalUniqTranId: opaque, immutable and limited by the provider to 25 chars. */
  @Column({
    name: 'cardcom_external_uniq_tran_id',
    type: 'varchar',
    length: 25,
    update: false,
  })
  cardcomExternalUniqTranId: string;

  @Column({
    name: 'cardcom_low_profile_id',
    type: 'varchar',
    length: 255,
    nullable: true,
    default: null,
  })
  cardcomLowProfileId: string | null;

  /** Provider terminal context; pairs with transaction id during reconciliation. */
  @Column({
    name: 'provider_terminal_ref',
    type: 'varchar',
    length: 100,
    nullable: true,
    default: null,
  })
  providerTerminalRef: string | null;

  @Column({
    name: 'cardcom_transaction_id',
    type: 'varchar',
    length: 128,
    nullable: true,
    default: null,
  })
  cardcomTransactionId: string | null;

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

  @Column({ name: 'plan_id', type: 'int' })
  planId: number;

  @ManyToOne(() => SubscriptionPlan, {
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({
    name: 'plan_id',
    foreignKeyConstraintName: 'fk_billing_attempt_plan',
  })
  plan: SubscriptionPlan;

  @Column({ name: 'amount_agorot', type: 'int' })
  amountAgorot: number;

  @Column({ name: 'amount_before_vat_agorot', type: 'int' })
  amountBeforeVatAgorot: number;

  @Column({ name: 'vat_amount_agorot', type: 'int' })
  vatAmountAgorot: number;

  @Column({ type: 'char', length: 3, default: 'ILS' })
  currency: string;

  @Column({
    name: 'receipt_doc_id',
    type: 'int',
    nullable: true,
    default: null,
  })
  receiptDocId: number | null;

  @ManyToOne(() => Documents, {
    nullable: true,
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
  })
  @JoinColumn({
    name: 'receipt_doc_id',
    foreignKeyConstraintName: 'fk_billing_attempt_receipt',
  })
  receipt: Documents | null;

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

  @Column({
    name: 'unknown_since',
    type: 'datetime',
    nullable: true,
    default: null,
  })
  unknownSince: Date | null;

  @Column({
    name: 'submitted_at',
    type: 'datetime',
    nullable: true,
    default: null,
  })
  submittedAt: Date | null;

  @Column({
    name: 'captured_at',
    type: 'datetime',
    nullable: true,
    default: null,
  })
  capturedAt: Date | null;

  @Column({
    name: 'completed_at',
    type: 'datetime',
    nullable: true,
    default: null,
  })
  completedAt: Date | null;

  @Column({ name: 'reconciliation_attempts', type: 'int', default: 0 })
  reconciliationAttempts: number;

  @Column({
    name: 'last_reconciled_at',
    type: 'datetime',
    nullable: true,
    default: null,
  })
  lastReconciledAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
