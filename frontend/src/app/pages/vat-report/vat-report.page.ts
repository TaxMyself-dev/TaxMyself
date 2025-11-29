import { Component, computed, inject, Input, OnInit, signal } from '@angular/core';
import { VatReportService } from './vat-report.service';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { ExpenseDataService } from 'src/app/services/expense-data.service';
import { EMPTY, Observable, catchError, filter, finalize, forkJoin, from, fromEvent, map, of, switchMap, take, tap } from 'rxjs';
import { BusinessStatus, FormTypes, ICellRenderer, inputsSize, ReportingPeriodType, ReportingPeriodTypeLabels } from 'src/app/shared/enums';
//import { ButtonSize } from 'src/app/shared/button/button.enum';
import { ButtonSize } from 'src/app/components/button/button.enum';
import { ExpenseFormColumns, ExpenseFormHebrewColumns } from 'src/app/shared/enums';
import { IColumnDataTable, IRowDataTable, ISelectItem, ITableRowAction, IUserData, IVatReportData } from 'src/app/shared/interface';
import { Router } from '@angular/router';
import { FilesService, IFileUploadItem } from 'src/app/services/files.service';
import { ModalController } from '@ionic/angular';
import { PopupConfirmComponent } from 'src/app/shared/popup-confirm/popup-confirm.component';
import { GenericService } from 'src/app/services/generic.service';
import { DateService } from 'src/app/services/date.service';
import { AuthService } from 'src/app/services/auth.service';
import { ButtonColor } from 'src/app/components/button/button.enum';
import { TransactionsService } from '../transactions/transactions.page.service';
import { MessageService, ConfirmationService } from 'primeng/api';
import { FilterField } from 'src/app/components/filter-tab/filter-fields-model.component';


@Component({
  selector: 'app-vat-report',
  templateUrl: './vat-report.page.html',
  styleUrls: ['./vat-report.page.scss', '../../shared/shared-styling.scss'],
  standalone: false
})
export class VatReportPage implements OnInit {

  private gs = inject(GenericService);
  private fb = inject(FormBuilder);

  confirmationService = inject(ConfirmationService);

  // Business related
  businessNumber = signal<string>("");
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

  visibleConfirmTransDialog = signal<boolean>(false);

  readonly ButtonSize = ButtonSize;
  readonly reportingPeriodType = ReportingPeriodType;
  readonly UPLOAD_FILE_FIELD_NAME = 'fileName';
  readonly UPLOAD_FILE_FIELD_FIREBASE = 'firebaseFile';
  readonly COLUMNS_TO_IGNORE = ['businessNumber', 'id', 'file', 'transId', 'vatReportingDate', 'firebaseFile', 'fileName'];
  readonly ACTIONS_TO_IGNORE = ['preview']

  years: number[] = Array.from({ length: 15 }, (_, i) => new Date().getFullYear() - i);
  vatReportData = signal<IVatReportData>(null);
  arrayLength = signal<number>(0);
  isLoadingButtonConfirmDialog = signal<boolean>(false);
  isLoadingStatePeryodSelectButton = signal<boolean>(false);
  isRequestSent = signal<boolean>(false);
  displayExpenses: boolean = false;
  tableActions: ITableRowAction[];
  fileActions: ITableRowAction[];
  arrayFile: { id: number, file: File | string }[] = [];
  filesAttachedMap = signal<Map<number, File>>(new Map());
  previousFile: string;
  tableData$: Observable<IRowDataTable[]>;
  items$: Observable<IRowDataTable[]>;
  item: IRowDataTable;
  rows: IRowDataTable[] = [];
  isSkip: boolean = false;
  userData: IUserData;

  optionsTypesList = [{ value: ReportingPeriodType.MONTHLY, name: ReportingPeriodTypeLabels[ReportingPeriodType.MONTHLY] },
  { value: ReportingPeriodType.BIMONTHLY, name: ReportingPeriodTypeLabels[ReportingPeriodType.BIMONTHLY] }];
  transToConfirm: Observable<IRowDataTable[]>;
  dataTable: Observable<IRowDataTable[]>;


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

