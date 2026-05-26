import { Component, OnInit, signal, inject } from '@angular/core';
import { EMPTY } from 'rxjs';
import { catchError, finalize, map, shareReplay } from 'rxjs/operators';
import { ExpenseDataService } from 'src/app/services/expense-data.service';
import { GenericService } from 'src/app/services/generic.service';
import { IColumnDataTable, IMobileCardConfig, IRowDataTable, ITableRowAction, IUserData } from 'src/app/shared/interface';
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
import { DialogService } from 'primeng/dynamicdialog';
import { MannualExpenseComponent } from 'src/app/components/mannual-expense/mannual-expense.component';

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
  private dialogService = inject(DialogService);
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
  myExpenses: any;          // P&L (regular) expenses — bound to the main table
  myAnnualExpenses: any;    // annual-report-only expenses — separate section
  fileActions = signal<ITableRowAction[]>([]);

  // ===========================
  // Table config
  // ===========================
  // VAT/Tax: ONE column each, rendered via AMOUNT_WITH_PERCENT — the amount
  // (₪) sits on top and the % shows in parens underneath (same pattern as
  // the VAT-report expenses table). The renderer reads the matching
  // percent field automatically (`totalVatPayable` → `vatPercent`,
  // `totalTaxPayable` → `taxPercent`); no separate column needed.
  expensesTableFields: IColumnDataTable<ExpenseFormColumns, ExpenseFormHebrewColumns>[] = [
    { name: ExpenseFormColumns.SUPPLIER, value: ExpenseFormHebrewColumns.supplier, type: FormTypes.TEXT },
    { name: ExpenseFormColumns.CATEGORY, value: ExpenseFormHebrewColumns.category, type: FormTypes.TEXT },
    { name: ExpenseFormColumns.SUB_CATEGORY, value: ExpenseFormHebrewColumns.subCategory, type: FormTypes.TEXT },
    { name: ExpenseFormColumns.SUM, value: ExpenseFormHebrewColumns.sum, type: FormTypes.NUMBER, cellRenderer: ICellRenderer.SUM_WITH_FX },
    { name: ExpenseFormColumns.DATE, value: ExpenseFormHebrewColumns.date, type: FormTypes.DATE, cellRenderer: ICellRenderer.DATE },
    { name: ExpenseFormColumns.TOTAL_VAT, value: ExpenseFormHebrewColumns.totalVat, type: FormTypes.NUMBER, cellRenderer: ICellRenderer.AMOUNT_WITH_PERCENT },
    { name: ExpenseFormColumns.TOTAL_TAX, value: ExpenseFormHebrewColumns.totalTax, type: FormTypes.NUMBER, cellRenderer: ICellRenderer.AMOUNT_WITH_PERCENT },
    // No "סוג דוח" column — annual-report expenses are shown in a SEPARATE
    // table below the regular ones instead. P&L-category stays visible.
    { name: ExpenseFormColumns.PNL_CATEGORY, value: ExpenseFormHebrewColumns.pnlCategory, type: FormTypes.TEXT },
  ];

  /** Annual-report table reuses the same columns minus PNL_CATEGORY
   *  (it's meaningless for rows that don't go to the P&L). */
  annualExpensesTableFields: IColumnDataTable<ExpenseFormColumns, ExpenseFormHebrewColumns>[] =
    this.expensesTableFields.filter(c => c.name !== ExpenseFormColumns.PNL_CATEGORY);

  mobileCardConfig: IMobileCardConfig = {
    primaryFields: [ExpenseFormColumns.SUPPLIER],
    highlightedField: ExpenseFormColumns.SUM,
    dateField: ExpenseFormColumns.DATE,
    hiddenFields: [],
  };


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

    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

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
        periodDefaults: this.gs.getDefaultPeriodConfig({ year: currentYear, month: String(currentMonth) })
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
    const initialBusiness = this.gs.getEffectiveBusinessNumber(this.form, undefined, this.userData);
    this.selectedBusinessNumber.set(initialBusiness);
    const initialBusinessObj = this.gs.businesses().find(b => b.businessNumber === initialBusiness);
    if (initialBusinessObj) {
      this.selectedBusinessName.set(initialBusinessObj.businessName);
    }
    this.fetchExpenses(initialBusiness, defaultStart, defaultEnd);
  }

  // ===========================
  // Handle filter submit
  // ===========================
  onSubmit(formValues: any): void {
    const effectiveBusiness = this.gs.getEffectiveBusinessNumber(this.form, formValues.businessNumber, this.userData);
    this.selectedBusinessNumber.set(effectiveBusiness);

    const business = this.gs.businesses().find(b => b.businessNumber === effectiveBusiness);
    if (business) {
      this.selectedBusinessName.set(business.businessName);
    }

    const { startDate, endDate } = this.gs.getPeriodDatesFromForm(this.form);
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

    this.isLoadingDataTable.set(true);

    const base$ = this.expenseDataService
      .getExpenseForVatReport(finalStartDate, finalEndDate, businessNumber)
      .pipe(
        map((rows: any[]) => {
          console.log('[הוצאות] תשובה מהבקאנד: מספר הוצאות=', rows?.length ?? 0, 'פרטים:', rows?.map((r) => ({ id: r.id, date: r.date, businessNumber: r.businessNumber, sum: r.sum })) ?? []);
          return rows.map(row => {
            // Sum column:
            //   ILS row → display "X ש"ח" as before.
            //   Non-ILS row → set `sum` to the formatted ORIGINAL amount with
            //     the currency symbol (e.g. "$20"), set `currency` and
            //     `ilsAmount` so the SUM_WITH_FX renderer can put the ILS
            //     value in parens underneath. The renderer's branch
            //     `row.currency && row.currency !== 'ILS'` decides which
            //     layout to draw.
            const ilsSum = row.sum as number;
            const oc = (row.originalCurrency ?? '').toUpperCase();
            const isForeign = oc && oc !== 'ILS' && row.originalSum != null;
            const sumDisplay = isForeign
              ? `${this.currencySymbol(oc)}${this.gs.addComma(Math.abs(Number(row.originalSum)))}`
              : `${this.gs.addComma(Math.abs(ilsSum))} ש"ח`;

            // reportScope: keep the raw value for filtering, show Hebrew in
            // the column. pnlCategory: backend attached `resolvedPnlCategory`
            // (per-expense override → subcategory default → null); "—" means
            // it uses the bookkeeping category.
            const rawScope = (row.reportScope ?? 'pnl') as string;

            return {
              ...row,
              sum: sumDisplay,
              // Surfacing these makes the SUM_WITH_FX renderer fire its
              // foreign-currency branch and read the converted ILS value.
              currency: isForeign ? oc : 'ILS',
              ilsAmount: isForeign ? ilsSum : null,
              // AMOUNT_WITH_PERCENT renderer expects NUMBERS so it can run
              // the `number` pipe and append "ש״ח" / "%" itself. Leave
              // totalTaxPayable / totalVatPayable / taxPercent / vatPercent
              // as numbers (default to 0 for null).
              totalTaxPayable: row.totalTaxPayable ?? 0,
              totalVatPayable: row.totalVatPayable ?? 0,
              taxPercent: row.taxPercent ?? 0,
              vatPercent: row.vatPercent ?? 0,
              reportScopeRaw: rawScope,
              reportScope: rawScope === 'annual' ? 'דוח שנתי' : 'רווח והפסד',
              // Raw per-expense override (for the Edit dialog prefill) vs the
              // resolved value shown in the table column.
              pnlCategoryOverrideRaw: row.pnlCategory ?? null,
              pnlCategory: row.resolvedPnlCategory ?? '—',
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
        finalize(() => this.isLoadingDataTable.set(false)),
        shareReplay(1),
      );

    // Regular (P&L) expenses → main table; annual-report-only → separate section.
    this.myExpenses = base$.pipe(
      map((rows: any[]) => rows.filter(r => r.reportScopeRaw !== 'annual')),
    );
    this.myAnnualExpenses = base$.pipe(
      map((rows: any[]) => rows.filter(r => r.reportScopeRaw === 'annual')),
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
        alwaysShow: true,
        action: (event: any, row: IRowDataTable) => {
          this.onEditExpense(row);
        }
      },
      {
        name: 'delete',
        icon: 'pi pi-trash',
        title: 'מחק',
        alwaysShow: true,
        action: (event: any, row: IRowDataTable) => {
          this.onDeleteExpense(row);
        }
      },
      {
        name: 'preview',
        icon: 'pi pi-eye',
        title: 'צפה בקובץ',
        alwaysShow: true,
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
    this.authService.setActiveBusinessNumber(this.selectedBusinessNumber());
    const ref = this.dialogService.open(MannualExpenseComponent, {
      header: 'עריכת הוצאה',
      width: '480px',
      style: { maxWidth: '95vw' },
      rtl: true,
      closable: true,
      dismissableMask: true,
      modal: true,
      data: { editMode: true, expense: row }
    });
    ref.onClose.subscribe((result) => {
      if (result != null) {
        this.fetchExpenses(this.selectedBusinessNumber(), this.startDate, this.endDate);
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

  /**
   * Currency code → display glyph. Same mapping the תזרים column uses; kept
   * local to avoid pulling in the generic-table helper from a page.
   */
  private currencySymbol(code: string | null | undefined): string {
    switch ((code ?? '').toUpperCase()) {
      case 'USD': return '$';
      case 'EUR': return '€';
      case 'GBP': return '£';
      case 'ILS': return '₪';
      default:    return code ?? '';
    }
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

