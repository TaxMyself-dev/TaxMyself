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

  addAgent(name: string): Observable<any> {
    const url = `${environment.apiUrl}agent/admin/add`;
    return this.http.post<any>(url, { name });
  }

  clearUserCache(firebaseId: string): Observable<any> {
    const url = `${environment.apiUrl}transactions/admin/clear-cache/${firebaseId}`;
    return this.http.delete<any>(url);
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
