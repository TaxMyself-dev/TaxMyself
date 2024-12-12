import { Component, OnInit, inject } from '@angular/core';
import { TransactionsService } from './transactions.page.service';
import { BehaviorSubject, EMPTY, catchError, from, map, switchMap, tap, zip, Subject, takeUntil } from 'rxjs';
import { IClassifyTrans, IColumnDataTable, IGetSubCategory, IRowDataTable, ISelectItem, ITableRowAction, ITransactionData, IUserDate } from 'src/app/shared/interface';
import { FormTypes, ICellRenderer, TransactionsOutcomesColumns, TransactionsOutcomesHebrewColumns } from 'src/app/shared/enums';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { AddBillComponent } from 'src/app/shared/add-bill/add-bill.component';
import { ModalController } from '@ionic/angular';
import { AddTransactionComponent } from 'src/app/shared/add-transaction/add-transaction.component';
import { Router } from '@angular/router';
import { editRowComponent } from 'src/app/shared/edit-row/edit-row.component';
import { DateService } from 'src/app/services/date.service';
import { ExpenseDataService } from 'src/app/services/expense-data.service';
import { ButtonClass, ButtonSize } from 'src/app/shared/button/button.enum';
import { GenericService } from 'src/app/services/generic.service';
import { ReportingPeriodType } from 'src/app/shared/enums';
import { AuthService } from 'src/app/services/auth.service';
import { PopupSelectComponent } from 'src/app/shared/popup-select/popup-select.component';

@Component({
  selector: 'app-transactions',
  templateUrl: './transactions.page.html',
  styleUrls: ['./transactions.page.scss', '../../shared/shared-styling.scss'],
})

export class TransactionsPage implements OnInit {

  equipmentList: ISelectItem[] = [{ name: "לא", value: 0 }, { name: "כן", value: 1 }];
  incomesData$ = new BehaviorSubject<IRowDataTable[]>(null);
  expensesData$ = new BehaviorSubject<IRowDataTable[]>(null);
  destroy$ = new Subject<void>();
  reportingPeriodType = ReportingPeriodType;
  bussinesesList: ISelectItem[] = [];




  editFieldsNamesExpenses: IColumnDataTable<TransactionsOutcomesColumns, TransactionsOutcomesHebrewColumns>[] = [
    { name: TransactionsOutcomesColumns.NAME, value: TransactionsOutcomesHebrewColumns.name, type: FormTypes.TEXT },
    { name: TransactionsOutcomesColumns.BILL_NUMBER, value: TransactionsOutcomesHebrewColumns.paymentIdentifier, type: FormTypes.TEXT },
    { name: TransactionsOutcomesColumns.BILL_NAME, value: TransactionsOutcomesHebrewColumns.billName, type: FormTypes.TEXT, cellRenderer: ICellRenderer.BILL },
    { name: TransactionsOutcomesColumns.CATEGORY, value: TransactionsOutcomesHebrewColumns.category, type: FormTypes.TEXT, cellRenderer: ICellRenderer.CATEGORY },
    { name: TransactionsOutcomesColumns.SUBCATEGORY, value: TransactionsOutcomesHebrewColumns.subCategory, type: FormTypes.TEXT, cellRenderer: ICellRenderer.SUBCATEGORY },
    { name: TransactionsOutcomesColumns.SUM, value: TransactionsOutcomesHebrewColumns.sum, type: FormTypes.NUMBER },
    { name: TransactionsOutcomesColumns.BILL_DATE, value: TransactionsOutcomesHebrewColumns.billDate, type: FormTypes.DATE },
    { name: TransactionsOutcomesColumns.IS_RECOGNIZED, value: TransactionsOutcomesHebrewColumns.isRecognized, type: FormTypes.DDL, listItems: this.equipmentList },
    { name: TransactionsOutcomesColumns.IS_EQUIPMENT, value: TransactionsOutcomesHebrewColumns.isEquipment, type: FormTypes.DDL, listItems: this.equipmentList },
    { name: TransactionsOutcomesColumns.REDUCTION_PERCENT, value: TransactionsOutcomesHebrewColumns.reductionPercent, type: FormTypes.NUMBER },
    { name: TransactionsOutcomesColumns.TAX_PERCENT, value: TransactionsOutcomesHebrewColumns.totalTax, type: FormTypes.NUMBER },
    { name: TransactionsOutcomesColumns.VAT_PERCENT, value: TransactionsOutcomesHebrewColumns.totalVat, type: FormTypes.NUMBER },
    { name: TransactionsOutcomesColumns.BUSINESS_NUMBER, value: TransactionsOutcomesHebrewColumns.businessNumber, type: FormTypes.DDL, listItems: this.bussinesesList },
  ];

