import { Component, OnInit, Input } from '@angular/core';
import { VatReportService } from './vat-report.service';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { ExpenseDataService } from 'src/app/services/expense-data.service';
import { startOfMonth, endOfMonth } from 'date-fns';
import { EMPTY, Observable, catchError, filter, finalize, forkJoin, from, map, of, switchMap, tap } from 'rxjs';
import { FormTypes, ICellRenderer, months, singleMonths, TransactionsOutcomesColumns } from 'src/app/shared/enums';
import { ButtonSize } from 'src/app/shared/button/button.enum';
import { ExpenseFormColumns, ExpenseFormHebrewColumns } from 'src/app/shared/enums';
import { IColumnDataTable, IRowDataTable, ITableRowAction } from 'src/app/shared/interface';
import { Router } from '@angular/router';
import { FilesService } from 'src/app/services/files.service';
import { ModalController } from '@ionic/angular';
import { PopupMessageComponent } from 'src/app/shared/popup-message/popup-message.component';


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

  readonly ButtonSize = ButtonSize;
  readonly UPLOAD_FILE_FIELD_NAME = 'fileName';
  readonly UPLOAD_FILE_FIELD_FIREBASE = 'firebaseFile';
  readonly COLUMNS_TO_IGNORE = ['id', 'file', 'transId', 'vatReportingDate','firebaseFile','fileName'];

  readonly COLUMNS_WIDTH = new Map<ExpenseFormColumns, number>([

    [ExpenseFormColumns.CATEGORY, 1.3],
    [ExpenseFormColumns.SUB_CATEGORY, 1.4],
    [ExpenseFormColumns.DATE, 1.4 ],
    [ExpenseFormColumns.TAX_PERCENT, 1],
    [ExpenseFormColumns.VAT_PERCENT, 1],
    [ExpenseFormColumns.TOTAL_TAX, 1.4],
    [ExpenseFormColumns.TOTAL_VAT, 1.5],
    [ExpenseFormColumns.ACTIONS, 1],
  ]);

  years: number[] = Array.from({ length: 15 }, (_, i) => new Date().getFullYear() - i);
  report?: ReportData;
  displayExpenses: boolean = false;
  vatReportForm: FormGroup;
  token: string;
  reportClick: boolean = true;
  tableActions: ITableRowAction[];
  arrayFile: {id: number, file: File | string}[] = [];
  previousFile: string;
  tableData$: Observable<IRowDataTable[]>;
  items$: Observable<IRowDataTable[]>;
  item: IRowDataTable;
  rows: IRowDataTable[] = [];
  messageToast: string;
  isToastOpen: boolean;


  readonly fieldsNamesToShow: IColumnDataTable<ExpenseFormColumns, ExpenseFormHebrewColumns>[] = [
    { name: ExpenseFormColumns.SUPPLIER, value: ExpenseFormHebrewColumns.supplier, type: FormTypes.TEXT },
    { name: ExpenseFormColumns.DATE, value: ExpenseFormHebrewColumns.date, type: FormTypes.DATE, cellRenderer: ICellRenderer.DATE },
    { name: ExpenseFormColumns.SUM, value: ExpenseFormHebrewColumns.sum, type: FormTypes.NUMBER },
    { name: ExpenseFormColumns.CATEGORY, value: ExpenseFormHebrewColumns.category, type: FormTypes.DDL },
    { name: ExpenseFormColumns.SUB_CATEGORY, value: ExpenseFormHebrewColumns.subCategory, type: FormTypes.DDL },
    { name: ExpenseFormColumns.VAT_PERCENT, value: ExpenseFormHebrewColumns.vatPercent, type: FormTypes.TEXT },
    { name: ExpenseFormColumns.TAX_PERCENT, value: ExpenseFormHebrewColumns.taxPercent, type: FormTypes.TEXT },
    { name: ExpenseFormColumns.TOTAL_TAX, value: ExpenseFormHebrewColumns.totalTaxPayable, type: FormTypes.NUMBER },
    { name: ExpenseFormColumns.TOTAL_VAT, value: ExpenseFormHebrewColumns.totalVatPayable, type: FormTypes.NUMBER },
  ];

  readonly specialColumnsCellRendering = new Map<ExpenseFormColumns, ICellRenderer>([
    [ExpenseFormColumns.DATE, ICellRenderer.DATE],
  ]);

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


  constructor(private router: Router, public vatReportService: VatReportService, private formBuilder: FormBuilder, private expenseDataService: ExpenseDataService, private fileService: FilesService, private modalController: ModalController) {
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
    this.setTableActions()
  }

  private setTableActions(): void {
    this.tableActions = [
      {
        name: 'upload',
        icon: 'attach-outline',
        fieldName: this.UPLOAD_FILE_FIELD_NAME,
        action: (event: any, row: IRowDataTable) => {
          this.addFile(event, row);
        }
      },
    ]
  }

  beforeSelectFile (event) {
    console.log(event);
    event.event.preventDefault()
    //alert("להוצאה זו כבר שמור קובץ, אתה בטוח שברצונך להחליפו?");
    //prevent.default()
    if (event.data.file != ""){
    
    from(this.modalController.create({

      component: PopupMessageComponent,
      //showBackdrop: false,
      componentProps: {
        message: "להוצאה זו כבר שמור קובץ, אתה בטוח שברצונך להחליפו?",
        buttonTextConfirm: "כן",
        buttonTextCancel: "ביטול"
      },
      //cssClass: 'expense-modal'
    })).pipe(catchError((err) => {
      alert("openPopupMessage error");
      return EMPTY;
    }), switchMap((modal) => from(modal.present())), catchError((err) => {
      alert("openPopupMessage switchMap error");
      console.log(err);

      return EMPTY;
    })).subscribe();
  }
  }

  addFile(event: any, row: IRowDataTable): void {
    console.log("file: ", row.file);
    
    if ((row.firebaseFile !== "" && row.firebaseFile !== undefined && row.firebaseFile !== null)) { // if already exist file
      if (event.target.files[0]) { // choose another file
      row[this.UPLOAD_FILE_FIELD_FIREBASE] = event.target.files[0]; // chnage file in row
      row[this.UPLOAD_FILE_FIELD_NAME] = event.target.files[0]?.name;
      this.arrayFile.map((expense) => { // change file in array
        if (expense.id === row.id) {
          expense.file = event.target.files[0];
        }
      })
      }
      else { // for delete file
        row[this.UPLOAD_FILE_FIELD_FIREBASE] = "";
        row[this.UPLOAD_FILE_FIELD_NAME] = "";
        this.arrayFile = this.arrayFile.filter((expense) => {
          return expense.id !== row.id
        })
      }
    }
    else { // first time selected file
      row[this.UPLOAD_FILE_FIELD_FIREBASE] = event.target.files[0];
      row[this.UPLOAD_FILE_FIELD_NAME] = event.target.files[0]?.name;
      this.arrayFile.push({id: row.id as number, file: event.target.files[0]})
      }
      console.log("row after update: ", row);
      console.log(this.arrayFile);
    }

  onSubmit() {
    console.log("onSubmit - start");
    const formData = this.vatReportForm.value;
    this.reportClick = false;
    this.setRowsData();
    this.getVarReportData(formData.month, formData.year, formData.isSingleMonth);
  }

  async getVarReportData(month: number , year: number, isSingleMonth: boolean) {

    const formData = this.vatReportForm.value;

    this.vatReportService.getVatReportData(formData)
    .subscribe((res) => {
      this.report = res;
    });

  }

  // Get the data from server and update items
  setRowsData(): void {
    const formData = this.vatReportForm.value;
    console.log("setRowsData - start");
    this.items$ = this.expenseDataService.getExpenseForVatReport(formData.isSingleMonth, formData.month)
      .pipe(
        map((data) => {
          const rows = [];
          
          data.forEach(row => {
            const { reductionDone, reductionPercent, expenseNumber, isEquipment, loadingDate, note, supplierID, userId, isReported, monthReport, ...tableData } = row;
            row.dateTimestamp = +row.dateTimestamp;

            console.log("table data for vat report is ", tableData);
            
            //tableData.dateTimestamp = this.timestampToDateStr(tableData.dateTimestamp as number);
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

  columnsOrderByFunc(a, b): number {
    const columnsAddExpenseOrder = [
      'supplier',
      'date',
      'sum',
      'category',
      'subCategory',
      'vatPercent',
      'taxPercent',
      'totalVat',
      'totalTax',
    ];

    const indexA = columnsAddExpenseOrder.indexOf(a.key);
    const indexB = columnsAddExpenseOrder.indexOf(b.key);

    if (indexA === -1 && indexB !== -1) {
      return 1; // objA is not in the order list, move it to the end
    } else if (indexA !== -1 && indexB === -1) {
      return -1; // objB is not in the order list, move it to the end
    } else if (indexA === -1 && indexB === -1) {
      return 0; // both keys are not in the order list, leave them as is
    }

    if (indexA < indexB) {
      return -1;
    } else if (indexA > indexB) {
      return 1;
    } else {
      return 0;
    }
  }

  // openVatReportLink(): void {
  
  //   this.router.navigate(https://secapp.taxes.gov.il/EMHANDOCH/LogonMaam.aspx?back=true, {
  //   })
  // }

  addFileToExpense(): void {

    const totalTransactions = this.arrayFile.length;
    let filesUploaded = 0;

    console.log("array file:", this.arrayFile);

    // If no transactions have files, skip file uploads and proceed directly
    // if (transactionsWithFiles === 0) {
    //   this.expenseDataService.getLoader().subscribe()
    //   console.log("No transactions with files, skipping file upload...");
    //   this.expenseDataService.updateLoaderMessage('Uploading transactions without files...');

    //   // Directly call addTransToExpense since there are no files to upload
    //   this.flowReportService.addTransToExpense(this.chosenTrans)
    //     .pipe(
    //       finalize(() => {
    //         this.expenseDataService.dismissLoader();
    //       }),
    //       catchError((err) => {
    //         console.log("Error in addTransToExpense: ", err);
    //         this.expenseDataService.dismissLoader();

    //         this.messageToast = "אירעה שגיאה העלאת תנועות לדוח לא נקלטה"
    //         this.isToastOpen = true;
    //         return EMPTY;
    //       }),
    //     )
    //     .subscribe((res) => {
    //       console.log("Response from addTransToExpense:", res);
    //       this.messageToast = `הועלו ${totalTransactions} תנועות. מתוכם ${transactionsWithFiles} עם קובץ ו${transactionsWithoutFiles} בלי קובץ`
    //       this.isToastOpen = true;
    //       this.chosenTrans = [];
    //       console.log("chosenTrans after upload: ", this.chosenTrans);
    //       this.getTransaction();
    //       this.expenseDataService.dismissLoader();
    //       //this.router.navigate(['vat-report']);

    //       // this.router.navigate(['vat-report'], {
    //       //   queryParams: {
    //       //     isToastOpen: true,
    //       //     messageToast:  `הועלו ${totalTransactions} תנועות. מתוכם ${transactionsWithFiles} עם קובץ ו${transactionsWithoutFiles} בלי קובץ`
    //       //   }
    //       // })

    //     });
    //     return; // Exit the function since file uploads are skipped
    // }

    // Update loader for transactions with files
    
    this.expenseDataService.getLoader().subscribe();
    this.expenseDataService.updateLoaderMessage(`Uploading files... ${0}%`);

    // Create an array of observables for each file upload
    const fileUploadObservables = this.arrayFile.map((tran) => {
      if (tran.file) {
        return this.fileService.uploadFileViaFront(tran.file as File).pipe(
          finalize(() => {
            this.expenseDataService.dismissLoader();
          }),
          catchError((error) => {
            console.log("Error in get vat report uploading file: ", error);
            alert("Error uploading file");
            return EMPTY;
          }),
          tap((res) => {
              tran.file = res.metadata.fullPath;  // Update the file path after upload
              console.log("Uploaded file path: ", tran.file);
              filesUploaded++;
              const progress = Math.round((filesUploaded / totalTransactions) * 100);
              this.expenseDataService.updateLoaderMessage(`Uploading files... ${progress}%`);
              this.expenseDataService.dismissLoader();
            }
          )
        );
      } else {
        return of(null);  // Return an observable that emits null for transactions without files
      }
    });

    // Use forkJoin to wait for all file uploads to finish
    forkJoin(fileUploadObservables)
      .pipe(
        catchError((err) => {
          console.log("Error in get vat report forkJoin: ", err);
          this.expenseDataService.dismissLoader();
          return EMPTY;
        }),
        switchMap(() => this.vatReportService.addFileToExpenses(this.arrayFile)),
        catchError((err) => {
          console.log("err in send transaction to server: ", err);
          this.arrayFile.forEach((tran) => {
            if (tran.file) {
              this.fileService.deleteFile(tran.file as string);
              console.log("file: ", tran.file, "is delete");
            }
          })
          this.expenseDataService.dismissLoader();
          this.messageToast = "אירעה שגיאה העלאת תנועות לדוח לא נקלטה"
          this.isToastOpen = true;
          return EMPTY
        }),
        tap(() => {
          console.log("All file uploads complete.");
          this.messageToast = `הועלו ${totalTransactions} קבצים `
          this.isToastOpen = true;
          this.expenseDataService.dismissLoader();
        }),
        finalize(() => {
          this.expenseDataService.dismissLoader();
        }),
      )
      .subscribe();
  }




}