import { Component, OnInit, signal, inject } from '@angular/core';
import { EMPTY } from 'rxjs';
import { catchError, finalize, map } from 'rxjs/operators';
import { ExpenseDataService } from 'src/app/services/expense-data.service';
import { GenericService } from 'src/app/services/generic.service';
import { IColumnDataTable, IRowDataTable, ITableRowAction, IUserData } from 'src/app/shared/interface';
import {
  BusinessStatus,
  ExpenseFormColumns,
  ExpenseFormHebrewColumns,
  FormTypes,
  ReportingPeriodType,
  ICellRenderer
} from 'src/app/shared/enums';
import { AuthService } from 'src/app/services/auth.service';
import { DateService } from 'src/app/services/date.service';
import { FilesService } from 'src/app/services/files.service';
import { FilterField } from 'src/app/components/filter-tab/filter-fields-model.component';
import { FormBuilder, FormGroup } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';

@Component({
  selector: 'app-expenses',
  templateUrl: './expenses.page.html',
  styleUrls: ['./expenses.page.scss', '../../../shared/shared-styling.scss'],
  standalone: false
})
export class ExpensesPage implements OnInit {

  // ===========================
  // Inject services
  // ===========================
  private gs = inject(GenericService);
  private authService = inject(AuthService);
  private dateService = inject(DateService);
  private expenseDataService = inject(ExpenseDataService);
  private filesService = inject(FilesService);
  private confirmationService = inject(ConfirmationService);
  private messageService = inject(MessageService);
  private fb = inject(FormBuilder);

  // ===========================
  // Global state
  // ===========================
  userData!: IUserData;

  // Business related
  selectedBusinessNumber = signal<string>("");
  selectedBusinessName = signal<string>("");
  BusinessStatus = BusinessStatus;
  businessStatus: BusinessStatus = BusinessStatus.SINGLE_BUSINESS;
  businessOptions = this.gs.businessSelectItems;

  startDate!: string;
  endDate!: string;

  isLoadingDataTable = signal<boolean>(false);
  myExpenses: any;
  fileActions = signal<ITableRowAction[]>([]);

  // ===========================
  // Table config
  // ===========================
  expensesTableFields: IColumnDataTable<ExpenseFormColumns, ExpenseFormHebrewColumns>[] = [
    { name: ExpenseFormColumns.SUPPLIER, value: ExpenseFormHebrewColumns.supplier, type: FormTypes.TEXT },
    { name: ExpenseFormColumns.CATEGORY, value: ExpenseFormHebrewColumns.category, type: FormTypes.TEXT },
    { name: ExpenseFormColumns.SUB_CATEGORY, value: ExpenseFormHebrewColumns.subCategory, type: FormTypes.TEXT },
    { name: ExpenseFormColumns.SUM, value: ExpenseFormHebrewColumns.sum, type: FormTypes.NUMBER },
    { name: ExpenseFormColumns.DATE, value: ExpenseFormHebrewColumns.date, type: FormTypes.DATE, cellRenderer: ICellRenderer.DATE },
    { name: ExpenseFormColumns.TAX_PERCENT, value: ExpenseFormHebrewColumns.taxPercent, type: FormTypes.NUMBER },
    { name: ExpenseFormColumns.VAT_PERCENT, value: ExpenseFormHebrewColumns.vatPercent, type: FormTypes.NUMBER },
    { name: ExpenseFormColumns.TOTAL_TAX, value: ExpenseFormHebrewColumns.totalTaxPayable, type: FormTypes.NUMBER },
    { name: ExpenseFormColumns.TOTAL_VAT, value: ExpenseFormHebrewColumns.totalVatPayable, type: FormTypes.NUMBER },
  ];

  // ===========================
  // Filter config (used by FilterTab)
  // ===========================
  form: FormGroup = this.fb.group({});
  filterConfig: FilterField[] = [];

