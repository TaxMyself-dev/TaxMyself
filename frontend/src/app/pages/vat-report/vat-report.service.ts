import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject, of } from 'rxjs';
import { ISortDate, IVatReportData } from 'src/app/shared/interface';

@Injectable({
  providedIn: 'root'
})
export class VatReportService {

private vatReportData: IVatReportData = {
  equipmentVatRefund: 87.5,
  generalVatRefund: 67.5,
  transactionVAT:0, //Variable of input incomes with VAT.
  transactionFreeVAT:0 //Variable of input incomes free VAT.
}

  constructor() { };

  getVatReportdata(data: ISortDate): Observable<IVatReportData>{
    return of(this.vatReportData);
  }

  setvatReportData(data:any):void{
    this.vatReportData.transactionVAT = data.liableForVAT;
    this.vatReportData.transactionFreeVAT = data.exempForVAT;
  }
}
