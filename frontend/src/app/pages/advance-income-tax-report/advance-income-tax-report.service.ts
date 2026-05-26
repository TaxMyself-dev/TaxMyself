import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { IAdvanceIncomeTaxReportData } from 'src/app/shared/interface';

@Injectable({
  providedIn: 'root'
})
export class AdvanceIncomeTaxReportService {

  constructor(private http: HttpClient) {}

  getAdvanceIncomeTaxReportData(
    startDate: string,
    endDate: string,
    businessNumber: string
  ): Observable<IAdvanceIncomeTaxReportData> {
    const url = `${environment.apiUrl}reports/advance-income-tax-report`;
    const params = new HttpParams()
      .set('startDate', startDate)
      .set('endDate', endDate)
      .set('businessNumber', businessNumber);
    return this.http.get<IAdvanceIncomeTaxReportData>(url, { params });
  }
}
