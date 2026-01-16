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
}
