import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormTypes, ICellRenderer, TransactionsOutcomesColumns, TransactionsOutcomesHebrewColumns } from 'src/app/shared/enums';
import { IColumnDataTable, IRowDataTable, ITableRowAction, IUserDate } from 'src/app/shared/interface';
import { FlowReportService } from './flow-report.page.service';
import { BehaviorSubject, EMPTY, catchError, finalize, forkJoin, map, of, switchMap, tap } from 'rxjs';
import { FilesService } from 'src/app/services/files.service';
import { GenericService } from 'src/app/services/generic.service';
import { AuthService } from 'src/app/services/auth.service';


@Component({
  selector: 'app-flow-report',
  templateUrl: './flow-report.page.html',
  styleUrls: ['./flow-report.page.scss'],
})
export class FlowReportPage implements OnInit {
  readonly UPLOAD_FILE_FIELD_NAME = 'fileName';
  readonly UPLOAD_FILE_FIELD_FIREBASE = 'firebaseFile';
  expensesData: IRowDataTable[] = [];
  // filteredExpense: IRowDataTable[] = [];
  expensesData$ = new BehaviorSubject<IRowDataTable[]>(null);

  private _params: {};
  public get params(): {} {
    return this._params;
  }
  public set params(value: {}) {
    this._params = value;
  }
  startDate: string;
  endDate: string;
  businessNumber: string;
  // chosenTrans = new Map<number, File | string>
  chosenTrans: { id: number, file?: File | string }[] = [];
  isSelectTransaction: boolean = false; // for able or disable send button
  isToastOpen: boolean = false;
  messageToast: string = "";
  userData: IUserDate;
  strFilter: string;
  checkedCount: number = 0;

  public COLUMNS_TO_IGNORE = ['note2', 'finsiteId', 'businessNumber', 'firebaseFile', 'id', 'payDate', 'isRecognized', 'isEquipment', 'paymentIdentifier', 'userId', 'billName', 'vatReportingDate', this.UPLOAD_FILE_FIELD_NAME];

  readonly COLUMNS_WIDTH = new Map<TransactionsOutcomesColumns, number>([
    [TransactionsOutcomesColumns.CHECKBOX, 0.5],
    [TransactionsOutcomesColumns.NAME, 1.4],
    [TransactionsOutcomesColumns.SUM, 1],
    [TransactionsOutcomesColumns.CATEGORY, 1.4],
    [TransactionsOutcomesColumns.SUBCATEGORY, 1.4],
    [TransactionsOutcomesColumns.TAX_PERCENT, 1.2],
    [TransactionsOutcomesColumns.VAT_PERCENT, 1.2],
    [TransactionsOutcomesColumns.REDUCTION_PERCENT, 1.2],
    [TransactionsOutcomesColumns.BILL_DATE, 1.6],
    [TransactionsOutcomesColumns.ACTIONS, 1],
  ]);

  fieldsNames: IColumnDataTable<TransactionsOutcomesColumns, TransactionsOutcomesHebrewColumns>[] = [
    { name: TransactionsOutcomesColumns.NAME, value: TransactionsOutcomesHebrewColumns.name, type: FormTypes.TEXT },
    { name: TransactionsOutcomesColumns.SUM, value: TransactionsOutcomesHebrewColumns.sum, type: FormTypes.TEXT },
    { name: TransactionsOutcomesColumns.CATEGORY, value: TransactionsOutcomesHebrewColumns.category, type: FormTypes.TEXT },
    { name: TransactionsOutcomesColumns.SUBCATEGORY, value: TransactionsOutcomesHebrewColumns.subCategory, type: FormTypes.TEXT },
    { name: TransactionsOutcomesColumns.TAX_PERCENT, value: TransactionsOutcomesHebrewColumns.totalTax, type: FormTypes.DATE },
    { name: TransactionsOutcomesColumns.VAT_PERCENT, value: TransactionsOutcomesHebrewColumns.totalVat, type: FormTypes.DATE },
    { name: TransactionsOutcomesColumns.REDUCTION_PERCENT, value: TransactionsOutcomesHebrewColumns.reductionPercent, type: FormTypes.DATE, },
    { name: TransactionsOutcomesColumns.BILL_DATE, value: TransactionsOutcomesHebrewColumns.payDate, type: FormTypes.DATE, cellRenderer: ICellRenderer.DATE },

  ];
  readonly specialColumnsCellRendering = new Map<TransactionsOutcomesColumns, ICellRenderer>([
    [TransactionsOutcomesColumns.BILL_DATE, ICellRenderer.DATE],
    [TransactionsOutcomesColumns.PAY_DATE, ICellRenderer.DATE]
  ]);
  tableActions: ITableRowAction[];

