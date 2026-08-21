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
import { Expense } from '../expenses/expenses.entity';

/**
 * One materialized depreciation journal posting per source equipment expense
 * and tax year. The unique index is the idempotency boundary used by both the
 * expense-create path and P&L preparation.
 */
@Entity('asset_depreciation_posting')
@Index('uq_asset_depreciation_expense_year', ['expenseId', 'taxYear'], { unique: true })
@Index('ix_asset_depreciation_business_year', ['businessNumber', 'taxYear'])
export class AssetDepreciationPosting {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  expenseId: number;

  @ManyToOne(() => Expense, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'expenseId', foreignKeyConstraintName: 'fk_asset_depreciation_expense' })
  expense: Expense;

  @Column()
  firebaseId: string;

  @Column()
  businessNumber: string;

  @Column({ type: 'int' })
  taxYear: number;

  @Column({ type: 'date' })
  activationDateSnapshot: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  originalCostSnapshot: number;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  depreciationRateSnapshot: number;

  @Column({ type: 'int' })
  activeDays: number;

  @Column({ type: 'int' })
  daysInYear: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  /** Equipment/source card credited by the direct-depreciation posting. */
  @Column()
  sourceAccountCode: string;

  @Column({ type: 'int', nullable: true, default: null })
  journalEntryNumber: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
