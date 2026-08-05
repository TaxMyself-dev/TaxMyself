import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';


@Entity()
export class JournalLine {

  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  issuerBusinessNumber: string;

  /** Firebase UID of the business owner — mirrors the parent JournalEntry.firebaseId.
   *  Allows direct filtering on lines without always joining the header. Default '' for existing rows. */
  @Column({ default: '' })
  firebaseId: string;

  @Column()
  journalEntryId: number;

  @Column()
  lineInEntry: number;

  @Column()
  accountCode: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  debit: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  credit: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  amountBeforeVat: number;     // סכום לרוה"ס

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  vatAmount: number;           // סכום למע"מ

  /**
   * Mirrors the source expense's isEquipment flag (false for document/income
   * lines). Lets the journal-based VAT report split deductible VAT input (2410)
   * into expenses vs assets, and lets the P&L report exclude equipment lines.
   */
  @Column({ type: 'boolean', nullable: true, default: false })
  isEquipment: boolean;

  /** אחוז מוכר למס הכנסה (0–100). Default 100 so existing rows are unaffected. */
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 100 })
  taxPercent: number;

  /** אחוז מוכר למע"מ (0–100). Default 100 so existing rows are unaffected. */
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 100 })
  vatPercent: number;

  /** סכום מוכר למס = debit × (taxPercent/100). Income lines carry amountBeforeVat here. */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  amountForTax: number;

  /** Sub-category name from the source expense ("דלק", "ארנונה" etc.).
   *  Null on VAT lines (2410) and income-document lines. */
  @Column({ nullable: true, default: null })
  subCategoryName: string | null;
}