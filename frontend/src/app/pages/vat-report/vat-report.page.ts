import { Component, computed, inject, Input, OnInit, signal } from '@angular/core';
import { VatReportService } from './vat-report.service';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { ExpenseDataService } from 'src/app/services/expense-data.service';
import { EMPTY, Observable, catchError, finalize, forkJoin, from, map, of, switchMap, tap } from 'rxjs';
import { BusinessMode, FormTypes, ICellRenderer, inputsSize, ReportingPeriodType, ReportingPeriodTypeLabels } from 'src/app/shared/enums';
//import { ButtonSize } from 'src/app/shared/button/button.enum';
import { ButtonSize } from 'src/app/components/button/button.enum';
import { ExpenseFormColumns, ExpenseFormHebrewColumns } from 'src/app/shared/enums';
import { IColumnDataTable, IRowDataTable, ISelectItem, ITableRowAction, IUserData, IVatReportData } from 'src/app/shared/interface';
import { Router } from '@angular/router';
import { FilesService } from 'src/app/services/files.service';
import { ModalController } from '@ionic/angular';
import { PopupConfirmComponent } from 'src/app/shared/popup-confirm/popup-confirm.component';
import { GenericService } from 'src/app/services/generic.service';
import { DateService } from 'src/app/services/date.service';
import { AuthService } from 'src/app/services/auth.service';
import { log } from 'console';
//import { l } from '@angular/core/navigation_types.d-u4EOrrdZ';
import { ButtonColor } from 'src/app/components/button/button.enum';
import { TransactionsService } from '../transactions/transactions.page.service';
import { MessageService } from 'primeng/api';


@Component({
  selector: 'app-vat-report',
  templateUrl: './vat-report.page.html',
  styleUrls: ['./vat-report.page.scss', '../../shared/shared-styling.scss'],
  standalone: false
})
export class VatReportPage implements OnInit {

  private gs = inject(GenericService);

  // reactive bindings
  businessOptions = computed(() => this.gs.businesses());
  isLoading = computed(() => this.gs.isLoadingBusinesses());

  visibleConfirmTransDialog = signal<boolean>(false);

  readonly ButtonSize = ButtonSize;
  readonly reportingPeriodType = ReportingPeriodType;
  readonly UPLOAD_FILE_FIELD_NAME = 'fileName';
  readonly UPLOAD_FILE_FIELD_FIREBASE = 'firebaseFile';
  readonly COLUMNS_TO_IGNORE = ['businessNumber', 'id', 'file', 'transId', 'vatReportingDate', 'firebaseFile', 'fileName'];
  readonly ACTIONS_TO_IGNORE = ['preview']

