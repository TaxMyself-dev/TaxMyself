import { Component, OnInit } from '@angular/core';
import { VatReportService } from './vat-report.service';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { ExpenseDataService } from 'src/app/services/expense-data.service';
import { EMPTY, Observable, catchError, finalize, forkJoin, from, map, of, switchMap, tap } from 'rxjs';
import { FormTypes, ICellRenderer, ReportingPeriodType, ReportingPeriodTypeLabels } from 'src/app/shared/enums';
import { ButtonSize } from 'src/app/shared/button/button.enum';
import { ExpenseFormColumns, ExpenseFormHebrewColumns } from 'src/app/shared/enums';
import { IColumnDataTable, IRowDataTable, ITableRowAction } from 'src/app/shared/interface';
import { Router } from '@angular/router';
import { FilesService } from 'src/app/services/files.service';
import { ModalController } from '@ionic/angular';
import { PopupMessageComponent } from 'src/app/shared/popup-message/popup-message.component';
import { GenericService } from 'src/app/services/generic.service';
import { DateService } from 'src/app/services/date.service';


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
  report?: ReportData;
  displayExpenses: boolean = false;
  vatReportForm: FormGroup;
  // token: string;
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
  isSkip: boolean = false
  optionsTypesList = [{ value: ReportingPeriodType.MONTHLY, name: ReportingPeriodTypeLabels[ReportingPeriodType.MONTHLY] },
                      { value: ReportingPeriodType.BIMONTHLY, name: ReportingPeriodTypeLabels[ReportingPeriodType.BIMONTHLY] }];

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


  constructor(private genericService: GenericService, private dateService: DateService, private filesService: FilesService, private router: Router, public vatReportService: VatReportService, private formBuilder: FormBuilder, private expenseDataService: ExpenseDataService, private modalController: ModalController) {
    this.vatReportForm = this.formBuilder.group({
      vatableTurnover: new FormControl(
        '', [Validators.required, Validators.pattern(/^\d+$/)]
      ),
      nonVatableTurnover: new FormControl(
        '', [Validators.required, Validators.pattern(/^\d+$/)]
      ),
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


  ngOnInit() {
    this.setTableActions()
  }

  private setTableActions(): void {
    this.tableActions = [
      {
        name: 'upload',
        icon: 'attach-outline',
        title: 'בחר קובץ',
        fieldName: this.UPLOAD_FILE_FIELD_NAME,
        action: (event: any, row: IRowDataTable) => {
          this.addFile(event, row);
        }
      },
      {
        name: 'preview',
        icon: 'glasses-outline',
        title: 'הצג קובץ',
        action: (row: IRowDataTable) => {
          this.onPreviewFileClicked(row);
        }
      }
    ]
  }

  beforeSelectFile(event): void {
    if (!this.isSkip && event.data.file != "") {
      this.isSkip = true;
      event.event.preventDefault()
        from(this.modalController.create({
          component: PopupMessageComponent,
          componentProps: {
            message: "להוצאה זו כבר שמור קובץ, אתה בטוח שברצונך להחליפו?",
            buttonTextConfirm: "כן",
            buttonTextCancel: "לא"
          },
          cssClass: 'vatReport-modal'
        }))
          .pipe(
            catchError((err) => {
              alert("openPopupMessage error");
              return EMPTY;
            }),
            switchMap((modal) => from(modal.present())
              .pipe(
                catchError((err) => {
                  alert("openPopupMessage switchMap error");
                  console.log(err);
                  return EMPTY;
                }),
                switchMap(() => from(modal.onWillDismiss())
                  .pipe(
                    catchError((err) => {
                      console.log("err in close popover get vat report: ", err);
                      return EMPTY;
                    })
                  ))
              )))
          .subscribe((res) => {
            console.log("res in close popover: ", res);
            if (res.data) {
              event.event.target.click();
            }
            this.isSkip = false
          });
    }
  }

  addFile(event: any, row: IRowDataTable): void {
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
      this.arrayFile.push({ id: row.id as number, file: event.target.files[0] })
    }
  }

  onPreviewFileClicked(expense: IRowDataTable): void {
    if (!(expense.file === undefined || expense.file === "" || expense.file === null)) {
      this.genericService.getLoader().subscribe();
      from(this.filesService.previewFile(expense.file as string))
      .pipe(
        finalize(()=> this.genericService.dismissLoader()),
        catchError((err) => {
        console.log("err in try to open file: ", err);
        alert("לא ניתן לפתוח את הקובץ");
        return EMPTY;
      })).subscribe((fileUrl) => {
        window.open(fileUrl.file, '_blank');
      });
    }
    else {
      alert("לא נשמר קובץ עבור הוצאה זו")
    }
  }

  onSubmit() {
    const formData = this.vatReportForm.value;
    this.reportClick = false;
    const { startDate, endDate } = this.dateService.getStartAndEndDates(formData.reportingPeriodType, formData.year, formData.month, formData.startDate, formData.endDate);
    this.getVatReportData(startDate, endDate, formData.vatableTurnover, formData.nonVatableTurnover);
    this.setRowsData();

  }

  async getVatReportData(startDate: string, endDate: string, vatableTurnover: number, nonVatableTurnover: number) {

    this.vatReportService.getVatReportData(startDate, endDate, vatableTurnover, nonVatableTurnover)
      .subscribe((res) => {
        this.report = res;
      });

  }

  // Get the data from server and update items
  setRowsData(): void {
    const formData = this.vatReportForm.value;

    const { startDate, endDate } = this.dateService.getStartAndEndDates(formData.reportingPeriodType, formData.year, formData.month, formData.startDate, formData.endDate);

    this.items$ = this.expenseDataService.getExpenseForVatReport(startDate, endDate)
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

  addFileToExpense(): void {
    const totalTransactions = this.arrayFile.length;
    let filesUploaded = 0;
    this.genericService.getLoader().subscribe();
    this.genericService.updateLoaderMessage(`Uploading files... ${0}%`);

    // Create an array of observables for each file upload
    const fileUploadObservables = this.arrayFile.map((tran) => {
      if (tran.file) {
        return this.filesService.uploadFileViaFront(tran.file as File).pipe(
          finalize(() => {
            this.genericService.dismissLoader();
          }),
          catchError((error) => {
            console.log("Error in get vat report uploading file: ", error);
            alert("Error uploading file");
            return EMPTY;
          }),
          tap((res) => {
            tran.file = res.metadata.fullPath;  // Update the file path after upload
            filesUploaded++;
            const progress = Math.round((filesUploaded / totalTransactions) * 100);
            this.genericService.updateLoaderMessage(`Uploading files... ${progress}%`);
            this.genericService.dismissLoader();
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
        finalize(() => {
          this.genericService.dismissLoader();
        }),
        catchError((err) => {
          console.log("Error in get vat report forkJoin: ", err);
          this.genericService.dismissLoader();
          return EMPTY;
        }),
        switchMap(() => this.vatReportService.addFileToExpenses(this.arrayFile)),
        catchError((err) => {
          console.log("err in send files to server: ", err);
          this.arrayFile.forEach((tran) => {
            if (tran.file) {
              this.filesService.deleteFile(tran.file as string);
            }
          })
          //this.genericService.dismissLoader();
          this.messageToast = "אירעה שגיאה העלאת קבצים נכשלה"
          this.isToastOpen = true;
          return EMPTY
        }),
        tap(() => {
          console.log("All file uploads complete.");
          this.messageToast = `הועלו ${totalTransactions} קבצים `
          this.isToastOpen = true;
          //this.genericService.dismissLoader();
        }),
       
      )
      .subscribe(() => {
        this.arrayFile = null;
        this.setRowsData();
      });
  }

  setCloseToast(): void {
    this.isToastOpen = false;
  }




}