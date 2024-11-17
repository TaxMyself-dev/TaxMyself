import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class VatReportService {

  token: string;

  constructor(private http: HttpClient) {
    this.setUserId();
   };

  private setUserId(): void {
    this.token = localStorage.getItem('token');
  }

  getVatReportData(startDate: string, endDate: string, vatableTurnover: number, nonVatableTurnover: number): Observable<any> {
    const token = localStorage.getItem('token');
    const url = `${environment.apiUrl}reports/vat-report`;
    const params = new HttpParams()
    .set('startDate', startDate)
    .set('endDate', endDate)
    .set('vatableTurnover', vatableTurnover.toString())
    .set('nonVatableTurnover', nonVatableTurnover.toString())
  
    const headers = {
      'token': token
    }
   
    return this.http.get<any>(url, { params: params, headers: headers})
  }

  addFileToExpenses(formData: {id:number, file: string | File}[]): Observable<any> {
    const token = localStorage.getItem('token');
    const url = `${environment.apiUrl}expenses/add-file-to-expense`;
    const headers = {
      'token': token
    }
    return this.http.patch<any>(url, formData, {headers: headers})

  }

}
