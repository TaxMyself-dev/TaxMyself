import { Component, OnInit } from '@angular/core';
import { TransactionsService } from './transactions.page.service';
import { Observable, tap } from 'rxjs';
import { IColumnDataTable, IRowDataTable, ITableRowAction, ITransactionData } from 'src/app/shared/interface';
import { FormTypes, TransactionsOutcomesColumns, TransactionsOutcomesHebrewColumns } from 'src/app/shared/enums';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';

@Component({
  selector: 'app-transactions',
  templateUrl: './transactions.page.html',
  styleUrls: ['./transactions.page.scss', '../../shared/search-bar/search-bar.component.scss'],
})

export class TransactionsPage implements OnInit {

  data$: Observable<ITransactionData[]>;
  fieldsNames: IColumnDataTable<TransactionsOutcomesColumns, TransactionsOutcomesHebrewColumns>[] = [
    { name: TransactionsOutcomesColumns.ID, value: TransactionsOutcomesHebrewColumns.id, type: FormTypes.NUMBER },
    { name: TransactionsOutcomesColumns.NAME, value: TransactionsOutcomesHebrewColumns.name, type: FormTypes.TEXT },
    { name: TransactionsOutcomesColumns.BILL_DATE, value: TransactionsOutcomesHebrewColumns.bill_date, type: FormTypes.DATE },
    { name: TransactionsOutcomesColumns.PAY_DATE, value: TransactionsOutcomesHebrewColumns.pay_date, type: FormTypes.DATE },
    { name: TransactionsOutcomesColumns.SUM, value: TransactionsOutcomesHebrewColumns.sum, type: FormTypes.TEXT },
    { name: TransactionsOutcomesColumns.CATEGORY, value: TransactionsOutcomesHebrewColumns.category, type: FormTypes.TEXT },
  ];
  rows: IRowDataTable[];
  tableActions: ITableRowAction[]; 
  accountsList = [{value:'4516', name: 'שובל'}, {value: '4517', name:'שמואל'}];
  transactionsForm: FormGroup;
  isOpen: boolean = false;
  constructor(private transactionsService: TransactionsService, private formBuilder: FormBuilder) {
    this.transactionsForm = this.formBuilder.group({
      monthFormat: new FormControl (
        '', Validators.required,
      ),
      month: new FormControl (
        '', Validators.required,
      ),
      year: new FormControl (
        '', Validators.required,
      ),
      accounts: new FormControl (
        '', Validators.required,
      )
    })
  }

  
  ngOnInit(): void {
    this.setTableActions();

  }

  onOpenClicked(event: boolean): void {
    console.log("event of cliack",event);
    
    this.isOpen = event
    console.log(this.isOpen);
    
  }

  getTransactions() {
    this.data$ = this.transactionsService.getTransactionsData()
      .pipe(
          tap((data) => {
            this.rows = [];
            if (data.length) {
              data.forEach((outcome: ITransactionData) => {
                const {userId,...data} = outcome;
                this.rows.push(data);
                }
              )
            }
          }
        )
      );
}

columnsOrderByFunc(a, b): number {
  const columnsOrder = [
    'id',
    'name',
    'bill_date',
    'pay_date',
    'sum',
    'category'
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

private setTableActions(): void {
  this.tableActions = [
    // {
    //   name: 'delete',
    //   icon: 'trash-outline',
    //   action: (row: IRowDataTable) => {
    //     this.confirmDel(row);
    //   }
    // },
  ]
}

}