  // ===========================
  // Init
  // ===========================
  async ngOnInit() {
    this.setFileActions();

    this.userData = this.authService.getUserDataFromLocalStorage();
    this.businessStatus = this.userData.businessStatus;
    const businesses = this.gs.businesses();
    this.selectedBusinessNumber.set(businesses[0]?.businessNumber ?? '');
    this.selectedBusinessName.set(businesses[0]?.businessName ?? '');

    // Create the form with essential controls early
    this.form = this.fb.group({
      businessNumber: [this.selectedBusinessNumber()],
    });

    this.form.get('businessNumber')?.valueChanges.subscribe(businessNumber => {
      if (!businessNumber) return;

      const business = this.gs.businesses().find(
        b => b.businessNumber === businessNumber
      );

      this.selectedBusinessNumber.set(business?.businessNumber ?? '');
      this.selectedBusinessName.set(business?.businessName ?? '');

      console.log("Change: business number is ", this.selectedBusinessNumber());

      // Auto-fetch only when business changes
      this.fetchExpenses(this.selectedBusinessNumber());
    });

    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;

    this.filterConfig = [
      {
        type: 'select',
        controlName: 'businessNumber',
        label: 'בחר עסק',
        required: true,
        options: this.gs.businessSelectItems,
        defaultValue: this.selectedBusinessNumber()
      },
      {
        type: 'period',
        controlName: 'period',
        required: true,
        allowedPeriodModes: [ReportingPeriodType.MONTHLY, ReportingPeriodType.BIMONTHLY, ReportingPeriodType.ANNUAL, ReportingPeriodType.DATE_RANGE],
        periodDefaults: {
          periodMode: ReportingPeriodType.MONTHLY,
          year: currentYear,
          month: String(currentMonth),
          bimonthlyDefaultMonth: '1', // דו-חודשי: ברירת מחדל ינואר-פברואר
        }
      }
    ];

    // ברירת מחדל: חודש נוכחי – כמו בדוח רווח והפסד, כדי שהטבלה והדוח יציגו אותה תקופה
    const { startDate: defaultStart, endDate: defaultEnd } = this.dateService.getStartAndEndDates(
      ReportingPeriodType.MONTHLY,
      currentYear,
      currentMonth,
      '',
      ''
    );
    this.startDate = defaultStart;
    this.endDate = defaultEnd;
    const initialBusiness = this.getEffectiveBusinessNumber();
    this.selectedBusinessNumber.set(initialBusiness);
    const initialBusinessObj = this.gs.businesses().find(b => b.businessNumber === initialBusiness);
    if (initialBusinessObj) {
      this.selectedBusinessName.set(initialBusinessObj.businessName);
    }
    this.fetchExpenses(initialBusiness, defaultStart, defaultEnd);
  }

  /**
   * Resolve business number for API calls.
   * When there's only one business, the filter hides the select – use form value and fallback to that business.
   */
  private getEffectiveBusinessNumber(formBusinessNumber?: string): string {
    const fromForm = formBusinessNumber ?? this.form?.get('businessNumber')?.value;
    if (fromForm) return fromForm;
    if (this.businessStatus === BusinessStatus.SINGLE_BUSINESS && this.userData?.businessNumber) {
      return this.userData.businessNumber;
    }
    const businesses = this.gs.businesses();
    return businesses[0]?.businessNumber ?? '';
  }

  // ===========================
  // Handle filter submit
  // ===========================
  onSubmit(formValues: any): void {
    console.log("Submitted filter (formValues):", formValues);

    const effectiveBusiness = this.getEffectiveBusinessNumber(formValues.businessNumber);
    this.selectedBusinessNumber.set(effectiveBusiness);

    const business = this.gs.businesses().find(b => b.businessNumber === effectiveBusiness);
    if (business) {
      this.selectedBusinessName.set(business.businessName);
    }

    // קריאה ישירה מהטופס כמו בדוח מעמ – מונעת ערך לא מעודכן מ-formValues
    const periodMode = this.form.get('periodMode')?.value;
    const year = Number(this.form.get('year')?.value) || new Date().getFullYear();
    let month = Number(this.form.get('month')?.value);
    const localStartDate = this.form.get('startDate')?.value;
    const localEndDate = this.form.get('endDate')?.value;

    console.log('[הוצאות] ערכים מהטופס לפני חישוב תאריכים:', { periodMode, year, month, localStartDate, localEndDate });

    if (periodMode === ReportingPeriodType.BIMONTHLY && !Number.isNaN(month) && month >= 1 && month <= 12) {
      if (month <= 2) month = 1;
      else if (month <= 4) month = 3;
      else if (month <= 6) month = 5;
      else if (month <= 8) month = 7;
      else if (month <= 10) month = 9;
      else month = 11;
    }

    const { startDate, endDate } = this.dateService.getStartAndEndDates(
      periodMode,
      year,
      month,
      localStartDate,
      localEndDate
    );

    this.startDate = startDate;
    this.endDate = endDate;

    this.fetchExpenses(effectiveBusiness, startDate, endDate);
  }

