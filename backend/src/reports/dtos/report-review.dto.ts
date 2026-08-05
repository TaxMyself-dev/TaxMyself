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

/** D9 mapping verdict for a review row's CURRENT classification names.
 *  Drives the status badge + whether the approve checkbox is enabled. */
export type ReviewMappingStatus =
  /** Resolves to an APPROVED sub_category with a card — approvable, journals. */
  | 'READY'
  /** Sub_category exists but has no usable card (MISSING_ACCOUNTING_MAPPING /
   *  PENDING_ACCOUNTANT_APPROVAL / REJECTED). Cannot be approved until an
   *  accountant completes the mapping (D5/D9). */
  | 'MISSING_MAPPING'
  /** isPrivate sub_category — approvable, but never journaled (D5). */
  | 'PRIVATE'
  /** The names don't resolve to any catalog row — user must classify first. */
  | 'UNCLASSIFIED';

/**
 * Phase 6.1 (D9): server-side resolution preview for one review row.
 * Computed against the business's merged catalog (CLIENT > ACCOUNTANT >
 * SYSTEM, delegation-aware) from the row's effective classification names —
 * the same resolution the approve path will run, so the professional-view
 * columns (section/account/percents) show exactly what approval would post.
 * Snapshot-frozen only at approval; until then this is a live preview the
 * frontend recomputes locally when the user re-classifies a row.
 */
export interface ReviewClassification {
  /** Effective merged-catalog row id, null when UNCLASSIFIED. */
  subCategoryId: number | null;
  /** Canonical names from the merged catalog row (may differ from the raw
   *  OCR/slim strings in casing/spacing). Null when UNCLASSIFIED. */
  categoryName: string | null;
  subCategoryName: string | null;
  status: ReviewMappingStatus;
  /** D7 description preview — "{category}/{subCategory}", else the document
   *  type label, else "מסמך לא מזוהה". Frozen into expense + journal at
   *  approval. */
  description: string;
  /** True when the effective sub_category is accountant-owned or was
   *  approved by someone other than the client — drives the
   *  "מופה ע״י רו״ח" badge with the override icon (D9). */
  mappedByAccountant: boolean;
  // ---- The card's law (null unless status is READY) + its section. ----
  sectionCode: string | null;
  sectionName: string | null;
  accountId: number | null;
  accountCode: string | null;
  accountName: string | null;
  vatPercent: number | null;
  taxPercent: number | null;
  reductionPercent: number | null;
  isEquipment: boolean | null;
}

export type ReviewRowMatched = {
  type: 'matched';
  document: ReviewDocSummary;
  transaction: ReviewTxSummary;
  classification: ReviewClassification;
};

export type ReviewRowDocOnly = {
  type: 'doc_only';
  document: ReviewDocSummary;
  classification: ReviewClassification;
};

export type ReviewRowTxOnly = {
  type: 'tx_only';
  transaction: ReviewTxSummary;
  classification: ReviewClassification;
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
  /** D9: true when the business owner has at least one ACTIVE delegation
   *  (an accountant services them). Missing-mapping rows then show
   *  "חסר מיפוי — אצל הרו״ח" with a disabled checkbox; without a delegation
   *  the client gets the simple "למה ההוצאה שייכת?" picker instead. */
  clientHasActiveDelegation: boolean;
}
