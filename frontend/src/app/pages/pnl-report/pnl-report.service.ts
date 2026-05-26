import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class PnLReportService {

  // token: string;

  constructor(private http: HttpClient) {
    // this.setUserId();
  };


  // private setUserId(): void {
  //   this.token = localStorage.getItem('token');
  // }


  getPnLReportData(startDate: string, endDate: string, businessNumber: string): Observable<any> {
    // const token = localStorage.getItem('token');
    const url = `${environment.apiUrl}reports/pnl-report`;
    const params = new HttpParams()
      .set('startDate', startDate)
      .set('endDate', endDate)
      .set('businessNumber', businessNumber)

    // const headers = {
    //   'token': token
    // }

    return this.http.get<any>(url, { params: params })
  }

  generatePnLReportPDF(data: any): Observable<Blob> {
    const url = `${environment.apiUrl}reports/pnl-report-pdf`;
    return this.http.post<Blob>(url, data, { 
      responseType: 'blob' as 'json'
    });
  }

  addFileToExpenses(formData: { id: number, file: string | File }[], fromTransactions: boolean = false): Observable<any> {
    const url = `${environment.apiUrl}expenses/add-file-to-expense`;
    return this.http.patch<any>(url, { formData, fromTransactions });
  }


  /** Marks the PnL/annual report as submitted — locks every transaction in the period. */
  markReportAsSubmitted(businessNumber: string, startDate: string): Observable<{ count: number; periodLabel: string }> {
    const url = `${environment.apiUrl}reports/mark-submitted`;
    return this.http.post<{ count: number; periodLabel: string }>(url, { businessNumber, startDate });
  }


  /** Returns whether the report for this period has already been marked as submitted. */
  getReportSubmissionStatus(businessNumber: string, startDate: string): Observable<{ isSubmitted: boolean; periodLabel: string }> {
    const url = `${environment.apiUrl}reports/submission-status`;
    const params = new HttpParams()
      .set('businessNumber', businessNumber)
      .set('startDate', startDate);
    return this.http.get<{ isSubmitted: boolean; periodLabel: string }>(url, { params });
  }


}