import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

export interface DriveSyncMonthResult {
  processed: number;
  failed: number;
  skipped: number;
  total: number;
  monthFolderId: string;
}

export interface DriveSyncRangeResult {
  months: Array<{ month: string; result: DriveSyncMonthResult | { error: string } }>;
  totals: {
    processed: number;
    failed: number;
    skipped: number;
    total: number;
  };
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

export interface ReviewableExtractedDoc {
  id: number;
  userId: number;
  driveFileId: string;
  driveFileName: string;
  month: string;
  supplier: string | null;
  supplierId: string | null;
  date: string | null;
  invoiceNumber: string | null;
  allocationNumber: string | null;
  amount: string | null;
  vat: string | null;
  amountBeforeVat: string | null;
  category: string | null;
  subCategory: string | null;
  taxPercent: string | null;
  vatPercent: string | null;
  isEquipment: boolean | null;
  description: string | null;
  status: 'pending' | 'processed' | 'error';
  rawResponse: string | null;
  matchedSupplier: MatchedSupplier | null;
}

export interface ConfirmFromDriveItem {
  documentId: number;
  supplier: string;
  supplierID: string | null;
  date: string;          // YYYY-MM-DD
  sum: number;
  category: string;
  subCategory: string;
  vatPercent: number;
  taxPercent: number;
  isEquipment: boolean;
  saveAsSupplier: boolean;
  /** Period label ("M/YYYY" or "M1-M2/YYYY"). Optional — backend derives
   *  from `date` + business cadence when omitted. UI sends it when the user
   *  manually overrode the auto-derived period in the table. */
  reportPeriod?: string | null;
}

export interface DuplicateCheckItem {
  documentId: number;
  supplier: string;
  sum: number;
  date: string;          // YYYY-MM-DD
}

export interface DuplicateExpenseMatch {
  documentId: number;
  existingExpenseId: number;
  existingPeriod: string | null;
  supplier: string;
  sum: number;
  date: string;
}

export interface SubCategoryCatalogEntry {
  subCategoryName: string;
  categoryName: string;
  taxPercent: number;
  vatPercent: number;
  isEquipment: boolean;
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

export interface BulkConfirmResponse {
  results: Array<{
    documentId: number;
    ok: boolean;
    expenseId?: number;
    supplierCreated?: boolean;
    error?: string;
  }>;
  summary: { total: number; succeeded: number; failed: number };
}

@Injectable({ providedIn: 'root' })
export class DriveDocsService {
  constructor(private http: HttpClient) {}

  syncMyDriveMonths(businessNumber: string, months: string[]): Observable<DriveSyncRangeResult> {
    const url = `${environment.apiUrl}documents/me/sync`;
    return this.http.post<DriveSyncRangeResult>(url, { businessNumber, months });
  }

  getMyReviewableDocs(businessNumber: string, months: string[]): Observable<ReviewableExtractedDoc[]> {
    const url = `${environment.apiUrl}documents/me/review`;
    const params = new HttpParams()
      .set('businessNumber', businessNumber)
      .set('months', months.join(','));
    return this.http.get<ReviewableExtractedDoc[]>(url, { params });
  }

  bulkConfirmFromDrive(businessNumber: string, items: ConfirmFromDriveItem[]): Observable<BulkConfirmResponse> {
    const url = `${environment.apiUrl}expenses/bulk-confirm-from-drive`;
    // Send businessNumber in the body so we don't depend on the auth
    // interceptor's businessnumber header (which may be unset depending on
    // session state). The backend treats body.businessNumber as authoritative.
    return this.http.post<BulkConfirmResponse>(url, { businessNumber, items });
  }

  checkDuplicatesFromDrive(
    businessNumber: string,
    items: DuplicateCheckItem[],
  ): Observable<DuplicateExpenseMatch[]> {
    const url = `${environment.apiUrl}expenses/check-duplicates-from-drive`;
    return this.http.post<DuplicateExpenseMatch[]>(url, { businessNumber, items });
  }

  getMySubCategoryCatalog(businessNumber: string): Observable<SubCategoryCatalogEntry[]> {
    const url = `${environment.apiUrl}documents/me/catalog`;
    const params = new HttpParams().set('businessNumber', businessNumber);
    return this.http.get<SubCategoryCatalogEntry[]>(url, { params });
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
}
