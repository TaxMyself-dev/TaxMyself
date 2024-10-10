import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormTypes, ICellRenderer, TransactionsOutcomesColumns, TransactionsOutcomesHebrewColumns } from 'src/app/shared/enums';
import { IColumnDataTable, IRowDataTable, ITableRowAction, ITransactionData } from 'src/app/shared/interface';
import { FlowReportService } from './flow-report.page.service';
import { BehaviorSubject, EMPTY, Observable, catchError, finalize, forkJoin, map, of, tap } from 'rxjs';
import { TransactionsService } from '../transactions/transactions.page.service';
import { FilesService } from 'src/app/services/files.service';
import { ExpenseDataService } from 'src/app/services/expense-data.service';
//const { FilePicker } = Plugins;


@Component({
  selector: 'app-flow-report',
  templateUrl: './flow-report.page.html',
  styleUrls: ['./flow-report.page.scss'],
})
export class FlowReportPage implements OnInit {
  readonly UPLOAD_FILE_FIELD_NAME = 'fileName';
  readonly UPLOAD_FILE_FIELD_FIREBASE = 'firebaseFile';
  expensesData: any[];
  // expensesData$: Observable<any>;

  month: string;
  year: string;
  isSingleMonth: string;
  params: {};
  columnsToIgnore = ['firebaseFile', 'id', 'payDate', 'isRecognized', 'isEquipment', 'paymentIdentifier', 'userId', 'billName', 'vatReportingDate', this.UPLOAD_FILE_FIELD_NAME];
  chosenTrans: { id: number, file?: File | string }[] = [];
  previousFile: string;
  //params: { month: string, year: string, isSingleMonth: string }
  isCheckboxClicked: boolean = false;
  isToastOpen: boolean = false;
  messageToast: string = "";



  fieldsNames: IColumnDataTable<TransactionsOutcomesColumns, TransactionsOutcomesHebrewColumns>[] = [
    { name: TransactionsOutcomesColumns.NAME, value: TransactionsOutcomesHebrewColumns.name, type: FormTypes.TEXT },
    { name: TransactionsOutcomesColumns.SUM, value: TransactionsOutcomesHebrewColumns.sum, type: FormTypes.TEXT },
    { name: TransactionsOutcomesColumns.CATEGORY, value: TransactionsOutcomesHebrewColumns.category, type: FormTypes.TEXT },
    { name: TransactionsOutcomesColumns.SUBCATEGORY, value: TransactionsOutcomesHebrewColumns.subCategory, type: FormTypes.TEXT },
    { name: TransactionsOutcomesColumns.TOTAL_TAX, value: TransactionsOutcomesHebrewColumns.totalTax, type: FormTypes.DATE },
    { name: TransactionsOutcomesColumns.TOTAL_VAT, value: TransactionsOutcomesHebrewColumns.totalVat, type: FormTypes.DATE },
    { name: TransactionsOutcomesColumns.REDUCTION_PERCENT, value: TransactionsOutcomesHebrewColumns.reductionPercent, type: FormTypes.DATE, },
    { name: TransactionsOutcomesColumns.PAY_DATE, value: TransactionsOutcomesHebrewColumns.payDate, type: FormTypes.DATE, cellRenderer: ICellRenderer.DATE },

  ];
  readonly specialColumnsCellRendering = new Map<TransactionsOutcomesColumns, ICellRenderer>([
    [TransactionsOutcomesColumns.BILL_DATE, ICellRenderer.DATE],
    [TransactionsOutcomesColumns.PAY_DATE, ICellRenderer.DATE]
  ]);
  tableActions: ITableRowAction[];

