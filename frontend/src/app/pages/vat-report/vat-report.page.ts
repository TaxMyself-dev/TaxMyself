import { Component, OnInit } from '@angular/core';
import { VatReportService } from './vat-report.service';
import { TableService } from 'src/app/services/table.service';
import { IRowDataTable, ISortDate, IVatReportTableData } from 'src/app/shared/interface';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { Observable, map, tap } from 'rxjs';

@Component({
  selector: 'app-vat-report',
  templateUrl: './vat-report.page.html',
  styleUrls: ['./vat-report.page.scss'],
})
export class VatReportPage implements OnInit {

  myForm: FormGroup;
  //Array of selected year input. @length:how many years back view.
  years: number[] = Array.from({ length: 15 }, (_, i) => new Date().getFullYear() - i);
  vatReportData$!: Observable<IVatReportTableData>;//Data from server.
  liableForVAT!: number;//Variable of input incomes with VAT.
  exempForVAT!: number;//Variable of input incomes free VAT.


  constructor(public vatReportService: VatReportService, private formBuilder: FormBuilder) {
    this.myForm = this.formBuilder.group({
      year: new FormControl(
        '', Validators.required,
      ),
      month: new FormControl(
        '', Validators.required,
      ),
      liableForVAT: new FormControl(
        '', Validators.required,
      ),
      exempForVAT: new FormControl(
        '', Validators.required
      )
    })
  }

  ngOnInit() {
  }
//Func of checkbox.Updates the variable oneMonth if selected or not.
  onCheckboxChange(event: any) {
    // this.vatReportService.oneMonth$.next(event.detail.checked);
  };
   

  getVatReportData(data: ISortDate){
    this.vatReportData$ = this.vatReportService.getVatReportdata(data).pipe(
      map(data => {
        return {
          'עסקאות חייבות לפני מע"מ':data.transactionVAT,
          'עסקאות פטורות ממע"מ או בשיעור 0': data.transactionFreeVAT,
          'מע"מ הכנסות': data.transactionVAT * 0.17,
          'החזר מע"מ רכוש קבוע:': data.equipmentVatRefund,
          'החזר מע"מ הוצאות משתנות': data.generalVatRefund,
          'מע"מ הכנסות:': 1236,
          'תשלום מע"מ': 1236
        }
      })
    )
  }
}
