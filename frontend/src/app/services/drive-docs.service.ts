import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
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
export type RecordSource = 'DRIVE' | 'MANUAL' | 'OPEN_BANKING' | 'WHATSAPP';

/** Simplified 3-state status for the ארכיון שלי page — see
 *  `ArchiveItemStatus` in the backend's `src/enum.ts`. */
export type ArchiveItemStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'DELETED';

/** A row on the ארכיון שלי (unified archive) page — `GET /documents/me/archived`.
 *  DOCUMENT rows come from an uploaded/OCR'd document; EXPENSE rows are a
 *  bank/card transaction classified as an expense with no underlying
 *  document. `id` is scoped per `itemType` (an ExtractedDocument.id and an
 *  Expense.id can collide) — key rows by `${itemType}-${id}`. */
export interface ArchivedItem {
  id: number;
  itemType: 'DOCUMENT' | 'EXPENSE';
  documentType: string | null;
  name: string;
  uploadDate: string | null;
  source: RecordSource;
  status: ArchiveItemStatus;
  driveFileId: string | null;
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
  constructor(private http: HttpClient) {}

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

  /**
   * Runs Claude OCR on a single uploaded file (PDF/JPEG/PNG/etc) and returns
   * the extracted invoice fields for the manual-expense form to prefill.
   * Does NOT persist anything on the backend.
   */
  ocrSingleFile(file: File, businessNumber: string): Observable<OcrSingleFileResponse> {
    const url = `${environment.apiUrl}documents/me/ocr-file`;
    const form = new FormData();
    form.append('file', file, file.name);
    form.append('businessNumber', businessNumber);
    return this.http.post<OcrSingleFileResponse>(url, form);
  }

  /**
   * Drops one or more files straight into the business's Drive inbox/
   * folder — no OCR, just storage. Used by the settings-page "upload docs
   * to Drive" button.
   */
  uploadFilesToInbox(
    files: File[],
    businessNumber: string,
    clientUserId?: string,
  ): Observable<{ fileId: string; fileName: string }[]> {
    const url = `${environment.apiUrl}documents/me/upload-to-inbox`;
    const form = new FormData();
    files.forEach(file => form.append('files', file, file.name));
    form.append('businessNumber', businessNumber);
    let headers = new HttpHeaders({ businessnumber: businessNumber });
    if (clientUserId) {
      headers = headers.set('x-client-user-id', clientUserId);
    }
    return this.http.post<{ fileId: string; fileName: string }[]>(url, form, { headers });
  }
}
