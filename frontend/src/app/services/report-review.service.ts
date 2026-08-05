import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

/**
 * Frontend wrapper for the unified report-review backend
 * (POST /reports/me/preview + 6 per-row action endpoints).
 *
 * Types mirror `backend/src/reports/dtos/report-review.dto.ts` — if you
 * change one side, change the other.
 */

export interface ReviewDocSummary {
  documentId: number;
  driveFileId: string;
  driveFileName: string;
  supplier: string | null;
  supplierId: string | null;
  date: string | null;
  invoiceNumber: string | null;
  /** Israeli tax authority allocation number (מספר הקצאה / Confirmation
   *  Number). Required on tax invoices above the threshold; null otherwise. */
  allocationNumber: string | null;
  amount: number | null;
  category: string | null;
  subCategory: string | null;
  vatPercent: number | null;
  taxPercent: number | null;
  isEquipment: boolean | null;
  uploadDate: string | null;
  documentType: string | null;
  /** D8 routing kind: EXPENSE_INVOICE | ANNUAL_DOCUMENT | UNIDENTIFIED.
   *  On the wire since Phase 4.3; the 6.1 screen renders the annual badge
   *  + "תייק" action and the unidentified triage from it. Null for legacy
   *  rows — treated as EXPENSE_INVOICE. */
  documentKind: string | null;
  /** ISO-4217 currency code (e.g. "ILS", "USD"). Drives the
   *  foreign-currency sumLabel in the review modal — non-ILS docs show
   *  "$50" on top with "(₪185.40)" underneath via the SUM_WITH_FX
   *  renderer that backs the sum column. */
  currency: string | null;
  /** `amount` pre-converted to ILS at OCR time (BOI rate via
   *  FxRateService). Populated for non-ILS docs; null for ILS docs and
   *  pre-migration legacy rows. Feeds the "(₪Y)" parenthesis under the
   *  foreign amount in the review modal — no front-end FX needed. */
  ilsAmount: number | null;
  /** True when the doc's supplier_id matches a row in the user's Supplier
   *  table — drives the "ספק מוכר / ספק חדש" badge in the review modal. */
  matchedSupplierKnown: boolean;
}

export interface ReviewTxSummary {
  slimTransactionId: number;
  externalTransactionId: string;
  date: string;
  amount: number;
  merchantName: string;
  category: string;
  subCategory: string;
  vatPercent: number;
  taxPercent: number;
  isEquipment: boolean;
  originalAmount: number | null;
  originalCurrency: string | null;
}

/** D9 mapping verdict for a row's current classification (Phase 6.1). */
export type ReviewMappingStatus =
  | 'READY'
  | 'MISSING_MAPPING'
  | 'PRIVATE'
  | 'UNCLASSIFIED';

/**
 * Server-side resolution preview for one review row (Phase 6.1 / D9) —
 * the same delegation-aware merged-catalog resolution the approve path
 * runs, so the professional-view columns show exactly what approval
 * would post. Recomputed client-side when the user re-classifies a row.
 */
