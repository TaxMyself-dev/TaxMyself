import { ChangeDetectionStrategy, Component, computed, effect, inject, input, OnInit, output, signal } from '@angular/core';
import { DialogModule } from 'primeng/dialog';
import { catchError, EMPTY, map } from 'rxjs';
import { TransactionsService } from 'src/app/pages/transactions/transactions.page.service';
import { AuthService } from 'src/app/services/auth.service';
import { GenericService } from 'src/app/services/generic.service';
import { IColumnDataTable, IRowDataTable, IUserData } from 'src/app/shared/interface';
import { GenericTableComponent } from "../generic-table/generic-table.component";
import { AsyncPipe } from '@angular/common';
import { TransactionsOutcomesColumns, TransactionsOutcomesHebrewColumns } from 'src/app/shared/enums';

@Component({
  selector: 'app-confirm-trans-dialog',
  templateUrl: './confirm-trans-dialog.component.html',
  styleUrls: ['./confirm-trans-dialog.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogModule, GenericTableComponent, AsyncPipe]
})
export class ConfirmTransDialogComponent implements OnInit {
  transactionService = inject(TransactionsService);
  genericService = inject(GenericService);
  authService = inject(AuthService);

  visible = signal<boolean>(false);
  isVisible = input<boolean>(false);
  startDate = input<string>("");
  endDate = input<string>("");
  businessNumber = input<string>("");
  isVisibleChange = output<boolean>(); // manual output
  userData: IUserData;
  transToConfirm: any;

    fieldsNamesExpenses: IColumnDataTable<TransactionsOutcomesColumns, TransactionsOutcomesHebrewColumns>[] = [
      { name: TransactionsOutcomesColumns.NAME, value: TransactionsOutcomesHebrewColumns.name},
      { name: TransactionsOutcomesColumns.BILL_NUMBER, value: TransactionsOutcomesHebrewColumns.paymentIdentifier},
      { name: TransactionsOutcomesColumns.BILL_NAME, value: TransactionsOutcomesHebrewColumns.billName},
      { name: TransactionsOutcomesColumns.CATEGORY, value: TransactionsOutcomesHebrewColumns.category},
      { name: TransactionsOutcomesColumns.SUBCATEGORY, value: TransactionsOutcomesHebrewColumns.subCategory},
      { name: TransactionsOutcomesColumns.SUM, value: TransactionsOutcomesHebrewColumns.sum},
      { name: TransactionsOutcomesColumns.BILL_DATE, value: TransactionsOutcomesHebrewColumns.billDate},
      // { name: TransactionsOutcomesColumns.PAY_DATE, value: TransactionsOutcomesHebrewColumns.payDate, type: FormTypes.DATE, cellRenderer: ICellRenderer.DATE },
      { name: TransactionsOutcomesColumns.IS_RECOGNIZED, value: TransactionsOutcomesHebrewColumns.isRecognized},
      // { name: TransactionsOutcomesColumns.BUSINESS_NUMBER, value: TransactionsOutcomesHebrewColumns.businessNumber, type: FormTypes.TEXT },
      { name: TransactionsOutcomesColumns.MONTH_REPORT, value: TransactionsOutcomesHebrewColumns.monthReport},
      { name: TransactionsOutcomesColumns.NOTE, value: TransactionsOutcomesHebrewColumns.note},
    ];

  get dialogVisible(): boolean {
    return this.visible();
  }

  set dialogVisible(value: boolean) {
    this.visible.set(value);
  }

  constructor() {
    effect(() => {
      const newValue = this.isVisible();
      this.visible.set(newValue);
    });
  }
  ngOnInit() {
    this.userData = this.authService.getUserDataFromLocalStorage();
    this.getTransToConfirm();
  }

  hide(): void {
    this.isVisibleChange.emit(false);
  }

  getTransToConfirm(): void {
    this.transToConfirm = this.transactionService.getTransToConfirm(
      this.startDate(),
      this.endDate(),
      this.businessNumber()
    ).pipe(
      catchError(err => {
        console.error("Error in getTransToConfirm:", err);
        return EMPTY;
      }),
      map(data =>
        data
          .filter(row => row.isRecognized) 
          .map(row => ({
            ...row,
            sum: this.genericService.addComma(Math.abs(row.sum as number)),
            businessNumber: row?.businessNumber === this.userData.businessNumber
              ? this.userData.businessName
              : this.userData.spouseBusinessName
          }))
      )
    )
    // .subscribe(res => {
    //   console.log("Filtered & transformed transactions:", res);
    // });
  }
  

  // getTransToConfirm(): void {
  //   this.transactionService.getTransToConfirm(this.startDate(), this.endDate(), this.businessNumber())
  //     .pipe(
  //       catchError((err) => {
  //         console.log("error in get transactions to confirm: ", err);
  //         return EMPTY;
  //       }),
  //       map((data) => {
  //         console.log(data);

  //         data.map((row) => {
  //           row.sum = Math.abs(row.sum as number);
  //           row.sum = this.genericService.addComma(row.sum)
  //           //  row?.businessNumber === this.userData.businessNumber ? row.businessNumber = this.userData.businessName : row.businessNumber = this.userData.spouseBusinessName;
  //           row.businessNumber = row?.businessNumber === this.userData.businessNumber
  //             ? this.userData.businessName
  //             : this.userData.spouseBusinessName;
  //           //if (row.vatReportingDate) {
  //           // if (row.vatReportingDate !== undefined && row.vatReportingDate !== null && row.vatReportingDate !== "0") {
  //           //   console.log("row is ", row);
  //           //   console.log("row.vatReportingDate is ", row.vatReportingDate);
  //           //   row.disabled = true;
  //           // }
  //         })
  //         return data;
  //       }),
  //       map((data) => { // filter only if transaction.isRecognized is true 
  //         const isRecognized = data.filter((tran) => {
  //           return tran.isRecognized;
  //         })
  //         return isRecognized;
  //       })
  //     )
  //     .subscribe((res) => {
  //       console.log("res expenses in flow-report :", res);
  //       // this.expensesData$.next(res);
  //       // this.expensesData = res;
  //     })
  // }
}
