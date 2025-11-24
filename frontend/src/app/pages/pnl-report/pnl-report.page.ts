import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { PnLReportService } from './pnl-report.service';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { ICreateDataDoc, IPnlReportData, ISelectItem, IUserData } from 'src/app/shared/interface';
import { GenericService } from 'src/app/services/generic.service';
import { DateService } from 'src/app/services/date.service';
import { AuthService } from 'src/app/services/auth.service';
import { catchError, EMPTY, finalize, map, tap } from 'rxjs';
import { FilesService } from 'src/app/services/files.service';
import { BusinessStatus, ReportingPeriodType } from 'src/app/shared/enums';
import { DocCreateService } from '../doc-create/doc-create.service';
import { ButtonColor, ButtonSize } from 'src/app/components/button/button.enum';
import { FilterField } from 'src/app/components/filter-tab/filter-fields-model.component';


@Component({
    selector: 'app-pnl-report',
    templateUrl: './pnl-report.page.html',
    styleUrls: ['./pnl-report.page.scss', '../../shared/shared-styling.scss'],
    standalone: false
})
export class PnLReportPage implements OnInit {

  // Services
  private gs = inject(GenericService);
  private fb = inject(FormBuilder);

  // Business related
  businessNumber = signal<string>("");
  businessNamesList: ISelectItem[] = [];
  BusinessStatus = BusinessStatus;
  businessStatus: BusinessStatus = BusinessStatus.SINGLE_BUSINESS;
  businessOptions = this.gs.businessSelectItems;

  // Filter related
  form: FormGroup = this.fb.group({
    businessNumber: [null],
    // ❗ DO NOT add "period" here → FilterTab will create it automatically
  });
  filterConfig: FilterField[] = [];
  startDate = signal<string>("");
  endDate = signal<string>("");

  pnlReportForm: FormGroup;
  pnlReport: IPnlReportData;
  userData: IUserData;
  displayExpenses: boolean = false;
  isLoading: boolean = false;
  totalExpense: number = 0;
  reportingPeriodType = ReportingPeriodType;

  buttonSize = ButtonSize;
  buttonColor = ButtonColor;

  constructor(private docCreateService: DocCreateService, public pnlReportService: PnLReportService, private formBuilder: FormBuilder, private dateService: DateService, public authService: AuthService, private genericService: GenericService, private fileService: FilesService) {
  }


  async ngOnInit() {

    this.userData = this.authService.getUserDataFromLocalStorage();

    this.businessStatus = this.userData.businessStatus;
    const businesses = this.gs.businesses();

    if (businesses.length === 1) {
      // 1️⃣ Set the signal
      this.businessNumber.set(businesses[0].businessNumber);
      // 2️⃣ Set the form so FilterTab works
      this.form.get('businessNumber')?.setValue(businesses[0].businessNumber);
    }
    
    // Now config can be set safely
    this.filterConfig = [
      {
        type: 'select',
        controlName: 'businessNumber',
        label: 'בחר עסק',
        required: true,
        options: this.gs.businessSelectItems
      },
      {
        type: 'period',
        controlName: 'period',
        required: true
      },
    ];

  }


  onSubmit(formValues: any): void {

    console.log("Submitted filter:", formValues);

    // period object
    const period = formValues.period;
    const {
      periodMode,
      year,
      month,
      startDate: localStartDate,
      endDate: localEndDate
    } = period;

    const { startDate, endDate } = this.dateService.getStartAndEndDates(
      periodMode,
      year,
      month,
      localStartDate,
      localEndDate
    );
    
    this.businessNumber.set(formValues.businessNumber);
    this.startDate.set(startDate);
    this.endDate.set(endDate);

    this.getPnLReportData(startDate, endDate, this.businessNumber());

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