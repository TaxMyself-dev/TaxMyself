import { Component, ElementRef, HostListener, OnInit, Signal, ViewChild, WritableSignal, computed, inject, signal } from '@angular/core';
import { TransactionsService } from './transactions.page.service';
import { BehaviorSubject, EMPTY, catchError, from, map, switchMap, tap, zip, Subject, takeUntil, finalize } from 'rxjs';
import { IColumnDataTable, IGetSubCategory, IRowDataTable, ISelectItem, ITableRowAction, ITransactionData, IUserData } from 'src/app/shared/interface';
import { bunnerImagePosition, FormTypes, ICellRenderer, TransactionsOutcomesColumns, TransactionsOutcomesHebrewColumns } from 'src/app/shared/enums';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { ModalController } from '@ionic/angular';
import { AddTransactionComponent } from 'src/app/shared/add-transaction/add-transaction.component';
import { Router } from '@angular/router';
import { DateService } from 'src/app/services/date.service';
import { ExpenseDataService } from 'src/app/services/expense-data.service';
import { ButtonColor, ButtonSize } from '../../components/button/button.enum';
import { GenericService } from 'src/app/services/generic.service';
import { ReportingPeriodType } from 'src/app/shared/enums';
import { AuthService } from 'src/app/services/auth.service';
import { ButtonClass } from 'src/app/shared/button/button.enum';

@Component({
  selector: 'app-transactions',
  templateUrl: './transactions.page.html',
  styleUrls: ['./transactions.page.scss', '../../shared/shared-styling.scss'],
  standalone: false
})

export class TransactionsPage implements OnInit {

  @ViewChild('filterPanelRef') filterPanelRef!: ElementRef;
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const clickedInside = this.filterPanelRef?.nativeElement.contains(event.target);
    const clickedFilterButton = (event.target as HTMLElement).closest('.sort-button');

