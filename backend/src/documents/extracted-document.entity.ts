import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum ExtractedDocStatus {
  PENDING = 'pending',
  PROCESSED = 'processed',
  ERROR = 'error',
}

// Stores invoice / receipt OCR results from Claude. One row per Drive file.
// Distinct from the existing `Documents` entity, which represents invoices
// the user ISSUES to their clients (this one represents documents RECEIVED
// from suppliers and OCR'd into structured fields).
@Entity('extracted_document')
@Index(['userId', 'businessNumber', 'month'])
// A single Drive file can contain multiple invoices (common: monthly fuel
// statements, bundled receipts). sub_index 0..N-1 disambiguates rows that
// share a drive_file_id. Old rows default to 0 — the migration is a no-op.
@Index(['driveFileId', 'subIndex'], { unique: true })
export class ExtractedDocument {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  // Which business this doc belongs to. Nullable for backward compat with
  // rows extracted before the per-business folder hierarchy was introduced.
  @Column({ name: 'business_number', type: 'varchar', length: 32, nullable: true })
  businessNumber: string | null;

  @Column({ name: 'drive_file_id', type: 'varchar', length: 255 })
  driveFileId: string;

  // Position of this invoice within its source file (0 for single-invoice
  // files, 0..N-1 for multi-invoice files like monthly statements).
  @Column({ name: 'sub_index', type: 'int', default: 0 })
  subIndex: number;

  @Column({ name: 'drive_file_name', type: 'varchar', length: 512 })
  driveFileName: string;

  // YYYY-MM
  @Column({ type: 'varchar', length: 7 })
  month: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  supplier: string | null;

  @Column({ name: 'supplier_id', type: 'varchar', length: 32, nullable: true })
  supplierId: string | null;

  // YYYY-MM-DD (string per Claude output; not parsed to Date to preserve nulls)
  @Column({ type: 'date', nullable: true })
  date: string | null;

  @Column({ name: 'invoice_number', type: 'varchar', length: 128, nullable: true })
  invoiceNumber: string | null;

  // Israeli tax authority allocation number (מספר הקצאה). Required by law on
  // tax invoices over a threshold (currently ~25,000 ILS). Nullable because
  // many invoices below threshold don't carry one.
  @Column({ name: 'allocation_number', type: 'varchar', length: 64, nullable: true })
  allocationNumber: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  amount: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  vat: string | null;

  @Column({ name: 'amount_before_vat', type: 'decimal', precision: 12, scale: 2, nullable: true })
  amountBeforeVat: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  category: string | null;

  @Column({ name: 'sub_category', type: 'varchar', length: 128, nullable: true })
  subCategory: string | null;

  @Column({ name: 'tax_percent', type: 'decimal', precision: 6, scale: 2, nullable: true })
  taxPercent: string | null;

  @Column({ name: 'vat_percent', type: 'decimal', precision: 6, scale: 2, nullable: true })
  vatPercent: string | null;

  // Flags this expense as a capital purchase (depreciated) rather than an
  // operating cost. Pre-filled by Claude from the catalog's isEquipment value;
  // user can override at review time.
  @Column({ name: 'is_equipment', type: 'boolean', nullable: true })
  isEquipment: boolean | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    type: 'enum',
    enum: ExtractedDocStatus,
    default: ExtractedDocStatus.PENDING,
  })
  status: ExtractedDocStatus;

  @Column({ name: 'raw_response', type: 'text', nullable: true })
  rawResponse: string | null;

  // Set once the user has confirmed this row as an Expense; prevents
  // double-confirmation and removes the row from the review list.
  @Column({ name: 'confirmed_expense_id', type: 'int', nullable: true })
  confirmedExpenseId: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
