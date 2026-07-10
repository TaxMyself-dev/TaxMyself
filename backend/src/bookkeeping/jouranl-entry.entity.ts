import { JournalReferenceType } from 'src/enum';
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class JournalEntry {

  @PrimaryGeneratedColumn()
  id: number; // Globally-unique PK — DB auto-increment (NOT a per-business number)

  /**
   * Per-business human-readable running number for display ("פקודה מס' N").
   * Sourced from the per-business counter (SharedService.getJournalEntryCurrentIndex).
   * Nullable: legacy rows created before this column existed have no value.
   */
  @Column({ type: 'int', nullable: true })
  entryNumber: number | null;

  @Column()
  issuerBusinessNumber: string;

  /** Firebase UID of the business owner. Scopes all journal queries to a single user
   *  so two users who happen to share a businessNumber cannot see each other's entries.
   *  Default '' so TypeORM synchronize doesn't fail on existing rows. */
  @Column({ default: '' })
  firebaseId: string;

  @Column({ type: 'date' })
  date: string;

  @Column({ nullable: true })
  description: string;

  @Column({ type: 'enum', enum: JournalReferenceType, nullable: true })
  referenceType: JournalReferenceType;

  @Column({ type: 'bigint', nullable: true })
  referenceId: number | null; // The ID of the invoice/receipt/expense etc; null for MANUAL entries

  @Column({ type: 'date', nullable: true })
  valueDate: string;           // תאריך ערך

  @Column({ type: 'date', nullable: true })
  vatDate: string;             // תאריך למע"מ

  @Column({ nullable: true })
  notes: string;               // הערות

  /**
   * VAT/income reporting-period label, same format as expense.vatReportingDate
   * ("3/2026", "1-2/2026", "2026"). Built via SharedService.buildReportPeriodLabel
   * at post time. Used by the journal-based VAT/P&L reports to bucket entries
   * into the same periods the legacy reports use (with a `date` fallback when null).
   */
  @Column({ type: 'varchar', nullable: true, default: null })
  vatReportingPeriod: string | null;

  /** Sub-category name from the source expense ("דלק", "ארנונה" etc.).
   *  Null for income-document entries. */
  @Column({ nullable: true, default: null })
  subCategory: string | null;

  /** The single counter-account code for this entry (e.g. '2000' for expenses,
   *  '1100' for paid invoices, '1200' for open A/R). Null for RECEIPT lines
   *  where the A/R close is implicit. Nullable so existing rows are unaffected. */
  @Column({ nullable: true, default: null })
  counterAccountCode: string | null;

  /** Sub-ledger counter-account code (default_sub_category.subAccountCode) for
   *  the entry's expense sub-category, alongside counterAccountCode. Nullable —
   *  existing rows and entries with no matching sub-account code stay NULL;
   *  no retroactive backfill. */
  @Column({ nullable: true, default: null })
  subCounterAccountCode: string | null;

  /** שם ספק / לקוח — vendor or customer name from the source document or expense. */
  @Column({ nullable: true, default: null })
  counterPartyName: string | null;

  /** סה"כ מסמך כולל מע"מ — full document total including VAT (sumAftDisWithVAT or expense.sum). */
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true, default: null })
  documentTotal: number | null;

  @CreateDateColumn()
  createdAt: Date;

}
