import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class VatReportService {

  constructor(private http: HttpClient) {};


  getVatReportData(startDate: string, endDate: string, businessNumber: string): Observable<any> {
    const url = `${environment.apiUrl}reports/vat-report`;
    const params = new HttpParams()
    .set('startDate', startDate)
    .set('endDate', endDate)
    .set('businessNumber', businessNumber)  
    return this.http.get<any>(url, { params: params})
  }


  addFileToExpenses(formData: {id:number, file: string | File}[], fromTransactions: boolean = false): Observable<any> {
    const url = `${environment.apiUrl}expenses/add-file-to-expense`;
    return this.http.patch<any>(url, {formData, fromTransactions})

  }


  deleteFileFromDB(expenseId: number): Observable<any> {
    const url = `${environment.apiUrl}expenses/delete-file-from-expense/${expenseId}`;
    return this.http.patch<any>(url, {})
  }


  /**
   * Marks the VAT report as submitted at the tax authority — locks every
   * transaction stamped with the matching period label.
   */
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
