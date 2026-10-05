import { Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { BillingAttempt } from './billing-attempt.entity';
import { BillingObligation } from './billing-obligation.entity';

/** Immutable membership of one provider attempt, including failed attempts. */
@Entity('billing_attempt_obligation')
@Index('ix_billing_attempt_obligation_debt', ['obligationId'])
export class BillingAttemptObligation {
  @PrimaryColumn({ name: 'attempt_id', type: 'int' })
  attemptId: number;

  @PrimaryColumn({ name: 'obligation_id', type: 'int' })
  obligationId: number;

  @ManyToOne(() => BillingAttempt, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'attempt_id', foreignKeyConstraintName: 'fk_billing_attempt_obligation_attempt' })
  attempt: BillingAttempt;

  @ManyToOne(() => BillingObligation, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'obligation_id', foreignKeyConstraintName: 'fk_billing_attempt_obligation_debt' })
  obligation: BillingObligation;
}