export interface ReviewClassification {
  subCategoryId: number | null;
  categoryName: string | null;
  subCategoryName: string | null;
  status: ReviewMappingStatus;
  /** D7 description preview — frozen into expense+journal at approval. */
  description: string;
  /** Drives the "מופה ע״י רו״ח" badge + override icon. */
  mappedByAccountant: boolean;
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

export type ReviewRow =
  | { type: 'matched'; document: ReviewDocSummary; transaction: ReviewTxSummary; classification: ReviewClassification }
  | { type: 'doc_only'; document: ReviewDocSummary; classification: ReviewClassification }
  | { type: 'tx_only'; transaction: ReviewTxSummary; classification: ReviewClassification };

export interface ReportPreviewResponse {
  mode: 'documents_only' | 'with_banking';
  rows: ReviewRow[];
  counts: { matched: number; docOnly: number; txOnly: number };
  /** Byte-identical re-uploads the inbox scan auto-rejected this pass.
   *  Surfaced as a non-blocking notice; never appear as review rows. */
  duplicatesSkipped: number;
  /** D9: the business owner has at least one ACTIVE delegation. Missing-
   *  mapping rows then show "חסר מיפוי — אצל הרו״ח" (disabled checkbox);
   *  without one the client gets the simple "למה ההוצאה שייכת?" picker. */
  clientHasActiveDelegation: boolean;
}

/**
 * One row of GET /bookkeeping/expense-catalog?includePrivate=true — the
 * merged (CLIENT > ACCOUNTANT > SYSTEM) expense catalog WITH each row's
 * card law + section. Single data source for the approval screen's
 * pickers (regular sub-category cascade, professional card-by-section)
 * and the client-side live-resolution preview.
 */
export interface CatalogRow {
  subCategoryId: number;
  category: string | null;
  subCategory: string;
  accountId: number | null;
  isPrivate: boolean;
  approvalStatus: string;
  ownerType: string;
  accountCode: string | null;
  accountName: string | null;
  sectionCode: string | null;
  sectionName: string | null;
  vatPercent: number | null;
  taxPercent: number | null;
  reductionPercent: number | null;
  isEquipment: boolean | null;
}

/**
 * Inline edits the user made in the review modal before clicking approve.
 * Every field optional — anything left undefined falls back to the source
 * row's value. `reportPeriod` is in label form ("M/YYYY" or "M1-M2/YYYY")
 * — backend stamps it directly on the resulting Expense.vatReportingDate
 * instead of computing from the date + business cadence.
 */
export interface ReviewOverrides {
  /** D1/Phase 6.1: direct sub_category pointer — wins over the name pair
   *  in the backend's resolution. Sent whenever the picker knows the id. */
  subCategoryId?: number;
  category?: string;
  subCategory?: string;
  vatPercent?: number;
  taxPercent?: number;
  isEquipment?: boolean;
  reportPeriod?: string;
  /** Per-row opt-out for adding the supplier to the user's master list.
   *  Backend defaults to true when undefined. The review modal toggles
   *  this via the red flag icon on rows where the supplier is new. */
  saveAsSupplier?: boolean;
  /** Acknowledges a soft duplicate (same supplier/sum/date, different or
   *  missing document number). Sent as true after the user confirms "save
   *  anyway" on a row the backend flagged with DUPLICATE_WARNING. */
  acknowledgeDuplicate?: boolean;
  /** Invoice/receipt number override — every row type. */
  invoiceNumber?: string;
  /** Israeli tax allocation number override — written back onto the source
   *  document (matched/doc_only only, no document on tx_only rows). */
  allocationNumber?: string;
  /** Supplier tax-ID override — every row type. */
  supplierId?: string;
  /** Supplier display-name override — every row type. */
  supplier?: string;
  /** OCR document-type override — written back onto the source document
   *  (matched/doc_only only, no document on tx_only rows). */
  documentType?: string;
  /** ISO date (YYYY-MM-DD) override — every row type, including
   *  matched/tx_only (both anchored to a real bank transaction — there is
   *  no reconciliation check anywhere, so this can silently desync the
   *  posted expense from the bank statement it came from; applied anyway
   *  per explicit product decision). */
  date?: string;
  /** Amount override — every row type, same caveat as `date`. */
  amount?: number;
}

@Injectable({ providedIn: 'root' })
export class ReportReviewService {
  constructor(private http: HttpClient) {}

  /** Pre-flight call from the VAT/P&L report page — kicks off inbox
   *  processing + auto-matching, returns the unified review rows. */
  getPreview(
    businessNumber: string,
    startDate: string,
    endDate: string,
  ): Observable<ReportPreviewResponse> {
    return this.http.post<ReportPreviewResponse>(
      `${environment.apiUrl}reports/me/preview`,
      { businessNumber, startDate, endDate },
    );
  }

  /** Cheap "is there anything worth reviewing?" check — DB SELECT 1
   *  for pending extracted_documents + Drive folder listing (only on a
   *  DB miss). Used by the report-page submit flow to skip the full
   *  review modal when both signals are false. `endDate` bounds the pending-
   *  docs/unconfirmed-tx counts to the same "date <= period end" window
   *  getReportPreview uses, so a "yes" here always means the review page
   *  will actually show something for the period the user is looking at. */
  previewCheck(
    businessNumber: string,
    endDate: string,
  ): Observable<{ hasPendingDocs: boolean; hasUnconfirmedExpenses: boolean }> {
    return this.http.get<{ hasPendingDocs: boolean; hasUnconfirmedExpenses: boolean }>(
      `${environment.apiUrl}reports/me/preview-check`,
      { params: { businessNumber, endDate } },
    );
  }

  // ---- Row actions: each returns the backend's small per-action result. ----

  approveMatched(
    businessNumber: string,
    documentId: number,
    transactionId: number,
    overrides?: ReviewOverrides,
  ): Observable<{ expenseId: number }> {
    return this.http.post<{ expenseId: number }>(
      `${environment.apiUrl}reports/me/review/approve-matched`,
      { businessNumber, documentId, transactionId, overrides },
    );
  }

  approveDocCash(
    businessNumber: string,
    documentId: number,
    overrides?: ReviewOverrides,
  ): Observable<{ expenseId: number }> {
    return this.http.post<{ expenseId: number }>(
      `${environment.apiUrl}reports/me/review/approve-doc-cash`,
      { businessNumber, documentId, overrides },
    );
  }

  approveTxNoDoc(
    businessNumber: string,
    transactionId: number,
    overrides?: ReviewOverrides,
  ): Observable<{ expenseId: number }> {
    return this.http.post<{ expenseId: number }>(
      `${environment.apiUrl}reports/me/review/approve-tx-no-doc`,
      { businessNumber, transactionId, overrides },
    );
  }

