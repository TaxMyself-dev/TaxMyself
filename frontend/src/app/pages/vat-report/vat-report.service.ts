import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class VatReportService {

  constructor(private http: HttpClient) { };

  getVatReportData(startDate: Date, endDate: Date, vatableTurnover: number, nonVatableTurnover: number, token: string): Observable<any> {
    const url = `${environment.apiUrl}reports/vat-report`;
    const param = new HttpParams()
      .set('startDate', startDate.toISOString())
      .set('endDate', endDate.toISOString())
      .set('vatableTurnover', vatableTurnover.toString())
      .set('nonVatableTurnover', nonVatableTurnover.toString())
      .set('token', token);
    return this.http.get<any>(url, { params: param })
  }

}