  years: number[] = Array.from({ length: 15 }, (_, i) => new Date().getFullYear() - i);
  vatReportData = signal<IVatReportData>(null);
  startDate = signal<string>("");
  arrayLength = signal<number>(0);
  endDate = signal<string>("");
  isLoadingButtonConfirmDialog = signal<boolean>(false);
  isLoadingStatePeryodSelectButton = signal<boolean>(false);
  businessNumber = signal<string>("");
  displayExpenses: boolean = false;
  //vatReportForm: FormGroup;
  tableActions: ITableRowAction[];
  arrayFile: { id: number, file: File | string }[] = [];
  previousFile: string;
  tableData$: Observable<IRowDataTable[]>;
  items$: Observable<IRowDataTable[]>;
  item: IRowDataTable;
  rows: IRowDataTable[] = [];
  isSkip: boolean = false;
  userData: IUserData;
  businessNamesList: ISelectItem[] = [];
  BusinessMode = BusinessMode;
  businessMode: BusinessMode = BusinessMode.ONE_BUSINESS;
  optionsTypesList = [{ value: ReportingPeriodType.MONTHLY, name: ReportingPeriodTypeLabels[ReportingPeriodType.MONTHLY] },
  { value: ReportingPeriodType.BIMONTHLY, name: ReportingPeriodTypeLabels[ReportingPeriodType.BIMONTHLY] }];
  // dataTable = Observable<IRowDataTable[]>;
  transToConfirm: Observable<IRowDataTable[]> ;
  dataTable: Observable<IRowDataTable[]> ;
  

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
) {}


  async ngOnInit() {
    this.userData = this.authService.getUserDataFromLocalStorage();
    //this.gs.clearBusinesses();
    await this.gs.loadBusinesses();

    if (this.userData.isTwoBusinessOwner) {
      console.log("two business owner");
      this.businessMode = BusinessMode.TWO_BUSINESS;
      this.businessNamesList.push({ name: this.userData.businessName, value: this.userData.businessNumber });
      this.businessNamesList.push({ name: this.userData.spouseBusinessName, value: this.userData.spouseBusinessNumber });
    }
    else {
      console.log("one business owner");
      this.businessMode = BusinessMode.ONE_BUSINESS;
      this.businessNamesList.push({ name: this.userData.businessName, value: this.userData.businessNumber });
    }
  }

  beforeSelectFile(event): void {
    console.log("in beforeSelectFile");
    console.log("skip: ", this.isSkip);


    if (!this.isSkip && event.data.file != "") {
      console.log("in if beforeSelectFile");
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

  onSubmit(event: any): void {
    this.isLoadingStatePeryodSelectButton.set(true);
    const year = event.year;
    const month = event.month;
    const reportingPeriodType = event.periodMode;
    this.businessNumber.set(event.business);
    const { startDate, endDate } = this.dateService.getStartAndEndDates(reportingPeriodType, year, month, "", "");
    this.startDate.set(startDate);
    this.endDate.set(endDate);
    this.getTransToConfirm();
    
    this.getVatReportData(startDate, endDate, this.businessNumber());
    this.getDataTable(startDate, endDate, this.businessNumber());
    
  }
  
  getTransToConfirm(): void {
    this.visibleConfirmTransDialog.set(true);
    console.log("in getTransToConfirm");
    console.log("startDate: ", this.startDate());
    console.log("endDate: ", this.endDate());
    console.log("businessNumber: ", this.businessNumber());
    
    this.transToConfirm = this.transactionService.getTransToConfirm(
      this.startDate(),
      this.endDate(),
      this.businessNumber()
    ).pipe(
      catchError(err => {
        console.error("Error in getTransToConfirm:", err);
        return EMPTY;
      }),
      map(data =>{
        console.log("🚀 ~ VatReportPage ~ getTransToConfirm ~ data:", data);
        
        return data.filter(row => !row.vatReportingDate || row.vatReportingDate === '0')
          .map(row => ({
            ...row,
            sum: this.genericService.addComma(Math.abs(row.sum as number)),
            isRecognized: row.isRecognized ? 'כן' : 'לא',
            businessNumber: row?.businessNumber === this.userData.businessNumber
              ? this.userData.businessName
              : this.userData.spouseBusinessName
          }))
                 }
      ),
       tap((data: IRowDataTable[]) => {
        console.log("🚀 ~ tap ~ data:", data)
        this.arrayLength.set(data.length);
      })
    )
   
    // .subscribe(res => {
    //   console.log("Filtered & transformed transactions:", res);
    // });
  }


  getVatReportData(startDate: string, endDate: string, businessNumber: string) {
    console.log("in get vat report data");
    // this.isLoading.set(true);
    // this.genericService.getLoader().subscribe();
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

  confirmTrans(event: IRowDataTable[]): void {
    this.isLoadingButtonConfirmDialog.set(true);
    this.transactionService.addTransToExpense(event)
      .pipe(
        catchError((err) => {
          console.log("Error in confirmTrans: ", err);
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            sticky: true,
            detail:"אירעה שגיאה באישור התנועות, נא לנסות שוב מאוחר יותר",
            life: 3000,
            key: 'br'
          })
          return EMPTY;
        }),
        finalize(() => {
          this.isLoadingButtonConfirmDialog.set(false);
          this.visibleConfirmTransDialog.set(false);
        }),
      )
      .subscribe((res) => {
        this.messageService.add({
          severity: 'success',
          summary: 'Success',
          detail:"אישור התנועות בוצע בהצלחה",
          life: 3000,
          key: 'br'
        })
        
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

  // // Get the data from server and update items
  // setRowsData(): void {
  //   //const formData = this.vatReportForm.value;

  //   const { startDate, endDate } = this.dateService.getStartAndEndDates(formData.reportingPeriodType, formData.year, formData.month, formData.startDate, formData.endDate);

  //   this.items$ = this.expenseDataService.getExpenseForVatReport(startDate, endDate, formData.businessNumber)
  //     .pipe(
  //       map((data) => {
  //         const rows = [];
  //         console.log("data of table in vat report: ", data);

  //         data.forEach(row => {
  //           const { reductionDone, reductionPercent, expenseNumber, isEquipment, loadingDate, note, supplierID, userId, isReported, monthReport, ...tableData } = row;
  //           if (row.file != undefined && row.file != null && row.file != "") {
  //             tableData[this.UPLOAD_FILE_FIELD_NAME] = row.file; // to show that this expense already has a file 
  //           }
  //           tableData.totalTaxPayable = this.genericService.addComma(tableData.totalTaxPayable as string);
  //           tableData.totalVatPayable = this.genericService.addComma(tableData.totalVatPayable as string);
  //           tableData.sum = this.genericService.addComma(tableData.sum as string);
  //           rows.push(tableData);
  //         })
  //         this.rows = rows;
  //         return rows
  //       })
  //     )
  // }

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

  // addFileToExpense(): void {
  //   const totalTransactions = this.arrayFile.length;
  //   let filesUploaded = 0;
  //   this.genericService.getLoader().subscribe();
  //   this.genericService.updateLoaderMessage(`Uploading files... ${0}%`);

  //   // Create an array of observables for each file upload
  //   const fileUploadObservables = this.arrayFile.map((tran) => {
  //     if (tran.file) {
  //       return this.filesService.uploadFileViaFront(tran.file as File).pipe(
  //         finalize(() => {
  //           this.genericService.dismissLoader();
  //         }),
  //         catchError((error) => {
  //           console.log("Error in get vat report uploading file: ", error);
  //           alert("Error uploading file");
  //           return EMPTY;
  //         }),
  //         tap((res) => {
  //           tran.file = res.metadata.fullPath;  // Update the file path after upload
  //           filesUploaded++;
  //           const progress = Math.round((filesUploaded / totalTransactions) * 100);
  //           this.genericService.updateLoaderMessage(`Uploading files... ${progress}%`);
  //           this.genericService.dismissLoader();
  //         }
  //         )
  //       );
  //     } else {
  //       return of(null);  // Return an observable that emits null for transactions without files
  //     }
  //   });

  //   // Use forkJoin to wait for all file uploads to finish
  //   forkJoin(fileUploadObservables)
  //     .pipe(
  //       finalize(() => {
  //         this.genericService.dismissLoader();
  //       }),
  //       catchError((err) => {
  //         console.log("Error in get vat report forkJoin: ", err);
  //         this.genericService.dismissLoader();
  //         return EMPTY;
  //       }),
  //       switchMap(() => this.vatReportService.addFileToExpenses(this.arrayFile)),
  //       catchError((err) => {
  //         console.log("err in send files to server: ", err);
  //         this.arrayFile.forEach((tran) => {
  //           if (tran.file) {
  //             this.filesService.deleteFile(tran.file as string);
  //           }
  //         })
  //         this.genericService.showToast("אירעה שגיאה העלאת קבצים נכשלה", "error");
  //         // this.messageToast = "אירעה שגיאה העלאת קבצים נכשלה"
  //         // this.isToastOpen = true;
  //         return EMPTY
  //       }),
  //       tap(() => {
  //         console.log("All file uploads complete.");
  //         this.genericService.showToast(`הועלו ${totalTransactions} קבצים `, "success");
  //         // this.messageToast = `הועלו ${totalTransactions} קבצים `
  //         // this.isToastOpen = true;
  //       }),

  //     )
  //     .subscribe(() => {
  //       this.arrayFile = [];
  //       this.setRowsData();
  //     });
  // }

  onChange(event: string): void {
    console.log("onChange event: ", event);
    this.updateIncome(event);
  }

  show(): void {
    console.log("in show");
    
    this.visibleConfirmTransDialog.set(true);
  }

}