import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PaymentMethodUpdateAttempt } from './payment-method-update-attempt.entity';

@Entity('payment_method')
@Index('ix_payment_method_firebase', ['firebaseId'])
@Index('ux_payment_method_source_update_attempt', ['sourceUpdateAttemptId'], { unique: true })
export class PaymentMethod {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'firebase_id', type: 'varchar', length: 255 })
  firebaseId: string;

  @Column({ name: 'cardcom_token', type: 'varchar', length: 512 })
  cardcomToken: string;

  @Column({ name: 'last4', type: 'varchar', length: 4, nullable: true, default: null })
  last4: string | null;

  @Column({ name: 'card_brand', type: 'varchar', length: 50, nullable: true, default: null })
  cardBrand: string | null;

  @Column({ name: 'card_expiry_month', type: 'int', nullable: true, default: null })
  cardExpiryMonth: number | null;

  @Column({ name: 'card_expiry_year', type: 'int', nullable: true, default: null })
  cardExpiryYear: number | null;

  @Column({ name: 'source_update_attempt_id', type: 'int', nullable: true, default: null })
  sourceUpdateAttemptId: number | null;

  @ManyToOne(() => PaymentMethodUpdateAttempt, { nullable: true, onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({
    name: 'source_update_attempt_id',
    foreignKeyConstraintName: 'fk_payment_method_source_update_attempt',
  })
  sourceUpdateAttempt: PaymentMethodUpdateAttempt | null;

  /** CardCom TokenExDate: token deletion date, distinct from card expiry. */
  @Column({ name: 'cardcom_token_delete_at', type: 'datetime', nullable: true, default: null })
  cardcomTokenDeleteAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt: Date | null;
}
