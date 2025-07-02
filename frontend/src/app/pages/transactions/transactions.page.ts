import { Component, OnInit, WritableSignal, inject, signal } from '@angular/core';
import { TransactionsService } from './transactions.page.service';
import { BehaviorSubject, EMPTY, catchError, from, map, switchMap, tap, zip, Subject, takeUntil, finalize } from 'rxjs';
import { IClassifyTrans, IColumnDataTable, IGetSubCategory, IRowDataTable, ISelectItem, ITableRowAction, ITransactionData, IUserData } from 'src/app/shared/interface';
import { bunnerImagePosition, FormTypes, ICellRenderer, TransactionsOutcomesColumns, TransactionsOutcomesHebrewColumns } from 'src/app/shared/enums';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
// import { AddBillComponent } from 'src/app/shared/add-bill/add-bill.component';
import { AddBillComponent } from 'src/app/components/add-bill/add-bill.component';
import { ModalController } from '@ionic/angular';
import { AddTransactionComponent } from 'src/app/shared/add-transaction/add-transaction.component';
import { Router } from '@angular/router';
import { editRowComponent } from 'src/app/shared/edit-row/edit-row.component';
import { DateService } from 'src/app/services/date.service';
import { ExpenseDataService } from 'src/app/services/expense-data.service';
import { ButtonColor, ButtonSize } from '../../components/button/button.enum';
import { GenericService } from 'src/app/services/generic.service';
import { ReportingPeriodType } from 'src/app/shared/enums';
import { AuthService } from 'src/app/services/auth.service';
import { PopupSelectComponent } from 'src/app/shared/popup-select/popup-select.component';
import { ButtonClass } from 'src/app/shared/button/button.enum';
// import { CheckboxModule } from 'primeng/checkbox';

@Component({
  selector: 'app-transactions',
  templateUrl: './transactions.page.html',
  styleUrls: ['./transactions.page.scss', '../../shared/shared-styling.scss'],
  standalone: false
})

export class TransactionsPage implements OnInit {

  equipmentList: ISelectItem[] = [{ name: "לא", value: 0 }, { name: "כן", value: 1 }];
  incomesData$ = new BehaviorSubject<IRowDataTable[]>(null);
  expensesData$ = new BehaviorSubject<IRowDataTable[]>(null);
  destroy$ = new Subject<void>();
  reportingPeriodType = ReportingPeriodType;
  bussinesesList: ISelectItem[] = [];




