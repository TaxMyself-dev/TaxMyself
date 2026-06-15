import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

/** One row of the Form 1342 depreciation report — mirrors the backend DTO. */
export interface IForm1342ReportRow {
  assetName: string;
  purchaseDate: string;
  activationDate: string;
  originalCost: number;
  changesDuringYear: number;
  depreciationRate: number;
  depreciationRatePerLaw: number;
  currentYearDepreciation: number;
  priorYearsDepreciation: number;
  totalDepreciation: number;
  remainingBalance: number;
}

export interface IForm1342Report {
  year: number;
  rows: IForm1342ReportRow[];
  totalOriginalCost: number;
  totalCurrentYearDepreciation: number;
  totalPriorYearsDepreciation: number;
  totalDepreciation: number;
  totalRemainingBalance: number;
}

@Injectable({
  providedIn: 'root'
})
export class DepreciationReportService {

  constructor(private http: HttpClient) {}

  getDepreciationReport(businessNumber: string, year: number): Observable<IForm1342Report> {
    const url = `${environment.apiUrl}reports/depreciation-report`;
    const params = new HttpParams()
      .set('businessNumber', businessNumber)
      .set('year', String(year));
    return this.http.get<IForm1342Report>(url, { params });
  }
}
