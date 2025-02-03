import { Component, OnInit } from '@angular/core';
import { PnLReportService } from './pnl-report.service';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { ICreateDataFile, IPnlReportData, ISelectItem, IUserDate } from 'src/app/shared/interface';
import { GenericService } from 'src/app/services/generic.service';
import { DateService } from 'src/app/services/date.service';
import { AuthService } from 'src/app/services/auth.service';
import { catchError, EMPTY, finalize, map, tap } from 'rxjs';
import { FilesService } from 'src/app/services/files.service';
import { ReportingPeriodType } from 'src/app/shared/enums';


@Component({
  selector: 'app-pnl-report',
  templateUrl: './pnl-report.page.html',
  styleUrls: ['./pnl-report.page.scss', '../../shared/shared-styling.scss'],
})
export class PnLReportPage implements OnInit {

  pnlReportForm: FormGroup;
  pnlReport: IPnlReportData;
  userData: IUserDate;
  displayExpenses: boolean = false;
  reportClick: boolean = true;
  startDate: string;
  endDate: string;
  totalExpense: number = 0;
  businessNames: ISelectItem[] = [];

  reportingPeriodType = ReportingPeriodType;

  constructor(public pnlReportService: PnLReportService, private formBuilder: FormBuilder, private dateService: DateService, public authService: AuthService, private genericService: GenericService, private fileService: FilesService) {
    this.pnlReportForm = this.formBuilder.group({
      month: new FormControl(
        '', Validators.required,
      ),
      year: new FormControl(
        '', Validators.required,
      ),
      reportingPeriodType: new FormControl(
        '', Validators.required,
      ),
      startDate: new FormControl(
        Date,
      ),
      endDate: new FormControl(
        Date,
      ),
      businessNumber: new FormControl(
        '',
      ),
    })
  }


  ngOnInit() {
    this.userData = this.authService.getUserDataFromLocalStorage();
    if (this.userData.isTwoBusinessOwner) {
      this.businessNames.push({ name: this.userData.businessName, value: this.userData.businessNumber });
      this.businessNames.push({ name: this.userData.spouseBusinessName, value: this.userData.spouseBusinessNumber });
      this.pnlReportForm.get('businessNumber')?.setValidators([Validators.required]);
    }
    else {
      this.pnlReportForm.get('businessNumber')?.patchValue(this.userData.id);
    }
  }

  setFormValidators(event): void {
    console.log("event in perid type transaction: ", event.value);
    switch (event.value) {
      case this.reportingPeriodType.ANNUAL:
        this.pnlReportForm.controls['month']?.setValidators([]);// for reset month control
        this.pnlReportForm.controls['startDate']?.setValidators([]);// for reset month control
        this.pnlReportForm.controls['endDate']?.setValidators([]);// for reset month control
        this.pnlReportForm.controls['year']?.setValidators([Validators.required]);
        // this.pnlReportForm.controls['year']?.updateValueAndValidity();
        Object.values(this.pnlReportForm.controls).forEach((control) => {
          control.updateValueAndValidity();

        });
        console.log(this.pnlReportForm);
        break;

      case this.reportingPeriodType.DATE_RANGE:
        this.pnlReportForm.controls['year']?.setValidators([]);// for reset year control
        this.pnlReportForm.controls['month']?.setValidators([]);// for reset month control
        this.pnlReportForm.controls['startDate']?.setValidators([Validators.required]);
        this.pnlReportForm.controls['startDate']?.updateValueAndValidity();
        this.pnlReportForm.controls['endDate']?.setValidators([Validators.required]);
        Object.values(this.pnlReportForm.controls).forEach((control) => {
          control.updateValueAndValidity();
        });
        console.log(this.pnlReportForm);
        break;

      case this.reportingPeriodType.BIMONTHLY:
      case this.reportingPeriodType.MONTHLY:
        this.pnlReportForm.controls['startDate']?.setValidators([]);
        this.pnlReportForm.controls['endDate']?.setValidators([]);
        this.pnlReportForm.controls['month']?.setValidators([Validators.required]);
        this.pnlReportForm.controls['year']?.setValidators([Validators.required]);
        Object.values(this.pnlReportForm.controls).forEach((control) => {
          control.updateValueAndValidity();
        });
        console.log(this.pnlReportForm);
    }

  }

  onSubmit() {
    const formData = this.pnlReportForm.value;
    this.reportClick = false;
    const { startDate, endDate } = this.dateService.getStartAndEndDates(formData.reportingPeriodType, formData.year, formData.month, formData.startDate, formData.endDate);
    this.startDate = startDate;
    this.endDate = endDate;
    this.getPnLReportData(startDate, endDate, formData.businessNumber);
  }

  getPnLReportData(startDate: string, endDate: string, businessNumber: string) {
    this.genericService.getLoader().subscribe();
    this.pnlReportService.getPnLReportData(startDate, endDate, businessNumber)
      .pipe(
        finalize(() => this.genericService.dismissLoader()),
        catchError((err) => {
          console.log("err in get pnl report data: ", err);
          return EMPTY;
        }),
        map((data: IPnlReportData) => {
          console.log("pnl report: ", data);
          data.income = this.genericService.addComma(data.income);
          data.netProfitBeforeTax = this.genericService.addComma(data.netProfitBeforeTax);
          return data;
        }),
        tap((data) => {
          this.pnlReport = data;
          for (const expense of this.pnlReport.expenses) {
            this.totalExpense += expense.total;
          }
        })
      )
      .subscribe();

  }

  updateIncome(event: any) {
    if (event.detail.value === "") {
      event.detail.value = '0';
      this.pnlReport.income = '0';
    }
    this.pnlReport.income = this.genericService.convertStringToNumber(event.detail.value);
    this.pnlReport.netProfitBeforeTax = this.genericService.convertStringToNumber(this.pnlReport.netProfitBeforeTax as string);
    this.pnlReport.netProfitBeforeTax = this.pnlReport.income - this.totalExpense;
    this.pnlReport.netProfitBeforeTax = this.genericService.addComma(this.pnlReport.netProfitBeforeTax);
    this.pnlReport.income = this.genericService.addComma(this.pnlReport.income);
  }

  showExpenses() {
    this.displayExpenses = !this.displayExpenses
  }

  createPDF(): void {
    console.log("in cerate");
    let dataTable: (string | number)[][] = [];
    this.pnlReport.expenses.forEach((expense) => {
      dataTable.push([String(expense.total), expense.category]);
    })
     //console.log("dataTable: ", dataTable);
     
    const data: ICreateDataFile = {
      fid: "ydAEQsvSbC",
      prefill_data: {
      name: this.userData.fName + " " + this.userData.lName,
      id: this.userData.businessNumber,
      peryod: `${this.endDate} - ${this.startDate}`,
      income: this.pnlReport.income as string,
      profit: this.pnlReport.netProfitBeforeTax as string,
      expenses: String(this.totalExpense),
      table: dataTable,
    }
  }
    this.fileService.createPDF(data)
      .pipe(
        catchError((err) => {
          console.log("error in create pdf: ", err);
          return EMPTY;
        })
      )
      .subscribe((res) => {
        console.log('res of create pdf: ', res);
        this.fileService.downloadFile("my pdf", res)
      })
  }
}