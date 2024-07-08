import { Component, OnInit } from '@angular/core';
import { TransactionsService } from './transactions.page.service';
import { BehaviorSubject, Observable, map, zip } from 'rxjs';
import { IColumnDataTable, IRowDataTable, ITableRowAction, ITransactionData } from 'src/app/shared/interface';
import { FormTypes, TransactionsOutcomesColumns, TransactionsOutcomesHebrewColumns } from 'src/app/shared/enums';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';

@Component({
  selector: 'app-transactions',
  templateUrl: './transactions.page.html',
  styleUrls: ['./transactions.page.scss', '../../shared/search-bar/search-bar.component.scss'],
})

export class TransactionsPage implements OnInit {

  incomesData$ = new BehaviorSubject<IRowDataTable[]>(null);
  expensesData$ = new BehaviorSubject<IRowDataTable[]>(null);
  fieldsNames: IColumnDataTable<TransactionsOutcomesColumns, TransactionsOutcomesHebrewColumns>[] = [
    // { name: TransactionsOutcomesColumns.ID, value: TransactionsOutcomesHebrewColumns.id, type: FormTypes.NUMBER },
    { name: TransactionsOutcomesColumns.BILL_NUMBER, value: TransactionsOutcomesHebrewColumns.bill_number, type: FormTypes.DATE },
    { name: TransactionsOutcomesColumns.NAME, value: TransactionsOutcomesHebrewColumns.name, type: FormTypes.TEXT },
    { name: TransactionsOutcomesColumns.CATEGORY, value: TransactionsOutcomesHebrewColumns.category, type: FormTypes.TEXT },
    { name: TransactionsOutcomesColumns.SUBCATEGORY, value: TransactionsOutcomesHebrewColumns.sub_category, type: FormTypes.TEXT },
    { name: TransactionsOutcomesColumns.SUM, value: TransactionsOutcomesHebrewColumns.sum, type: FormTypes.TEXT },
    { name: TransactionsOutcomesColumns.PAY_DATE, value: TransactionsOutcomesHebrewColumns.pay_date, type: FormTypes.DATE },
  ];
  rows: IRowDataTable[];
  tableActions: ITableRowAction[]; 
  accountsList = [{value:'null', name: 'כל החשבונות'},{value:'4516', name: 'שובל'}, {value: '4517', name:'שמואל'}];
  typeIncomeList = [{value:null, name: 'הכל'}, {value:'classification', name: 'סווג'}, {value: 'notClassification', name:'טרם סווג'}];
  transactionsForm: FormGroup;
  incomeForm: FormGroup;
  expensesForm: FormGroup;
  isOpen: boolean = false;
  incomesData: IRowDataTable[];
  expensesData: IRowDataTable[];

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
    });

    this.incomeForm = this.formBuilder.group({
      incomeType: new FormControl (
        '', Validators.required,
      ),
      category: new FormControl (
        '', Validators.required,
      ),
    });

    this.expensesForm = this.formBuilder.group({
      expensesType: new FormControl (
        '', Validators.required,
      ),
      category: new FormControl (
        '', Validators.required,
      ),
    })
  }

  
  ngOnInit(): void {
    this.setTableActions();

  }

  onOpenClicked(event: boolean): void {
    this.isOpen = event
  }

  getTransactions() {
    this.isOpen = true;
    const formData = this.transactionsForm.value;
    const incomeData$ = this.transactionsService.getIncomeTransactionsData(formData);
    const expensesData$ = this.transactionsService.getExpenseTransactionsData(formData);

    zip(incomeData$, expensesData$)
    .pipe(
      map(([incomeData, expenseData]) => {
        const incomeDataRows = this.handleTableData(incomeData);
        const expenseeDataRows = this.handleTableData(expenseData);
        return {incomes: incomeDataRows, expenses: expenseeDataRows};
      }
    )
  )
  .subscribe((data: {incomes: IRowDataTable[]; expenses: IRowDataTable[]}) => {
    this.expensesData = data.expenses;
    this.incomesData = data.incomes;
    this.incomesData$.next(data.incomes);
    this.expensesData$.next(data.expenses);
  });
}

columnsOrderByFunc(a, b): number {
  
  const columnsOrder = [
    'paymentIdentifier',
    'name',
    'category',
    'subCategory',
    'sum',
    'payDate'
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

incomeFilter(): void {
  console.log("income filter");
  const formData = this.incomeForm.value;
  console.log(formData);
  if (formData.incomeType === "notClassification") {
    this.incomesData$.next(this.incomesData.filter((income) => income.category === "טרם סווג"));
  }
  else if (formData.incomeType === null) {
    this.incomesData$.next(this.incomesData);
  }
  else {
    this.incomesData$.next(this.incomesData.filter((income) => income.category !== "טרם סווג"));
  }
}

expensesFilter(): void {
  console.log("expens filter");
  const formData = this.expensesForm.value;
  console.log(this.expensesForm.get('expensesType').value);
  if (formData.expensesType === "notClassification") {
    this.expensesData$.next(this.expensesData.filter((expense) => expense.category === "טרם סווג"));
  }
  else if (formData.expensesType === null) {
    this.expensesData$.next(this.expensesData);
  }
  else {
    this.expensesData$.next(this.expensesData.filter((expense) => expense.category !== "טרם סווג"));
  }
}


private handleTableData(data: ITransactionData[]) {
  const rows = [];
  if (data.length) {
    data.forEach((row: ITransactionData) => {
      const {userId,isRecognized,isEquipment,id,taxPercent,vatPercent,billDate,reductionPercent,...data} = row;
      console.log("befor",data.category);
      
      data.category === "" ? data.category = "טרם סווג" : null; 
      data.subCategory === "" ? data.subCategory = "טרם סווג" : null; 
      console.log("afterr",data.category);
      rows.push(data);
      }
    )
  }

  return rows;
}

}