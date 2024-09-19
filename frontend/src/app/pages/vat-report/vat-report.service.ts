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

  // ngOnInit() {
  //   this.token = localStorage.getItem('token');
  // }

  private setUserId(): void {
    this.token = localStorage.getItem('token');
  }

  //getVatReportData(startDate: Date, endDate: Date, vatableTurnover: number, nonVatableTurnover: number, token: string): Observable<any> {
  getVatReportData(formData: any): Observable<any> {
    const url = `${environment.apiUrl}reports/vat-report`;
    const params = new HttpParams()
    .set('year', formData.year)
    .set('monthReport', formData.month)
    .set('isSingleMonth', formData.isSingleMonth)
    .set('vatableTurnover', formData.vatableTurnover.toString())
    .set('nonVatableTurnover', formData.nonVatableTurnover.toString())
  
    const headers = {
      'token': this.token
    }
    // const param = new HttpParams()
    //   .set('startDate', startDate.toISOString())
    //   .set('endDate', endDate.toISOString())
    //   .set('token', token);
    return this.http.get<any>(url, { params: params, headers: headers})
  }

}
