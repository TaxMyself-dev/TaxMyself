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
}

export interface SubCategoryCatalogEntry {
  subCategoryName: string;
  categoryName: string;
  taxPercent: number;
  vatPercent: number;
  isEquipment: boolean;
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

  getMySubCategoryCatalog(businessNumber: string): Observable<SubCategoryCatalogEntry[]> {
    const url = `${environment.apiUrl}documents/me/catalog`;
    const params = new HttpParams().set('businessNumber', businessNumber);
    return this.http.get<SubCategoryCatalogEntry[]>(url, { params });
  }
}
