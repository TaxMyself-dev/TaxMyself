import { Component, OnInit, inject } from '@angular/core';
import { TransactionsService } from './transactions.page.service';
import { BehaviorSubject, EMPTY, Observable, catchError, finalize, from, map, skip, switchMap, tap, zip, distinctUntilChanged, Subject, takeUntil } from 'rxjs';
import { IButtons, IClassifyTrans, IColumnDataTable, IGetSubCategory, IRowDataTable, ISelectItem, ITableRowAction, ITransactionData } from 'src/app/shared/interface';
import { ExpenseFormColumns, ExpenseFormHebrewColumns, FormTypes, ICellRenderer, TransactionsOutcomesColumns, TransactionsOutcomesHebrewColumns } from 'src/app/shared/enums';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { AddBillComponent } from 'src/app/shared/add-bill/add-bill.component';
import { ModalController } from '@ionic/angular';
import { AddTransactionComponent } from 'src/app/shared/add-transaction/add-transaction.component';
import { ModalExpensesComponent } from 'src/app/shared/modal-add-expenses/modal.component';
import { Router } from '@angular/router';
import { editRowComponent } from 'src/app/shared/edit-row/edit-row.component';
import { DateService } from 'src/app/services/date.service';
import { ExpenseDataService } from 'src/app/services/expense-data.service';
import { ButtonClass, ButtonSize } from 'src/app/shared/button/button.enum';
import { addIcons } from 'ionicons';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

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

  fieldsNamesIncome: IColumnDataTable<TransactionsOutcomesColumns, TransactionsOutcomesHebrewColumns>[] = [
    { name: TransactionsOutcomesColumns.NAME, value: TransactionsOutcomesHebrewColumns.name, type: FormTypes.TEXT },
    { name: TransactionsOutcomesColumns.BILL_NUMBER, value: TransactionsOutcomesHebrewColumns.paymentIdentifier, type: FormTypes.NUMBER, },
    { name: TransactionsOutcomesColumns.BILL_NAME, value: TransactionsOutcomesHebrewColumns.billName, type: FormTypes.TEXT, cellRenderer: ICellRenderer.BILL },
    { name: TransactionsOutcomesColumns.CATEGORY, value: TransactionsOutcomesHebrewColumns.category, type: FormTypes.TEXT, cellRenderer: ICellRenderer.CATEGORY },
    { name: TransactionsOutcomesColumns.SUBCATEGORY, value: TransactionsOutcomesHebrewColumns.subCategory, type: FormTypes.DDL },
    { name: TransactionsOutcomesColumns.SUM, value: TransactionsOutcomesHebrewColumns.sum, type: FormTypes.TEXT },
    { name: TransactionsOutcomesColumns.PAY_DATE, value: TransactionsOutcomesHebrewColumns.payDate, type: FormTypes.DATE },
    { name: TransactionsOutcomesColumns.MONTH_REPORT, value: TransactionsOutcomesHebrewColumns.monthReport, type: FormTypes.TEXT },
  ];

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
  ];

  fieldsNamesExpenses: IColumnDataTable<TransactionsOutcomesColumns, TransactionsOutcomesHebrewColumns>[] = [
    { name: TransactionsOutcomesColumns.NAME, value: TransactionsOutcomesHebrewColumns.name, type: FormTypes.TEXT },
    { name: TransactionsOutcomesColumns.BILL_NUMBER, value: TransactionsOutcomesHebrewColumns.paymentIdentifier, type: FormTypes.NUMBER },
    { name: TransactionsOutcomesColumns.BILL_NAME, value: TransactionsOutcomesHebrewColumns.billName, type: FormTypes.TEXT, cellRenderer: ICellRenderer.BILL },
    { name: TransactionsOutcomesColumns.CATEGORY, value: TransactionsOutcomesHebrewColumns.category, type: FormTypes.TEXT, cellRenderer: ICellRenderer.CATEGORY },
    { name: TransactionsOutcomesColumns.SUBCATEGORY, value: TransactionsOutcomesHebrewColumns.subCategory, type: FormTypes.TEXT, cellRenderer: ICellRenderer.SUBCATEGORY },
    { name: TransactionsOutcomesColumns.SUM, value: TransactionsOutcomesHebrewColumns.sum, type: FormTypes.NUMBER },
    { name: TransactionsOutcomesColumns.BILL_DATE, value: TransactionsOutcomesHebrewColumns.billDate, type: FormTypes.DATE, cellRenderer: ICellRenderer.DATE },
    { name: TransactionsOutcomesColumns.PAY_DATE, value: TransactionsOutcomesHebrewColumns.payDate, type: FormTypes.DATE, cellRenderer: ICellRenderer.DATE },
    { name: TransactionsOutcomesColumns.IS_RECOGNIZED, value: TransactionsOutcomesHebrewColumns.isRecognized, type: FormTypes.TEXT },
    { name: TransactionsOutcomesColumns.MONTH_REPORT, value: TransactionsOutcomesHebrewColumns.monthReport, type: FormTypes.TEXT },
  ];

  readonly specialColumnsCellRendering = new Map<TransactionsOutcomesColumns, ICellRenderer>([
    [TransactionsOutcomesColumns.CATEGORY, ICellRenderer.CATEGORY],
    [TransactionsOutcomesColumns.SUBCATEGORY, ICellRenderer.SUBCATEGORY],
    [TransactionsOutcomesColumns.BILL_NAME, ICellRenderer.BILL],
    [TransactionsOutcomesColumns.BILL_DATE, ICellRenderer.DATE],
    [TransactionsOutcomesColumns.PAY_DATE, ICellRenderer.DATE]
  ]);

  readonly COLUMNS_TO_IGNORE_EXPENSES = ['id', 'isEquipment', 'reductionPercent', 'taxPercent', 'vatPercent'];
  readonly COLUMNS_TO_IGNORE_INCOMES = ['id', 'payDate', 'isRecognized', 'isEquipment', 'reductionPercent', 'taxPercent', 'vatPercent'];
  readonly buttonSize = ButtonSize;
  readonly ButtonClass = ButtonClass;


  rows: IRowDataTable[];
  tableActions: ITableRowAction[];
  typeIncomeList = [{ value: null, name: 'הכל' }, { value: 'classification', name: 'סווג' }, { value: 'notClassification', name: 'טרם סווג' }];
  transactionsForm: FormGroup;
  incomeForm: FormGroup;
  expensesForm: FormGroup;
  editRowForm: FormGroup
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
  listCategory: ISelectItem[];
  listFilterCategory: ISelectItem[] = [{ value: null, name: 'הכל' }];
  originalSubCategoryList: IGetSubCategory[];
  expenseDataService = inject(ExpenseDataService);
  myIcon: string;
  constructor(private sanitizer: DomSanitizer, private router: Router, private formBuilder: FormBuilder, private modalController: ModalController, private dateService: DateService, private transactionService: TransactionsService) {

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

    this.editRowForm = this.formBuilder.group({
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
    });
  }


  ngOnInit(): void {
    // const myIcon = this.sanitizer.bypassSecurityTrustResourceUrl(');
    //this.myIcon = 'assets/icon/customEdit.png';
    addIcons({
      'myIcon': "https://www.svgrepo.com/show/42233/pencil-edit-button.svg",
    });
    this.setTableActions();
    this.transactionService.getAllBills();
    this.transactionService.accountsList$.pipe(takeUntil(this.destroy$)).subscribe(
      (accountsList) => {
        this.accountsList = accountsList;
      }
    );
    // this.transactionsService.getAllSources().subscribe((data) => {
    //   // console.log("sources: ", data);
    //   this.sourcesList = data;
    // });
    this.getCategory();

    // this.transactionService.updateRow(4);
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
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
    // console.log("form data trans is ", formData);

    this.dateForUpdate.isSingleMonth = formData.isSingleMonth;
    this.dateForUpdate.month = formData.month;
    this.dateForUpdate.year = formData.year;
    // console.log("dateForUpdate ", this.dateForUpdate);

    const incomeData$ = this.transactionService.getIncomeTransactionsData(formData);

    const expensesData$ = this.transactionService.getExpenseTransactionsData(formData);

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
        this.filterIncomes(); // for after update table the table will stay filtered according to the search-bar
        this.expensesData$.next(data.expenses);
        this.filterExpenses(); // for after update table the table will stay filtered according to the search-bar
      });
  }

  getExpensesData(): void {
    const formData = this.transactionsForm.value;
    // console.log("form data trans is ", formData);

    this.dateForUpdate.isSingleMonth = formData.isSingleMonth;
    this.dateForUpdate.month = formData.month;
    this.dateForUpdate.year = formData.year;
    this.transactionService.getExpenseTransactionsData(formData).subscribe((res) => {
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
      'payDate',
      'billDate',
      'isRecognized',
      'monthReport'
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
    console.log(formData.incomeType);
    const categoryName = this.listCategory?.find((category) => category.value === formData.category);

    if (!categoryName && !formData.incomeType) {
      this.incomesData$.next(this.incomesData);
    }
    else if (!categoryName) {
      if (formData.incomeType === "notClassification") {
        this.incomesData$.next(this.incomesData.filter((income) => income.category === "טרם סווג"));
      }
      else {
        this.incomesData$.next(this.incomesData.filter((income) => income.category !== "טרם סווג"));
      }
    }
    else if (!formData.incomeType) {
      this.incomesData$.next(this.incomesData.filter((income) => income.category === categoryName.name));
    }
    else {
      if (formData.incomeType === "notClassification") {
        this.incomesData$.next(this.incomesData.filter((income) => income.category === "טרם סווג" ||  income.category === categoryName.name));
      }
      else {
        this.incomesData$.next(this.incomesData.filter((income) => income.category !== "טרם סווג" && income.category === categoryName.name));
      }

    }
  }


  filterExpenses(): void {
    const formData = this.expensesForm.value;
    console.log(formData);
    console.log(formData.expensesType);
    const categoryName = this.listCategory?.find((category) => category.value === formData.category);

    if (!categoryName && !formData.expensesType) {
      this.expensesData$.next(this.expensesData);
    }
    else if (!categoryName) {
      if (formData.expensesType === "notClassification") {
        this.expensesData$.next(this.expensesData.filter((expense) => expense.category === "טרם סווג"));
      }
      else {
        this.expensesData$.next(this.expensesData.filter((expense) => expense.category !== "טרם סווג"));
      }
    }
    else if (!formData.expensesType) {
      this.expensesData$.next(this.expensesData.filter((expense) => expense.category === categoryName.name));
    }
    else {
      if (formData.expensesType === "notClassification") {
        this.expensesData$.next(this.expensesData.filter((expense) => expense.category === "טרם סווג" ||  expense.category === categoryName.name));
      }
      else {
        this.expensesData$.next(this.expensesData.filter((expense) => expense.category !== "טרם סווג" && expense.category === categoryName.name));
      }

    }
  }

  private handleTableData(data: ITransactionData[]) {
    const rows = [];
    //let rows: any[];
    if (data.length) {
      // console.log("data: ", data);

      data.forEach((row: ITransactionData) => {
        const { userId, ...data } = row;
        // console.log("payment", data.paymentIdentifier);
        //data.billDate = +data.billDate;
        //data.payDate = +data.payDate;
        data.billName ? null : (data.billName = "זמני", this.checkClassifyBill = false);
        data.category ? null : data.category = "טרם סווג";
        data.subCategory ? null : data.subCategory = "טרם סווג";
        data.isRecognized ? data.isRecognized = "כן" : data.isRecognized = "לא"
        data.isEquipment ? data.isEquipment = "כן" : data.isEquipment = "לא"
        data.sum = Math.abs(data.sum);
        data.vatReportingDate ? null : data.vatReportingDate = "טרם דווח";
        rows.push(data);
      }
      )
    }
    console.log("rows: ", rows);
    return rows;
  }

  getCategory(): void {
    this.expenseDataService.getcategry(null)
      .pipe(
        takeUntil(this.destroy$),
        map((res) => {
          return res.map((item: any) => ({
            name: item.category,
            value: item.id
          })
          )
        }))
      .subscribe((res) => {
        this.listCategory = res;
        this.listFilterCategory.push(...res);
        this.editFieldsNamesExpenses.map((field: IColumnDataTable<TransactionsOutcomesColumns, TransactionsOutcomesHebrewColumns>) => {
          if (field.name === TransactionsOutcomesColumns.CATEGORY) {
            field.listItems = res;
            // console.log("list item of category :", field.listItems);

          }
        });
        console.log("listCategory: ", this.listCategory);
      })
  }

  // getSubCategory(category, subCategory): void {
  //   console.log(event);
  //   console.log("in get sub category");

  //   const combinedListSubCategory = [];
  //     const isEquipmentSubCategory: Observable<IGetSubCategory[]> = this.expenseDataService.getSubCategory(category, true);
  //     const notEquipmentSubCategory: Observable<IGetSubCategory[]> = this.expenseDataService.getSubCategory(category, false);


  //     zip(isEquipmentSubCategory, notEquipmentSubCategory)
  //       .pipe(
  //         takeUntil(this.destroy$),
  //         map(([isEquipmentSubCategory, notEquipmentSubCategory]) => {
  //           console.log(isEquipmentSubCategory, notEquipmentSubCategory);
  //           this.originalSubCategoryList = [...isEquipmentSubCategory, ...notEquipmentSubCategory];
  //           console.log("originalSubCategoryList: ", this.originalSubCategoryList);

  //           const isEquipmentSubCategoryList = isEquipmentSubCategory.map((item: any) => ({
  //             name: item.subCategory,
  //             value: item.id
  //           })
  //           );
  //           const notEquipmentSubCategoryList = notEquipmentSubCategory.map((item: any) => ({
  //             name: item.subCategory,
  //             value: item.id
  //           })
  //           )
  //           const combinedListSubCategory: ISelectItem[] = [];
  //           const separator: ISelectItem[] = [{ name: '-- מוגדרות כציוד --', value: null, disable: true }];
  //           if (isEquipmentSubCategoryList && notEquipmentSubCategoryList) {
  //             combinedListSubCategory.push(...notEquipmentSubCategoryList, ...separator, ...isEquipmentSubCategoryList);
  //           }
  //           else {
  //             isEquipmentSubCategoryList ? combinedListSubCategory.push(...isEquipmentSubCategoryList) : combinedListSubCategory.push(...notEquipmentSubCategoryList);
  //           }
  //           this.editFieldsNamesExpenses.map((field: IColumnDataTable<TransactionsOutcomesColumns, TransactionsOutcomesHebrewColumns>) => {
  //             if (field.name === TransactionsOutcomesColumns.SUBCATEGORY) {
  //               field.listItems = combinedListSubCategory;
  //             }
  //           });
  //           console.log(combinedListSubCategory);


  //           return combinedListSubCategory;
  //         }),
  //         catchError((err) => {
  //           console.log("err in get sub category: ", err);
  //           return EMPTY;
  //         })
  //       )
  //       .subscribe((res) => {
  //         console.log("combine sub category :", res);
  //         const subCategoryId = this.getSubCategoryId(subCategory);
  //         this.editRowForm.get(TransactionsOutcomesColumns.SUBCATEGORY).patchValue(subCategoryId);
  //       })
  // }

  // getSubCategoryId(subCategory): number {
  //     const chosen = this.originalSubCategoryList?.find((item: IGetSubCategory) => item.subCategory === subCategory);
  //     return chosen?.id || 0;
  //     // console.log(chosen);
  //     // const isEquipmentVal = chosen.isEquipment ? 1 : 0; 
  //     // const isRecognizedVal = chosen.isRecognized ? 1 : 0; 
  //     // this.editRowForm.get(TransactionsOutcomesColumns.TAX_PERCENT).patchValue(chosen?.taxPercent || ''),
  //     // this.editRowForm.get(TransactionsOutcomesColumns.VAT_PERCENT).patchValue(chosen?.vatPercent || ''),
  //     // this.editRowForm.get(TransactionsOutcomesColumns.IS_EQUIPMENT).patchValue(isEquipmentVal),
  //     // this.editRowForm.get(TransactionsOutcomesColumns.REDUCTION_PERCENT).patchValue(chosen?.reductionPercent || 0),
  //     // this.editRowForm.get(TransactionsOutcomesColumns.IS_RECOGNIZED).patchValue(isRecognizedVal)
  // }

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

        this.transactionService.uploadFile(arrayBuffer as ArrayBuffer)
          .pipe(takeUntil(this.destroy$))
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
      alert("אנא בחר קובץ")
    }
  }

  openEditRow(data: IRowDataTable): void {
    console.log("data in edit row before: ", data);

    const isEquipmentEdit = data?.isEquipment === "לא" ? 0 : 1;
    const isRecognizedEdit = data?.isRecognized === "לא" ? 0 : 1;
    const disabledFields = [TransactionsOutcomesColumns.BILL_NAME, TransactionsOutcomesColumns.BILL_NUMBER, TransactionsOutcomesColumns.SUM, TransactionsOutcomesColumns.NAME, TransactionsOutcomesColumns.BILL_DATE, TransactionsOutcomesColumns.CATEGORY, TransactionsOutcomesColumns.SUBCATEGORY];

    this.editRowForm.get(TransactionsOutcomesColumns.CATEGORY).patchValue(data?.category || '');
    this.editRowForm.get(TransactionsOutcomesColumns.SUBCATEGORY).patchValue(data?.subCategory || '');
    this.editRowForm.get(TransactionsOutcomesColumns.IS_RECOGNIZED).patchValue(isRecognizedEdit || 0),
      this.editRowForm.get(TransactionsOutcomesColumns.SUM).patchValue(data?.sum || ''),
      this.editRowForm.get(TransactionsOutcomesColumns.TAX_PERCENT).patchValue(data?.taxPercent || ''),
      this.editRowForm.get(TransactionsOutcomesColumns.VAT_PERCENT).patchValue(data?.vatPercent || ''),
      this.editRowForm.get(TransactionsOutcomesColumns.BILL_DATE).patchValue(this.dateService.convertTimestampToDateInput(+data?.billDate) || Date),
      this.editRowForm.get(TransactionsOutcomesColumns.BILL_NAME).patchValue(data?.billName || ''),
      this.editRowForm.get(TransactionsOutcomesColumns.IS_EQUIPMENT).patchValue(isEquipmentEdit || 0),
      this.editRowForm.get(TransactionsOutcomesColumns.REDUCTION_PERCENT).patchValue(data?.reductionPercent || 0),
      this.editRowForm.get(TransactionsOutcomesColumns.NAME).patchValue(data?.name || 0),
      this.editRowForm.get(TransactionsOutcomesColumns.BILL_NUMBER).patchValue(data?.paymentIdentifier || 0);

    if (data.category !== "טרם סווג" && data.category !== undefined) {
      from(this.modalController.create({
        component: editRowComponent,
        componentProps: {
          //date: this.dateForUpdate,
          data,
          fields: this.editFieldsNamesExpenses,
          parentForm: this.editRowForm,
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
                    console.log(data);

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
    let formData: IClassifyTrans = this.editRowForm.getRawValue();

    // formData.category = category.name as string;
    formData.id = id;
    formData.isEquipment ? formData.isEquipment = true : formData.isEquipment = false;
    formData.isRecognized ? formData.isRecognized = true : formData.isRecognized = false;
    formData.isSingleUpdate = true;
    formData.isNewCategory = false;
    formData.vatPercent = +formData.vatPercent;
    formData.taxPercent = +formData.taxPercent;
    formData.reductionPercent = +formData.reductionPercent;
    console.log(formData);

    this.transactionService.updateRow(formData).pipe(takeUntil(this.destroy$)).subscribe((res) => this.getExpensesData());
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
                tap((data) => {
                  console.log(data);
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
    this.router.navigate(['flow-report'], {
      queryParams: {
        month: this.dateForUpdate.month,
        year: this.dateForUpdate.year,
        isSingleMonth: this.dateForUpdate.isSingleMonth,
        accounts: 'null'
      }
    })
  }

  getExpenseTransactionsData(event) {
    this.transactionService.getExpenseTransactionsData(event)
  }



}