import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormTypes, ICellRenderer, TransactionsOutcomesColumns, TransactionsOutcomesHebrewColumns } from 'src/app/shared/enums';
import { IColumnDataTable, IRowDataTable, ITableRowAction, ITransactionData } from 'src/app/shared/interface';
import { FlowReportService } from './flow-report.page.service';
import { BehaviorSubject, EMPTY, Observable, catchError, finalize, map } from 'rxjs';
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
  params:{};
  columnsToIgnore = ['firebaseFile','id', 'payDate', 'isRecognized', 'isEquipment','paymentIdentifier','userId','billName', this.UPLOAD_FILE_FIELD_NAME];
  chosenTrans: {id: number, file?: File | string}[] = [];
  previousFile: string;
  //params: { month: string, year: string, isSingleMonth: string }

  fieldsNames: IColumnDataTable<TransactionsOutcomesColumns, TransactionsOutcomesHebrewColumns>[] = [
    { name: TransactionsOutcomesColumns.NAME, value: TransactionsOutcomesHebrewColumns.name, type: FormTypes.TEXT },
    { name: TransactionsOutcomesColumns.SUM, value: TransactionsOutcomesHebrewColumns.sum, type: FormTypes.TEXT },
    { name: TransactionsOutcomesColumns.CATEGORY, value: TransactionsOutcomesHebrewColumns.category, type: FormTypes.TEXT },
    { name: TransactionsOutcomesColumns.SUBCATEGORY, value: TransactionsOutcomesHebrewColumns.subCategory, type: FormTypes.TEXT },
    { name: TransactionsOutcomesColumns.TOTAL_TAX, value: TransactionsOutcomesHebrewColumns.totalTax, type: FormTypes.DATE },
    { name: TransactionsOutcomesColumns.TOTAL_VAT, value: TransactionsOutcomesHebrewColumns.totalVat, type: FormTypes.DATE },
    { name: TransactionsOutcomesColumns.REDUCTION_PERCENT, value: TransactionsOutcomesHebrewColumns.reductionPercent, type: FormTypes.DATE, },
    { name: TransactionsOutcomesColumns.PAY_DATE, value: TransactionsOutcomesHebrewColumns.payDate, type: FormTypes.DATE },

  ];
  tableActions: ITableRowAction[];

  constructor(private fileService: FilesService, private route: ActivatedRoute, private flowReportService: FlowReportService, private transactionService: TransactionsService, private expenseDataService: ExpenseDataService) { }

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
    this.flowReportService.getExpenseTransactionsData(this.params)
    .pipe(
      catchError((err) => {
        console.log("error in get expenses flow-report: ", err);
        return EMPTY;
      }),
      map((data) => {
        data.forEach((row) => {
          //row.billDate = this.transactionService.timestampToDateStr(row.billDate as number)
        })
        return data;
      }),
      map((data) =>{
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

    checkedClicked(event:{row: IRowDataTable, checked: boolean}): void {
    //console.log(event.checked);
    //console.log(event.id);
    event.checked ? this.chosenTrans.push({id: event.row.id as number, file: event.row.firebaseFile as string}) : this.chosenTrans = this.chosenTrans.filter((item) => {
      return item.id !== event.row.id;
    })
    console.log(this.chosenTrans);
    
    
  }

  selectedAll(event: {id: number[], checked: boolean}): void {
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
    console.log("chosen trans :", this.chosenTrans);
    
    this.chosenTrans.map((tran) => {
      return (
        this.fileService.uploadFileViaFront(tran.file as File)
        .pipe(
          catchError((error) => {
            console.log("error in upload file: ", error);
            alert("אירעה שגיאה לא ניתן להעלות את הקובץ")
            return EMPTY;
          })
          )
          .subscribe((res) => {
            tran.file = res.metadata.fullPath;
            // if (this.previousFile) {
            //   this.fileService.deleteFile(this.previousFile);
            //   this.previousFile = null;
            // }
            // this.chosenTrans.map((item) => {
            //   if (item.id === row.id) {
            //     item.file = res.metadata.fullPath;
            //     console.log(this.chosenTrans);
            //   }
            // }
            // )
            //row[this.UPLOAD_FILE_FIELD_NAME] = event.target.files[0]?.name;
            //this.expenseDataService.closeLoader();
          })
          
        )
    })

    // this.flowReportService.addTransToExpense(this.chosenTrans)
    // .pipe(
    //   catchError((err) => {
    //     console.log("err in add trans to expense: ", err);
    //     return EMPTY;
    //   })
    //   )
    // .subscribe((res) => {
    //   console.log("res from add trans to expense:", res);
      
    // })  
    console.log("trans after file: ",this.chosenTrans);
    
  }

  addFile(event: any, row: IRowDataTable): void {
    console.log(event);
    console.log(event.target.files[0]);
    //change file
    if (row.firebaseFile !== "" && row.firebaseFile !== undefined && row.firebaseFile !== null){
      this.previousFile = row.firebaseFile as string;
    }

    row[this.UPLOAD_FILE_FIELD_FIREBASE] = event.target.files[0];
    row[this.UPLOAD_FILE_FIELD_NAME] = event.target.files[0]?.name;

    //this.expenseDataService.getLoader().subscribe()
    // this.fileService.uploadFileViaFront(event.target.files[0])
    // .pipe(
    //   catchError((error) => {
    //     console.log("error in upload file: ", error);
    //     alert("אירעה שגיאה לא ניתן להעלות את הקובץ")
    //     return EMPTY;
    //   })
    //   )
      // .subscribe((res) => {
      //   if (this.previousFile) {
      //     this.fileService.deleteFile(this.previousFile);
      //     this.previousFile = null;
      //   }
      //   this.chosenTrans.map((item) => {
      //     if (item.id === row.id) {
      //       item.file = res.metadata.fullPath;
      //       console.log(this.chosenTrans);
      //     }
      //   }
      //   )
      //   row[this.UPLOAD_FILE_FIELD_FIREBASE] = res.metadata.fullPath;
      //   this.expenseDataService.closeLoader();
      // })
    
    // row.fileIcon = 'document-attach-outline';
    // this.tableActions.find((el) => el.name === 'upload').tooltip = event.target.files[0].name;
    
  }
  

}
