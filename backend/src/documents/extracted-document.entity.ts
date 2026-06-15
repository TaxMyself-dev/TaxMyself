import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum ExtractedDocStatus {
  /** OCR succeeded, awaiting user review in the report-page modal. */
  PENDING_REVIEW = 'pending_review',
  /** User confirmed the row → became an Expense; file already in processed/. */
  APPROVED = 'approved',
  /** User reviewed, doesn't want to claim now but it's a real doc — keep
   *  for future reference / audit. File moves to archive/. */
  ARCHIVED = 'archived',
  /** User reviewed, decided this isn't an expense doc (OCR error, junk,
   *  duplicate). File also moves to archive/ — same Drive layout as
   *  ARCHIVED, distinguished only in the DB status so future filters
   *  can tell them apart. */
  REJECTED = 'rejected',
  /** Auto-set by the pairing service: this row is the SECONDARY half of
   *  an invoice↔receipt pair (typically the invoice). The PRIMARY half
   *  (typically the receipt, marked documentType='invoice_receipt_pair')
   *  is what shows up in the review modal; this row is hidden via the
   *  status filter. When the primary is approved/archived/rejected, the
   *  cascade also updates this row to match. Unpair reverts both halves. */
  PAIRED = 'paired',
  /** OCR failed on the file; row exists for diagnostics, file stays in inbox/. */
  ERROR = 'error',
}

/** Classification returned by Claude — drives downstream routing
 *  (only `invoice`/`receipt`/`tax_invoice_receipt` rows show up as
 *  candidate expenses today). The invoice / receipt split matters for
 *  audit + VAT purposes: an invoice is a request to pay (חשבונית), a
 *  receipt is confirmation of payment (קבלה), and a combined doc
 *  (חשבונית מס קבלה) is both. Previously these were all bundled into
 *  `invoice`, which made the document-type column misleading. */
export enum ExtractedDocumentType {
  INVOICE = 'invoice',
  RECEIPT = 'receipt',
  TAX_INVOICE_RECEIPT = 'tax_invoice_receipt',
  /** חשבונית זיכוי — credit/refund invoice. Negative-amount invoice
   *  issued to reverse a prior charge. Claude returns this when the doc
   *  has wording like "חשבונית זיכוי" / "credit note" / "refund". */
  CREDIT_INVOICE = 'credit_invoice',
  /** חשבונית + קבלה — synthetic type set by the pairing service when
   *  an INVOICE row and a RECEIPT row from the same supplier with the
   *  same invoice_number get auto-paired. The receipt is the primary
   *  (keeps this type); the invoice goes status=PAIRED. Never returned
   *  by Claude — only the pairing service writes this value. */
  INVOICE_RECEIPT_PAIR = 'invoice_receipt_pair',
  FORM_106 = 'form_106',
  TAX_FORM = 'tax_form',
  CONTRACT = 'contract',
  UNKNOWN = 'unknown',
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

  /**
   * ISO-4217 currency code for `amount`, `vat`, and `amount_before_vat`.
   * NULL is treated as ILS by the read paths — pre-currency rows + cases
   * where Claude couldn't pin down the currency both end up here. At
   * approve time the report-review service detects non-ILS and runs the
   * BOI rate via FxRateService to stamp originalCurrency/originalSum on
   * the resulting Expense (so the dashboard's "$X (₪Y)" rendering works
   * for OCR'd rows too).
   */
  @Column({ type: 'varchar', length: 3, nullable: true })
  currency: string | null;

  /**
   * `amount` pre-converted to ILS using the BOI rate at `date`. Populated
   * at OCR time by DocumentsService when `currency` is non-ILS; NULL
   * otherwise (ILS docs + legacy rows pre-this-column). Lets the matcher
   * compare doc amounts to bank-transaction amounts in a single currency
   * (the tx side has been ILS-normalized via cache.ilsAmount all along).
   * Stored as DECIMAL(12,2) so it lines up with how ILS amounts are
   * persisted everywhere else in the schema.
   */
  @Column({ name: 'ils_amount', type: 'decimal', precision: 12, scale: 2, nullable: true })
  ilsAmount: string | null;

  /**
   * BOI rate used to compute `ils_amount` (foreign units → ILS). Stored
   * for audit + future rate-drift detection; the matcher itself just
   * reads `ils_amount`. Six decimal places matches the FxRate table's
   * precision so we don't lose fidelity on the round-trip.
   */
  @Column({ name: 'fx_rate_to_ils', type: 'decimal', precision: 12, scale: 6, nullable: true })
  fxRateToIls: string | null;

  /**
   * Back-pointer for invoice↔receipt pairing. When the pairing service
   * detects an INVOICE and a RECEIPT with the same supplier_id +
   * invoice_number (or amount+date fallback), it links the two rows:
   *
   *   receipt.pairedWithDocumentId = invoice.id
   *   receipt.documentType         = INVOICE_RECEIPT_PAIR
   *   invoice.pairedWithDocumentId = receipt.id
   *   invoice.status               = PAIRED   (hides it from the review modal)
   *
   * Both halves point at each other so either side can be the entry
   * point for the unpair flow. NULL for unpaired rows (the common case).
   */
  @Column({ name: 'paired_with_document_id', type: 'int', nullable: true })
  pairedWithDocumentId: number | null;

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

  // Stored as varchar (not enum) so adding a new state in the future doesn't
  // require an ALTER on the enum type; the app layer enforces valid values.
  @Column({
    type: 'varchar',
    length: 32,
    default: ExtractedDocStatus.PENDING_REVIEW,
  })
  status: ExtractedDocStatus;

  // Claude's document classification — see ExtractedDocumentType. Drives
  // downstream filtering (e.g. only `invoice` shows in expenses review).
  @Column({ name: 'document_type', type: 'varchar', length: 50, nullable: true })
  documentType: ExtractedDocumentType | null;

  // Drive's `createdTime` on the source file. Independent of `createdAt`
  // (which is the OCR-row insert time) — `uploadDate` tells the user "when
  // did this invoice land in my inbox".
  @Column({ name: 'upload_date', type: 'datetime', nullable: true })
  uploadDate: Date | null;

  @Column({ name: 'raw_response', type: 'text', nullable: true })
  rawResponse: string | null;

  // Set once the user has confirmed this row as an Expense; prevents
  // double-confirmation and removes the row from the review list.
  @Column({ name: 'confirmed_expense_id', type: 'int', nullable: true })
  confirmedExpenseId: number | null;

  /**
   * The slim_transactions.id this document was paired with by the unified
   * matcher (or by the user, via /reports/me/review/link-doc-to-tx).
   * NULL = unmatched. Drives the "matched" row type in the report-preview.
   */
  @Column({ name: 'matched_transaction_id', type: 'int', nullable: true })
  matchedTransactionId: number | null;

  /**
   * How this document got paired (or didn't):
   *   "matched"      — auto-matched by MatchingService (±3 days, ±1 NIS)
   *   "manual_link"  — user paired it via the review modal
   *   null           — not paired (most rows for cash-only users)
   */
  @Column({ name: 'match_status', type: 'varchar', length: 32, nullable: true })
  matchStatus: 'matched' | 'manual_link' | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
