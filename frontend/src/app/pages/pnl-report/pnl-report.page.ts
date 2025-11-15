import { Component, computed, inject, OnInit } from '@angular/core';
import { PnLReportService } from './pnl-report.service';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { ICreateDataDoc, IPnlReportData, ISelectItem, IUserData } from 'src/app/shared/interface';
import { GenericService } from 'src/app/services/generic.service';
import { DateService } from 'src/app/services/date.service';
import { AuthService } from 'src/app/services/auth.service';
import { catchError, EMPTY, finalize, map, tap } from 'rxjs';
import { FilesService } from 'src/app/services/files.service';
import { BusinessMode, ReportingPeriodType } from 'src/app/shared/enums';
import { DocCreateService } from '../doc-create/doc-create.service';
import { ButtonColor, ButtonSize } from 'src/app/components/button/button.enum';


@Component({
    selector: 'app-pnl-report',
    templateUrl: './pnl-report.page.html',
    styleUrls: ['./pnl-report.page.scss', '../../shared/shared-styling.scss'],
    standalone: false
})
export class PnLReportPage implements OnInit {

  private gs = inject(GenericService);

  // reactive bindings
  businessOptions = computed(() => this.gs.businesses());
  isLoadingBusiness = computed(() => this.gs.isLoadingBusinesses());

  pnlReportForm: FormGroup;
  pnlReport: IPnlReportData;
  userData: IUserData;
  displayExpenses: boolean = false;
  isLoading: boolean = false;
  startDate: string;
  endDate: string;
  totalExpense: number = 0;
  businessNames: ISelectItem[] = [];
  businessNamesList: ISelectItem[] = [];
  BusinessMode = BusinessMode;
  businessMode: BusinessMode = BusinessMode.ONE_BUSINESS;

  reportingPeriodType = ReportingPeriodType;

  buttonSize = ButtonSize;
  buttonColor = ButtonColor;

  constructor(private docCreateService: DocCreateService, public pnlReportService: PnLReportService, private formBuilder: FormBuilder, private dateService: DateService, public authService: AuthService, private genericService: GenericService, private fileService: FilesService) {
  }


  async ngOnInit() {
    this.userData = this.authService.getUserDataFromLocalStorage();
    this.gs.clearBusinesses();
    await this.gs.loadBusinesses();
    if (this.userData.isTwoBusinessOwner) {
      this.businessMode = BusinessMode.TWO_BUSINESS;
      this.businessNamesList.push({name: this.userData.businessName, value: this.userData.businessNumber});
      this.businessNamesList.push({name: this.userData.spouseBusinessName, value: this.userData.spouseBusinessNumber});
    }
    else {
      this.businessMode = BusinessMode.ONE_BUSINESS;
      this.businessNamesList.push({name: this.userData.businessName, value: this.userData.businessNumber});
    }
  }


  onSubmit(event: any): void {

    console.log("event is ", event);

    const year = event.year;
    const month = event.month;
    const reportingPeriodType = event.periodMode;
    const localStartDate = event.startDate;
    const localEndDate = event.endDate;
    const businessNumber = event.businessNumber;
    const { startDate, endDate } = this.dateService.getStartAndEndDates(reportingPeriodType, year, month, localStartDate, localEndDate);
    this.startDate = startDate;
    this.endDate = endDate;

    this.getPnLReportData(startDate, endDate, businessNumber);

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


  createPnlReportPDFfile(): void {

    this.isLoading = true;
    let dataTable: (string | number)[][] = [];
    this.pnlReport.expenses.forEach((expense) => {
      dataTable.push([String(expense.total), expense.category]);
    })
     
    const data: ICreateDataDoc = {
      fid: "ydAEQsvSbC",
      prefill_data: {
        name: this.userData.fName + " " + this.userData.lName,
        id: this.userData.businessNumber,
        period: `${this.startDate} - ${this.endDate}`,
        income: this.pnlReport.income as string,
        profit: this.pnlReport.netProfitBeforeTax as string,
        expenses: String(this.totalExpense),
        table: dataTable,
      },
    }

    this.docCreateService.generatePDF(data)
      .pipe(
        catchError((err) => {
          console.log("error in create pdf: ", err);
          this.isLoading = false;
          return EMPTY;
        }),
        finalize(() =>{
          this.isLoading = false;
        })
      )
      .subscribe((res) => {
        console.log('res of create pdf: ', res);
        this.fileService.downloadFile("my pdf", res)
      })
  }


}