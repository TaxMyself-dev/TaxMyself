import { Component, OnInit, Input } from '@angular/core';
import { VatReportService } from './vat-report.service';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { startOfMonth, endOfMonth } from 'date-fns';
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
  styleUrls: ['./vat-report.page.scss', '../../shared/shared-styling.scss'],
})
export class VatReportPage implements OnInit {

  @Input() isSingleMonth: boolean = false;

  readonly ButtonSize = ButtonSize;
  // months = months;
  // singleMonths = singleMonths;
  // optionTypeReport = [{key: 'oneMonth', value: 'חודשי'}, {key: 'twoMonth', value: 'דו-חודשי'}];
  years: number[] = Array.from({ length: 15 }, (_, i) => new Date().getFullYear() - i);
  report?: ReportData;
  expenses_details: boolean = false;
  vatReportForm: FormGroup;
  token: string;


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
    this.vatReportForm = this.formBuilder.group({
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
      ),
      isSingleMonth: new FormControl (
        '', Validators.required,
      )
    })
  }


  ngOnInit() {
    //this.token = localStorage.getItem('token');
  }


  onSubmit() {
    console.log("onSubmit - start");
    const formData = this.vatReportForm.value;
    console.log(formData);
    
    this.getVarReportData(formData.month, formData.year, this.isSingleMonth);
  }


  // slectedTypeReport(event: any): void {
  //   console.log(event.target.value);
  //   const val = event.target.value;
  //   val === "oneMonth" ? this.months = singleMonths : this.months = months ;
  //   console.log(this.months);
    
  // }


  toggleSingleMonth(): void {
    this.isSingleMonth = !this.isSingleMonth;
  }
  

  async getVarReportData(month: number , year: number, isSingleMonth: boolean) {

    const formData = this.vatReportForm.value;

    console.log("form data debug is ",formData);
    
    // Create a date object for the first day of the specified month and year
    let startDateofMonth = startOfMonth(new Date(year, month));
    let monthAdjusted = isSingleMonth ? Number(month) : Number(month) + 1;
    let lastDayOfMonth = endOfMonth(new Date(year, monthAdjusted));

    //this.vatReportService.getVatReportData(startDateofMonth, lastDayOfMonth, formData.vatableTurnover, formData.nonVatableTurnover, this.token)
    this.vatReportService.getVatReportData(formData)
    .subscribe((res) => {
      console.log("res of vat report is", res);
      this.report = res;
      console.log("report is ", this.report);
    });

  }

  showExpenses() {
    this.expenses_details = !this.expenses_details
  }


}