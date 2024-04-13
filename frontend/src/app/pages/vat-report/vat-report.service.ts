import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject, of } from 'rxjs';
import { ISortDate, IVatReportData } from 'src/app/shared/interface';
import { HttpClient, HttpParams } from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})
export class VatReportService {

// private vatReportData: IVatReportData = {
//   equipmentVatRefund: 87.5,
//   generalVatRefund: 67.5,
//   transactionVAT:0, //Variable of input incomes with VAT.
//   transactionFreeVAT:0 //Variable of input incomes free VAT.
// }

  constructor(private http: HttpClient) { };

  getVatReportData(startDate: Date, endDate: Date, vatableTurnover: number, nonVatableTurnover: number, userId: string): Observable<any> {
    const url = 'http://localhost:3000/reports/vat-report'
    const param = new HttpParams()
      .set('startDate', startDate.toISOString())
      .set('endDate', endDate.toISOString())
      .set('vatableTurnover', vatableTurnover.toString())
      .set('nonVatableTurnover', nonVatableTurnover.toString())
      .set('userId', userId);
    return this.http.get<any>(url, { params: param })
  }

  // getVatReportdata(data: ISortDate): Observable<IVatReportData>{
  //   return of(this.vatReportData);
  // }

  // setvatReportData(data:any):void{
  //   this.vatReportData.transactionVAT = data.liableForVAT;
  //   this.vatReportData.transactionFreeVAT = data.exempForVAT;
  // }

}
