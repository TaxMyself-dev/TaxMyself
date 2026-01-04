import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { ICreateDataDoc, IDataDocFormat, IDocIndexes, ISettingDoc } from 'src/app/shared/interface';
import { IClient } from './doc-create.interface';

@Injectable({
  providedIn: 'root'
})
export class DocCreateService {

  token: string;



  constructor(private http: HttpClient) {};


  getDocIndexes(docType: string, issuerBusinessNumber: string): Observable<IDocIndexes> {
    const url = `${environment.apiUrl}documents/get-setting-doc-by-type/${docType}`;
    const params = new HttpParams().set('issuerBusinessNumber', issuerBusinessNumber);
    return this.http.get<IDocIndexes>(url, { params });
  }

  getDocLines(issuerBusinessNumber: string, docNumber: string): Observable<any[]> {
    const url = `${environment.apiUrl}documents/get-doc-lines`;
    const params = new HttpParams()
      .set('issuerBusinessNumber', issuerBusinessNumber)
      .set('docNumber', docNumber);
    return this.http.get<any[]>(url, { params });
  }
  

  setInitialDocDetails(docType: string, initialIndex: number, issuerBusinessNumber: string): Observable<any> {
    const url = `${environment.apiUrl}documents/setting-initial-index/${docType}`;
    return this.http.post<any>(url, { initialIndex, issuerBusinessNumber });
  }

  getClients(businessNumber: string): Observable<IClient[]> {
    const url = `${environment.apiUrl}clients/get-clients/${businessNumber}`;
    return this.http.get<IClient[]>(url);
  }

  
  deleteClient(clientId: number): Observable<any> {
    const url = `${environment.apiUrl}clients/delete-client/${clientId}`;
    return this.http.delete<any>(url);
  }


  createDoc(dataFile: any): Observable<any> {
    const url = `${environment.apiUrl}documents/create-doc`;
    return this.http.post<any>(url, dataFile);
  }


  previewDoc(dataFile: any): Observable<Blob> {
    const url = `${environment.apiUrl}documents/preview-doc`;
    return this.http.post<Blob>(url, dataFile, { responseType: 'blob' as 'json'})
  }

  rollbackDocument(issuerBusinessNumber: string, generalDocIndex: string | number): Observable<any> {
    const url = `${environment.apiUrl}documents/rollback`;
    return this.http.post<any>(url, { issuerBusinessNumber, generalDocIndex: String(generalDocIndex) });
  }

  
  generatePDF(data: any): Observable<Blob> {
    const url = `${environment.apiUrl}documents/generate-pdf`;
    return this.http.post<Blob>(url, data, { responseType: 'blob' as 'json' });
  }

  updateCurrentIndex(docType: number): Observable<any> {
    const url = `${environment.apiUrl}documents/update-cerrunt-index/${docType}`;
    return this.http.patch<any>(url, {});
  }

  addDoc(data: any): Observable<any> {
    const url = `${environment.apiUrl}documents/add-doc`;
    return this.http.post<any>(url, data);
  }
}
