import { SingleMonthReport, DualMonthReport, ExpenseReportScope, ExpenseApprovalStatus } from 'src/enum';
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

  /**
   * Renamed in place from `taxPercent` (D6, Phase 3.1) — the same column,
   * no data copy needed. Historically (and still, pre-Phase-4) set at
   * creation time, the moment an expense is journal-posted — there is no
   * separate PENDING-then-APPROVED write path yet, so "snapshot" here means
   * exactly what it always meant: the percent used for this expense's own
   * VAT/tax calculation and journal lines.
   */
  @Column('decimal')
  taxPercentSnapshot: number;

  /** Renamed in place from `vatPercent` — see taxPercentSnapshot. */
  @Column('decimal')
  vatPercentSnapshot: number;

  @Column('date')
  date: Date;

  @Column()
  businessNumber: string;

  @Column({ nullable: true, default: null })
  note: string;

  @Column({ nullable: true, default: null })
  file: string;

  /** Renamed in place from `isEquipment` — see taxPercentSnapshot. */
  @Column('boolean')
  isEquipmentSnapshot: boolean;

  @Column()
  userId: string;

  @Column('date')
  loadingDate: Date;

  @Column({ nullable: true, default: null })
  expenseNumber: string;

  @Column({ nullable: true, default: null })
  reductionDone: number;

  /** Renamed in place from `reductionPercent` — see taxPercentSnapshot. */
  @Column()
  reductionPercentSnapshot: number;

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
   * The extracted_document.id this Expense was approved from. Set by the
   * unified review-modal approve paths (doc-cash, matched). Used to:
   *   • un-approve a row (drop the Expense, flip doc back to pending_review)
   *   • audit which expenses came from a given PDF
   * For rows approved from a "matched" review row this is set ALONGSIDE
   * externalTransactionId — one Expense, two source pointers.
   */
  @Column({ name: 'source_document_id', type: 'int', nullable: true, default: null })
  sourceDocumentId: number | null;

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

  /**
   * The entryNumber of the JournalEntry created for this expense.
   * Stored so that when the expense is edited, the journal entry can be
   * found and updated by entryNumber (stable, per-business running number)
   * instead of relying only on referenceType+referenceId lookup.
   * NULL for legacy rows created before this field was added.
   */
  @Column({ type: 'int', nullable: true, default: null })
  journalEntryNumber: number | null;

  // ==========================================================================
  // D6 (Phase 3) — catalog FK + accounting-law snapshot + description +
  // approval workflow. Backfilled from the journal (the historical source of
  // truth) in Phase 3.2/3.3/3.4; NOT YET written by addExpense/updateExpense
  // — that switchover is Phase 4.1. All nullable: legacy rows predate every
  // one of these columns.
  // ==========================================================================

  /** FK -> sub_category.id (real DB constraint, added Phase 3.5 after backfill
   *  is verified clean). Resolved from (category, subCategory, userId,
   *  businessNumber) against the merged catalog (Phase 3.2). */
  @Column({ type: 'int', nullable: true, default: null })
  subCategoryId: number | null;

  @Column({ type: 'int', nullable: true, default: null })
  sectionIdSnapshot: number | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  sectionCodeSnapshot: string | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  sectionNameSnapshot: string | null;

  @Column({ type: 'int', nullable: true, default: null })
  accountIdSnapshot: number | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  accountCodeSnapshot: string | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  accountNameSnapshot: string | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  code6111Snapshot: string | null;

  /**
   * Computed by buildExpenseDescription (D7) — the עמודת תיאור fallback
   * chain (classification -> recognized-document type -> "מסמך לא מזוהה").
   * Recomputed on every classification change while PENDING; frozen at
   * approval. Nullable: backfilled in Phase 3.4, not yet written live.
   */
  @Column({ type: 'varchar', nullable: true, default: null })
  description: string | null;

  /**
   * D6/Phase 3.3 backfill: a journal-posted expense -> APPROVED (matches
   * today's implicit "every addExpense immediately posts a journal entry"
   * behavior); no journal entry -> PENDING (or MISSING_ACCOUNTING_MAPPING
   * when its sub_category is). Default APPROVED only applies going forward
   * once Phase 4.1 wires real writes; existing rows are backfilled
   * explicitly, never rely on this default.
   */
  @Column({ type: 'enum', enum: ExpenseApprovalStatus, nullable: true, default: null })
  approvalStatus: ExpenseApprovalStatus | null;

  @Column({ nullable: true, default: null })
  approvedByUserId: string | null;

  @Column({ type: 'datetime', nullable: true, default: null })
  approvedAt: Date | null;

  /** D10: set by an accountant's reclassification override. Once set, this
   *  expense is NEVER auto re-resolved — manual override sticks. */
  @Column({ nullable: true, default: null })
  classificationOverrideByUserId: string | null;

  @Column({ type: 'datetime', nullable: true, default: null })
  classificationOverrideAt: Date | null;

}