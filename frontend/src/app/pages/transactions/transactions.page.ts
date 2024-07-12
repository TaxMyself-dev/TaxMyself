import { Component, OnInit } from '@angular/core';
import { TransactionsService } from './transactions.page.service';
import { BehaviorSubject, EMPTY, Observable, catchError, from, map, switchMap, zip } from 'rxjs';
import { IColumnDataTable, IRowDataTable, ITableRowAction, ITransactionData } from 'src/app/shared/interface';
import { FormTypes, ICellRenderer, TransactionsOutcomesColumns, TransactionsOutcomesHebrewColumns } from 'src/app/shared/enums';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { AddBillComponent } from 'src/app/shared/add-bill/add-bill.component';
import { ModalController } from '@ionic/angular';

@Component({
  selector: 'app-transactions',
  templateUrl: './transactions.page.html',
  styleUrls: ['./transactions.page.scss', '../../shared/search-bar/search-bar.component.scss'],
})

export class TransactionsPage implements OnInit {

  incomesData$ = new BehaviorSubject<IRowDataTable[]>(null);
  expensesData$ = new BehaviorSubject<IRowDataTable[]>(null);
  fieldsNamesIncome: IColumnDataTable<TransactionsOutcomesColumns, TransactionsOutcomesHebrewColumns>[] = [
    { name: TransactionsOutcomesColumns.NAME, value: TransactionsOutcomesHebrewColumns.name, type: FormTypes.TEXT },
    { name: TransactionsOutcomesColumns.BILL_NUMBER, value: TransactionsOutcomesHebrewColumns.paymentIdentifier, type: FormTypes.DATE, cellRenderer: ICellRenderer.BILL },
    { name: TransactionsOutcomesColumns.BILL_NAME, value: TransactionsOutcomesHebrewColumns.billName, type: FormTypes.DATE, cellRenderer: ICellRenderer.BILL },
    { name: TransactionsOutcomesColumns.CATEGORY, value: TransactionsOutcomesHebrewColumns.category, type: FormTypes.TEXT, cellRenderer: ICellRenderer.CATEGORY },
    { name: TransactionsOutcomesColumns.SUBCATEGORY, value: TransactionsOutcomesHebrewColumns.subCategory, type: FormTypes.TEXT, cellRenderer: ICellRenderer.SUBCATEGORY },
    { name: TransactionsOutcomesColumns.SUM, value: TransactionsOutcomesHebrewColumns.sum, type: FormTypes.TEXT },
    { name: TransactionsOutcomesColumns.PAY_DATE, value: TransactionsOutcomesHebrewColumns.payDate, type: FormTypes.DATE },
  ];
  fieldsNamesExpenses: IColumnDataTable<TransactionsOutcomesColumns, TransactionsOutcomesHebrewColumns>[] = [
    { name: TransactionsOutcomesColumns.NAME, value: TransactionsOutcomesHebrewColumns.name, type: FormTypes.TEXT },
    { name: TransactionsOutcomesColumns.BILL_NUMBER, value: TransactionsOutcomesHebrewColumns.paymentIdentifier, type: FormTypes.DATE },
    { name: TransactionsOutcomesColumns.BILL_NAME, value: TransactionsOutcomesHebrewColumns.billName, type: FormTypes.DATE, cellRenderer: ICellRenderer.BILL },
    { name: TransactionsOutcomesColumns.CATEGORY, value: TransactionsOutcomesHebrewColumns.category, type: FormTypes.TEXT, cellRenderer: ICellRenderer.CATEGORY },
    { name: TransactionsOutcomesColumns.SUBCATEGORY, value: TransactionsOutcomesHebrewColumns.subCategory, type: FormTypes.TEXT, cellRenderer: ICellRenderer.SUBCATEGORY },
    { name: TransactionsOutcomesColumns.SUM, value: TransactionsOutcomesHebrewColumns.sum, type: FormTypes.TEXT },
    { name: TransactionsOutcomesColumns.PAY_DATE, value: TransactionsOutcomesHebrewColumns.payDate, type: FormTypes.DATE },
    { name: TransactionsOutcomesColumns.BILL_DATE, value: TransactionsOutcomesHebrewColumns.billDate, type: FormTypes.DATE },
    { name: TransactionsOutcomesColumns.IS_RECOGNIZED, value: TransactionsOutcomesHebrewColumns.isRecognized, type: FormTypes.DATE },
  ];
  readonly specialColumnsCellRendering = new Map<TransactionsOutcomesColumns, ICellRenderer>([
    [TransactionsOutcomesColumns.CATEGORY, ICellRenderer.CATEGORY],
    [TransactionsOutcomesColumns.SUBCATEGORY, ICellRenderer.SUBCATEGORY],
    [TransactionsOutcomesColumns.BILL_NUMBER, ICellRenderer.BILL],
  ]);
  rows: IRowDataTable[];
  tableActions: ITableRowAction[];
  typeIncomeList = [{ value: null, name: 'הכל' }, { value: 'classification', name: 'סווג' }, { value: 'notClassification', name: 'טרם סווג' }];
  transactionsForm: FormGroup;
  incomeForm: FormGroup;
  expensesForm: FormGroup;
  isOpen: boolean = false;
  incomesData: IRowDataTable[];
  expensesData: IRowDataTable[];
  addPayment: boolean = false;
  selectBill: string;
  accountsList: any[] = [];

