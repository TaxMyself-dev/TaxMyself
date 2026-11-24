import { DocumentRetrySummary } from './document-retry';
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, switchMap } from 'rxjs';
import { DocumentAnalysisService, AnalysisReceipt } from './document-analysis.service';
import { environment } from 'src/environments/environment';

/** Mirrors the backend's FilesInterceptor('files', 30, ...) cap on
 *  POST /documents/me/upload-to-inbox — kept here so both upload entry
 *  points (settings page + quick-upload dialog) can validate before
 *  sending instead of surfacing the backend's raw 400. */
export const MAX_UPLOAD_TO_INBOX_FILES = 30;

/** Per-call counters returned by /me/process-inbox. `total` is the number of
 *  files currently sitting in `inbox/` at the time of the call — NOT a
 *  cumulative count. After a successful pass, total ≈ skipped + processed
 *  + failed; on the next call total drops as files moved to `processed/`
 *  fall out of the listing. */
export interface ProcessInboxResult {
  processed: number;
  /** Registered for asynchronous analysis, not yet completed. */
  queued?: number;
  failed: number;
  skipped: number;
  /** Byte-identical re-uploads auto-rejected this pass (same file dropped
   *  twice). Skipped before OCR; never become review rows. */
  duplicates: number;
  /** Previously deleted documents restored from an identical re-upload. */
  restored: number;
  total: number;
  inboxFolderId: string;
  processedFolderId: string;
  /** Another Cloud Run request already owns this business's OCR lock. */
  alreadyProcessing: boolean;
}

export interface MatchedSupplier {
  id: number;
  supplier: string;
  supplierID: string | null;
  category: string;
  subCategory: string;
  taxPercent: number;
  vatPercent: number;
  isEquipment: boolean;
  reductionPercent: number;
}

export interface SubCategoryCatalogEntry {
  subCategoryName: string;
  categoryName: string;
  taxPercent: number;
  vatPercent: number;
  isEquipment: boolean;
}

/** Where an archive row originated from — see `RecordSource` in the
 *  backend's `src/enum.ts`. */
export type RecordSource = 'DRIVE' | 'EMAIL' | 'MANUAL' | 'OPEN_BANKING' | 'WHATSAPP';

/** User-facing lifecycle status for the ארכיון שלי page. */
export type ArchiveItemStatus =
  | 'PASSWORD_REQUIRED'
  | 'NO_INVOICE_FOUND'
  | 'PENDING'
  | 'APPROVED'
  | 'FILED_ANNUAL'
  | 'ARCHIVED'
  | 'REJECTED'
  | 'ERROR'
  | 'DELETED';

export type ArchiveDocumentClassification =
  | 'PENDING'
  | 'FILED_ANNUAL'
  | 'ARCHIVED'
  | 'REJECTED';

/** A row on the ארכיון שלי (unified archive) page — `GET /documents/me/archived`.
 *  DOCUMENT rows come from an uploaded/OCR'd document; EXPENSE rows are a
 *  bank/card transaction classified as an expense with no underlying
 *  document. `id` is scoped per `itemType` (an ExtractedDocument.id and an
 *  Expense/SlimTransaction ids can collide) — key rows by `${itemType}-${id}`. */
export interface ArchivedItem {
  canRetryProcessing?: boolean;
  processingBlocked?: boolean;
  routingNote?: string | null;
  protectedDocumentId?: number;
  originalDriveFileId?: string;
  canUploadOpenCopy?: boolean;
  canRetryDelivery?: boolean;
  replacementUploadStatus?: string;
  replacementProcessingStatus?: string;
  id: number;
  itemType: 'DOCUMENT' | 'EXPENSE' | 'TRANSACTION';
  documentType: string | null;
  documentKind: 'EXPENSE_INVOICE' | 'ANNUAL_DOCUMENT' | 'UNIDENTIFIED' | null;
  name: string;
  documentDate: string | null;
  uploadDate: string | null;
  source: RecordSource;
  status: ArchiveItemStatus;
  canResolve: boolean;
  canReclassify: boolean;
  canManageExpenses: boolean;
  driveFileId: string | null;
  expenseFile: string | null;
  rejectionReason: string | null;
  /** VAT reporting-period label copied from the approved linked expense. */
  vatReportPeriod: string | null;
  /** Annual income-tax reporting year copied from the approved linked expense. */
  annualReportingYear: number | null;
  amount?: number | null;
  originalAmount?: number | null;
  currency?: string | null;
}

/** Raw shape of a single invoice returned by the OCR endpoint. Matches
 *  Claude's `ExtractedFields` shape on the backend. */
export interface OcrInvoiceFields {
  supplier: string | null;
  supplier_id: string | null;
  date: string | null;          // YYYY-MM-DD
  invoice_number: string | null;
  allocation_number: string | null;
  amount: number | null;
  vat: number | null;
  amount_before_vat: number | null;
  category: string | null;
  sub_category: string | null;
  tax_percent: number | null;
  vat_percent: number | null;
  is_equipment: boolean | null;
  description: string | null;
}

export interface OcrSingleFileResponse {
  invoice: OcrInvoiceFields | null;
  invoicesCount: number;
}