  fieldsNamesIncome: IColumnDataTable<TransactionsOutcomesColumns, TransactionsOutcomesHebrewColumns>[] = [
    { name: TransactionsOutcomesColumns.NAME, value: TransactionsOutcomesHebrewColumns.name, type: FormTypes.TEXT },
    { name: TransactionsOutcomesColumns.BILL_NUMBER, value: TransactionsOutcomesHebrewColumns.paymentIdentifier, type: FormTypes.NUMBER, },
    { name: TransactionsOutcomesColumns.BILL_NAME, value: TransactionsOutcomesHebrewColumns.billName, type: FormTypes.TEXT, cellRenderer: ICellRenderer.BILL },
    { name: TransactionsOutcomesColumns.CATEGORY, value: TransactionsOutcomesHebrewColumns.category, type: FormTypes.TEXT, cellRenderer: ICellRenderer.CATEGORY },
    { name: TransactionsOutcomesColumns.SUBCATEGORY, value: TransactionsOutcomesHebrewColumns.subCategory, type: FormTypes.DDL },
    { name: TransactionsOutcomesColumns.SUM, value: TransactionsOutcomesHebrewColumns.sum, type: FormTypes.TEXT },
    { name: TransactionsOutcomesColumns.BILL_DATE, value: TransactionsOutcomesHebrewColumns.billDate, type: FormTypes.DATE },
    { name: TransactionsOutcomesColumns.MONTH_REPORT, value: TransactionsOutcomesHebrewColumns.monthReport, type: FormTypes.TEXT },
    { name: TransactionsOutcomesColumns.NOTE, value: TransactionsOutcomesHebrewColumns.note, type: FormTypes.TEXT },
  ];

  fieldsNamesExpenses: IColumnDataTable<TransactionsOutcomesColumns, TransactionsOutcomesHebrewColumns>[] = [
    { name: TransactionsOutcomesColumns.NAME, value: TransactionsOutcomesHebrewColumns.name, type: FormTypes.TEXT },
    { name: TransactionsOutcomesColumns.BILL_NUMBER, value: TransactionsOutcomesHebrewColumns.paymentIdentifier, type: FormTypes.NUMBER },
    { name: TransactionsOutcomesColumns.BILL_NAME, value: TransactionsOutcomesHebrewColumns.billName, type: FormTypes.TEXT, cellRenderer: ICellRenderer.BILL },
    { name: TransactionsOutcomesColumns.CATEGORY, value: TransactionsOutcomesHebrewColumns.category, type: FormTypes.TEXT, cellRenderer: ICellRenderer.CATEGORY },
    { name: TransactionsOutcomesColumns.SUBCATEGORY, value: TransactionsOutcomesHebrewColumns.subCategory, type: FormTypes.TEXT, cellRenderer: ICellRenderer.SUBCATEGORY },
    { name: TransactionsOutcomesColumns.SUM, value: TransactionsOutcomesHebrewColumns.sum, type: FormTypes.NUMBER },
    { name: TransactionsOutcomesColumns.BILL_DATE, value: TransactionsOutcomesHebrewColumns.billDate, type: FormTypes.DATE, cellRenderer: ICellRenderer.DATE },
    // { name: TransactionsOutcomesColumns.PAY_DATE, value: TransactionsOutcomesHebrewColumns.payDate, type: FormTypes.DATE, cellRenderer: ICellRenderer.DATE },
    { name: TransactionsOutcomesColumns.IS_RECOGNIZED, value: TransactionsOutcomesHebrewColumns.isRecognized, type: FormTypes.TEXT },
    { name: TransactionsOutcomesColumns.MONTH_REPORT, value: TransactionsOutcomesHebrewColumns.monthReport, type: FormTypes.TEXT },
    { name: TransactionsOutcomesColumns.NOTE, value: TransactionsOutcomesHebrewColumns.note, type: FormTypes.TEXT },
  ];

  readonly specialColumnsCellRendering = new Map<TransactionsOutcomesColumns, ICellRenderer>([
    [TransactionsOutcomesColumns.CATEGORY, ICellRenderer.CATEGORY],
    [TransactionsOutcomesColumns.SUBCATEGORY, ICellRenderer.SUBCATEGORY],
    [TransactionsOutcomesColumns.BILL_NAME, ICellRenderer.BILL],
    [TransactionsOutcomesColumns.BILL_DATE, ICellRenderer.DATE],
    [TransactionsOutcomesColumns.PAY_DATE, ICellRenderer.DATE]
  ]);