    if (!clickedInside && !clickedFilterButton && this.visibleFilterPannel()) {
      this.visibleFilterPannel.set(false); // 👈 close the panel
    }
  }

  equipmentList: ISelectItem[] = [{ name: "לא", value: 0 }, { name: "כן", value: 1 }];
  incomesData$ = new BehaviorSubject<IRowDataTable[]>(null);
  expensesData$ = new BehaviorSubject<IRowDataTable[]>(null);
  destroy$ = new Subject<void>();
  reportingPeriodType = ReportingPeriodType;
  bussinesesList: ISelectItem[] = [];




  // editFieldsNamesExpenses: IColumnDataTable<TransactionsOutcomesColumns, TransactionsOutcomesHebrewColumns>[] = [
  //   { name: TransactionsOutcomesColumns.BUSINESS_NUMBER, value: TransactionsOutcomesHebrewColumns.businessNumber, type: FormTypes.DDL, listItems: this.bussinesesList },
  //   { name: TransactionsOutcomesColumns.IS_RECOGNIZED, value: TransactionsOutcomesHebrewColumns.isRecognized, type: FormTypes.DDL, listItems: this.equipmentList },
  //   { name: TransactionsOutcomesColumns.IS_EQUIPMENT, value: TransactionsOutcomesHebrewColumns.isEquipment, type: FormTypes.DDL, listItems: this.equipmentList },
  //   { name: TransactionsOutcomesColumns.REDUCTION_PERCENT, value: TransactionsOutcomesHebrewColumns.reductionPercent, type: FormTypes.NUMBER },
  //   { name: TransactionsOutcomesColumns.TAX_PERCENT, value: TransactionsOutcomesHebrewColumns.totalTax, type: FormTypes.NUMBER },
  //   { name: TransactionsOutcomesColumns.VAT_PERCENT, value: TransactionsOutcomesHebrewColumns.totalVat, type: FormTypes.NUMBER },
  //   { name: TransactionsOutcomesColumns.NAME, value: TransactionsOutcomesHebrewColumns.name, type: FormTypes.TEXT },
  //   { name: TransactionsOutcomesColumns.BILL_NUMBER, value: TransactionsOutcomesHebrewColumns.paymentIdentifier, type: FormTypes.TEXT },
  //   { name: TransactionsOutcomesColumns.BILL_NAME, value: TransactionsOutcomesHebrewColumns.billName, type: FormTypes.TEXT, cellRenderer: ICellRenderer.BILL },
  //   { name: TransactionsOutcomesColumns.CATEGORY, value: TransactionsOutcomesHebrewColumns.category, type: FormTypes.TEXT, cellRenderer: ICellRenderer.CATEGORY },
  //   { name: TransactionsOutcomesColumns.SUBCATEGORY, value: TransactionsOutcomesHebrewColumns.subCategory, type: FormTypes.TEXT, cellRenderer: ICellRenderer.SUBCATEGORY },
  //   { name: TransactionsOutcomesColumns.SUM, value: TransactionsOutcomesHebrewColumns.sum, type: FormTypes.NUMBER },
  //   { name: TransactionsOutcomesColumns.BILL_DATE, value: TransactionsOutcomesHebrewColumns.billDate, type: FormTypes.DATE },
  // ];

  allFieldsNamesIncome: IColumnDataTable<TransactionsOutcomesColumns, TransactionsOutcomesHebrewColumns>[] = [
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

  allFieldsNamesExpenses: IColumnDataTable<TransactionsOutcomesColumns, TransactionsOutcomesHebrewColumns>[] = [
    { name: TransactionsOutcomesColumns.NAME, value: TransactionsOutcomesHebrewColumns.name, type: FormTypes.TEXT },
    { name: TransactionsOutcomesColumns.BILL_NUMBER, value: TransactionsOutcomesHebrewColumns.paymentIdentifier, type: FormTypes.NUMBER },
    { name: TransactionsOutcomesColumns.BILL_NAME, value: TransactionsOutcomesHebrewColumns.billName, type: FormTypes.TEXT, cellRenderer: ICellRenderer.BILL },
    { name: TransactionsOutcomesColumns.CATEGORY, value: TransactionsOutcomesHebrewColumns.category, type: FormTypes.TEXT, cellRenderer: ICellRenderer.CATEGORY },
    { name: TransactionsOutcomesColumns.SUBCATEGORY, value: TransactionsOutcomesHebrewColumns.subCategory, type: FormTypes.TEXT, cellRenderer: ICellRenderer.SUBCATEGORY },
    { name: TransactionsOutcomesColumns.SUM, value: TransactionsOutcomesHebrewColumns.sum, type: FormTypes.NUMBER },
    { name: TransactionsOutcomesColumns.BILL_DATE, value: TransactionsOutcomesHebrewColumns.billDate, type: FormTypes.DATE, cellRenderer: ICellRenderer.DATE },
    // { name: TransactionsOutcomesColumns.PAY_DATE, value: TransactionsOutcomesHebrewColumns.payDate, type: FormTypes.DATE, cellRenderer: ICellRenderer.DATE },
    { name: TransactionsOutcomesColumns.IS_RECOGNIZED, value: TransactionsOutcomesHebrewColumns.isRecognized, type: FormTypes.TEXT, hide: true },
    // { name: TransactionsOutcomesColumns.BUSINESS_NUMBER, value: TransactionsOutcomesHebrewColumns.businessNumber, type: FormTypes.TEXT },
    { name: TransactionsOutcomesColumns.MONTH_REPORT, value: TransactionsOutcomesHebrewColumns.monthReport, type: FormTypes.TEXT, hide: true },
    { name: TransactionsOutcomesColumns.NOTE, value: TransactionsOutcomesHebrewColumns.note, type: FormTypes.TEXT },
  ];

  fieldsNamesExpenses = computed<IColumnDataTable<TransactionsOutcomesColumns, TransactionsOutcomesHebrewColumns>[]>(() => {
    const onlyHide = this.isOnlyEmployer();
    const addBiz = this.isTwoBusinessOwner();

    // start from a fresh copy
    let cols = [...this.allFieldsNamesExpenses];

    // add BUSINESS_NUMBER when needed (insert before NOTE, keep NOTE last)
    if (addBiz && !cols.some(c => c.name === TransactionsOutcomesColumns.BUSINESS_NUMBER)) {
      const businessCol: IColumnDataTable<
        TransactionsOutcomesColumns,
        TransactionsOutcomesHebrewColumns
      > = {
        name: TransactionsOutcomesColumns.BUSINESS_NUMBER,
        value: TransactionsOutcomesHebrewColumns.businessNumber,
        type: FormTypes.TEXT
      };

      const noteIdx = cols.findIndex(c => c.name === TransactionsOutcomesColumns.NOTE);
      const insertAt = noteIdx >= 0 ? noteIdx : cols.length;
      cols.splice(insertAt, 0, businessCol);
    }

    // filter out hidden columns when onlyHide = true
    if (onlyHide) {
      cols = cols.filter(c => !c.hide);
    }

    return cols;
  });

  fieldsNamesIncome = computed<IColumnDataTable<TransactionsOutcomesColumns, TransactionsOutcomesHebrewColumns>[]>(() => {
    const onlyHide = this.isOnlyEmployer();
    const addBiz = this.isTwoBusinessOwner();

    // start from a fresh copy
    let cols = [...this.allFieldsNamesExpenses];

    // add BUSINESS_NUMBER when needed (insert before NOTE, keep NOTE last)
    if (addBiz && !cols.some(c => c.name === TransactionsOutcomesColumns.BUSINESS_NUMBER)) {
      const businessCol: IColumnDataTable<
        TransactionsOutcomesColumns,
        TransactionsOutcomesHebrewColumns
      > = {
        name: TransactionsOutcomesColumns.BUSINESS_NUMBER,
        value: TransactionsOutcomesHebrewColumns.businessNumber,
        type: FormTypes.TEXT
      };

      const noteIdx = cols.findIndex(c => c.name === TransactionsOutcomesColumns.NOTE);
      const insertAt = noteIdx >= 0 ? noteIdx : cols.length;
      cols.splice(insertAt, 0, businessCol);
    }

    // filter out hidden columns when onlyHide = true
    if (onlyHide) {
      cols = cols.filter(c => !c.hide);
    }

    return cols;
  });




  readonly bunnerImagePosition = bunnerImagePosition;
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
  visibleFilterPannel = signal(false);
  isOnlyEmployer = signal<boolean>(false);
  isTwoBusinessOwner = signal<boolean>(false);


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

    if (this.userData.employmentStatus === 'employee' && this.userData.spouseEmploymentStatus === 'employee' || null) {
      this.isOnlyEmployer.set(true);
    }
    if (this.userData.isTwoBusinessOwner) {
      this.isTwoBusinessOwner.set(true);
      console.log("in this.userData.isTwoBusinessOwner: ", this.userData.isTwoBusinessOwner);
    }

    this.transactionService.getAllBills();
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

  openFilterDialod(): void {
    this.visibleFilterPannel.set(!this.visibleFilterPannel());
  }

  getTransactions(filters: any | null): void {
    console.log("filters: ", filters);

    this.isLoadingStateTable.set(true);
    const periodType = filters?.periodType;
    let accounts: ISelectItem[] = filters?.account || null;
    let categories: ISelectItem[] = filters?.category;
    let sources: ISelectItem[] = filters?.sources;
    let startDate: string;
    let endDate: string;

    let accountsNames: string[] = accounts?.map((account: ISelectItem) => account.value as string);
    console.log("accountsNames: ", accountsNames);

    let categoriesName: string[] = categories?.map((category: ISelectItem) => category.value as string);
    let sourcesName: string[] = sources?.map((source: ISelectItem) => source.value as string);
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
    // === End setting the date //
    // For dont send empty arrays to the backend
    accountsNames = accountsNames?.length ? accountsNames : null;
    categoriesName = categoriesName?.length ? categoriesName : null;
    sourcesName = sourcesName?.length ? sourcesName : null;

    const incomeData$ = this.transactionService.getIncomeTransactionsData(startDate, endDate, accountsNames, categoriesName);

    const expensesData$ = this.transactionService.getExpenseTransactionsData(startDate, endDate, accountsNames, categoriesName, sourcesName);

    zip(incomeData$, expensesData$)
      .pipe(
        finalize(() => this.isLoadingStateTable.set(false))
        , map(([incomeData, expenseData]) => {
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
        // this.filteredExpensesData.set(this.expensesData);
        // this.filteredIncomesData.set(this.incomesData);
        this.classifyDataFilter();
        console.log("income: ", this.incomesData);
        console.log("expense: ", this.expensesData);
      });
  }


  getExpensesData(): void {
    const formData = this.transactionsForm.value;
    const { startDate, endDate } = this.dateService.getStartAndEndDates(formData.reportingPeriodType, formData.year, formData.month, null, null);
    this.dateForUpdate.startDate = startDate;
    this.dateForUpdate.endDate = endDate;

    this.transactionService.getExpenseTransactionsData(startDate, endDate, formData.accounts, null, null).subscribe((res) => {
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
        data.businessNumber =
          data.businessNumber === this.userData.businessNumber
            ? this.userData.businessName
            : data.businessNumber === this.userData.spouseBusinessNumber
              ? this.userData.spouseBusinessName
              : 'לא משוייך';



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
        // this.editFieldsNamesExpenses.map((field: IColumnDataTable<TransactionsOutcomesColumns, TransactionsOutcomesHebrewColumns>) => {
        //   if (field.name === TransactionsOutcomesColumns.CATEGORY) {
        //     field.listItems = res;
        //   }
        // });
      })
  }


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
    this.visibleFilterPannel.set(false);
  }

  resetFilters(event: string): void {
    console.log("🚀 ~ resetFilters ~ event:", event);

    switch (event) {
      case 'time':
        this.filterData.update(current => {
          // Reset the time-related fields
          return {
            ...current,
            year: null,
            month: null,
            bimonth: null,
            startDate: null,
            endDate: null,
            periodType: null
          };
        });
        break;

      case 'account':
        this.filterData.update(current => ({
          ...current,
          account: []
        }));
        break;

      case 'category':
        this.filterData.update(current => ({
          ...current,
          category: []
        }));
        break;
    }

    // After resetting — always call getTransactions with updated filters
    this.getTransactions(this.filterData());
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
      if (!hasClassification && !hasNotClassification) return false; // hide all
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