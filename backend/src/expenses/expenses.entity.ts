import { SingleMonthReport, DualMonthReport, ExpenseReportScope } from 'src/enum';
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
} from 'typeorm'

@Entity()
export class Expense {

  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  supplier: string;

  @Column({ nullable: true, default: null })
  supplierID: string;

  @Column()
  category: string;

  @Column()
  subCategory: string;

  @Column('decimal', { precision: 10, scale: 2 })
  sum: number;

  @Column('decimal')
  taxPercent: number;

  @Column('decimal')
  vatPercent: number;

  @Column('date')
  date: Date;

  @Column()
  businessNumber: string;

  @Column({ nullable: true, default: null })
  note: string;

  @Column({ nullable: true, default: null })
  file: string;

  @Column('boolean')
  isEquipment: boolean;

  @Column()
  userId: string;

  @Column('date')
  loadingDate: Date;

  @Column({ nullable: true, default: null })
  expenseNumber: string;

  @Column({ nullable: true, default: null })
  reductionDone: number;

  @Column()
  reductionPercent: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  totalTaxPayable: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  totalVatPayable: number;

  @Column({
    type: 'int',
    nullable: true,
    default: null,
  })
  transId: number;

  /**
   * Stable identity of the source cache/slim transaction this Expense row
   * was created from. Used to keep the Expense in sync when the user
   * re-classifies a confirmed-but-not-yet-locked transaction.
   * Null for legacy Expenses created before this link existed, or for rows
   * added manually (not from a bank/card transaction).
   */
  @Column({
    type: 'varchar',
    nullable: true,
    default: null,
  })
  externalTransactionId: string | null;

  /**
   * Original currency code if the underlying transaction wasn't in ILS.
   * `sum` is always ILS (already converted via BOI rate), but the תזרים /
   * expenses tables show "$X (₪Y)" for foreign-currency rows — so we need
   * to remember the original currency + sum at confirm/manual-entry time.
   * Null for plain ILS rows.
   */
  @Column({ type: 'varchar', length: 3, nullable: true, default: null })
  originalCurrency: string | null;

  /** Original (non-ILS) amount, paired with `originalCurrency`. Null for ILS rows. */
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true, default: null })
  originalSum: number | null;

  @Column({
    type: 'varchar',
    nullable: true,
    default: null,
  })
  vatReportingDate: SingleMonthReport | DualMonthReport | null;

  @Column({
    type: 'boolean',
    nullable: true,
    default: null,
  })
  isReported: boolean;

  /**
   * Snapshot of the subcategory's report scope at classify/confirm time.
   * Default 'pnl' (forward-only — existing rows behave as today). ANNUAL
   * expenses are excluded from the P&L and shown in the annual section.
   */
  @Column({ type: 'enum', enum: ExpenseReportScope, default: ExpenseReportScope.PNL })
  reportScope: ExpenseReportScope;

  /**
   * Optional per-expense P&L-category override (rare). Resolution precedence
   * in the P&L: this → subcategory.pnlCategory → bookkeeping category.
   * NULL for all legacy/most rows.
   */
  @Column({ type: 'varchar', nullable: true, default: null })
  pnlCategory: string | null;

}