  readonly COLUMNS_WIDTH_INCOME = new Map<TransactionsOutcomesColumns, number>([
    [TransactionsOutcomesColumns.NAME, 1.3],
    [TransactionsOutcomesColumns.CATEGORY, 1.3],
    [TransactionsOutcomesColumns.SUBCATEGORY, 1.3],
    [TransactionsOutcomesColumns.BILL_DATE, 1.4],
    [TransactionsOutcomesColumns.BILL_NUMBER, 1.3],
    [TransactionsOutcomesColumns.BILL_NAME, 1.2],
    [TransactionsOutcomesColumns.MONTH_REPORT, 1],
    [TransactionsOutcomesColumns.SUM, 1.2],
    [TransactionsOutcomesColumns.ACTIONS, 1],
    [TransactionsOutcomesColumns.BUSINESS_NAME, 1],
    [TransactionsOutcomesColumns.NOTE, 1],
  ]);

  readonly COLUMNS_WIDTH_EXPENSES = new Map<TransactionsOutcomesColumns, number>([
    [TransactionsOutcomesColumns.NAME, 1.2],
    [TransactionsOutcomesColumns.BILL_NUMBER, 1],
    [TransactionsOutcomesColumns.BILL_NAME, 1],
    [TransactionsOutcomesColumns.CATEGORY, 1.3],
    [TransactionsOutcomesColumns.SUBCATEGORY, 1.2],
    [TransactionsOutcomesColumns.SUM, 1],
    [TransactionsOutcomesColumns.BILL_DATE, 1.3],
    [TransactionsOutcomesColumns.IS_RECOGNIZED, 1],
    [TransactionsOutcomesColumns.MONTH_REPORT, 1],
    [TransactionsOutcomesColumns.BUSINESS_NAME, 1],
    [TransactionsOutcomesColumns.ACTIONS, 1],
    [TransactionsOutcomesColumns.NOTE, 1],
  ]);

  public COLUMNS_TO_IGNORE_EXPENSES = ['finsiteId', 'businessNumber', 'id', 'payDate', 'isEquipment', 'reductionPercent', 'taxPercent', 'vatPercent'];
  // public COLUMNS_TO_SHOW_EXPENSES = ['businessNumber', 'id', 'payDate', 'isEquipment', 'reductionPercent', 'taxPercent', 'vatPercent'];
  public COLUMNS_TO_IGNORE_INCOMES = ['finsiteId', 'businessNumber', 'id', 'payDate', 'isRecognized', 'isEquipment', 'reductionPercent', 'taxPercent', 'vatPercent'];
  readonly buttonSize = ButtonSize;
  readonly ButtonClass = ButtonClass;


  rows: IRowDataTable[];
  tableActionsExpense: ITableRowAction[];
  tableActionsIncomes: ITableRowAction[];
  typeIncomeList = [{ value: null, name: 'הכל' }, { value: 'classification', name: 'סווג' }, { value: 'notClassification', name: 'טרם סווג' }];
  transactionsForm: FormGroup;
  incomeForm: FormGroup;
  expensesForm: FormGroup;
  editRowExpenseForm: FormGroup;
  editRowIncomeForm: FormGroup;
  isOpen: boolean = false;
  incomesData: IRowDataTable[] = [];
  expensesData: IRowDataTable[];
  addPayment: boolean = false;
  selectBill: string;
  accountsList: any[] = [];
  sourcesList: string[] = [];
  selectedFile: File = null;
  dateForUpdate = { 'startDate': "", 'endDate': "" };
  checkClassifyBill: boolean = true;
  listCategory: ISelectItem[];
  listFilterCategory: ISelectItem[] = [{ value: null, name: 'הכל' }];
  originalSubCategoryList: IGetSubCategory[];
  expenseDataService = inject(ExpenseDataService);
  myIcon: string;
  isToastOpen: boolean = false;
  messageToast: string = "";
  filterByExpense: string = "";
  filterByIncome: string = "";
  userData: IUserDate;
  businessSelect: string = "";

