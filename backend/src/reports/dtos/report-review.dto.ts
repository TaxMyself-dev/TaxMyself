/**
 * Wire-format types for the unified report-review pre-flight.
 *
 * Three row shapes, discriminated by `type`:
 *   - "matched"  : an OCR'd document was auto-paired with a slim transaction
 *   - "doc_only" : an OCR'd document with no matching transaction (typical
 *                  for cash payments, or for the first review pass before
 *                  Open Banking has synced the matching bank entry)
 *   - "tx_only"  : a classified-as-expense slim transaction with no
 *                  matching document. Only appears when Open Banking is on.
 *
 * The frontend uses `type` to pick which action buttons to render and
 * which endpoint to call when the user clicks one.
 */

/** Document-side fields the review modal needs to render a row. Subset of
 *  ExtractedDocument — only the columns the modal cares about. */
export interface ReviewDocSummary {
  documentId: number;
  driveFileId: string;
  driveFileName: string;
  supplier: string | null;
  supplierId: string | null;
  date: string | null;          // YYYY-MM-DD
  invoiceNumber: string | null;
  /** Israeli tax authority allocation number (מספר הקצאה / Confirmation
   *  Number) — required on tax invoices over the threshold (~25,000 ILS).
   *  Null on receipts and on invoices under the threshold. Displayed as
   *  a separate column in the review modal so the user can spot a missing
   *  allocation_number on a high-value invoice before approving it. */
  allocationNumber: string | null;
  amount: number | null;        // positive ILS value (the OCR'd total)
  category: string | null;
  subCategory: string | null;
  vatPercent: number | null;
  taxPercent: number | null;
  isEquipment: boolean | null;
  uploadDate: string | null;    // ISO-8601 from Drive's createdTime
  documentType: string | null;  // invoice | receipt | tax_invoice_receipt | form_106 | tax_form | contract | unknown
  /** D8 routing kind (Phase 4.3): EXPENSE_INVOICE | ANNUAL_DOCUMENT |
   *  UNIDENTIFIED. ANNUAL/UNIDENTIFIED rows stay PENDING_REVIEW so they
   *  appear in the modal, tagged for the Phase-6 UI (annual rows offer
   *  "תייק", unidentified rows offer triage). Null on legacy rows the
   *  Phase-3 backfill somehow missed. */
  documentKind: string | null;
  /** ISO-4217 currency code (uppercase) the OCR'd amounts are in.
   *  "ILS" for Israeli documents (the common case); foreign codes
   *  drive the "$X (₪Y)" two-line render in the review modal and tell
   *  the approve path to convert via BOI rate before creating the
   *  Expense. Null only for legacy rows (pre-currency-column docs). */
  currency: string | null;
  /** `amount` pre-converted to ILS using the BOI rate at OCR time
   *  (`fxRateToIls` from the entity). Populated for non-ILS docs;
   *  NULL for ILS docs and pre-this-migration legacy rows. Used by the
   *  review modal to render the "(₪Y)" parenthesis under the foreign
   *  amount without a second FX lookup. */
  ilsAmount: number | null;
  /** True when the document's supplier_id matches a row in the user's
   *  Supplier table. Drives the "ספק מוכר / ספק חדש" status column in the
   *  review modal — same mental model as the old PullDriveDocsDialog
   *  had. False when supplier_id is null, blank, or absent from suppliers. */
  matchedSupplierKnown: boolean;
}

/** Transaction-side fields the review modal needs. Joined from
 *  slim_transactions + full_transactions_cache. */
export interface ReviewTxSummary {
  slimTransactionId: number;
  externalTransactionId: string;
  date: string;                 // YYYY-MM-DD (cache.transactionDate)
  amount: number;               // positive ILS value (abs(amount), or ilsAmount when non-ILS)
  merchantName: string;
  category: string;
  subCategory: string;
  vatPercent: number;
  taxPercent: number;
  isEquipment: boolean;
  /** Original currency code (e.g. "USD") when the transaction wasn't in ILS,
   *  paired with `originalAmount`. Null for ILS rows. The modal shows
   *  "$X (₪Y)" for non-ILS transactions; ILS rows just show `amount`. */
  originalAmount: number | null;
  originalCurrency: string | null;
}

export type ReviewRowMatched = {
  type: 'matched';
  document: ReviewDocSummary;
  transaction: ReviewTxSummary;
};

export type ReviewRowDocOnly = {
  type: 'doc_only';
  document: ReviewDocSummary;
};

export type ReviewRowTxOnly = {
  type: 'tx_only';
  transaction: ReviewTxSummary;
};

export type ReviewRow = ReviewRowMatched | ReviewRowDocOnly | ReviewRowTxOnly;

/** Full response from POST /reports/me/preview. */
export interface ReportPreviewResponse {
  /** "documents_only" when Open Banking isn't connected — only doc_only
   *  rows possible. "with_banking" enables all 3 row types. */
  mode: 'documents_only' | 'with_banking';
  rows: ReviewRow[];
  /** Counts for the modal subtitle ("X matched, Y documents only, Z transactions only"). */
  counts: {
    matched: number;
    docOnly: number;
    txOnly: number;
  };
  /** Number of byte-identical re-uploads the inbox scan auto-rejected this
   *  pass (same file dropped twice). These never become review rows; the
   *  modal surfaces the count as a non-blocking notice. */
  duplicatesSkipped: number;
}