  constructor(private transactionsService: TransactionsService, private formBuilder: FormBuilder, private modalController: ModalController) {
    this.transactionsForm = this.formBuilder.group({
      isSingleMonth: new FormControl(
        false, Validators.required,
      ),
      month: new FormControl(
        '', Validators.required,
      ),
      year: new FormControl(
        '', Validators.required,
      ),
      accounts: new FormControl(
        '', Validators.required,
      )
    });

    this.incomeForm = this.formBuilder.group({
      incomeType: new FormControl(
        '', Validators.required,
      ),
      category: new FormControl(
        '', Validators.required,
      ),
    });

    this.expensesForm = this.formBuilder.group({
      expensesType: new FormControl(
        '', Validators.required,
      ),
      category: new FormControl(
        '', Validators.required,
      ),
    })
  }


  ngOnInit(): void {
    this.setTableActions();
    this.transactionsService.getAllBills();
    this.transactionsService.accountsList$.subscribe(
      (accountsList) => {
        this.accountsList = accountsList;
        console.log(this.accountsList);
      }
    );
    this.transactionsService.getAllSources().subscribe((data) => {
      console.log("sources: ",data);
    })

  }

  ngOnDestroy(): void {
      this.transactionsService.accountsList$.unsubscribe();
    
  }

  renameFields(obj: any): any {
    return {
      value: obj.id,
      name: obj.billName,
    };
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
          return { incomes: incomeDataRows, expenses: expenseeDataRows };
        }
        )
      )
      .subscribe((data: { incomes: IRowDataTable[]; expenses: IRowDataTable[] }) => {
        this.expensesData = data.expenses;
        this.incomesData = data.incomes;
        this.incomesData$.next(data.incomes);
        this.expensesData$.next(data.expenses);
      });
  }

  columnsOrderByFunc(a, b): number {

    const columnsOrder = [
      'name',
      'paymentIdentifier',
      'bill_name',
      'category',
      'subCategory',
      'sum',
      'payDate',
      'billDate',
      'isRecognized'
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
      {
        name: 'delete',
        icon: 'create',
        action: (row: IRowDataTable) => {
          this.openAddBill(row)
        }
      },
    ]
  }

  openAddBill(data: IRowDataTable): void {
    // this.addPayment = true;        
    this.selectBill = data.paymentIdentifier as string;
    this.openPopupAddBill()
  }

  openPopupAddBill(data?: IRowDataTable): void {
    from(this.modalController.create({

      component: AddBillComponent,
      componentProps: {
        paymentMethod: this.selectBill,
        // accountsList: this.accountsList.splice(1)
      }
    })).pipe(catchError((err) => {
      alert("openPopupAddExpense error");
      return EMPTY;
    }), switchMap((modal) => from(modal.present())), catchError((err) => {
      alert("openPopupAddExpense switchMap error");
      console.log(err);

      return EMPTY;
    })).subscribe();
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
        const { userId, isEquipment, id, taxPercent, vatPercent, reductionPercent, ...data } = row;
        console.log("befor", data.category);

        data.category === "" ? data.category = "טרם סווג" : null;
        data.subCategory === "" ? data.subCategory = "טרם סווג" : null;
        console.log("afterr", data.category);
        rows.push(data);
      }
      )
    }

    return rows;
  }



}