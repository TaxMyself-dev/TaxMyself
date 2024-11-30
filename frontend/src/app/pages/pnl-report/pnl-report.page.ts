import { Component, OnInit } from '@angular/core';
import { PnLReportService } from './pnl-report.service';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { ExpenseDataService } from 'src/app/services/expense-data.service';
import { EMPTY, Observable, catchError, finalize, forkJoin, from, map, of, switchMap, tap } from 'rxjs';
import { FormTypes, ICellRenderer } from 'src/app/shared/enums';
import { ButtonSize } from 'src/app/shared/button/button.enum';
import { ExpenseFormColumns, ExpenseFormHebrewColumns } from 'src/app/shared/enums';
import { IColumnDataTable, IRowDataTable, ITableRowAction } from 'src/app/shared/interface';
import { Router } from '@angular/router';
import { FilesService } from 'src/app/services/files.service';
import { ModalController } from '@ionic/angular';
import { PopupMessageComponent } from 'src/app/shared/popup-message/popup-message.component';
import { GenericService } from 'src/app/services/generic.service';
import { DateService } from 'src/app/services/date.service';
import { AuthService } from 'src/app/services/auth.service';


// interface ReportData {
//   vatableTurnover: string;
//   nonVatableTurnover: string;
//   vatRefundOnAssets: number;
//   vatRefundOnExpenses: number;
//   vatPayment: number;
// }

interface FieldTitles {
  [key: string]: string;
}

@Component({
  selector: 'app-pnl-report',
  templateUrl: './pnl-report.page.html',
  styleUrls: ['./pnl-report.page.scss', '../../shared/shared-styling.scss'],
})
export class PnLReportPage implements OnInit {

  pnlReportForm: FormGroup;


  readonly ButtonSize = ButtonSize;
  readonly UPLOAD_FILE_FIELD_NAME = 'fileName';
  readonly UPLOAD_FILE_FIELD_FIREBASE = 'firebaseFile';
  readonly COLUMNS_TO_IGNORE = ['id', 'file', 'transId', 'vatReportingDate', 'firebaseFile', 'fileName'];
  readonly ACTIONS_TO_IGNORE = ['preview']
  
  readonly COLUMNS_WIDTH = new Map<ExpenseFormColumns, number>([
    [ExpenseFormColumns.CATEGORY, 1.3],
    [ExpenseFormColumns.SUB_CATEGORY, 1.4],
    [ExpenseFormColumns.DATE, 1.4],
    [ExpenseFormColumns.TAX_PERCENT, 1],
    [ExpenseFormColumns.VAT_PERCENT, 1],
    [ExpenseFormColumns.TOTAL_TAX, 1.4],
    [ExpenseFormColumns.TOTAL_VAT, 1.5],
    [ExpenseFormColumns.ACTIONS, 1],
  ]);

  years: number[] = Array.from({ length: 15 }, (_, i) => new Date().getFullYear() - i);
  pnlReport?: any;
  userData: any = {};
  displayExpenses: boolean = false;
  reportClick: boolean = true;
  tableActions: ITableRowAction[];
  arrayFile: { id: number, file: File | string }[] = [];
  previousFile: string;
  tableData$: Observable<IRowDataTable[]>;
  items$: Observable<IRowDataTable[]>;
  item: IRowDataTable;
  rows: IRowDataTable[] = [];
  messageToast: string;
  isToastOpen: boolean;
  isSkip: boolean = false;
  startDate: string;
  endDate: string;
  totalExpense: number;


  //constructor(private genericService: GenericService, private dateService: DateService, private filesService: FilesService, private router: Router, public pnlReportService: PnLReportService, private formBuilder: FormBuilder, private expenseDataService: ExpenseDataService, private modalController: ModalController) {
  constructor(public pnlReportService: PnLReportService, private formBuilder: FormBuilder, private dateService: DateService, public authService: AuthService, private expenseDataService: ExpenseDataService) {
    this.pnlReportForm = this.formBuilder.group({
      // taxableTurnover: new FormControl(
      //   '', [Validators.required, Validators.pattern(/^\d+$/)]
      // ),
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
      )
    })
  }


  ngOnInit() {}


  onSubmit() {
    const formData = this.pnlReportForm.value;
    this.reportClick = false;
    this.setRowsData();
    const { startDate, endDate } = this.dateService.getStartAndEndDates(formData.reportingPeriodType, formData.year, formData.month, formData.startDate, formData.endDate);
    this.startDate = startDate;
    this.endDate = endDate;
    this.getPnLReportData(startDate, endDate);
  }


  async getPnLReportData(startDate: string, endDate: string) {

    this.pnlReportService.getPnLReportData(startDate, endDate)
      .subscribe((res) => {
        console.log("getPnLReportData is ", res);
        this.pnlReport = res;
        this.totalExpense = 0;
        for (const expense of this.pnlReport.expenses) {
          console.log("category is ", expense.category);
          console.log("total is ", expense.total);
          this.totalExpense += expense.total;
          console.log("totalExpense is ", this.totalExpense);
        }
      });

  }


  async updateIncome(event: any) {    
    this.pnlReport.netProfitBeforeTax = event.detail.value - this.totalExpense;
  }

  
  // Get the data from server and update items
  setRowsData(): void {
    const formData = this.pnlReportForm.value;
    this.items$ = this.expenseDataService.getExpenseForVatReport(formData.isSingleMonth, formData.month, '123123133')
      .pipe(
        map((data) => {
          const rows = [];

          data.forEach(row => {
            const { reductionDone, reductionPercent, expenseNumber, isEquipment, loadingDate, note, supplierID, userId, isReported, monthReport, ...tableData } = row;
            if (row.file != undefined && row.file != null && row.file != "" ) {
              tableData[this.UPLOAD_FILE_FIELD_NAME] = row.file; // to show that this expense already has a file 
            }
            rows.push(tableData);
          })          
          this.rows = rows;
          return rows
        })
      )
  }


  showExpenses() {
    this.displayExpenses = !this.displayExpenses
  }


  setCloseToast(): void {
    this.isToastOpen = false;
  }


}