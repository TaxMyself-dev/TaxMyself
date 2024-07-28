import { Component, OnInit } from '@angular/core';
import { TransactionsService } from './transactions.page.service';
import { BehaviorSubject, EMPTY, Observable, catchError, from, map, switchMap, zip } from 'rxjs';
import { IButtons, IColumnDataTable, IRowDataTable, ITableRowAction, ITransactionData } from 'src/app/shared/interface';
import { ExpenseFormColumns, ExpenseFormHebrewColumns, FormTypes, ICellRenderer, TransactionsOutcomesColumns, TransactionsOutcomesHebrewColumns } from 'src/app/shared/enums';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { AddBillComponent } from 'src/app/shared/add-bill/add-bill.component';
import { ModalController } from '@ionic/angular';
import { AddTransactionComponent } from 'src/app/shared/add-transaction/add-transaction.component';
import { ModalExpensesComponent } from 'src/app/shared/modal-add-expenses/modal.component';

@Component({
  selector: 'app-transactions',
  templateUrl: './transactions.page.html',
  styleUrls: ['./transactions.page.scss', '../../shared/shared-styling.scss'],
})

export class TransactionsPage implements OnInit {

  incomesData$ = new BehaviorSubject<IRowDataTable[]>(null);
  expensesData$ = new BehaviorSubject<IRowDataTable[]>(null);
  fieldsNamesIncome: IColumnDataTable<TransactionsOutcomesColumns, TransactionsOutcomesHebrewColumns>[] = [
    { name: TransactionsOutcomesColumns.NAME, value: TransactionsOutcomesHebrewColumns.name, type: FormTypes.TEXT },
    { name: TransactionsOutcomesColumns.BILL_NUMBER, value: TransactionsOutcomesHebrewColumns.paymentIdentifier, type: FormTypes.DATE, },
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
    [TransactionsOutcomesColumns.BILL_NAME, ICellRenderer.BILL],
  ]);

  columns: IColumnDataTable<ExpenseFormColumns, ExpenseFormHebrewColumns>[] = [ // Titles of expense// TODO: what? why is this here? should be generic??
    { name: ExpenseFormColumns.IS_EQUIPMENT, value: ExpenseFormHebrewColumns.isEquipment, type: FormTypes.DDL },
    { name: ExpenseFormColumns.CATEGORY, value: ExpenseFormHebrewColumns.category, type: FormTypes.DDL },
    { name: ExpenseFormColumns.SUB_CATEGORY, value: ExpenseFormHebrewColumns.subCategory, type: FormTypes.DDL },
  ];

  buttons: IButtons[] = [
    {text: "שמור", size: "large", action: this.saveTransaction}
  ]
  rows: IRowDataTable[];
  tableActions: ITableRowAction[];
  typeIncomeList = [{ value: null, name: 'הכל' }, { value: 'classification', name: 'סווג' }, { value: 'notClassification', name: 'טרם סווג' }];
  transactionsForm: FormGroup;
  incomeForm: FormGroup;
  expensesForm: FormGroup;
  isOpen: boolean = false;
  incomesData: IRowDataTable[] = [];
  expensesData: IRowDataTable[];
  addPayment: boolean = false;
  selectBill: string;
  accountsList: any[] = [];
  sourcesList: string[] =[];
  selectedFile: File = null;

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
      this.sourcesList = data;
    })

  }

  // ngOnDestroy(): void {
  //     this.transactionsService.accountsList$.unsubscribe();
    
  // }

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
        data.incomes.forEach((row => {
          const {isRecognized, payDate, ...incomeRow} = row;
          this.incomesData = [];
          this.incomesData.push(incomeRow);
        }))
        this.expensesData = data.expenses;
        this.incomesData$.next(this.incomesData);
        this.expensesData$.next(data.expenses);
      });
  }

  columnsOrderByFunc(a, b): number {

    const columnsOrder = [
      'name',
      'paymentIdentifier',
      'billName',
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
    this.selectBill = data.paymentIdentifier as string;
    this.openPopupAddBill()
  }

  openPopupAddBill(data?: IRowDataTable): void {
    from(this.modalController.create({

      component: AddBillComponent,
      componentProps: {
        paymentMethod: this.selectBill,
      }
    })).pipe(catchError((err) => {
      alert("openPopupAddBill error");
      return EMPTY;
    }),
     switchMap((modal) => from(modal.present())
     .pipe(
      switchMap(() => from(modal.onWillDismiss()))
      )),
     catchError((err) => {
      alert("openPopupAddBill switchMap error");
      console.log(err);
      return EMPTY;
    }))
    .subscribe(({data, role}) => {
      if (role === 'success') {
        this.getTransactions()
      }
    });
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

  timestampToDateStr(timestamp: number): string {
    let date: Date;
    if (typeof timestamp === 'string') {
      const parsedTimestamp = parseInt(timestamp);
      if (isNaN(parsedTimestamp)) {
        throw new Error('Invalid timestamp string');
      }
      date = new Date(parsedTimestamp);
    } 
    else {
      date = new Date(timestamp);
    }
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are zero-based
    const year = date.getFullYear().toString().slice(-2);
    return `${day}/${month}/${year}`;
  }

  private handleTableData(data: ITransactionData[]) {
    const rows = [];
    if (data.length) {
      console.log("data: ", data);
      
      data.forEach((row: ITransactionData) => {
        const { userId, isEquipment, id, taxPercent, vatPercent, reductionPercent, ...data } = row;
        console.log("payment",data.paymentIdentifier);
        data.billDate = this.timestampToDateStr(data.billDate as number);
        data.payDate = this.timestampToDateStr(data.payDate as number);
        data.billName ? null : data.billName = "זמני";
        data.category ? null : data.category = "טרם סווג";
        data.subCategory ? null : data.subCategory = "טרם סווג";
        rows.push(data);
      }
      )
    }

    return rows;
  }

  onFileSelected(event: any): void {
    console.log("in file");
    this.selectedFile = event.target.files[0];
    console.log(this.selectedFile);
  }

  onUpload(): void {
    if (this.selectedFile) {
      const reader = new FileReader();

      reader.onload = (e) => {
        const arrayBuffer = reader.result;
console.log("array buffer: ", arrayBuffer);

        this.transactionsService.uploadFile(arrayBuffer as ArrayBuffer)
        .pipe()
        .subscribe(
          (response) => {
            console.log(response.message);
            // Handle successful response
          },
          error => {
            console.error('Error uploading file', error);
            // Handle error response
          }
        );
      };

      reader.readAsArrayBuffer(this.selectedFile);
    } else {
      console.error('No file selected.');
    }
  }

  openAddTransaction(): void {
    from(this.modalController.create({

      component: AddTransactionComponent,
      componentProps: {
        columns: this.columns,
        buttons: this.buttons
      }
    })).pipe(catchError((err) => {
      alert("openAddTransaction error");
      return EMPTY;
    }), switchMap((modal) => from(modal.present())), catchError((err) => {
      alert("openAddTransaction switchMap error");
      console.log(err);

      return EMPTY;
    })).subscribe();
  }

  saveTransaction(): void {
    console.log("save transaction");
    
  }

  onClickedCell(event: {str: string, data: IRowDataTable}): void {
    console.log(event);
    event.str === "bill" ? this.openAddBill(event.data) : this.openAddTransaction()
    
  }



}