  constructor(private router: Router, private formBuilder: FormBuilder, private modalController: ModalController, private dateService: DateService, private transactionService: TransactionsService, private authService: AuthService, private genericService: GenericService) {

    this.transactionsForm = this.formBuilder.group({
      reportingPeriodType: new FormControl(
        false, Validators.required,
      ),
      month: new FormControl(
        '', [],
      ),
      year: new FormControl(
        '', [],
      ),
      startDate: new FormControl(
        '', [],
      ),
      endDate: new FormControl(
        '', [],
      ),
      accounts: new FormControl(
        '', Validators.required,
      )
    });

    this.incomeForm = this.formBuilder.group({
      incomeType: new FormControl(
        null,
      ),
      category: new FormControl(
        null,
      ),
    });

    this.expensesForm = this.formBuilder.group({
      expensesType: new FormControl(
        null,
      ),
      category: new FormControl(
        null,
      ),
    })

    this.editRowExpenseForm = this.formBuilder.group({
      [TransactionsOutcomesColumns.CATEGORY]: [0, Validators.required],
      [TransactionsOutcomesColumns.SUBCATEGORY]: [0, Validators.required],
      [TransactionsOutcomesColumns.IS_RECOGNIZED]: [0, Validators.required],
      [TransactionsOutcomesColumns.SUM]: ['', Validators.required],
      [TransactionsOutcomesColumns.TAX_PERCENT]: [0],
      [TransactionsOutcomesColumns.VAT_PERCENT]: [0],
      [TransactionsOutcomesColumns.BILL_DATE]: [Date, Validators.required,],
      [TransactionsOutcomesColumns.BILL_NAME]: ['', Validators.required,],
      [TransactionsOutcomesColumns.IS_EQUIPMENT]: [0, Validators.required],
      [TransactionsOutcomesColumns.REDUCTION_PERCENT]: [0],
      [TransactionsOutcomesColumns.NAME]: [''],
      [TransactionsOutcomesColumns.BILL_NUMBER]: [''],
      [TransactionsOutcomesColumns.BUSINESS_NUMBER]: ['', Validators.required],
    });

    this.editRowIncomeForm = this.formBuilder.group({
      [TransactionsOutcomesColumns.NAME]: [''],
      [TransactionsOutcomesColumns.BILL_NUMBER]: [''],
      [TransactionsOutcomesColumns.BILL_NAME]: ['', Validators.required,],
      [TransactionsOutcomesColumns.CATEGORY]: [0, Validators.required],
      [TransactionsOutcomesColumns.SUBCATEGORY]: [0, Validators.required],
      [TransactionsOutcomesColumns.SUM]: ['', Validators.required],
      [TransactionsOutcomesColumns.BILL_DATE]: [Date, Validators.required,],
      [TransactionsOutcomesColumns.MONTH_REPORT]: ['', Validators.required],
      [TransactionsOutcomesColumns.BUSINESS_NUMBER]: ['', Validators.required],
    });
  }