  buttonSize = ButtonSize;
  inputSize = inputsSize;
  buttonColor = ButtonColor;

  constructor(private genericService: GenericService, private dateService: DateService, private filesService: FilesService, private router: Router, public vatReportService: VatReportService, private formBuilder: FormBuilder, private expenseDataService: ExpenseDataService, private modalController: ModalController, public authService: AuthService, private transactionService: TransactionsService, private messageService: MessageService
  ) { }


  async ngOnInit() {

    this.setFileActions();

    this.userData = this.authService.getUserDataFromLocalStorage();
    this.businessStatus = this.userData.businessStatus;
    const businesses = this.gs.businesses();  // always updated after refresh

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

  beforeSelectFile(event): void {

    if (!this.isSkip && event.data.file != "") {
      this.isSkip = true;
      event.event.preventDefault()
      from(this.modalController.create({
        component: PopupConfirmComponent,
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
    console.log("in add file");

    if ((row.firebaseFile !== "" && row.firebaseFile !== undefined && row.firebaseFile !== null)) { // if already exist file
      if (event.target.files[0]) { // choose another file
        console.log("in if add file");

        row[this.UPLOAD_FILE_FIELD_FIREBASE] = event.target.files[0]; // chnage file in row
        row[this.UPLOAD_FILE_FIELD_NAME] = event.target.files[0]?.name;
        console.log("array file: ", this.arrayFile);

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
      this.filesService.previewFile(expense.file as string).subscribe();

    }
    else {
      alert("לא נשמר קובץ עבור הוצאה זו")
    }
  }

  //onSubmit(event: any): void {

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

    this.isLoadingStatePeryodSelectButton.set(true);
    this.businessNumber.set(formValues.businessNumber);
    this.startDate.set(startDate);
    this.endDate.set(endDate);
    this.getTransToConfirm();
    this.isRequestSent.set(true);
  }

  getTransToConfirm(): void {
    this.visibleConfirmTransDialog.set(true);

    console.log("business number in getTransToConfirm:", this.businessNumber());

    this.transToConfirm = this.transactionService.getTransToConfirm(
      this.startDate(),
      this.endDate(),
      this.businessNumber()
    ).pipe(
      catchError(err => {
        console.error("Error in getTransToConfirm:", err);
        return EMPTY;
      }),
      tap((data: IRowDataTable[]) => {
        if (!data?.length) {
          this.closeDialogWithoutConfirm(false);
        }
        console.log("🚀 ~ tap ~ data:", data)
        this.arrayLength.set(data?.length);
      }),
      map(data => {
        return data?.map(row => ({
          ...row,
          sum: this.genericService.addComma(Math.abs(row.sum as number)),
          isRecognized: row.isRecognized ? 'כן' : 'לא',
          businessNumber: row?.businessNumber === this.userData.businessNumber
            ? this.userData.businessName
            : this.userData.spouseBusinessName
        }))
      }
      ),

    )

  }


  getVatReportData(startDate: string, endDate: string, businessNumber: string) {
    console.log("in get vat report data");
    // this.isLoading.set(true);
    // this.genericService.getLoader().subscribe();

    console.log("startDate is ", startDate);
    console.log("endDate is ", endDate);
    console.log("businessNumber is ", businessNumber);

    this.vatReportService.getVatReportData(startDate, endDate, businessNumber)
      .pipe(
        finalize(() => this.isLoadingStatePeryodSelectButton.set(false)),
        catchError((error) => {
          console.log("error in get vat report data: ", error);
          return EMPTY;
        }),
        map((data) => {
          Object.keys(data).forEach((field) => { //convert all to type string for display with comma
            data[field] = this.genericService.addComma(data[field]);
          });
          console.log(data);
          return data;
        })
      )
      .subscribe((res) => {
        console.log("🚀 ~ VatReportPage ~ getVatReportData ~ res:", res);

        this.vatReportData.set(res);
        console.log("🚀 ~ VatReportPage ~ .subscribe ~ this.vatReportData in subscribe:", this.vatReportData())
      });

  }

  updateIncome(event: any) {
    console.log("updateIncome event: ", event);

    if (event === "") {
      console.log("event is empty string, setting to 0");
      event = '0';
    }

    // Step 1: Update vatableTurnover
    this.vatReportData.update((prev) => ({
      ...prev,
      vatableTurnover: event, // Update vatableTurnover with the new value
    }));
    // }
    // else {


    // Step 2: Convert all fields to number for calculation
    // const numericData = Object.fromEntries(
    //   Object.entries(this.vatReportData()).map(([key, value]) => [
    //     key,
    //     this.genericService.convertStringToNumber(value),
    //   ])
    // ) as IVatReportData;

    const numericData = {} as IVatReportData;
    Object.entries(this.vatReportData()).forEach(([key, value]) => {
      // numericData[key as keyof IVatReportData] = 15;
      numericData[key as keyof IVatReportData] = this.genericService.convertStringToNumber(value);
    });
    console.log("🚀 ~ VatReportPage ~ updateIncome ~ numericData:", numericData)

    // Step 3: Recalculate vatPayment
    const vatPayment = (
      Number(numericData.vatableTurnover) * Number(numericData.vatRate) -
      Number(numericData.vatRefundOnAssets) -
      Number(numericData.vatRefundOnExpenses)
    ).toFixed(2);

    // Step 4: Update vatPayment
    this.vatReportData.update((prev) => ({
      ...numericData,
      vatPayment,
    }));

    // Step 5: Convert all values back to display strings
    // const stringFormatted = Object.fromEntries(
    //   Object.entries(this.vatReportData()).map(([key, value]) => [
    //     key,
    //     this.genericService.addComma(value),
    //   ])
    // ) as IVatReportData;
    const stringFormatted = {} as IVatReportData;
    Object.entries(this.vatReportData()).forEach(([key, value]) => {
      stringFormatted[key as keyof IVatReportData] = this.genericService.addComma(value);
    });


    this.vatReportData.set(stringFormatted);
    // }
  }

  closeDialogWithoutConfirm(event: boolean): void {
    console.log("🚀 ~ VatReportPage ~ closeDialogWithoutConfirm ~ event:", event)
    this.visibleConfirmTransDialog.set(event);
    this.getVatReportData(this.startDate(), this.endDate(), this.businessNumber());
    this.getDataTable(this.startDate(), this.endDate(), this.businessNumber());
  }

  confirmTrans(event: { transactions: IRowDataTable[], files: { id: number, file: File }[] }): void {
    if (!event.transactions.length) {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        sticky: true,
        detail: "לא נבחרה אף תנועה",
        life: 3000,
        key: 'br'
      });
      return;
    }
    console.log("🚀 ~ VatReportPage ~ confirmTrans ~ event:", event)
    this.isLoadingButtonConfirmDialog.set(true);

    // Step 1: Confirm transactions as expenses
    this.transactionService.addTransToExpense(event.transactions)
      .pipe(
        catchError((err) => {
          console.log("Error in confirmTrans: ", err);
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            sticky: true,
            detail: "אירעה שגיאה באישור התנועות, נא לנסות שוב מאוחר יותר",
            life: 3000,
            key: 'br'
          });
          this.isLoadingButtonConfirmDialog.set(false);
          return EMPTY;
        }),
        switchMap((res) => {
          // Step 2: If files were attached, upload and attach them
          if (event.files && event.files.length > 0) {
            console.log(`Uploading ${event.files.length} files for confirmed transactions...`);
            return this.filesService.uploadAndSaveMultipleFilesToServer(
              event.files, this.businessNumber(),
              (uploadedFiles) => this.vatReportService.addFileToExpenses(uploadedFiles, true)
            ).pipe(
              tap(() => {
                this.messageService.add({
                  severity: 'success',
                  summary: 'Success',
                  detail: `אושרו ${event.transactions.length} תנועות והועלו ${event.files.length} קבצים בהצלחה`,
                  life: 3000,
                  key: 'br'
                });
              }),
              catchError((fileErr) => {
                console.error("Error uploading files:", fileErr);
                this.messageService.add({
                  severity: 'error',
                  summary: 'Error',
                  detail: `אושרו ${event.transactions.length} תנועות אך העלאת הקבצים נכשלה`,
                  life: 5000,
                  key: 'br'
                });
                return of(res); // Continue anyway
              })
            );
          } else {
            // No files to upload
            this.messageService.add({
              severity: 'success',
              summary: 'Success',
              detail: `אושרו ${event.transactions.length} תנועות בהצלחה`,
              life: 3000,
              key: 'br'
            });
            return of(res);
          }
        }),
        finalize(() => {
          this.isLoadingButtonConfirmDialog.set(false);
          this.visibleConfirmTransDialog.set(false);
        })
      )
      .subscribe((res) => {
        // Refresh data after transactions are confirmed
        this.getVatReportData(this.startDate(), this.endDate(), this.businessNumber());
        this.getDataTable(this.startDate(), this.endDate(), this.businessNumber());
      })
  }

  // updateIncome(event: any) {
  //   console.log("updateIncome event: ", event);

  //   if (event === "") {
  //     event = '0';
  //     this.vatReportData.update((prevData) => ({
  //       ...prevData,
  //       vatableTurnover: '0',
  //     }));
  //     Object.keys(this.vatReportData()).forEach((field) => { // convert all to type number for math manipulation
  //       this.vatReportData[field] = this.genericService.convertStringToNumber(this.vatReportData[field]);
  //       console.log("🚀 ~ VatReportPage ~ Object.keys ~ this.vatReport[field]:", this.vatReportData[field])

  //     });
  //     this.vatReportData.update((prevData) => ({
  //       ...prevData,
  //       vatPayment: (
  //         Number(this.vatReportData().vatableTurnover) * Number(this.vatReportData().vatRate) -
  //         Number(this.vatReportData().vatRefundOnAssets) -
  //         Number(this.vatReportData().vatRefundOnExpenses)
  //       ).toFixed(2)
  //     }));
  //     Object.keys(this.vatReportData()).map((field) => { //convert all to type string for display with comma
  //       this.vatReportData()[field] = this.genericService.addComma(this.vatReportData()[field]);
  //     });
  //   }
  // }


  getDataTable(startDate: string, endDate: string, businessNumber: string): void {

    this.dataTable = this.expenseDataService.getExpenseForVatReport(startDate, endDate, businessNumber)
      .pipe(
        map((data) => {
          const rows = [];
          console.log("data of table in vat report: ", data);

          data.forEach(row => {
            const { reductionDone, reductionPercent, expenseNumber, isEquipment, loadingDate, note, supplierID, userId, isReported, monthReport, ...tableData } = row;
            if (row.file != undefined && row.file != null && row.file != "") {
              tableData[this.UPLOAD_FILE_FIELD_NAME] = row.file; // to show that this expense already has a file 
            }
            tableData.totalTaxPayable = this.genericService.addComma(tableData.totalTaxPayable as string);
            tableData.totalVatPayable = this.genericService.addComma(tableData.totalVatPayable as string);
            tableData.sum = this.genericService.addComma(tableData.sum as string);
            rows.push(tableData);
          })
          this.rows = rows;
          return rows
        })
      )
    // .subscribe((res) => {
    // this.dataTable.set(res);
    // console.log("data table in vat report: ", this.dataTable());
    // 
    // })

    //= this.expenseDataService.getExpenseForVatReport(startDate, endDate, businessNumber)


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

  onFileChange(e: { row: IRowDataTable, file?: File }) {
    console.log("onFileChange event: ", e);
    this.addFileToExpense(e)
  }


  addFileToExpense(e: { row: IRowDataTable, file?: File }): void {
    this.genericService.getLoader().subscribe();
    this.filesService.addFileToExpense(e.row, this.businessNumber(), e.file)
      .pipe(
        tap(() => {
          this.getDataTable(this.startDate(), this.endDate(), this.businessNumber());
        }),
        finalize(() => {
          this.genericService.dismissLoader();
        })
      )
      .subscribe(() => {
        this.messageService.add({
          severity: 'success',
          summary: 'Success',
          detail: 'קובץ הועלה בהצלחה',
          life: 5000,
          key: 'br'
        });
      })
  }

  onChange(event: string): void {
    console.log("onChange event: ", event);
    this.updateIncome(event);
  }

  show(): void {
    console.log("in show");

    this.visibleConfirmTransDialog.set(true);
  }

  onDeleteFile(row: IRowDataTable): void {
    this.filesService.deleteFileCompletely(row.id as number, row.file as string)
      .pipe(
        tap(() => {
          this.messageService.add({
            severity: 'success',
            summary: 'Success',
            detail: 'קובץ נמחק בהצלחה',
            life: 5000,
            key: 'br'
          });
          this.getDataTable(this.startDate(), this.endDate(), this.businessNumber());
        }),
        catchError((error) => {
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'שגיאה במחיקת הקובץ, אנא נסה/י שנית',
            life: 5000,
            key: 'br'
          });
          console.error("Error deleting file:", error);
          return of(null);
        }),
        finalize(() => {
          this.genericService.dismissLoader();
        })
      )
      .subscribe();
  }

