import { ChangeDetectionStrategy, Component, computed, effect, inject, input, OnInit, output, signal } from '@angular/core';
import { DialogModule } from 'primeng/dialog';
import { catchError, EMPTY, map, tap } from 'rxjs';
import { TransactionsService } from 'src/app/pages/transactions/transactions.page.service';
import { AuthService } from 'src/app/services/auth.service';
import { GenericService } from 'src/app/services/generic.service';
import { IColumnDataTable, IRowDataTable, IUserData } from 'src/app/shared/interface';
import { GenericTableComponent } from "../generic-table/generic-table.component";
import { AsyncPipe, NgStyle } from '@angular/common';
import { TransactionsOutcomesColumns, TransactionsOutcomesHebrewColumns } from 'src/app/shared/enums';
import { ButtonComponent } from "../button/button.component";
import { ButtonColor, ButtonSize } from '../button/button.enum';

@Component({
  selector: 'app-confirm-trans-dialog',
  templateUrl: './confirm-trans-dialog.component.html',
  styleUrls: ['./confirm-trans-dialog.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogModule, GenericTableComponent, ButtonComponent, NgStyle]
})
export class ConfirmTransDialogComponent implements OnInit {
  transactionService = inject(TransactionsService);
  genericService = inject(GenericService);
  authService = inject(AuthService);

  visible = signal<boolean>(false);
  isLoadingButton = input<boolean>(false);
  arrayLength = input<number>(1);
  isVisible = input<boolean>(false);
  startDate = input<string>("");
  isAllChecked = signal<boolean>(true);
  data = input<IRowDataTable[]>([]);
  endDate = input<string>("");
  businessNumber = input<string>("");
  isVisibleChange = output<boolean>(); // manual output
  confirmArraySelected = output<{ transactions: IRowDataTable[], files: { id: number, file: File }[] }>(); 
  userData: IUserData;
  selectedArray: IRowDataTable[] = [];
  filesAttachedMap = signal<Map<number, File>>(new Map());
  arrayFile: { id: number, file: File }[] = [];

  buttonColor = ButtonColor;
  buttonSize = ButtonSize;

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
    // this.getTransToConfirm();
  }

  onAllChecked(event: boolean): void {
    this.isAllChecked.set(event);
  }

  // getTransToConfirm(): void {
  //   this.transToConfirm = this.transactionService.getTransToConfirm(
  //     this.startDate(),
  //     this.endDate(),
  //     this.businessNumber()
  //   ).pipe(
  //     catchError(err => {
  //       console.error("Error in getTransToConfirm:", err);
  //       return EMPTY;
  //     }),
  //     map(data =>{
  //       return data
  //         .filter(row => row.isRecognized) 
  //         .map(row => ({
  //           ...row,
  //           sum: this.genericService.addComma(Math.abs(row.sum as number)),
  //           businessNumber: row?.businessNumber === this.userData.businessNumber
  //             ? this.userData.businessName
  //             : this.userData.spouseBusinessName
  //         }))
  //                }
  //     ),
  //      tap((data: IRowDataTable[]) => {
  //       console.log("🚀 ~ tap ~ data:", data)
  //       // this.arrayLength.set(data.length);
  //     })
  //   )
   
  //   // .subscribe(res => {
  //   //   console.log("Filtered & transformed transactions:", res);
  //   // });
  // }

  closeDialog(): void {
    this.dialogVisible = false;
    this.isVisibleChange.emit(false);
  }

  onChecked(event :IRowDataTable[]): void {
    this.selectedArray = event;    
  }

  onFileSelected(data: { row: IRowDataTable, file: File }): void {
    console.log("File selected for transaction:", data.row.id, "file:", data.file.name);
    
    // Update or add to arrayFile (store locally, no upload yet)
    const existingIndex = this.arrayFile.findIndex(item => item.id === data.row.id);
    if (existingIndex !== -1) {
      this.arrayFile[existingIndex].file = data.file;
    } else {
      this.arrayFile.push({ id: data.row.id as number, file: data.file });
    }

    // Update the filesAttachedMap for UI feedback (icon changes immediately)
    const updatedMap = new Map(this.filesAttachedMap());
    updatedMap.set(data.row.id as number, data.file);
    this.filesAttachedMap.set(updatedMap);
  }

  sendArray(): void {
    // Emit both transactions and attached files
    this.confirmArraySelected.emit({
      transactions: this.selectedArray,
      files: this.arrayFile
    });
  }

}
