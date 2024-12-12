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
    const token = localStorage.getItem('token');
    const url = `${environment.apiUrl}transactions/get-trans`;
    const param = new HttpParams()
    .set('finsiteId', formData.finsiteId)
    .set('startDate',  formData.startDate)
    .set('endDate',  formData.endDate)
    const headers = {
      'token': token
    }
    return this.http.get<any>(url, {params: param, headers: headers})
  }
  
  getAllUsersDataFromFinsite(): Observable<any> {
    // const token = localStorage.getItem('token');
    const url = `${environment.apiUrl}finsite/finsite-connect`;
    return this.http.get<any>(url);
  }
}