  constructor(private authService: AuthService, private genericService: GenericService, private fileService: FilesService, private route: ActivatedRoute, private flowReportService: FlowReportService) { }

  ngOnInit() {
    this.userData = this.authService.getUserDataFromLocalStorage();
    if (this.userData.isTwoBusinessOwner) {
      this.fieldsNames.push({ name: TransactionsOutcomesColumns.BUSINESS_NAME, value: TransactionsOutcomesHebrewColumns.businessName, type: FormTypes.TEXT });
      this.COLUMNS_WIDTH.set(TransactionsOutcomesColumns.NAME, 1.2);
      this.COLUMNS_WIDTH.set(TransactionsOutcomesColumns.CATEGORY, 1.2);
      this.COLUMNS_WIDTH.set(TransactionsOutcomesColumns.SUBCATEGORY, 1.2);
      this.COLUMNS_WIDTH.set(TransactionsOutcomesColumns.TAX_PERCENT, 1.1);
      this.COLUMNS_WIDTH.set(TransactionsOutcomesColumns.VAT_PERCENT, 1.1);
      this.COLUMNS_WIDTH.set(TransactionsOutcomesColumns.BILL_DATE, 1.4);

      const expenseIndex = this.COLUMNS_TO_IGNORE.indexOf('businessNumber');
      if (expenseIndex > -1) {
        this.COLUMNS_TO_IGNORE.splice(expenseIndex, 1);
      }
    }

    this.route.queryParams.subscribe((params) => {
      this.params = params;
      this.startDate = this.params['startDate'];
      this.endDate = this.params['endDate'];
      this.businessNumber = this.params['businessNumber'];

      this.getTransaction();
    });
    this.setTableActions();
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
    ]
  }

  isAllChecked(): boolean {
    return this.checkedCount === this.expensesData.length;
  }

  getTransaction(): void {
    this.flowReportService.getFlowReportData(this.startDate, this.endDate, this.businessNumber)
      .pipe(
        catchError((err) => {
          console.log("error in get expenses flow-report: ", err);
          return EMPTY;
        }),
        map((data) => {
          console.log(data);

          data.forEach((row) => {
            row.sum = Math.abs(row.sum);
            row.sum = this.genericService.addComma(row.sum)
            row?.businessNumber === this.userData.businessNumber ? row.businessNumber = this.userData.businessName : row.businessNumber = this.userData.spouseBusinessName;

          })
          return data;
        }),
        map((data) => { // filter only if transaction.isRecognized is true 
          const isRecognized = data.filter((tran) => {
            return tran.isRecognized;
          })
          return isRecognized;
        })
      )
      .subscribe((res) => {
        console.log("res expenses in flow-report :", res);
        this.expensesData$.next(res);
        this.expensesData = res;
      })
  }

  columnsOrderByFunc(a, b): number {

    const columnsOrder = [
      'name',
      'sum',
      'category',
      'subCategory',
      'taxPercent',
      'vatPercent',
      'reductionPercent',
      'billDate',
      'billName'
    ];

    const indexA = columnsOrder.indexOf(a.key);
    const indexB = columnsOrder.indexOf(b.key);

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

  checkedClicked(event: { row: IRowDataTable, checked: boolean }): void {

    // If the checkbox is checked, add it to chosenTrans
    if (event.checked) {
      this.checkedCount++;
      this.chosenTrans.push({ id: event.row.id as number, file: event.row.firebaseFile as string });
    } else {
      this.checkedCount--;
      // If unchecked, remove it from chosenTrans
      this.chosenTrans = this.chosenTrans.filter((item) => {
        return item.id !== event.row.id;
      });
    }

    // Update isSelectTransaction flag based on whether there are any selected transaction
    this.isSelectTransaction = this.chosenTrans.length > 0;
console.log(this.isAllChecked);

    console.log(this.chosenTrans);
  }

  selectAll(event: boolean, expensesData: IRowDataTable[]): void {
    if (event) {
      this.chosenTrans = [];
      this.expensesData.forEach((expense) => {
        this.chosenTrans.push({id: expense.id as number, file: expense.firebaseFile as File})
      })
      this.isSelectTransaction = true;
      this.checkedCount = this.expensesData.length;
    }
    else {
      this.chosenTrans = [];
      this.isSelectTransaction = false;
      this.checkedCount = 0;
    }
  }

  addTransToExpense(): void {

    const totalTransactions = this.chosenTrans.length;
    let filesUploaded = 0;
    let transactionsWithFiles = 0;
    let transactionsWithoutFiles = 0;

    // Count transactions with and without files
    this.chosenTrans.forEach(tran => {
      if (tran.file) {
        transactionsWithFiles++;
      } else {
        transactionsWithoutFiles++;
      }
    });

    console.log("chosen trans:", this.chosenTrans);

    // If no transactions have files, skip file uploads and proceed directly
    if (transactionsWithFiles === 0) {
      this.genericService.getLoader().subscribe()
      console.log("No transactions with files, skipping file upload...");
      this.genericService.updateLoaderMessage('Uploading transactions without files...');

      // Directly call addTransToExpense since there are no files to upload
      this.flowReportService.addTransToExpense(this.chosenTrans)
        .pipe(
          finalize(() => {
            this.genericService.dismissLoader();
          }),
          catchError((err) => {
            console.log("Error in addTransToExpense: ", err);
            this.genericService.dismissLoader();

            this.messageToast = "אירעה שגיאה העלאת תנועות לדוח לא נקלטה"
            this.isToastOpen = true;
            return EMPTY;
          }),
        )
        .subscribe((res) => {
          console.log("Response from addTransToExpense:", res);
          this.messageToast = `הועלו ${totalTransactions} תנועות. מתוכם ${transactionsWithFiles} עם קובץ ו${transactionsWithoutFiles} בלי קובץ`
          this.isToastOpen = true;
          this.chosenTrans = [];
          console.log("chosenTrans after upload: ", this.chosenTrans);
          this.getTransaction();
          this.genericService.dismissLoader();
          //this.router.navigate(['vat-report']);

          // this.router.navigate(['vat-report'], {
          //   queryParams: {
          //     isToastOpen: true,
          //     messageToast:  `הועלו ${totalTransactions} תנועות. מתוכם ${transactionsWithFiles} עם קובץ ו${transactionsWithoutFiles} בלי קובץ`
          //   }
          // })

        });
      return; // Exit the function since file uploads are skipped
    }

    // Update loader for transactions with files
    this.genericService.getLoader().subscribe();
    this.genericService.updateLoaderMessage(`Uploading files... ${0}%`);

    // Create an array of observables for each file upload
    const fileUploadObservables = this.chosenTrans.map((tran) => {
      if (tran.file) {
        return this.fileService.uploadFileViaFront(tran.file as File).pipe(
          finalize(() => {
            this.genericService.dismissLoader();
          }),
          catchError((error) => {
            console.log("Error in uploading file: ", error);
            //this.genericService.dismissLoader();
            alert("Error uploading file");
            return EMPTY;
          }),
          tap((res) => {
            tran.file = res.metadata.fullPath;  // Update the file path after upload
            console.log("Uploaded file path: ", tran.file);
            filesUploaded++;
            const progress = Math.round((filesUploaded / transactionsWithFiles) * 100);
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
        catchError((err) => {
          console.log("Error in forkJoin: ", err);
          this.genericService.dismissLoader();
          return EMPTY;
        }),
        switchMap(() => this.flowReportService.addTransToExpense(this.chosenTrans)),
        catchError((err) => {
          console.log("err in send transaction to server: ", err);
          this.chosenTrans.forEach((tran) => {
            if (tran.file) {
              this.fileService.deleteFile(tran.file as string);
              console.log("file: ", tran.file, "is delete");
            }
          })
          this.genericService.dismissLoader();
          this.messageToast = "אירעה שגיאה העלאת תנועות לדוח לא נקלטה"
          this.isToastOpen = true;
          return EMPTY
        }),
        tap(() => {
          console.log("All file uploads complete.");
          this.messageToast = `הועלו ${totalTransactions} תנועות. מתוכם ${transactionsWithFiles} עם קובץ ו${transactionsWithoutFiles} בלי קובץ`
          this.isToastOpen = true;
          this.genericService.dismissLoader();
          //this.router.navigate(['vat-report']);
          // this.router.navigate(['vat-report'], {
          //   queryParams: {
          //     isToastOpen: true,
          //     messageToast:  `הועלו ${totalTransactions} תנועות. מתוכם ${transactionsWithFiles} עם קובץ ו${transactionsWithoutFiles} בלי קובץ`
          //   }
          // })
        }),
        finalize(() => {
          this.genericService.dismissLoader();
        }),
      )
      .subscribe();
  }

  setCloseToast(): void {
    this.isToastOpen = false;
  }

  addFile(event: any, row: IRowDataTable): void {

    row[this.UPLOAD_FILE_FIELD_FIREBASE] = event.target.files[0];
    row[this.UPLOAD_FILE_FIELD_NAME] = event.target.files[0]?.name;
    this.chosenTrans.map((tran) => {
      if (tran.id === row.id) {
        return (
          tran.file = event.target.files[0]
        )
      }

    })
    console.log(this.chosenTrans);
    console.log(this.expensesData);
  }

  filterBy(event: string): void {
    this.strFilter = event;
    this.expensesData$.next(this.expensesData?.filter((e) => {
      return String(e.name).includes(event)
    }
    ));

  }


}
