import { Injectable } from '@angular/core';
import { Observable, of, from, throwError } from 'rxjs';
import { switchMap, catchError } from 'rxjs/operators';
import { HttpClient, HttpParams, HttpResponse } from '@angular/common/http';
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
    return this.http.post<Blob>(url, dataFile, { 
      responseType: 'blob' as 'json',
      observe: 'response'
    }).pipe(
      switchMap((response: HttpResponse<Blob>) => {
        // Check if response status is not OK
        if (!response.ok || !response.body) {
          // It's an error response, parse the blob as JSON
          const body = response.body;
          if (!body) {
            return throwError(() => new Error(`HTTP Error: ${response.status} ${response.statusText}`));
          }
          return from(body.text()).pipe(
            switchMap(text => {
              try {
                const error = JSON.parse(text);
                console.error('❌ Backend validation error:', error);
                return throwError(() => new Error(JSON.stringify(error, null, 2)));
              } catch (parseError) {
                return throwError(() => new Error(`Failed to parse error: ${text}`));
              }
            })
          );
        }
        // Check content type to ensure it's a PDF
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          // Unexpected JSON response, try to parse as error
          return from(response.body.text()).pipe(
            switchMap((text: string) => {
              try {
                const error = JSON.parse(text);
                console.error('❌ Unexpected JSON response:', error);
                return throwError(() => new Error(JSON.stringify(error, null, 2)));
              } catch (parseError) {
                return throwError(() => new Error(`Unexpected response format: ${text}`));
              }
            })
          );
        }
        // It's a valid PDF blob
        return of(response.body);
      }),
      catchError(error => {
        // Handle HTTP errors (400, 500, etc.)
        if (error.error instanceof Blob) {
          return from(error.error.text()).pipe(
            switchMap((text: string) => {
              try {
                const errorObj = JSON.parse(text);
                console.error('❌ Backend error:', errorObj);
                return throwError(() => new Error(JSON.stringify(errorObj, null, 2)));
              } catch (parseError) {
                return throwError(() => new Error(`Error: ${text}`));
              }
            })
          );
        }
        // If it's already a parsed error message, re-throw it
        if (error.message) {
          return throwError(() => error);
        }
        return throwError(() => new Error(`HTTP Error: ${error.status || 'Unknown'} ${error.statusText || ''}`));
      })
    );
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