  editFieldsNamesExpenses: IColumnDataTable<TransactionsOutcomesColumns, TransactionsOutcomesHebrewColumns>[] = [
    { name: TransactionsOutcomesColumns.BUSINESS_NUMBER, value: TransactionsOutcomesHebrewColumns.businessNumber, type: FormTypes.DDL, listItems: this.bussinesesList },
    { name: TransactionsOutcomesColumns.IS_RECOGNIZED, value: TransactionsOutcomesHebrewColumns.isRecognized, type: FormTypes.DDL, listItems: this.equipmentList },
    { name: TransactionsOutcomesColumns.IS_EQUIPMENT, value: TransactionsOutcomesHebrewColumns.isEquipment, type: FormTypes.DDL, listItems: this.equipmentList },
    { name: TransactionsOutcomesColumns.REDUCTION_PERCENT, value: TransactionsOutcomesHebrewColumns.reductionPercent, type: FormTypes.NUMBER },
    { name: TransactionsOutcomesColumns.TAX_PERCENT, value: TransactionsOutcomesHebrewColumns.totalTax, type: FormTypes.NUMBER },
    { name: TransactionsOutcomesColumns.VAT_PERCENT, value: TransactionsOutcomesHebrewColumns.totalVat, type: FormTypes.NUMBER },
    { name: TransactionsOutcomesColumns.NAME, value: TransactionsOutcomesHebrewColumns.name, type: FormTypes.TEXT },
    { name: TransactionsOutcomesColumns.BILL_NUMBER, value: TransactionsOutcomesHebrewColumns.paymentIdentifier, type: FormTypes.TEXT },
    { name: TransactionsOutcomesColumns.BILL_NAME, value: TransactionsOutcomesHebrewColumns.billName, type: FormTypes.TEXT, cellRenderer: ICellRenderer.BILL },
    { name: TransactionsOutcomesColumns.CATEGORY, value: TransactionsOutcomesHebrewColumns.category, type: FormTypes.TEXT, cellRenderer: ICellRenderer.CATEGORY },
    { name: TransactionsOutcomesColumns.SUBCATEGORY, value: TransactionsOutcomesHebrewColumns.subCategory, type: FormTypes.TEXT, cellRenderer: ICellRenderer.SUBCATEGORY },
    { name: TransactionsOutcomesColumns.SUM, value: TransactionsOutcomesHebrewColumns.sum, type: FormTypes.NUMBER },
    { name: TransactionsOutcomesColumns.BILL_DATE, value: TransactionsOutcomesHebrewColumns.billDate, type: FormTypes.DATE },
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
    // { name: TransactionsOutcomesColumns.BUSINESS_NUMBER, value: TransactionsOutcomesHebrewColumns.businessNumber, type: FormTypes.TEXT },
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
    [TransactionsOutcomesColumns.BILL_NUMBER, 1.3],
    [TransactionsOutcomesColumns.BILL_NAME, 1.2],
    [TransactionsOutcomesColumns.CATEGORY, 1.3],
    [TransactionsOutcomesColumns.SUBCATEGORY, 1.3],
    [TransactionsOutcomesColumns.BILL_DATE, 1.4],
    [TransactionsOutcomesColumns.MONTH_REPORT, 1],
    [TransactionsOutcomesColumns.SUM, 1.2],
    // [TransactionsOutcomesColumns.ACTIONS, 1],
    // [TransactionsOutcomesColumns.BUSINESS_NAME, 1],
    [TransactionsOutcomesColumns.NOTE, 2],
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
    // [TransactionsOutcomesColumns.BUSINESS_NAME, 1],
    [TransactionsOutcomesColumns.ACTIONS, 1],
    [TransactionsOutcomesColumns.NOTE, 1],
  ]);


  readonly bunnerImagePosition = bunnerImagePosition;

  public COLUMNS_TO_IGNORE_EXPENSES = ['necessity', 'finsiteId', 'businessNumber', 'id', 'payDate', 'isEquipment', 'reductionPercent', 'taxPercent', 'vatPercent'];
  // public COLUMNS_TO_SHOW_EXPENSES = ['businessNumber', 'id', 'payDate', 'isEquipment', 'reductionPercent', 'taxPercent', 'vatPercent'];
  public COLUMNS_TO_IGNORE_INCOMES = ['necessity', 'finsiteId', 'businessNumber', 'id', 'payDate', 'isRecognized', 'isEquipment', 'reductionPercent', 'taxPercent', 'vatPercent'];
  readonly buttonSize = ButtonSize;
  readonly buttonColor = ButtonColor;
  readonly ButtonClass = ButtonClass;

  visibleAccountAssociationDialog: WritableSignal<boolean> = signal<boolean>(false);
  visibleAddBill: WritableSignal<boolean> = signal<boolean>(false);
  visibleClassifyTran = signal<boolean>(false);
  visibleAddCategory: WritableSignal<boolean> = signal<boolean>(false);
  subCategoryMode = signal<boolean>(false);
  categoryName = signal<string>("");
  isLoadingStateTable = signal<boolean>(false);
  filteredExpensesData = signal<IRowDataTable[]>(null);
  filteredIncomesData = signal<IRowDataTable[]>(null);
  // visibleAddSubCategory: WritableSignal<boolean> = signal<boolean>(false);
  leftPanelData = signal<IRowDataTable>(null); // Data for all version of left panels
  selectedValue: string[] = ['classification', 'notClassification'];
  // selectedValue = signal<string | null>(null);
  rows: IRowDataTable[];
  tableActionsExpense: ITableRowAction[];
  tableActionsIncomes: ITableRowAction[];
  classifyDisplayOptions = [{ value: 'classification', name: 'סווג' }, { value: 'notClassification', name: 'טרם סווג' }];
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
  accountsList = signal<ISelectItem[]>([]);
  filterData = signal<any>(null);
  incomeMode = signal<boolean>(false);
  sourcesList: string[] = [];
  selectedFile: File = null;
  dateForUpdate = { 'startDate': "", 'endDate': "" };
  checkClassifyBill: boolean = true;
  listCategory: ISelectItem[];
  listFilterCategory: ISelectItem[] = [{ value: null, name: 'הכל' }];
  originalSubCategoryList: IGetSubCategory[];
  expenseDataService = inject(ExpenseDataService);
  myIcon: string;
  filterByExpense: string = "";
  filterByIncome: string = "";
  userData: IUserData;
  businessSelect: string = "";
  

  constructor(private router: Router, private formBuilder: FormBuilder, private modalController: ModalController, private dateService: DateService, private transactionService: TransactionsService, private authService: AuthService, private genericService: GenericService) {

    this.transactionsForm = this.formBuilder.group({
      reportingPeriodType: new FormControl(
        '', Validators.required,
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
    this.filterData = this.transactionService.filterData;
    this.getTransactions(null);
    this.userData = this.authService.getUserDataFromLocalStorage();
    this.bussinesesList.push({ name: this.userData?.businessName, value: this.userData.businessNumber });
    this.bussinesesList.push({ name: this.userData.spouseBusinessName, value: this.userData.spouseBusinessNumber });
    console.log(this.userData);

    if (this.userData.isTwoBusinessOwner) {
      console.log("in this.userData.isTwoBusinessOwner: ", this.userData.isTwoBusinessOwner);
      
      //------------ expenses -------------
      this.fieldsNamesExpenses.push({ name: TransactionsOutcomesColumns.BUSINESS_NUMBER, value: TransactionsOutcomesHebrewColumns.businessNumber, type: FormTypes.TEXT });
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
      this.COLUMNS_WIDTH_INCOME.set(TransactionsOutcomesColumns.NAME, 1.2);
      this.COLUMNS_WIDTH_INCOME.set(TransactionsOutcomesColumns.BILL_NUMBER, 1.2);
      this.COLUMNS_WIDTH_INCOME.set(TransactionsOutcomesColumns.BILL_NAME, 1.2);
      this.COLUMNS_WIDTH_INCOME.set(TransactionsOutcomesColumns.CATEGORY, 1.1)
      this.COLUMNS_WIDTH_INCOME.set(TransactionsOutcomesColumns.SUBCATEGORY, 1.1);
      this.COLUMNS_WIDTH_INCOME.set(TransactionsOutcomesColumns.BILL_DATE, 1.1);
      this.COLUMNS_WIDTH_INCOME.set(TransactionsOutcomesColumns.SUM, 1.1);
      this.COLUMNS_WIDTH_INCOME.set(TransactionsOutcomesColumns.NOTE, 1);
      this.COLUMNS_WIDTH_INCOME.set(TransactionsOutcomesColumns.ACTIONS, 1);
    }

    // this.setTableActions();
    this.transactionService.getAllBills();
    // this.transactionService.accountsList$.pipe(takeUntil(this.destroy$)).subscribe(
    //   (accountsList) => {
    //     this.accountsList = accountsList;
    //   }
    // );
    this.accountsList = this.transactionService.accountsList;
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

  getTransactions(filters: any | null): void {
    this.isLoadingStateTable.set(true);
    const periodType = filters?.periodType;
    let accounts = filters?.account;
    let categories = filters?.category;
    let startDate: string;
    let endDate: string;

    let accountsNames = accounts?.map((account: ISelectItem) => account.value);
    let categoriesName = categories?.map((category: ISelectItem) => category.value);
    // === Setting the date
    if (!filters) { // For default table.
      const today = new Date();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(today.getDate() - 29); // כולל היום = 30 ימים
      
      ({ startDate, endDate } = this.dateService.getStartAndEndDates(
        this.reportingPeriodType.DATE_RANGE,
        null,
        null,
        thirtyDaysAgo.toISOString(),
        today.toISOString()
      ));
      accountsNames = null;
      categoriesName = null;
    }
    else {
      switch (periodType) {
        case this.reportingPeriodType.MONTHLY:
          ({ startDate, endDate } = this.dateService.getStartAndEndDates(this.reportingPeriodType.MONTHLY, filters?.year, filters?.month, null, null));
          break;
        case this.reportingPeriodType.BIMONTHLY:
          ({ startDate, endDate } = this.dateService.getStartAndEndDates(this.reportingPeriodType.BIMONTHLY, filters?.year, filters?.bimonth, null, null));
          break;
        case this.reportingPeriodType.ANNUAL:
          ({ startDate, endDate } = this.dateService.getStartAndEndDates(this.reportingPeriodType.ANNUAL, filters?.year, null, null, null));
          break;
        case this.reportingPeriodType.DATE_RANGE:
          ({ startDate, endDate } = this.dateService.getStartAndEndDates(this.reportingPeriodType.DATE_RANGE, null, null, filters?.startDate, filters?.endDate));
          break;
        default:
          const today = new Date();
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(today.getDate() - 29); // כולל היום = 30 ימים
          
          ({ startDate, endDate } = this.dateService.getStartAndEndDates(
            this.reportingPeriodType.DATE_RANGE,
            null,
            null,
            thirtyDaysAgo.toISOString(),
            today.toISOString()
          ));
          break;
      }
    }
    // === Setting the date //
   

    const incomeData$ = this.transactionService.getIncomeTransactionsData(startDate, endDate, accountsNames, categoriesName);

    const expensesData$ = this.transactionService.getExpenseTransactionsData(startDate, endDate, accountsNames, categoriesName);

    zip(incomeData$, expensesData$)
      .pipe(
        finalize(() => this.isLoadingStateTable.set(false))
,        map(([incomeData, expenseData]) => {
          const incomeDataRows = this.handleTableData(incomeData);
          const expenseeDataRows = this.handleTableData(expenseData);
          return { incomes: incomeDataRows, expenses: expenseeDataRows };
        }
        )
      )
      .subscribe((data: { incomes: IRowDataTable[]; expenses: IRowDataTable[] }) => {
        this.incomesData = data.incomes;
        this.expensesData = data.expenses;
        // this.classifyDataFilter();
        this.filteredExpensesData.set(this.expensesData);
        this.filteredIncomesData.set(this.incomesData);
        console.log("income: ", this.incomesData);
        console.log("expense: ", this.expensesData);
      });
  }


  getExpensesData(): void {
    const formData = this.transactionsForm.value;
    const { startDate, endDate } = this.dateService.getStartAndEndDates(formData.reportingPeriodType, formData.year, formData.month, null, null);
    this.dateForUpdate.startDate = startDate;
    this.dateForUpdate.endDate = endDate;

    this.transactionService.getExpenseTransactionsData(startDate, endDate, formData.accounts, null).subscribe((res) => {
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
      // 'businessName',
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

  // setTableActions(): void {
  //   this.tableActionsExpense = [
  //     {
  //       name: 'delete',
  //       icon: 'create',
  //       action: (row: IRowDataTable) => {
  //         this.openEditRow(row)
  //       }
  //     },
  //   ];

  //   this.tableActionsIncomes = [
  //     {
  //       name: 'delete',
  //       icon: 'create',
  //       action: (row: IRowDataTable) => {
  //         this.openEditRow(row, false)
  //       }
  //     },
  //   ];
  // }

  // openAddBill(data: IRowDataTable): void {
  //   this.selectBill = data.paymentIdentifier as string;
  //   console.log("🚀 ~ TransactionsPage ~ openAddBill ~ this.selectBill:", this.selectBill)
  //   this.openPopupAddBill()
  // }

  // openPopupAddBill(data?: IRowDataTable): void {
  //   from(this.modalController.create({

  //     component: AddBillComponent,
  //     componentProps: {
  //       paymentMethod: this.selectBill,
  //     }
  //   })).pipe(
  //     takeUntil(this.destroy$),
  //     catchError((err) => {
  //       alert("openPopupAddBill error");
  //       return EMPTY;
  //     }),
  //     switchMap((modal) => from(modal.present())
  //       .pipe(
  //         takeUntil(this.destroy$),
  //         switchMap(() => from(modal.onWillDismiss()))
  //       )),
  //     catchError((err) => {
  //       alert("openPopupAddBill switchMap error");
  //       console.log(err);
  //       return EMPTY;
  //     }))
  //     .subscribe(({ data, role }) => {
  //       if (role === 'success') {
  //         // this.getTransactions()
  //       }
  //     });
  // }

  // filterIncomes(): void {
  //   const formData = this.incomeForm.value;
  //   console.log(formData);

  //   const categoryName = this.listCategory?.find((category) => category.value === formData.category);

  //   if (!categoryName && !formData.incomeType) {
  //     this.incomesData$.next(this.incomesData.filter((income) => String(income.name).includes(this.filterByIncome)));
  //   }
  //   else if (!categoryName) {
  //     if (formData.incomeType === "notClassification") {
  //       this.incomesData$.next(this.incomesData.filter((income) => {
  //         return (income.category === "טרם סווג") && String(income.name).includes(this.filterByIncome);
  //       }
  //       ));
  //     }
  //     else {
  //       this.incomesData$.next(this.incomesData.filter((income) => {
  //         return (income.category !== "טרם סווג") && String(income.name).includes(this.filterByIncome);
  //       }));
  //     }
  //   }
  //   else if (!formData.incomeType) {
  //     this.incomesData$.next(this.incomesData.filter((income) => {
  //       return (income.category === categoryName.name) && (String(income.name).includes(this.filterByIncome));
  //     }));
  //   }
  //   else {
  //     if (formData.incomeType === "notClassification") {
  //       this.incomesData$.next(this.incomesData.filter((income) => {
  //         return (income.category === "טרם סווג" || income.category === categoryName.name) && (String(income.name).includes(this.filterByIncome));
  //       }));
  //     }
  //     else {
  //       this.incomesData$.next(this.incomesData.filter((income) => {
  //         return (income.category !== "טרם סווג" && income.category === categoryName.name) && (String(income.name).includes(this.filterByIncome));
  //       }));
  //     }

  //   }
  // }

  // filterExpenses(): void {
  //   const formData = this.expensesForm.value;

  //   const categoryName = this.listCategory?.find((category) => category.value === formData.category);

  //   if (!categoryName && !formData.expensesType) {
  //     this.expensesData$.next(this.expensesData.filter((expense) => String(expense.name).includes(this.filterByExpense)));
  //   }
  //   else if (!categoryName) {
  //     if (formData.expensesType === "notClassification") {
  //       this.expensesData$.next(this.expensesData.filter((expense) => {
  //         return ((expense.category === "טרם סווג") && String(expense.name).includes(this.filterByExpense));
  //       }));
  //     }
  //     else {
  //       this.expensesData$.next(this.expensesData.filter((expense) => {
  //         return (expense.category !== "טרם סווג") && String(expense.name).includes(this.filterByExpense);
  //       }));
  //     }
  //   }
  //   else if (!formData.expensesType) {
  //     this.expensesData$.next(this.expensesData.filter((expense) => {
  //       return (expense.category === categoryName.name) && (String(expense.name).includes(this.filterByExpense));
  //     }));
  //   }
  //   else {
  //     if (formData.expensesType === "notClassification") {
  //       this.expensesData$.next(this.expensesData.filter((expense) => {
  //         return (expense.category === "טרם סווג" || expense.category === categoryName.name) && (String(expense.name).includes(this.filterByExpense));
  //       }))
  //     }
  //     else {
  //       this.expensesData$.next(this.expensesData.filter((expense) => {
  //         return (expense.category !== "טרם סווג" && expense.category === categoryName.name) && (String(expense.name).includes(this.filterByExpense))
  //       }));
  //     }

  //   }
  //   //}
  // }

  handleTableData(data: ITransactionData[]) {
    const rows = [];
    if (data.length) {
      console.log("data in handle data in transaction: ", data);

      data.forEach((row: ITransactionData) => {
        const { userId, ...data } = row;
        data.billName ? null : (data.billName = "לא שוייך", this.checkClassifyBill = false);
        data.category ? null : data.category = "טרם סווג";
        data.subCategory ? null : data.subCategory = "טרם סווג";
        data.isRecognized ? data.isRecognized = "כן" : data.isRecognized = "לא"
        data.isEquipment ? data.isEquipment = "כן" : data.isEquipment = "לא"
        data.sum = String(Math.abs(Number(data.sum)));
        data.sum = this.genericService.addComma(data.sum);
        data.vatReportingDate ? null : data.vatReportingDate = "טרם דווח";
        data.note2 ? null : data.note2 = "--";

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

  // openEditRow(data: IRowDataTable, isExpense: boolean = true): void {
  //   let editFieldsNamesIncomes: IColumnDataTable<TransactionsOutcomesColumns, TransactionsOutcomesHebrewColumns>[] = []; // For does changes in fieldsNamesIncomes array before open update row.
  //   let disabledFields: TransactionsOutcomesColumns[];
  //   console.log("data.businessNumber: ", data.businessNumber);
  //   console.log(" this.userData.businessNumber: ", this.userData.businessNumber);

  //   const businessNumber = data.businessNumber === this.userData.businessNumber || this.userData.businessName ? { name: this.userData.businessName, value: this.userData.businessNumber } : { name: this.userData.spouseBusinessName, value: this.userData.spouseBusinessNumber }
  //   console.log("data in open edit row: ", data);
  //   console.log("businessNumber: ", businessNumber);


  //   if (isExpense) {
  //     if (!this.userData.isTwoBusinessOwner) {
  //       this.editFieldsNamesExpenses = this.editFieldsNamesExpenses.filter(
  //         field => field.name !== TransactionsOutcomesColumns.BUSINESS_NUMBER); // For remove column businessNumber from array for one business 
  //     }
  //     const isEquipmentEdit = data?.isEquipment === "לא" ? 0 : 1;
  //     const isRecognizedEdit = data?.isRecognized === "לא" ? 0 : 1;
  //     disabledFields = [TransactionsOutcomesColumns.BILL_NAME, TransactionsOutcomesColumns.BILL_NUMBER, TransactionsOutcomesColumns.SUM, TransactionsOutcomesColumns.NAME, TransactionsOutcomesColumns.BILL_DATE, TransactionsOutcomesColumns.CATEGORY, TransactionsOutcomesColumns.SUBCATEGORY];
  //     this.editRowExpenseForm.get(TransactionsOutcomesColumns.CATEGORY).patchValue(data?.category || '');
  //     this.editRowExpenseForm.get(TransactionsOutcomesColumns.SUBCATEGORY).patchValue(data?.subCategory || '');
  //     this.editRowExpenseForm.get(TransactionsOutcomesColumns.IS_RECOGNIZED).patchValue(isRecognizedEdit || 0),
  //       this.editRowExpenseForm.get(TransactionsOutcomesColumns.SUM).patchValue(data?.sum || ''),
  //       this.editRowExpenseForm.get(TransactionsOutcomesColumns.TAX_PERCENT).patchValue(data?.taxPercent || ''),
  //       this.editRowExpenseForm.get(TransactionsOutcomesColumns.VAT_PERCENT).patchValue(data?.vatPercent === 0 ? 0 : ""),
  //       this.editRowExpenseForm.get(TransactionsOutcomesColumns.BILL_DATE).patchValue(data?.billDate || Date),
  //       this.editRowExpenseForm.get(TransactionsOutcomesColumns.BILL_NAME).patchValue(data?.billName || ''),
  //       this.editRowExpenseForm.get(TransactionsOutcomesColumns.IS_EQUIPMENT).patchValue(isEquipmentEdit || 0),
  //       this.editRowExpenseForm.get(TransactionsOutcomesColumns.REDUCTION_PERCENT).patchValue(data?.reductionPercent || 0),
  //       this.editRowExpenseForm.get(TransactionsOutcomesColumns.NAME).patchValue(data?.name || 0),
  //       this.editRowExpenseForm.get(TransactionsOutcomesColumns.BILL_NUMBER).patchValue(data?.paymentIdentifier || 0);
  //     this.editRowExpenseForm.get(TransactionsOutcomesColumns.BUSINESS_NUMBER).patchValue(businessNumber.value || '');

  //   }
  //   else {
  //     editFieldsNamesIncomes = this.fieldsNamesIncome.filter(
  //       field => {
  //         return field.name !== TransactionsOutcomesColumns.NOTE && field.name !== TransactionsOutcomesColumns.BUSINESS_NAME
  //       }
  //     ); // For remove column note & businessName from array 
  //     editFieldsNamesIncomes.push({ name: TransactionsOutcomesColumns.BUSINESS_NUMBER, value: TransactionsOutcomesHebrewColumns.businessNumber, type: FormTypes.DDL, listItems: this.bussinesesList });

  //     disabledFields = [TransactionsOutcomesColumns.BILL_NAME, TransactionsOutcomesColumns.BILL_NUMBER, TransactionsOutcomesColumns.SUM, TransactionsOutcomesColumns.NAME, TransactionsOutcomesColumns.BILL_DATE, TransactionsOutcomesColumns.CATEGORY, TransactionsOutcomesColumns.SUBCATEGORY, TransactionsOutcomesColumns.MONTH_REPORT];

  //     this.editRowIncomeForm.get(TransactionsOutcomesColumns.CATEGORY).patchValue(data?.category || '');
  //     this.editRowIncomeForm.get(TransactionsOutcomesColumns.SUBCATEGORY).patchValue(data?.subCategory || '');
  //     this.editRowIncomeForm.get(TransactionsOutcomesColumns.SUM).patchValue(data?.sum || ''),
  //       this.editRowIncomeForm.get(TransactionsOutcomesColumns.BILL_DATE).patchValue(data?.billDate || Date),
  //       this.editRowIncomeForm.get(TransactionsOutcomesColumns.BILL_NAME).patchValue(data?.billName || ''),
  //       this.editRowIncomeForm.get(TransactionsOutcomesColumns.NAME).patchValue(data?.name || 0),
  //       this.editRowIncomeForm.get(TransactionsOutcomesColumns.BILL_NUMBER).patchValue(data?.paymentIdentifier || 0);
  //     this.editRowIncomeForm.get(TransactionsOutcomesColumns.BUSINESS_NUMBER).patchValue(businessNumber.value || '');
  //     this.editRowIncomeForm.get(TransactionsOutcomesColumns.MONTH_REPORT).patchValue(data.vatReportingDate || '');

  //   }




  //   if (data.category !== "טרם סווג" && data.category !== undefined) {
  //     from(this.modalController.create({
  //       component: editRowComponent,
  //       componentProps: {
  //         data,
  //         fields: isExpense ? this.editFieldsNamesExpenses : editFieldsNamesIncomes,
  //         parentForm: isExpense ? this.editRowExpenseForm : this.editRowIncomeForm,
  //         disabledFields
  //       },
  //       cssClass: 'edit-row-modal',
  //     }))
  //       .pipe(
  //         takeUntil(this.destroy$),
  //         catchError((err) => {
  //           alert("open Edit Row error");
  //           console.log("open Edit Row error: ", err);
  //           return EMPTY;
  //         }),
  //         switchMap((modal) => from(modal.present())
  //           .pipe(
  //             takeUntil(this.destroy$),
  //             switchMap(() => from(modal.onWillDismiss())
  //               .pipe(
  //                 takeUntil(this.destroy$),
  //                 tap((data) => {
  //                   if (data.role != 'backdrop' && data.role != 'cancel') {
  //                     // this.getTransactions()
  //                   }
  //                 })
  //               )
  //             )
  //           )),
  //         catchError((err) => {
  //           alert("open Edit row switchMap error");
  //           console.log("open Edit row switchMap error: ", err);
  //           return EMPTY;
  //         }))
  //       .subscribe((res) => {
  //         if (res.role == 'send') {
  //           this.genericService.getLoader().subscribe();
  //           this.updateRow(res.data.id)
  //         }
  //       });
  //   }
  //   else {
  //     alert("חובה לסווג תנועה כדי לאפשר עריכה")
  //   }
  // }

  // updateRow(id: number): void {
  //   let formData: IClassifyTrans = this.editRowExpenseForm.getRawValue();
  //   console.log("edit row form: ", formData);

  //   formData.id = id;
  //   formData.isEquipment ? formData.isEquipment = true : formData.isEquipment = false;
  //   formData.isRecognized ? formData.isRecognized = true : formData.isRecognized = false;
  //   formData.isSingleUpdate = true;
  //   formData.isNewCategory = false;
  //   formData.vatPercent = +formData.vatPercent;
  //   formData.taxPercent = +formData.taxPercent;
  //   formData.reductionPercent = +formData.reductionPercent;

  //   this.transactionService.updateRow(formData)
  //     .pipe(
  //       // finalize(() => this.genericService.dismissLoader()),
  //       catchError((err) => {
  //         alert("עדכון שורה נכשל");
  //         this.genericService.dismissLoader();
  //         return EMPTY;
  //       }),
  //       takeUntil(this.destroy$)
  //     )
  //     .subscribe((res) => {
  //       this.genericService.dismissLoader();
  //       this.genericService.showToast("עדכון שורה הצליח", "success");
  //       // this.messageToast = "עדכון שורה הצליח"
  //       // this.isToastOpen = true;
  //       this.getExpensesData()
  //     });
  // }

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
                  if (data.role === 'error') {
                    setTimeout(() => {
                      this.genericService.dismissLoader()
                      alert("אירעה שגיאה התנועה לא סווגה אנא נסה מאוחר יותר")
                    }, 500)
                  }
                  else if (data.role != 'backdrop' && data.role != 'cancel') {
                    this.genericService.showToast("התנועה סווגה בהצלחה", "success");
                    // this.messageToast = "התנועה סווגה בהצלחה"
                    // this.isToastOpen = true;
                    // this.getTransactions()
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

  // onClickedCell(event: { str: string, data: IRowDataTable }, isExpense: boolean = true): void {
  //   if (event.str === "bill") {
  //     // this.openAddBill(event.data);
  //   }
  //   else {
  //     event.data.billName === "לא שוייך" ? alert("לפני סיווג קטגוריה יש לשייך אמצעי תשלום לחשבון") : this.openAddTransaction(event.data, isExpense);
  //   }
  // }

  // openPopupSelect(): void {
  //   from(this.modalController.create({
  //     component: PopupSelectComponent,
  //     componentProps: {
  //       message: "עבור איזה עסק אתה רוצה להפיק דוח?",
  //       options: this.bussinesesList,
  //     },
  //     cssClass: 'popup-select'
  //   }))
  //     .pipe(
  //       catchError((err) => {
  //         alert("create popup select error");
  //         return EMPTY;
  //       }),
  //       switchMap((modal) => from(modal.present())
  //         .pipe(
  //           catchError((err) => {
  //             alert("present popup select error");
  //             console.log(err);
  //             return EMPTY;
  //           }),
  //           switchMap(() => from(modal.onWillDismiss())
  //             .pipe(
  //               catchError((err) => {
  //                 console.log("err in close popup select: ", err);
  //                 return EMPTY;
  //               })
  //             ))
  //         )))
  //     .subscribe((res) => {
  //       this.businessSelect = res.data;
  //       console.log("businessSelect: ", this.businessSelect);

  //       console.log("res of popup select: ", res);
  //       if (res.role === 'success') {
  //         this.openFlowReport();
  //       }
  //     });
  // }

  // openFlowReport(): void {
  //   if (!this.userData.isTwoBusinessOwner) {
  //     this.businessSelect = this.userData.businessNumber;
  //   }
  //   this.router.navigate(['flow-report'], {
  //     queryParams: {
  //       startDate: this.dateForUpdate.startDate,
  //       endDate: this.dateForUpdate.endDate,
  //       businessNumber: this.businessSelect,
  //       accounts: 'null'
  //     }
  //   })
  // }

  // filterByExpenses(event: string): void {
  //   this.filterByExpense = event;
  //   this.filterExpenses()
  // }

  // filterByIncomes(event: string): void {
  //   this.filterByIncome = event;
  //   this.filterIncomes()
  // }

  openAccountAssociation(event: { state: boolean, data: IRowDataTable }): void {
    this.visibleAccountAssociationDialog.set(event.state);
    this.leftPanelData.set(event.data);
  }

  openAddBill(event: any): void {
    this.visibleAddBill.set(event);
  }

  openClassifyTran(event: { state: boolean, data: IRowDataTable, incomeMode: boolean }): void {
    this.visibleClassifyTran.set(event.state);
    this.leftPanelData.set(event.data);
    this.incomeMode.set(event.incomeMode);
  }

  openAddCategory(event: { state: boolean, subCategoryMode: boolean, category?: string }): void {
    this.visibleAddCategory.set(event.state);
    this.subCategoryMode.set(event.subCategoryMode);
    this.categoryName.set(event.category);
  }

  closeAccountAssociation(event: { visible: boolean, data: boolean }): void {
    this.visibleAccountAssociationDialog.set(event.visible);
    event.data ? this.getTransactions(this.filterData()) : null; // TODO: get transactions by the filters!!
  }

  closeAddBill(event: { visible: boolean, data?: boolean }): void {
    this.visibleAddBill.set(event.visible);
  }

  closeClassyfyTran(event: { visible: boolean, data: boolean }): void {
    this.visibleClassifyTran.set(event.visible);
    event.data ? this.getTransactions(this.filterData()) : null; // TODO: get transactions by the filters!!
  }

  closeAddCategory(event: { visible: boolean, data?: boolean }): void {
    this.visibleAddCategory.set(event.visible);
    event.data ? this.transactionService.getCategories().subscribe() : null;
  }

  onAddBill(event: FormGroup): void {
    // console.log("🚀 ~ onAddBill ~ event:", event);
    const accountName = event.controls?.['accountName']?.value;
    const businessNumber = event.controls?.['businessNumber']?.value;
    // console.log("businessbillNameNumber: ", accountName);
    // console.log("businessNumber: ", businessNumber);

    this.transactionService.addBill(accountName, businessNumber)
      .pipe(
        finalize(() => this.genericService.dismissLoader()),
        catchError((err) => {
          console.log('err in add bill: ', err);
          return EMPTY;
        })
      )
      .subscribe(() => {
        this.transactionService.getAllBills();
        this.closeAddBill({ visible: false });
      });


  }

  applyFilters(filters: FormGroup): void {
    this.getTransactions(filters);
  }

  imageBunnerButtonClicked(event: any): void {
    this.router.navigate(['/reports'])
  }

  onQuickClassifyClicked(event: boolean): void {
    this.getTransactions(this.filterData());
  }
  
  selectOption(value: string) {
    console.log("🚀 ~ selectOption ~ value:", value)
    const valueExist = this.selectedValue.some(v => v === value);

    console.log("🚀 ~ selectOption ~ valueExist:", valueExist);
    if (valueExist) {
      this.selectedValue = this.selectedValue.filter(item => item !== value);
    } else {
      this.selectedValue.push(value);
    }
    console.log("🚀 ~ selectOption ~ this.selectedValue:", this.selectedValue);

    // const filteredExpenses = this.expensesData.filter(row => {
    //   const hasClassification = this.selectedValue.includes('classification');
    //   const hasNotClassification = this.selectedValue.includes('notClassification');
    
    //   if (hasClassification && hasNotClassification) return true; // show all
    //   if (hasClassification) return row.category !== 'לא שוייך';
    //   if (hasNotClassification) return row.category === 'לא שוייך';
    //   return true; // default is display all
    // });
    this.classifyDataFilter();
  }

  classifyDataFilter(): void {
   this.filteredExpensesData.set(this.expensesData.filter(row => {
      const hasClassification = this.selectedValue.includes('classification');
      const hasNotClassification = this.selectedValue.includes('notClassification');
    
      if (hasClassification && hasNotClassification) return true; // show all
      if (hasClassification) return row.category !== 'טרם סווג';
      if (hasNotClassification) return row.category === 'טרם סווג';
      return true; // default is display all
    }));

    this.filteredIncomesData.set(this.incomesData.filter(row => {
      const hasClassification = this.selectedValue.includes('classification');
      const hasNotClassification = this.selectedValue.includes('notClassification');
    
      if (hasClassification && hasNotClassification) return true; // show all
      if (hasClassification) return row.category !== 'טרם סווג';
      if (hasNotClassification) return row.category === 'טרם סווג';
      return true; // default is display all
    }));
    console.log("🚀 ~ selectOption ~ filteredExpenses:", this.filteredIncomesData())

    // return this.expensesData = filteredExpenses;
  }

  

}