  linkDocToTx(
    businessNumber: string,
    documentId: number,
    transactionId: number,
  ): Observable<{ ok: true }> {
    return this.http.post<{ ok: true }>(
      `${environment.apiUrl}reports/me/review/link-doc-to-tx`,
      { businessNumber, documentId, transactionId },
    );
  }

  archiveDoc(
    documentId: number,
  ): Observable<{ ok: true; documentId: number; movedFile: boolean }> {
    return this.http.post<{ ok: true; documentId: number; movedFile: boolean }>(
      `${environment.apiUrl}reports/me/review/archive-doc/${documentId}`,
      {},
    );
  }

  /** Hard-delete a document row. Returns the same shape as archiveDoc. */
  deleteDoc(
    documentId: number,
  ): Observable<{ ok: true; documentId: number; movedFile: boolean }> {
    return this.http.post<{ ok: true; documentId: number; movedFile: boolean }>(
      `${environment.apiUrl}reports/me/review/delete-doc/${documentId}`,
      {},
    );
  }

  rejectTx(
    businessNumber: string,
    transactionId: number,
  ): Observable<{ ok: true }> {
    return this.http.post<{ ok: true }>(
      `${environment.apiUrl}reports/me/review/reject-tx`,
      { businessNumber, transactionId },
    );
  }

  /** Split an invoice↔receipt pair back into two separate rows. Either
   *  side of the pair can be the entry point — backend follows the
   *  back-pointer. Refuses if either side is APPROVED. */
  unpair(documentId: number): Observable<{ ok: true }> {
    return this.http.post<{ ok: true }>(
      `${environment.apiUrl}reports/me/review/unpair/${documentId}`,
      {},
    );
  }

  /** D8 "תייק" — file an ANNUAL_DOCUMENT row for the annual report. The
   *  doc leaves the review table with the terminal not_an_expense status;
   *  no expense, no journal entry, ever. */
  fileDoc(documentId: number): Observable<{ ok: true; documentId: number }> {
    return this.http.post<{ ok: true; documentId: number }>(
      `${environment.apiUrl}reports/me/review/file-doc/${documentId}`,
      {},
    );
  }

  /** D8 triage on an UNIDENTIFIED row — the human decides what the doc is:
   *  EXPENSE_INVOICE (normal approval flow) or ANNUAL_DOCUMENT (תייק flow). */
  setDocKind(
    documentId: number,
    documentKind: 'EXPENSE_INVOICE' | 'ANNUAL_DOCUMENT',
  ): Observable<{ ok: true; documentId: number; documentKind: string }> {
    return this.http.patch<{ ok: true; documentId: number; documentKind: string }>(
      `${environment.apiUrl}reports/me/review/doc-kind/${documentId}`,
      { documentKind },
    );
  }

  /**
   * D9 inline mapping completion (accountant-only backend gate). Called
   * right after an approve that landed MISSING_ACCOUNTING_MAPPING:
   * applyToFuture=false → one-off snapshot override on this expense;
   * true → repoint the sub_category (future expenses follow) + re-resolve.
   * Either way the expense is approved + journaled by the backend.
   */
  completeExpenseMapping(
    expenseId: number,
    accountId: number,
    applyToFuture: boolean,
  ): Observable<{ id: number }> {
    return this.http.post<{ id: number }>(
      `${environment.apiUrl}expenses/${expenseId}/complete-mapping`,
      { accountId, applyToFuture },
    );
  }

  /**
   * D9 future-mapping primitive: repoint a sub_category at a card so
   * future classifications resolve there. Used by the simple picker
   * (unaccompanied client completing their own unmapped row). SYSTEM/
   * ACCOUNTANT-owned rows land a same-named CLIENT override — the
   * response carries the row that was ACTUALLY mapped (its id may differ
   * from the one sent).
   */
  repointSubCategory(
    subCategoryId: number,
    accountId: number,
  ): Observable<{ id: number }> {
    return this.http.patch<{ id: number }>(
      `${environment.apiUrl}bookkeeping/sub-categories/${subCategoryId}/account`,
      { accountId },
    );
  }

  /** Merged expense catalog with card law + section per row — the approval
   *  screen's single picker/preview data source (includePrivate so a user
   *  can classify a personal purchase as private). */
  getCatalog(businessNumber: string): Observable<CatalogRow[]> {
    return this.http.get<CatalogRow[]>(
      `${environment.apiUrl}bookkeeping/expense-catalog`,
      { params: { businessNumber, includePrivate: 'true' } },
    );
  }

  /** Upload a new PDF/image as the source doc for a tx_only row and let
   *  the backend OCR + auto-link it. multipart/form-data — synchronous on
   *  the backend (Claude call inline), so the UI must show a spinner. */
  uploadDocToTx(
    businessNumber: string,
    transactionId: number,
    file: File,
  ): Observable<{ ok: true; documentId: number }> {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('businessNumber', businessNumber);
    return this.http.post<{ ok: true; documentId: number }>(
      `${environment.apiUrl}reports/me/review/upload-doc-to-tx/${transactionId}`,
      fd,
    );
  }
}