  constructor(private router: Router, private fileService: FilesService, private route: ActivatedRoute, private flowReportService: FlowReportService, private transactionService: TransactionsService, private expenseDataService: ExpenseDataService) { }

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      this.params = params;
      console.log(params);
      this.month = params['month'];
      this.year = params['year'];
      this.isSingleMonth = params['isSingleMonth'];
      this.getTransaction();
    });
    this.setTableActions();
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

  getTransaction(): void {
    //this.flowReportService.getExpenseTransactionsData(this.params)
    this.flowReportService.getFlowReportData(this.params)
      .pipe(
        catchError((err) => {
          console.log("error in get expenses flow-report: ", err);
          return EMPTY;
        }),
        map((data) => {
          console.log(data);

          data.forEach((row) => {
            row.billDate = +row.billDate;
            row.payDate = +row.payDate;
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

  // checkedClicked(event: { row: IRowDataTable, checked: boolean }): void {
  //   this.isCheckboxClicked = true;
  //   event.checked ? this.chosenTrans.push({ id: event.row.id as number, file: event.row.firebaseFile as string }) : this.chosenTrans = this.chosenTrans.filter((item) => {
  //     return item.id !== event.row.id;
  //   })
  //   console.log(this.chosenTrans);
  // }

  checkedClicked(event: { row: IRowDataTable, checked: boolean }): void {
    // If the checkbox is checked, add it to chosenTrans
    if (event.checked) {
      this.chosenTrans.push({ id: event.row.id as number, file: event.row.firebaseFile as string });
    } else {
      // If unchecked, remove it from chosenTrans
      this.chosenTrans = this.chosenTrans.filter((item) => {
        return item.id !== event.row.id;
      });
    }

    // Update isCheckboxClicked flag based on whether there are any selected items
    this.isCheckboxClicked = this.chosenTrans.length > 0;

    console.log(this.chosenTrans);
  }

  selectedAll(event: { id: number[], checked: boolean }): void {
    // console.log(event);
    // event.checked ? event.id.forEach((id) => {
    //   if (!this.chosenTrans.includes(id)){
    //     this.chosenTrans.push(id)
    //   }
    // })
    //     : this.chosenTrans = [];
    // console.log(this.chosenTrans);

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
      this.expenseDataService.getLoader().subscribe();
      console.log("No transactions with files, skipping file upload...");
      this.expenseDataService.updateLoaderMessage('Uploading transactions without files...');

      // Directly call addTransToExpense since there are no files to upload
      this.flowReportService.addTransToExpense(this.chosenTrans)
        .pipe(
          catchError((err) => {
            console.log("Error in addTransToExpense: ", err);
            this.expenseDataService.dismissLoader();
            return EMPTY;
          })
        )
        .subscribe((res) => {
          console.log("Response from addTransToExpense:", res);
          this.messageToast = `הועלו ${totalTransactions} תנועות. מתוכם ${transactionsWithFiles} עם קובץ ו${transactionsWithoutFiles} בלי קובץ`
          this.isToastOpen = true;
          this.expenseDataService.dismissLoader();
          this.router.navigate(['vat-report']);
        });
      return; // Exit the function since file uploads are skipped
    }

    // Update loader for transactions with files
    this.expenseDataService.getLoader().subscribe();
    this.expenseDataService.updateLoaderMessage(`Uploading files... ${0}%`);

    // Create an array of observables for each file upload
    const fileUploadObservables = this.chosenTrans.map((tran) => {
      if (tran.file) {
        return this.fileService.uploadFileViaFront(tran.file as File).pipe(
          catchError((error) => {
            console.log("Error in uploading file: ", error);
            alert("Error uploading file");
            return EMPTY;
          }),
          tap((res) => {
            tran.file = res.metadata.fullPath;  // Update the file path after upload
            console.log("Uploaded file path: ", tran.file);
            filesUploaded++;
            const progress = Math.round((filesUploaded / transactionsWithFiles) * 100);
            this.expenseDataService.updateLoaderMessage(`Uploading files... ${progress}%`);
          })
        );
      } else {
        return of(null);  // Return an observable that emits null for transactions without files
      }
    });

    // Use forkJoin to wait for all file uploads to finish
    forkJoin(fileUploadObservables)
      .pipe(
        catchError((err) => {
          console.log("Error in addTransToExpense: ", err);
          this.expenseDataService.dismissLoader();
          return EMPTY;
        }),
        tap(() => {
          console.log("All file uploads complete.");
          this.messageToast = `הועלו ${totalTransactions} תנועות. מתוכם ${transactionsWithFiles} עם קובץ ו${transactionsWithoutFiles} בלי קובץ`
          this.isToastOpen = true;
          this.expenseDataService.dismissLoader();
          this.router.navigate(['vat-report']);
        })
      )
      .subscribe();
  }


  setOpenToast(): void {
    this.isToastOpen = false;
  }



  addFile(event: any, row: IRowDataTable): void {
    console.log(event);
    console.log(row);
    console.log(event.target.files[0]);
    //change file
    if (row.firebaseFile !== "" && row.firebaseFile !== undefined && row.firebaseFile !== null) {
      this.previousFile = row.firebaseFile as string;
    }

    row[this.UPLOAD_FILE_FIELD_FIREBASE] = event.target.files[0];
    row[this.UPLOAD_FILE_FIELD_NAME] = event.target.files[0]?.name;
    this.chosenTrans.map((tran) => {
      console.log(tran.id, row.id);

      if (tran.id === row.id) {
        console.log("in if")
        return (
          tran.file = event.target.files[0]
        )
      }

    })
    console.log(this.chosenTrans);
  }


}
