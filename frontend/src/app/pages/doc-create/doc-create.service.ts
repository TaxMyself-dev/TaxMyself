import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { ICreateDataDoc, ISettingDoc } from 'src/app/shared/interface';

@Injectable({
  providedIn: 'root'
})
export class DocCreateService {

  token: string;



  constructor(private http: HttpClient) {};


  getDetailsDoc(docType: string): Observable<ISettingDoc> {
    const token = localStorage.getItem('token');
    const url = `${environment.apiUrl}documents/get-setting-doc-by-type/${docType}`;
    const headers = {
      'token': token
    }
    return this.http.get<ISettingDoc>(url,{headers});
  }

  setInitialDocDetails(data,docType: string): Observable<any> {
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

  deleteClient(clientId: number): Observable<any> {
    const token = localStorage.getItem('token');
    const url = `${environment.apiUrl}clients/delete-client/${clientId}`;
    return this.http.delete<any>(url, { headers: { token } });
  }

  createDoc(dataFile: ICreateDataDoc): Observable<Blob> {
    console.log("🚀 ~ DocCreateService ~ createDoc ~ dataFile:", dataFile)
    console.log("cerate in service");
    const url = `${environment.apiUrl}documents/create-doc`;
   
    return this.http.post<Blob>(url, dataFile, { responseType: 'blob' as 'json'})
  }

  generatePDF(data: any): Observable<Blob> {
    const url = `${environment.apiUrl}documents/generate-pdf`;
    return this.http.post<Blob>(url, data, { responseType: 'blob' as 'json' });
  }

  updateCurrentIndex(docType: number): Observable<any> {
    const token = localStorage.getItem('token');
    const url = `${environment.apiUrl}documents/update-cerrunt-index/${docType}`;
    return this.http.patch<any>(url, {}, {headers: {token}});
  }

  addDoc(data: any): Observable<any> {
    const token = localStorage.getItem('token');
    const url = `${environment.apiUrl}documents/add-doc`;
    return this.http.post<any>(url, data, {headers: {token}});
  }
}