  ngOnInit(): void {
    this.userData = this.authService.getUserDataFromLocalStorage();
    this.bussinesesList.push({ name: this.userData?.businessName, value: this.userData.businessNumber }, { name: this.userData.spouseBusinessName, value: this.userData.spouseBusinessNumber }
    )
    console.log(this.userData);

    if (this.userData.isTwoBusinessOwner) {
      //------------ expenses -------------
      this.fieldsNamesExpenses.push({ name: TransactionsOutcomesColumns.BUSINESS_NAME, value: TransactionsOutcomesHebrewColumns.businessName, type: FormTypes.TEXT });
      const expenseIndex = this.COLUMNS_TO_IGNORE_EXPENSES.indexOf('businessNumber');
      if (expenseIndex > -1) {
        this.COLUMNS_TO_IGNORE_EXPENSES.splice(expenseIndex, 1);
      }
      this.COLUMNS_WIDTH_EXPENSES.set(TransactionsOutcomesColumns.NAME, 1)
      this.COLUMNS_WIDTH_EXPENSES.set(TransactionsOutcomesColumns.CATEGORY, 1)
      this.COLUMNS_WIDTH_EXPENSES.set(TransactionsOutcomesColumns.SUBCATEGORY, 1)
      this.COLUMNS_WIDTH_EXPENSES.set(TransactionsOutcomesColumns.BILL_DATE, 1);

      //------------ incomes -------------
      this.fieldsNamesIncome.push({ name: TransactionsOutcomesColumns.BUSINESS_NAME, value: TransactionsOutcomesHebrewColumns.businessName, type: FormTypes.TEXT });
      const inomeIndex = this.COLUMNS_TO_IGNORE_INCOMES.indexOf('businessNumber');
      if (inomeIndex > -1) {
        this.COLUMNS_TO_IGNORE_INCOMES.splice(inomeIndex, 1); // Remove 1 element at the found index
      }
      this.COLUMNS_WIDTH_INCOME.set(TransactionsOutcomesColumns.BILL_DATE, 1.2);
      this.COLUMNS_WIDTH_INCOME.set(TransactionsOutcomesColumns.NAME, 1.2);
      this.COLUMNS_WIDTH_INCOME.set(TransactionsOutcomesColumns.BILL_NUMBER, 1.2);
      this.COLUMNS_WIDTH_INCOME.set(TransactionsOutcomesColumns.BILL_NAME, 1.2);
      this.COLUMNS_WIDTH_INCOME.set(TransactionsOutcomesColumns.CATEGORY, 1.1)
      this.COLUMNS_WIDTH_INCOME.set(TransactionsOutcomesColumns.SUBCATEGORY, 1.1);
      this.COLUMNS_WIDTH_INCOME.set(TransactionsOutcomesColumns.SUM, 1);
    }

    this.setTableActions();
    this.transactionService.getAllBills();
    this.transactionService.accountsList$.pipe(takeUntil(this.destroy$)).subscribe(
      (accountsList) => {
        this.accountsList = accountsList;
      }
    );
    this.getCategory();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  setFormValidators(event): void {
    console.log("event in perid type transaction: ", event.value);
    switch (event.value) {
      case this.reportingPeriodType.ANNUAL:
        this.transactionsForm.controls['month']?.setValidators([]);// for reset month control
        this.transactionsForm.controls['startDate']?.setValidators([]);// for reset month control
        this.transactionsForm.controls['endDate']?.setValidators([]);// for reset month control
        this.transactionsForm.controls['year']?.setValidators([Validators.required]);
        // this.transactionsForm.controls['year']?.updateValueAndValidity();
        Object.values(this.transactionsForm.controls).forEach((control) => {
          control.updateValueAndValidity();

        });
        console.log(this.transactionsForm);
        break;

      case this.reportingPeriodType.DATE_RANGE:
        this.transactionsForm.controls['year']?.setValidators([]);// for reset year control
        this.transactionsForm.controls['month']?.setValidators([]);// for reset month control
        this.transactionsForm.controls['startDate']?.setValidators([Validators.required]);
        this.transactionsForm.controls['startDate']?.updateValueAndValidity();
        this.transactionsForm.controls['endDate']?.setValidators([Validators.required]);
        // this.transactionsForm.controls['endDate']?.updateValueAndValidity();
        Object.values(this.transactionsForm.controls).forEach((control) => {
          control.updateValueAndValidity();
        });
        console.log(this.transactionsForm);
        break;

      case this.reportingPeriodType.BIMONTHLY:
      case this.reportingPeriodType.MONTHLY:
        this.transactionsForm.controls['startDate']?.setValidators([]);
        this.transactionsForm.controls['endDate']?.setValidators([]);
        this.transactionsForm.controls['month']?.setValidators([Validators.required]);
        this.transactionsForm.controls['year']?.setValidators([Validators.required]);
        Object.values(this.transactionsForm.controls).forEach((control) => {
          control.updateValueAndValidity();
        });
        console.log(this.transactionsForm);
    }

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

    const { startDate, endDate } = this.dateService.getStartAndEndDates(formData.reportingPeriodType, formData.year, formData.month, null, null);
    this.dateForUpdate.startDate = startDate;
    this.dateForUpdate.endDate = endDate;

    const incomeData$ = this.transactionService.getIncomeTransactionsData(startDate, endDate, formData.accounts);

    const expensesData$ = this.transactionService.getExpenseTransactionsData(startDate, endDate, formData.accounts);

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
        console.log("income: ", this.incomesData);

        this.expensesData = data.expenses;
        console.log("expense: ", this.expensesData);
        this.incomesData$.next(this.incomesData);
        this.filterIncomes(); // for after update table the table will stay filtered according to the search-bar
        this.expensesData$.next(data.expenses);
        this.filterExpenses(); // for after update table the table will stay filtered according to the search-bar
      });
  }

  getExpensesData(): void {
    const formData = this.transactionsForm.value;
    const { startDate, endDate } = this.dateService.getStartAndEndDates(formData.reportingPeriodType, formData.year, formData.month, null, null);
    this.dateForUpdate.startDate = startDate;
    this.dateForUpdate.endDate = endDate;

    this.transactionService.getExpenseTransactionsData(startDate, endDate, formData.accounts).subscribe((res) => {
      this.expensesData$.next(this.handleTableData(res));
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
      'billDate',
      'isRecognized',
      'vatReportingDate',
      'note2',
      'businessName',
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

  setTableActions(): void {
    this.tableActionsExpense = [
      {
        name: 'delete',
        icon: 'create',
        action: (row: IRowDataTable) => {
          this.openEditRow(row)
        }
      },
    ];

    this.tableActionsIncomes = [
      {
        name: 'delete',
        icon: 'create',
        action: (row: IRowDataTable) => {
          this.openEditRow(row, false)
        }
      },
    ];
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
    })).pipe(
      takeUntil(this.destroy$),
      catchError((err) => {
        alert("openPopupAddBill error");
        return EMPTY;
      }),
      switchMap((modal) => from(modal.present())
        .pipe(
          takeUntil(this.destroy$),
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

  filterIncomes(): void {
    const formData = this.incomeForm.value;
    console.log(formData);

    const categoryName = this.listCategory?.find((category) => category.value === formData.category);

    if (!categoryName && !formData.incomeType) {
      this.incomesData$.next(this.incomesData.filter((income) => String(income.name).includes(this.filterByIncome)));
    }
    else if (!categoryName) {
      if (formData.incomeType === "notClassification") {
        this.incomesData$.next(this.incomesData.filter((income) => {
          return (income.category === "טרם סווג") && String(income.name).includes(this.filterByIncome);
        }
        ));
      }
      else {
        this.incomesData$.next(this.incomesData.filter((income) => {
          return (income.category !== "טרם סווג") && String(income.name).includes(this.filterByIncome);
        }));
      }
    }
    else if (!formData.incomeType) {
      this.incomesData$.next(this.incomesData.filter((income) => {
        return (income.category === categoryName.name) && (String(income.name).includes(this.filterByIncome));
      }));
    }
    else {
      if (formData.incomeType === "notClassification") {
        this.incomesData$.next(this.incomesData.filter((income) => {
          return (income.category === "טרם סווג" || income.category === categoryName.name) && (String(income.name).includes(this.filterByIncome));
        }));
      }
      else {
        this.incomesData$.next(this.incomesData.filter((income) => {
          return (income.category !== "טרם סווג" && income.category === categoryName.name) && (String(income.name).includes(this.filterByIncome));
        }));
      }

    }
  }

  filterExpenses(): void {
    const formData = this.expensesForm.value;

    const categoryName = this.listCategory?.find((category) => category.value === formData.category);

    if (!categoryName && !formData.expensesType) {
      this.expensesData$.next(this.expensesData.filter((expense) => String(expense.name).includes(this.filterByExpense)));
    }
    else if (!categoryName) {
      if (formData.expensesType === "notClassification") {
        this.expensesData$.next(this.expensesData.filter((expense) => {
          return ((expense.category === "טרם סווג") && String(expense.name).includes(this.filterByExpense));
        }));
      }
      else {
        this.expensesData$.next(this.expensesData.filter((expense) => {
          return (expense.category !== "טרם סווג") && String(expense.name).includes(this.filterByExpense);
        }));
      }
    }
    else if (!formData.expensesType) {
      this.expensesData$.next(this.expensesData.filter((expense) => {
        return (expense.category === categoryName.name) && (String(expense.name).includes(this.filterByExpense));
      }));
    }
    else {
      if (formData.expensesType === "notClassification") {
        this.expensesData$.next(this.expensesData.filter((expense) => {
          return (expense.category === "טרם סווג" || expense.category === categoryName.name) && (String(expense.name).includes(this.filterByExpense));
        }))
      }
      else {
        this.expensesData$.next(this.expensesData.filter((expense) => {
          return (expense.category !== "טרם סווג" && expense.category === categoryName.name) && (String(expense.name).includes(this.filterByExpense))
        }));
      }

    }
    //}
  }

  handleTableData(data: ITransactionData[]) {
    const rows = [];
    if (data.length) {
      console.log("data in hnadle data in transaction: ", data);

      data.forEach((row: ITransactionData) => {
        const { userId, ...data } = row;
        data.billName ? null : (data.billName = "זמני", this.checkClassifyBill = false);
        data.category ? null : data.category = "טרם סווג";
        data.subCategory ? null : data.subCategory = "טרם סווג";
        data.isRecognized ? data.isRecognized = "כן" : data.isRecognized = "לא"
        data.isEquipment ? data.isEquipment = "כן" : data.isEquipment = "לא"
        data.sum = String(Math.abs(Number(data.sum)));
        data.sum = this.genericService.addComma(data.sum);
        data.vatReportingDate ? null : data.vatReportingDate = "טרם דווח";
        data.businessNumber === this.userData.businessNumber ? data.businessNumber = this.userData.businessName : data.businessNumber = this.userData.spouseBusinessName

        rows.push(data);
      }
      )
    }
    return rows;
  }

  getCategory(): void {
    this.expenseDataService.getcategry(null)
      .pipe(
        takeUntil(this.destroy$),
        map((res) => {
          return res.map((item: any) => ({
            name: item.categoryName,
            value: item.categoryName
          })
          )
        }))
      .subscribe((res) => {
        this.listCategory = res;
        this.listFilterCategory.push(...res);
        this.editFieldsNamesExpenses.map((field: IColumnDataTable<TransactionsOutcomesColumns, TransactionsOutcomesHebrewColumns>) => {
          if (field.name === TransactionsOutcomesColumns.CATEGORY) {
            field.listItems = res;
          }
        });
      })
  }

  openEditRow(data: IRowDataTable, isExpense: boolean = true): void {
    let disabledFields: TransactionsOutcomesColumns[];
    const businessNumber = data.businessNumber === this.userData.businessNumber ? { name: this.userData.businessName, value: this.userData.businessNumber } : { name: this.userData.spouseBusinessName, value: this.userData.spouseBusinessNumber }
    console.log("data in open edit row: ", data);

    if (isExpense) {
      const isEquipmentEdit = data?.isEquipment === "לא" ? 0 : 1;
      const isRecognizedEdit = data?.isRecognized === "לא" ? 0 : 1;
      disabledFields = [TransactionsOutcomesColumns.BILL_NAME, TransactionsOutcomesColumns.BILL_NUMBER, TransactionsOutcomesColumns.SUM, TransactionsOutcomesColumns.NAME, TransactionsOutcomesColumns.BILL_DATE, TransactionsOutcomesColumns.CATEGORY, TransactionsOutcomesColumns.SUBCATEGORY];
      this.editRowExpenseForm.get(TransactionsOutcomesColumns.CATEGORY).patchValue(data?.category || '');
      this.editRowExpenseForm.get(TransactionsOutcomesColumns.SUBCATEGORY).patchValue(data?.subCategory || '');
      this.editRowExpenseForm.get(TransactionsOutcomesColumns.IS_RECOGNIZED).patchValue(isRecognizedEdit || 0),
        this.editRowExpenseForm.get(TransactionsOutcomesColumns.SUM).patchValue(data?.sum || ''),
        this.editRowExpenseForm.get(TransactionsOutcomesColumns.TAX_PERCENT).patchValue(data?.taxPercent || ''),
        this.editRowExpenseForm.get(TransactionsOutcomesColumns.VAT_PERCENT).patchValue(data?.vatPercent === 0 ? 0 : ""),
        this.editRowExpenseForm.get(TransactionsOutcomesColumns.BILL_DATE).patchValue(data?.billDate || Date),
        this.editRowExpenseForm.get(TransactionsOutcomesColumns.BILL_NAME).patchValue(data?.billName || ''),
        this.editRowExpenseForm.get(TransactionsOutcomesColumns.IS_EQUIPMENT).patchValue(isEquipmentEdit || 0),
        this.editRowExpenseForm.get(TransactionsOutcomesColumns.REDUCTION_PERCENT).patchValue(data?.reductionPercent || 0),
        this.editRowExpenseForm.get(TransactionsOutcomesColumns.NAME).patchValue(data?.name || 0),
        this.editRowExpenseForm.get(TransactionsOutcomesColumns.BILL_NUMBER).patchValue(data?.paymentIdentifier || 0);
      this.editRowExpenseForm.get(TransactionsOutcomesColumns.BUSINESS_NUMBER).patchValue(businessNumber.value || '');

    }
    else {
      const businessNameColumn = this.fieldsNamesIncome.find(
        (column) => column.name === TransactionsOutcomesColumns.BUSINESS_NAME
      );

      if (businessNameColumn) {
        businessNameColumn.type = FormTypes.DDL; // Set the new type
      }
      disabledFields = [TransactionsOutcomesColumns.BILL_NAME, TransactionsOutcomesColumns.BILL_NUMBER, TransactionsOutcomesColumns.SUM, TransactionsOutcomesColumns.NAME, TransactionsOutcomesColumns.BILL_DATE, TransactionsOutcomesColumns.CATEGORY, TransactionsOutcomesColumns.SUBCATEGORY, TransactionsOutcomesColumns.MONTH_REPORT];
      this.editRowIncomeForm.get(TransactionsOutcomesColumns.CATEGORY).patchValue(data?.category || '');
      this.editRowIncomeForm.get(TransactionsOutcomesColumns.SUBCATEGORY).patchValue(data?.subCategory || '');
      this.editRowIncomeForm.get(TransactionsOutcomesColumns.SUM).patchValue(data?.sum || ''),
        this.editRowIncomeForm.get(TransactionsOutcomesColumns.BILL_DATE).patchValue(data?.billDate || Date),
        this.editRowIncomeForm.get(TransactionsOutcomesColumns.BILL_NAME).patchValue(data?.billName || ''),
        this.editRowIncomeForm.get(TransactionsOutcomesColumns.NAME).patchValue(data?.name || 0),
        this.editRowIncomeForm.get(TransactionsOutcomesColumns.BILL_NUMBER).patchValue(data?.paymentIdentifier || 0);
      this.editRowIncomeForm.get(TransactionsOutcomesColumns.BUSINESS_NUMBER).patchValue(businessNumber.value || '');
      this.editRowIncomeForm.get(TransactionsOutcomesColumns.MONTH_REPORT).patchValue(data.vatReportingDate || '');

    }




    if (data.category !== "טרם סווג" && data.category !== undefined) {
      from(this.modalController.create({
        component: editRowComponent,
        componentProps: {
          data,
          fields: isExpense ? this.editFieldsNamesExpenses : this.fieldsNamesIncome,
          parentForm: isExpense ? this.editRowExpenseForm : this.editRowIncomeForm,
          disabledFields
        },
        cssClass: 'edit-row-modal',
      }))
        .pipe(
          takeUntil(this.destroy$),
          catchError((err) => {
            alert("open Edit Row error");
            console.log("open Edit Row error: ", err);
            return EMPTY;
          }),
          switchMap((modal) => from(modal.present())
            .pipe(
              takeUntil(this.destroy$),
              switchMap(() => from(modal.onWillDismiss())
                .pipe(
                  takeUntil(this.destroy$),
                  tap((data) => {
                    if (data.role != 'backdrop' && data.role != 'cancel') {
                      this.getTransactions()
                    }
                  })
                )
              )
            )),
          catchError((err) => {
            alert("open Edit row switchMap error");
            console.log("open Edit row switchMap error: ", err);
            return EMPTY;
          }))
        .subscribe((res) => {
          if (res.role == 'send') {
            this.updateRow(res.data.id)
          }
        });
    }
    else {
      alert("חובה לסווג תנועה כדי לאפשר עריכה")
    }
  }

  updateRow(id: number): void {
    let formData: IClassifyTrans = this.editRowExpenseForm.getRawValue();
    console.log("edit row form: ", formData);

    formData.id = id;
    formData.isEquipment ? formData.isEquipment = true : formData.isEquipment = false;
    formData.isRecognized ? formData.isRecognized = true : formData.isRecognized = false;
    formData.isSingleUpdate = true;
    formData.isNewCategory = false;
    formData.vatPercent = +formData.vatPercent;
    formData.taxPercent = +formData.taxPercent;
    formData.reductionPercent = +formData.reductionPercent;

    this.transactionService.updateRow(formData).pipe(takeUntil(this.destroy$)).subscribe((res) => this.getExpensesData());
  }

  openAddTransaction(event, isExpense: boolean): void {
    from(this.modalController.create({

      component: AddTransactionComponent,
      componentProps: {
        date: this.dateForUpdate,
        data: event,
        incomeMode: !isExpense
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
                tap((data) => {
                  if (data.role != 'backdrop' && data.role != 'cancel') {
                    this.getTransactions()
                  }
                })
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

  onClickedCell(event: { str: string, data: IRowDataTable }, isExpense: boolean = true): void {
    if (event.str === "bill") {
      this.openAddBill(event.data);
    }
    else {
      event.data.billName === "זמני" ? alert("לפני סיווג קטגוריה יש לשייך אמצעי תשלום לחשבון") : this.openAddTransaction(event.data, isExpense);
    }
  }

  openPopupSelect(): void {
    from(this.modalController.create({
      component: PopupSelectComponent,
      componentProps: {
        message: "עבור איזה עסק אתה רוצה להפיק דוח?",
        options: this.bussinesesList,
      },
      cssClass: 'popup-select'
    }))
      .pipe(
        catchError((err) => {
          alert("create popup select error");
          return EMPTY;
        }),
        switchMap((modal) => from(modal.present())
          .pipe(
            catchError((err) => {
              alert("present popup select error");
              console.log(err);
              return EMPTY;
            }),
            switchMap(() => from(modal.onWillDismiss())
              .pipe(
                catchError((err) => {
                  console.log("err in close popup select: ", err);
                  return EMPTY;
                })
              ))
          )))
      .subscribe((res) => {
        this.businessSelect = res.data;
        console.log("businessSelect: ", this.businessSelect);

        console.log("res of popup select: ", res);
        if (res.role === 'success') {
          this.openFlowReport();
        }
      });
  }

  openFlowReport(): void {
    if (!this.userData.isTwoBusinessOwner) {
      this.businessSelect = this.userData.businessNumber;
    }
    this.router.navigate(['flow-report'], {
      queryParams: {
        startDate: this.dateForUpdate.startDate,
        endDate: this.dateForUpdate.endDate,
        businessNumber: this.businessSelect,
        accounts: 'null'
      }
    })
  }

  setOpenToast(): void {
    this.isToastOpen = false;
  }

  filterByExpenses(event: string): void {
    this.filterByExpense = event;
    this.filterExpenses()
  }

  filterByIncomes(event: string): void {
    this.filterByIncome = event;
    this.filterIncomes()
  }

}