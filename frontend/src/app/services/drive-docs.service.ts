import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

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

/** Derived lifecycle label for a document archive row — see
 *  `DocumentArchiveStatus` in the backend's `src/enum.ts` for the exact
 *  precedence rules (REJECTED > FILED_ANNUAL > APPROVED_EXPENSE > IN_PROGRESS). */
export type DocumentArchiveStatus = 'IN_PROGRESS' | 'APPROVED_EXPENSE' | 'FILED_ANNUAL' | 'REJECTED';

/** A row from the document archive tab — `GET /documents/me/archived`. */
export interface ArchivedDocSummary {
  id: number;
  driveFileId: string;
  driveFileName: string;
  supplier: string | null;
  supplierId: string | null;
  date: string | null;
  invoiceNumber: string | null;
  amount: string | null;
  currency: string | null;
  category: string | null;
  subCategory: string | null;
  documentType: string | null;
  uploadDate: string | null;
  archiveStatus: DocumentArchiveStatus;
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

  getArchivedDocuments(businessNumber: string): Observable<ArchivedDocSummary[]> {
    const url = `${environment.apiUrl}documents/me/archived`;
    const params = new HttpParams().set('businessNumber', businessNumber);
    return this.http.get<ArchivedDocSummary[]>(url, { params });
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
  uploadFilesToInbox(files: File[], businessNumber: string): Observable<{ fileId: string; fileName: string }[]> {
    const url = `${environment.apiUrl}documents/me/upload-to-inbox`;
    const form = new FormData();
    files.forEach(file => form.append('files', file, file.name));
    form.append('businessNumber', businessNumber);
    return this.http.post<{ fileId: string; fileName: string }[]>(url, form);
  }
}