  // ===========================
  // Fetch expenses from server
  // ===========================
  fetchExpenses(
    businessNumber: string,
    startDate?: string,
    endDate?: string
  ): void {
    // Use default dates if not provided
    const finalStartDate = startDate || this.startDate || '';
    const finalEndDate = endDate || this.endDate || '';

    console.log('[הוצאות] תאריכים שנשלחים לבקאנד (get-expenses-for-vat-report):', {
      startDate: finalStartDate,
      endDate: finalEndDate,
      businessNumber: businessNumber || '(ריק)',
    });

    this.isLoadingDataTable.set(true);

    this.myExpenses = this.expenseDataService
      .getExpenseForVatReport(finalStartDate, finalEndDate, businessNumber)
      .pipe(
        map((rows: any[]) => {
          console.log('[הוצאות] תשובה מהבקאנד: מספר הוצאות=', rows?.length ?? 0, 'פרטים:', rows?.map((r) => ({ id: r.id, date: r.date, businessNumber: r.businessNumber, sum: r.sum })) ?? []);
          return rows.map(row => {
            // Format sum with currency
            const sumValue = row.sum as number;
            const formattedSum = this.gs.addComma(Math.abs(sumValue));
            const sumWithCurrency = `${formattedSum} ש"ח`;

            // Format totalTaxPayable with currency
            const taxPayableValue = row.totalTaxPayable as number;
            const formattedTaxPayable = taxPayableValue ? this.gs.addComma(Math.abs(taxPayableValue)) : '0';
            const taxPayableWithCurrency = `${formattedTaxPayable} ש"ח`;

            // Format totalVatPayable with currency
            const vatPayableValue = row.totalVatPayable as number;
            const formattedVatPayable = vatPayableValue ? this.gs.addComma(Math.abs(vatPayableValue)) : '0';
            const vatPayableWithCurrency = `${formattedVatPayable} ש"ח`;

            // Format percentages
            const taxPercent = row.taxPercent ? `${row.taxPercent}%` : '0%';
            const vatPercent = row.vatPercent ? `${row.vatPercent}%` : '0%';

            return {
              ...row,
              sum: sumWithCurrency,
              totalTaxPayable: taxPayableWithCurrency,
              totalVatPayable: vatPayableWithCurrency,
              taxPercent: taxPercent,
              vatPercent: vatPercent,
            };
          });
        }),
        catchError(err => {
          console.error("Error fetching expenses:", err);
          this.messageService.add({
            severity: 'error',
            summary: 'שגיאה',
            detail: 'שגיאה בטעינת ההוצאות',
            life: 3000,
            key: 'br'
          });
          return EMPTY;
        }),
        finalize(() => this.isLoadingDataTable.set(false))
      );
  }

  // ===========================
  // Set file actions
  // ===========================
  private setFileActions(): void {
    this.fileActions.set([
      {
        name: 'edit',
        icon: 'pi pi-pencil',
        title: 'ערוך',
        action: (event: any, row: IRowDataTable) => {
          this.onEditExpense(row);
        }
      },
      {
        name: 'delete',
        icon: 'pi pi-trash',
        title: 'מחק',
        action: (event: any, row: IRowDataTable) => {
          this.onDeleteExpense(row);
        }
      },
      {
        name: 'preview',
        icon: 'pi pi-eye',
        title: 'צפה בקובץ',
        action: (event: any, row: IRowDataTable) => {
          this.onPreviewFile(row);
        }
      }
    ]);
  }

  // ===========================
  // Actions
  // ===========================
  onEditExpense(row: IRowDataTable): void {
    console.log("Edit expense:", row);
    this.expenseDataService.openModalAddExpense(row, true)
      .pipe(
        catchError(err => {
          console.error("Error opening edit modal:", err);
          return EMPTY;
        })
      )
      .subscribe((result) => {
        if (result && result.data) {
          console.log("Expense updated:", result.data);
          // Refresh expenses after update
          this.fetchExpenses(this.selectedBusinessNumber(), this.startDate, this.endDate);
          this.messageService.add({
            severity: 'success',
            summary: 'הצלחה',
            detail: 'ההוצאה עודכנה בהצלחה',
            life: 3000,
            key: 'br'
          });
        }
      });
  }

  onDeleteExpense(row: IRowDataTable): void {
    console.log("Delete expense:", row);
    this.confirmationService.confirm({
      message: 'האם אתה בטוח שברצונך למחוק את ההוצאה?',
      header: 'אישור מחיקה',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'מחק',
      rejectLabel: 'ביטול',
      acceptVisible: true,
      rejectVisible: true,
      accept: () => {
        const expenseId = typeof row.id === 'number' ? row.id : Number(row.id);
        if (expenseId && !isNaN(expenseId)) {
          this.expenseDataService.deleteExpense(expenseId)
            .pipe(
              catchError(err => {
                console.error("Error deleting expense:", err);
                this.messageService.add({
                  severity: 'error',
                  summary: 'שגיאה',
                  detail: 'שגיאה במחיקת ההוצאה',
                  life: 3000,
                  key: 'br'
                });
                return EMPTY;
              })
            )
            .subscribe(() => {
              // Refresh expenses after deletion
              this.fetchExpenses(this.selectedBusinessNumber(), this.startDate, this.endDate);
              this.messageService.add({
                severity: 'success',
                summary: 'הצלחה',
                detail: 'ההוצאה נמחקה בהצלחה',
                life: 3000,
                key: 'br'
              });
            });
        }
      }
    });
  }

  /** תצוגה מקדימה של קובץ – כמו בטבלת הכנסות */
  onPreviewFile(row: IRowDataTable): void {
    const filePath = row.file as string | undefined;
    if (filePath && filePath !== '') {
      this.filesService.previewFile(filePath).subscribe();
    } else {
      alert('לא נשמר קובץ עבור הוצאה זו');
    }
  }
}