@Injectable({ providedIn: 'root' })
export class DriveDocsService {
  retryProcessing(businessNumber:string,fileIds:string[]):Observable<DocumentRetrySummary> {
    return this.http.post<DocumentRetrySummary>(environment.apiUrl+'documents/me/retry-processing',{businessNumber,fileIds},
      {headers:new HttpHeaders({businessnumber:businessNumber})});
  }

  replaceProtectedPdf(documentId: number, businessNumber: string, file: File, key: string, confirmed: boolean): Observable<any> {
    const form = new FormData();
    form.append('file', file, file.name);
    form.append('businessNumber', businessNumber);
    form.append('idempotencyKey', key);
    form.append('confirmed', String(confirmed));
    return this.http.post(`${environment.apiUrl}documents/me/protected/${documentId}/replacement`, form,
      { headers: new HttpHeaders({ businessnumber: businessNumber }) });
  }
  protectedPdfHistory(documentId: number, businessNumber: string): Observable<any> {
    return this.http.get(`${environment.apiUrl}documents/me/protected/${documentId}/history`, { params: { businessNumber } });
  }
  retryProtectedDelivery(documentId: number, businessNumber: string): Observable<any> {
    return this.http.post(`${environment.apiUrl}documents/me/protected/${documentId}/retry-delivery`, { businessNumber });
  }
  private readonly analysis:DocumentAnalysisService;
  constructor(private http: HttpClient,analysis?:DocumentAnalysisService) {this.analysis=analysis||new DocumentAnalysisService(http);}

  processInbox(businessNumber: string): Observable<ProcessInboxResult> {
    const url = `${environment.apiUrl}documents/me/process-inbox`;
    return this.http.post<ProcessInboxResult>(url, { businessNumber });
  }

  archiveDocument(documentId: number): Observable<{ ok: true; documentId: number; movedFile: boolean }> {
    const url = `${environment.apiUrl}documents/me/archive/${documentId}`;
    return this.http.post<{ ok: true; documentId: number; movedFile: boolean }>(url, {});
  }

  getMySubCategoryCatalog(businessNumber: string): Observable<SubCategoryCatalogEntry[]> {
    const url = `${environment.apiUrl}documents/me/catalog`;
    const params = new HttpParams().set('businessNumber', businessNumber);
    return this.http.get<SubCategoryCatalogEntry[]>(url, { params });
  }

  getArchivedItems(businessNumber: string): Observable<ArchivedItem[]> {
    const url = `${environment.apiUrl}documents/me/archived`;
    const params = new HttpParams().set('businessNumber', businessNumber);
    return this.http.get<ArchivedItem[]>(url, { params });
  }

  deleteArchivedDocument(documentId: number): Observable<{
    ok: true;
    documentId: number;
    deletedDocumentRows: number;
  }> {
    const url = `${environment.apiUrl}documents/me/archived/${documentId}`;
    return this.http.delete<{
      ok: true;
      documentId: number;
      deletedDocumentRows: number;
    }>(url);
  }

  restoreArchivedDocument(documentId: number): Observable<{
    ok: true;
    documentId: number;
    restoredDocumentRows: number;
  }> {
    const url = `${environment.apiUrl}documents/me/archived/${documentId}/restore`;
    return this.http.patch<{
      ok: true;
      documentId: number;
      restoredDocumentRows: number;
    }>(url, {});
  }

  reclassifyArchivedDocument(
    documentId: number,
    classification: ArchiveDocumentClassification,
    rejectionReason?: string | null,
  ): Observable<{ ok: true; documentId: number; classification: ArchiveDocumentClassification }> {
    const url = `${environment.apiUrl}documents/me/archived/${documentId}/classification`;
    return this.http.patch<{ ok: true; documentId: number; classification: ArchiveDocumentClassification }>(
      url,
      { classification, rejectionReason },
    );
  }

  /**
   * Runs Claude OCR on a single uploaded file (PDF/JPEG/PNG/etc) and returns
   * the extracted invoice fields for the manual-expense form to prefill.
   * Uses a durable temporary analysis job; no archive or expense is created.
   */
  ocrSingleFile(file: File, businessNumber: string,onStatus?:(state:string)=>void): Observable<OcrSingleFileResponse> {
    const url = `${environment.apiUrl}documents/me/ocr-file`;
    const form = new FormData();
    form.append('file', file, file.name);
    form.append('businessNumber', businessNumber);
    return this.http.post<AnalysisReceipt>(url, form).pipe(switchMap(receipt=>this.analysis.waitFor<OcrSingleFileResponse>(receipt,businessNumber,onStatus)));
  }

  /**
   * Drops one or more files straight into the business's Drive inbox/
   * intake and shared analysis queue. Used by the settings-page "upload docs
   * to Drive" button.
   */
  uploadFilesToInbox(
    files: File[],
    businessNumber: string,
    clientUserId?: string,
  ): Observable<{ fileId: string; fileName: string; passwordRequired?: boolean }[]> {
    const url = `${environment.apiUrl}documents/me/upload-to-inbox`;
    const form = new FormData();
    files.forEach(file => form.append('files', file, file.name));
    form.append('businessNumber', businessNumber);
    let headers = new HttpHeaders({ businessnumber: businessNumber });
    if (clientUserId) {
      headers = headers.set('x-client-user-id', clientUserId);
    }
    return this.http.post<{ fileId: string; fileName: string; passwordRequired?: boolean }[]>(url, form, { headers });
  }
}