  onDownloadFile(row: IRowDataTable): void {
    console.log("Download file for row:", row);
    this.filesService.downloadFirebaseFile(row.file as string)
  }

  private setFileActions(): void {
    this.fileActions = [
      {
        name: 'preview',
        icon: 'pi pi-eye',
        title: 'צפה בקובץ',
        action: (event: any, row: IRowDataTable) => {
          this.onPreviewFileClicked(row);
        }
      },
      {
        name: 'download',
        icon: 'pi pi-download',
        title: 'הורד קובץ',
        action: (event: any, row: IRowDataTable) => {
          this.onDownloadFile(row);
        }
      },
      {
        name: 'edit',
        icon: 'pi pi-pencil',
        title: 'ערוך קובץ (החלף)',
        action: (fileInput: HTMLInputElement, row: IRowDataTable) => {
          this.confirmationService.confirm({
            message: 'האם אתה בטוח שאתה רוצה להחליף את הקובץ הקיים?',
            header: 'החלפת קובץ',
            icon: 'pi pi-exclamation-triangle',
            acceptLabel: 'החלף',
            rejectLabel: 'לא',
            accept: () => {
              fileInput.value = '';
              fromEvent(fileInput, 'change').pipe(
                take(1),
                map(() => fileInput.files?.[0] || null),
                filter((file): file is File => !!file)
              )
                .subscribe((file) => {
                  this.addFileToExpense({ row, file });
                });

              fileInput.click();
            },
            reject: () => { }
          });
        }
      },
      {
        name: 'delete',
        icon: 'pi pi-trash',
        title: 'מחק קובץ',
        action: (event: any, row: IRowDataTable) => {
          this.confirmationService.confirm({
            message: 'האם אתה בטוח שאתה רוצה למחוק את הקובץ?',
            header: 'מחיקת קובץ',
            icon: 'pi pi-exclamation-triangle',
            acceptLabel: 'מחק',
            rejectLabel: 'לא',
            accept: () => {
              this.onDeleteFile(row);
            },
            reject: () => { }
          });
        }
      },
    ];
  }

}