import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { ISettingDoc } from 'src/app/shared/interface';

@Injectable({
  providedIn: 'root'
})
export class DocCreateService {

  token: string;



  constructor(private http: HttpClient) {};


  getDetailsDoc(docType: number): Observable<ISettingDoc> {
    const token = localStorage.getItem('token');
    const url = `${environment.apiUrl}documents/get-setting-doc-by-type/${docType}`;
    const headers = {
      'token': token
    }
    return this.http.get<ISettingDoc>(url,{headers});
  }

  setInitialDocDetails(data,docType: number): Observable<any> {
    const token = localStorage.getItem('token');
    const url = `${environment.apiUrl}documents/setting-initial-index/${docType}`;
    return this.http.post<any>(url, {initialIndex: data.initialIndex}, {headers: {token}});
  }

  saveClientDetails(data: any): Observable<any> {
    console.log("🚀 ~ DocCreateService ~ saveClientDetails ~ data:", data)
    const token = localStorage.getItem('token');
    const url = `${environment.apiUrl}clients/add-client`;
    return this.http.post<any>(url, data, {headers: {token}});
  }

  getClients(): Observable<any> {
    const token = localStorage.getItem('token');
    const url = `${environment.apiUrl}clients/get-clients`;
    const headers = {
      'token': token
    }
    return this.http.get<any[]>(url, { headers });
  }
}
