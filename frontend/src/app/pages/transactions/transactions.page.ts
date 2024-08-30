import { Component, OnInit } from '@angular/core';
import { TransactionsService } from './transactions.page.service';
import { BehaviorSubject, EMPTY, Observable, catchError, finalize, from, map, switchMap, tap, zip } from 'rxjs';
import { IButtons, IColumnDataTable, IRowDataTable, ITableRowAction, ITransactionData } from 'src/app/shared/interface';
import { ExpenseFormColumns, ExpenseFormHebrewColumns, FormTypes, ICellRenderer, TransactionsOutcomesColumns, TransactionsOutcomesHebrewColumns } from 'src/app/shared/enums';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { AddBillComponent } from 'src/app/shared/add-bill/add-bill.component';
import { ModalController } from '@ionic/angular';
import { AddTransactionComponent } from 'src/app/shared/add-transaction/add-transaction.component';
import { ModalExpensesComponent } from 'src/app/shared/modal-add-expenses/modal.component';
import { Router } from '@angular/router';
import { editRowComponent } from 'src/app/shared/edit-row/edit-row.component';
import { DateService } from 'src/app/services/date.service';

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
    { name: TransactionsOutcomesColumns.SUBCATEGORY, value: TransactionsOutcomesHebrewColumns.subCategory, type: FormTypes.TEXT },
    { name: TransactionsOutcomesColumns.SUM, value: TransactionsOutcomesHebrewColumns.sum, type: FormTypes.TEXT },
    { name: TransactionsOutcomesColumns.PAY_DATE, value: TransactionsOutcomesHebrewColumns.payDate, type: FormTypes.DATE },
  ];
  editFieldsNamesExpenses: IColumnDataTable<TransactionsOutcomesColumns, TransactionsOutcomesHebrewColumns>[] = [
    { name: TransactionsOutcomesColumns.NAME, value: TransactionsOutcomesHebrewColumns.name, type: FormTypes.TEXT },
    { name: TransactionsOutcomesColumns.BILL_NUMBER, value: TransactionsOutcomesHebrewColumns.paymentIdentifier, type: FormTypes.TEXT },
    { name: TransactionsOutcomesColumns.BILL_NAME, value: TransactionsOutcomesHebrewColumns.billName, type: FormTypes.TEXT, cellRenderer: ICellRenderer.BILL },
    { name: TransactionsOutcomesColumns.CATEGORY, value: TransactionsOutcomesHebrewColumns.category, type: FormTypes.TEXT, cellRenderer: ICellRenderer.CATEGORY },
    { name: TransactionsOutcomesColumns.SUBCATEGORY, value: TransactionsOutcomesHebrewColumns.subCategory, type: FormTypes.TEXT, cellRenderer: ICellRenderer.SUBCATEGORY },
    { name: TransactionsOutcomesColumns.SUM, value: TransactionsOutcomesHebrewColumns.sum, type: FormTypes.NUMBER },
    { name: TransactionsOutcomesColumns.BILL_DATE, value: TransactionsOutcomesHebrewColumns.billDate, type: FormTypes.DATE },
    { name: TransactionsOutcomesColumns.IS_RECOGNIZED, value: TransactionsOutcomesHebrewColumns.isRecognized, type: FormTypes.TEXT },
    { name: TransactionsOutcomesColumns.IS_EQUIPMENT, value: TransactionsOutcomesHebrewColumns.isEquipment, type: FormTypes.TEXT },
    { name: TransactionsOutcomesColumns.REDUCTION_PERCENT, value: TransactionsOutcomesHebrewColumns.reductionPercent, type: FormTypes.NUMBER },
  ];
  
  fieldsNamesExpenses: IColumnDataTable<TransactionsOutcomesColumns, TransactionsOutcomesHebrewColumns>[] = [
    { name: TransactionsOutcomesColumns.NAME, value: TransactionsOutcomesHebrewColumns.name, type: FormTypes.TEXT },
    { name: TransactionsOutcomesColumns.BILL_NUMBER, value: TransactionsOutcomesHebrewColumns.paymentIdentifier, type: FormTypes.NUMBER },
    { name: TransactionsOutcomesColumns.BILL_NAME, value: TransactionsOutcomesHebrewColumns.billName, type: FormTypes.TEXT, cellRenderer: ICellRenderer.BILL },
    { name: TransactionsOutcomesColumns.CATEGORY, value: TransactionsOutcomesHebrewColumns.category, type: FormTypes.TEXT, cellRenderer: ICellRenderer.CATEGORY },
    { name: TransactionsOutcomesColumns.SUBCATEGORY, value: TransactionsOutcomesHebrewColumns.subCategory, type: FormTypes.TEXT, cellRenderer: ICellRenderer.SUBCATEGORY },
    { name: TransactionsOutcomesColumns.SUM, value: TransactionsOutcomesHebrewColumns.sum, type: FormTypes.NUMBER },
    { name: TransactionsOutcomesColumns.BILL_DATE, value: TransactionsOutcomesHebrewColumns.billDate, type: FormTypes.DATE, cellRenderer: ICellRenderer.DATE },
    { name: TransactionsOutcomesColumns.PAY_DATE, value: TransactionsOutcomesHebrewColumns.payDate, type: FormTypes.DATE, cellRenderer: ICellRenderer.DATE},
    { name: TransactionsOutcomesColumns.IS_RECOGNIZED, value: TransactionsOutcomesHebrewColumns.isRecognized, type: FormTypes.TEXT },
  ];
  // [TransactionsOutcomesColumns.TAX_PERCENT]: [data?.taxPercent || ''],
  // [TransactionsOutcomesColumns.VAT_PERCENT]: [data?.vatPercent || ''],
  // [TransactionsOutcomesColumns.IS_EQUIPMENT]: [data?.isEquipment || false, Validators.required], // TODO
  // [TransactionsOutcomesColumns.REDUCTION_PERCENT]: [data?.reductionPercent || 0],

    readonly specialColumnsCellRendering = new Map<TransactionsOutcomesColumns, ICellRenderer>([
    [TransactionsOutcomesColumns.CATEGORY, ICellRenderer.CATEGORY],
    [TransactionsOutcomesColumns.SUBCATEGORY, ICellRenderer.SUBCATEGORY],
    [TransactionsOutcomesColumns.BILL_NAME, ICellRenderer.BILL],
    [TransactionsOutcomesColumns.BILL_DATE, ICellRenderer.DATE],
    [TransactionsOutcomesColumns.PAY_DATE, ICellRenderer.DATE]
  ]);
  readonly COLUMNS_TO_IGNORE_EXPENSES = ['id', 'isEquipment','reductionPercent'];
  readonly COLUMNS_TO_IGNORE_INCOMES = ['id', 'payDate', 'isRecognized', 'isEquipment' ,'reductionPercent'];


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
  sourcesList: string[] = [];
  selectedFile: File = null;
  dateForUpdate = { 'isSingleMonth': true, 'month': "1", 'year': 2024 };
  checkClassifyBill: boolean = true;
  constructor( private router: Router, private transactionsService: TransactionsService, private formBuilder: FormBuilder, private modalController: ModalController, private dateService: DateService) {
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
        '',
      ),
      category: new FormControl(
        '',
      ),
    });

  

    this.expensesForm = this.formBuilder.group({
      expensesType: new FormControl(
        '',
      ),
      category: new FormControl(
        '',
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
      console.log("sources: ", data);
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
    console.log("form data trans is ", formData);
    
    this.dateForUpdate.isSingleMonth = formData.isSingleMonth;
    this.dateForUpdate.month = formData.month;
    this.dateForUpdate.year = formData.year;
    console.log("dateForUpdate ", this.dateForUpdate);

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
        this.incomesData = data.incomes;
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
          this.openEditRow(row)
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
      .subscribe(({ data, role }) => {
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

 

  private handleTableData(data: ITransactionData[]) {
    const rows = [];
    //let rows: any[];
    if (data.length) {
      console.log("data: ", data);

      data.forEach((row: ITransactionData) => {
        const { userId, taxPercent, vatPercent, ...data } = row;
        console.log("payment", data.paymentIdentifier);
        data.billDate = +data.billDate;
        data.payDate = +data.payDate;
        data.billName ? null : (data.billName = "זמני", this.checkClassifyBill = false);
        data.category ? null : data.category = "טרם סווג";
        data.subCategory ? null : data.subCategory = "טרם סווג";
        data.isRecognized ? data.isRecognized = "כן" : data.isRecognized = "לא"
        data.isEquipment ? data.isEquipment = "כן" : data.isEquipment = "לא"
        rows.push(data);
      }
      )
    }
    console.log("rows: ", rows);
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

  openEditRow(data: IRowDataTable): void {
    const editRowForm: FormGroup = this.formBuilder.group({
      [TransactionsOutcomesColumns.CATEGORY]: [data?.category || '', Validators.required],
      [TransactionsOutcomesColumns.SUBCATEGORY]: [data?.subCategory || '', Validators.required],
      [TransactionsOutcomesColumns.IS_RECOGNIZED]: [data?.isRecognized || '', Validators.required],
      [TransactionsOutcomesColumns.SUM]: [data?.sum || '', Validators.required],
      [TransactionsOutcomesColumns.TAX_PERCENT]: [data?.taxPercent || ''],
      [TransactionsOutcomesColumns.VAT_PERCENT]: [data?.vatPercent || ''],
      [TransactionsOutcomesColumns.BILL_DATE]: [this.dateService.convertTimestampToDateInput(+data?.billDate) || Date, Validators.required,],
      [TransactionsOutcomesColumns.BILL_NAME]: [data?.billName || '', Validators.required,],
      [TransactionsOutcomesColumns.IS_EQUIPMENT]: [data?.isEquipment || false, Validators.required], // TODO
      [TransactionsOutcomesColumns.REDUCTION_PERCENT]: [data?.reductionPercent || 0],
      [TransactionsOutcomesColumns.NAME]: [data?.name || 0],
      [TransactionsOutcomesColumns.BILL_NUMBER]: [data?.paymentIdentifier || 0],
    });
    const disabledFields = [TransactionsOutcomesColumns.BILL_NAME, TransactionsOutcomesColumns.BILL_NUMBER, TransactionsOutcomesColumns.SUM, TransactionsOutcomesColumns.NAME];
    from(this.modalController.create({

      component: editRowComponent,
      componentProps: {
        date: this.dateForUpdate,
        data,
        fields: this.editFieldsNamesExpenses,
        parentForm: editRowForm,
        disabledFields
      },
      cssClass: 'edit-row-modal'
    }))
      .pipe(
        catchError((err) => {
          alert("openEditTransaction error");
          return EMPTY;
        }),
        switchMap((modal) => from(modal.present())
        .pipe(
          switchMap(() => from(modal.onWillDismiss())
          .pipe(
             tap(() => this.getTransactions()) 
            )
          )
        )),
        catchError((err) => {
          alert("openEditTransaction switchMap error");
          console.log(err);
          return EMPTY;
        }))
      .subscribe(() => {
      });
  }

  openAddTransaction(event): void {
    from(this.modalController.create({

      component: AddTransactionComponent,
      componentProps: {
        date: this.dateForUpdate,
        data: event,
      },
      cssClass: 'expense-modal'
    }))
      .pipe(
        catchError((err) => {
          alert("openAddTransaction error");
          return EMPTY;
        }),
        switchMap((modal) => from(modal.present())
        .pipe(
          switchMap(() => from(modal.onWillDismiss())
          .pipe(
             tap(() => this.getTransactions()) 
            )
          )
        )),
        catchError((err) => {
          alert("openAddTransaction switchMap error");
          console.log(err);
          return EMPTY;
        }))
      .subscribe(() => {
      });
  }


  saveTransaction(): void {
    console.log("save transaction");

  }

  onClickedCell(event: { str: string, data: IRowDataTable }): void {
    console.log(event);
    if (event.str === "bill") {
      this.openAddBill(event.data);
    }
    else {
      event.data.billName === "זמני" ? alert("לפני סיווג קטגוריה יש לשייך אמצעי תשלום לחשבון") : this.openAddTransaction(event.data);
    }
  }

  openFlowReport(): void {
    const details = {
      date: this.dateForUpdate,

    }
    this.router.navigate(['flow-report'], {queryParams: { 
      month: this.dateForUpdate.month, 
      year: this.dateForUpdate.year, 
      isSingleMonth: this.dateForUpdate.isSingleMonth, 
      accounts: 'null'
    }})
  }



}