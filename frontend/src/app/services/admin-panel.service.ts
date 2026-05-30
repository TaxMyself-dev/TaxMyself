import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { LoadingController } from '@ionic/angular';
import { Observable } from 'rxjs';


@Injectable({
  providedIn: 'root'
})
export class AdminPanelService {

  token: string;

  constructor(private http: HttpClient, private loader: LoadingController) { 
    this.token = localStorage.getItem('token');
  }

  getTransFromApi(formData: any): Observable<any> {
    const url = `${environment.apiUrl}transactions/get-trans`;
    const param = new HttpParams()
    .set('finsiteId', formData.finsiteId)
    .set('startDate',  formData.startDate)
    .set('endDate',  formData.endDate)
    return this.http.get<any>(url, {params: param})
  }
  
  getAllUsersDataFromFinsite(): Observable<any> {
    // const token = localStorage.getItem('token');
    const url = `${environment.apiUrl}finsite/finsite-connect`;
    return this.http.get<any>(url);
  }

  getAllUsers(): Observable<any> {
    const url = `${environment.apiUrl}auth/all-users`;
    return this.http.get<any>(url);
  }

  fetchFeezbackTransactions(firebaseId: string, startDate: string, endDate: string): Observable<any> {
    const url = `${environment.apiUrl}feezback/admin-user-transactions`;
    const params = new HttpParams()
      .set('firebaseId', firebaseId)
      .set('dateFrom', startDate)
      .set('dateTo', endDate)
      .set('bookingStatus', 'booked');
    return this.http.get<any>(url, { params });
  }

  clearUserCache(firebaseId: string): Observable<any> {
    const url = `${environment.apiUrl}transactions/admin/clear-cache/${firebaseId}`;
    return this.http.delete<any>(url);
  }

  // ----- Drive OCR sync (admin) -----

  syncUserDriveMonth(userIndex: number, businessNumber: string, yearMonth: string): Observable<DriveSyncResult> {
    const url = `${environment.apiUrl}documents/sync/${userIndex}/${businessNumber}/${yearMonth}`;
    return this.http.post<DriveSyncResult>(url, {});
  }

  getUserExtractedDocs(userIndex: number, businessNumber: string, yearMonth: string): Observable<ExtractedDocRow[]> {
    const url = `${environment.apiUrl}documents/${userIndex}/${businessNumber}/${yearMonth}`;
    return this.http.get<ExtractedDocRow[]>(url);
  }

  // ----- Demo data -----

  listDemoProfiles(): Observable<DemoProfileListItem[]> {
    return this.http.get<DemoProfileListItem[]>(`${environment.apiUrl}demo-data/profiles`);
  }

  seedDemoProfile(id: string): Observable<DemoSeedResult> {
    return this.http.post<DemoSeedResult>(
      `${environment.apiUrl}demo-data/profiles/${id}/seed`,
      {},
    );
  }

  resetDemoProfile(id: string): Observable<DemoResetResult> {
    return this.http.post<DemoResetResult>(
      `${environment.apiUrl}demo-data/profiles/${id}/reset`,
      {},
    );
  }
}

export interface DemoSubUser {
  firebaseId?: string;
  email: string;
  password: string;
  label: string;
}

export interface DemoProfileListItem {
  id: string;
  label: string;
  description: string;
  email: string;
  password: string;
  exists: boolean;
  /** firebaseId of the primary demo user (when `exists === true`). */
  firebaseId?: string;
  /** Delegated clients (for accountant profiles). Empty/undefined for solo profiles. */
  clients?: DemoSubUser[];
}

export interface DemoSeedResult {
  firebaseId: string;
  email: string;
  password: string;
  clients?: DemoSubUser[];
}

export interface DemoResetResult {
  existed: boolean;
  deletedRows: Record<string, number>;
}

export interface DriveSyncResult {
  processed: number;
  failed: number;
  skipped: number;
  total: number;
  monthFolderId: string;
}

export interface ExtractedDocRow {
  id: number;
  userId: number;
  driveFileId: string;
  driveFileName: string;
  month: string;
  supplier: string | null;
  supplierId: string | null;
  date: string | null;
  invoiceNumber: string | null;
  amount: string | null;
  vat: string | null;
  amountBeforeVat: string | null;
  category: string | null;
  description: string | null;
  status: 'pending' | 'processed' | 'error';
  rawResponse: string | null;
  createdAt: string;
  updatedAt: string;
}
