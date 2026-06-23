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

export type ReviewRow =
  | { type: 'matched'; document: ReviewDocSummary; transaction: ReviewTxSummary }
  | { type: 'doc_only'; document: ReviewDocSummary }
  | { type: 'tx_only'; transaction: ReviewTxSummary };

export interface ReportPreviewResponse {
  mode: 'documents_only' | 'with_banking';
  rows: ReviewRow[];
  counts: { matched: number; docOnly: number; txOnly: number };
  /** Byte-identical re-uploads the inbox scan auto-rejected this pass.
   *  Surfaced as a non-blocking notice; never appear as review rows. */
  duplicatesSkipped: number;
}

/**
 * Inline edits the user made in the review modal before clicking approve.
 * Every field optional — anything left undefined falls back to the source
 * row's value. `reportPeriod` is in label form ("M/YYYY" or "M1-M2/YYYY")
 * — backend stamps it directly on the resulting Expense.vatReportingDate
 * instead of computing from the date + business cadence.
 */
export interface ReviewOverrides {
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
   *  review modal when both signals are false. */
  previewCheck(
    businessNumber: string,
  ): Observable<{ hasPendingDocs: boolean; hasUnconfirmedExpenses: boolean }> {
    return this.http.get<{ hasPendingDocs: boolean; hasUnconfirmedExpenses: boolean }>(
      `${environment.apiUrl}reports/me/preview-check`,
      { params: { businessNumber } },
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
