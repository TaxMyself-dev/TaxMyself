import { Component, OnInit, Output, Input, EventEmitter } from '@angular/core';
import { VatReportService } from './vat-report.service';
import { IRowDataTable, ISortDate, IVatReportTableData } from 'src/app/shared/interface';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { Observable, map, tap } from 'rxjs';
import { startOfMonth, endOfMonth, format } from 'date-fns';
import { months, singleMonths } from 'src/app/shared/enums';
import { ButtonSize } from 'src/app/shared/button/button.enum';

interface ReportData {
  vatableTurnover: string;
  nonVatableTurnover: string;  
  vatRefundOnAssets: number;
  vatRefundOnExpenses: number;
  vatPayment: number;
}



interface FieldTitles {
  [key: string]: string;
}

@Component({
  selector: 'app-vat-report',
  templateUrl: './vat-report.page.html',
  styleUrls: ['./vat-report.page.scss'],
})
export class VatReportPage implements OnInit {

  @Input() isSingleMonth: boolean = false;

  readonly ButtonSize = ButtonSize;
  months = months;
  singleMonths = singleMonths;
  optionTypeReport = [{key: 'oneMonth', value: 'חודשי'}, {key: 'twoMonth', value: 'דו-חודשי'}];
  years: number[] = Array.from({ length: 15 }, (_, i) => new Date().getFullYear() - i);
  report?: ReportData;
  myForm: FormGroup;


  reportOrder: string[] = [
    'vatableTurnover',
    'nonVatableTurnover',
    'vatRefundOnAssets',
    'vatRefundOnExpenses',
    'vatPayment'
  ];

  vatReportFieldTitles = {
    vatableTurnover: 'עסקאות חייבות',
    nonVatableTurnover: 'עסקאות פטורות או בשיעור אפס',
    vatRefundOnAssets: 'תשומות ציוד',
    vatRefundOnExpenses: 'תשומות אחרות',
    vatPayment: 'סה"כ לתשלום'
  };

  constructor(public vatReportService: VatReportService, private formBuilder: FormBuilder) {
    this.myForm = this.formBuilder.group({
      vatableTurnover: new FormControl (
        '', Validators.required,
      ),
      nonVatableTurnover: new FormControl (
        '', Validators.required,
      ),
      month: new FormControl (
        '', Validators.required,
      ),
      year: new FormControl (
        '', Validators.required,
      )
    })
  }


  ngOnInit() {
  }


  onSubmit() {
    console.log("onSubmit - start");
    const formData = this.myForm.value;
    //let monthArr = [];
    //monthArr = formData.month;
    console.log("month is ", formData.month);
    //console.log("monthArr is ", monthArr);
    console.log("year is ", formData.year);
    
    this.getVarReportData(formData.month, formData.year, this.isSingleMonth);
  }

  slectedTypeReport(event: any): void {
    console.log(event.target.value);
    const val = event.target.value;
    val === "oneMonth" ? this.months = singleMonths : this.months = months ;
    console.log(this.months);
    
  }


  toggleSingleMonth(): void {
    this.isSingleMonth = !this.isSingleMonth;
  }


  userId = 'L5gJkrdQZ5gGmte5XxRgagkqpOL2';
  

  async getVarReportData(month: number , year: number, isSingleMonth: boolean) {

    const formData = this.myForm.value;

    console.log("month is ", month);
    

    // Create a date object for the first day of the specified month and year
    let startDateofMonth = startOfMonth(new Date(year, month));
    let monthAdjusted = isSingleMonth ? Number(month) : Number(month) + 1;
    console.log("monthAdjusted is ", monthAdjusted);
    let lastDayOfMonth = endOfMonth(new Date(year, monthAdjusted));

    console.log("debug_0 startDate is ", startDateofMonth);
    console.log("debug_0 endDate is ", lastDayOfMonth);

    // Format the date as "dd-MM-yyyy"
    const startDate = format(startDateofMonth, 'yyyy-MM-dd').toString();
    const endDate = format(lastDayOfMonth, 'yyyy-MM-dd').toString();

    console.log("debug_1 startDate is ", startDate);
    console.log("debug_1 endDate is ", endDate);


    this.vatReportService.getVatReportData(startDate, endDate, formData.vatableTurnover, formData.nonVatableTurnover, this.userId)
    .subscribe((res) => {
      console.log("res of vat report is", res);
      this.report = res;
      console.log("report is ", this.report);
    });

  }




}