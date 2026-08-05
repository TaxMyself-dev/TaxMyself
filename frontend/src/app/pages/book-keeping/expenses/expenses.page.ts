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
  ICellRenderer,
  VATReportingType
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
  /** Base P&L columns. The VAT-report-period column is NOT here — it's
   *  inserted by `updateExpensesColumns()` only for VAT-licensed businesses. */
  private readonly baseExpensesTableFields: IColumnDataTable<ExpenseFormColumns, ExpenseFormHebrewColumns>[] = [
    { name: ExpenseFormColumns.SUPPLIER, value: ExpenseFormHebrewColumns.supplier, type: FormTypes.TEXT },
    { name: ExpenseFormColumns.CATEGORY, value: ExpenseFormHebrewColumns.category, type: FormTypes.TEXT },
    { name: ExpenseFormColumns.SUB_CATEGORY, value: ExpenseFormHebrewColumns.subCategory, type: FormTypes.TEXT },
    { name: ExpenseFormColumns.SUM, value: ExpenseFormHebrewColumns.sum, type: FormTypes.NUMBER, cellRenderer: ICellRenderer.SUM_WITH_FX },
    { name: ExpenseFormColumns.DATE, value: ExpenseFormHebrewColumns.date, type: FormTypes.DATE, cellRenderer: ICellRenderer.DATE },
    { name: ExpenseFormColumns.TOTAL_VAT, value: ExpenseFormHebrewColumns.totalVat, type: FormTypes.NUMBER, cellRenderer: ICellRenderer.AMOUNT_WITH_PERCENT },
    { name: ExpenseFormColumns.TOTAL_TAX, value: ExpenseFormHebrewColumns.totalTax, type: FormTypes.NUMBER, cellRenderer: ICellRenderer.TAX_WITH_EQUIPMENT },
    // No "סוג דוח" column — annual-report expenses are shown in a SEPARATE
    // table below the regular ones instead. P&L-category stays visible.
    { name: ExpenseFormColumns.PNL_CATEGORY, value: ExpenseFormHebrewColumns.pnlCategory, type: FormTypes.TEXT },
  ];

  /** VAT-report-period column. Shown only for VAT-licensed businesses; the
   *  value is the period label already stamped on the expense, so it reads as
   *  a single month ("1/2024") or a dual month ("1-2/2024") exactly as the
   *  business reports. MUST use the MONTH_REPORT renderer — the column name
   *  contains "date", which would otherwise hit the generic table's date-name
   *  catch-all and run the label through the dateFormat pipe (turning
   *  "1-2/2026" into "02/01/2026"). */
  private readonly vatReportPeriodField: IColumnDataTable<ExpenseFormColumns, ExpenseFormHebrewColumns> =
    { name: ExpenseFormColumns.VAT_REPORT_PERIOD, value: ExpenseFormHebrewColumns.vatReportingDate, type: FormTypes.TEXT, cellRenderer: ICellRenderer.MONTH_REPORT };

  /** Main table columns — recomputed per selected business by
   *  `updateExpensesColumns()`. Starts as the base set. */
  expensesTableFields: IColumnDataTable<ExpenseFormColumns, ExpenseFormHebrewColumns>[] = [...this.baseExpensesTableFields];

  /** Annual-report table reuses the base columns minus PNL_CATEGORY
   *  (it's meaningless for rows that don't go to the P&L). Annual-only
   *  expenses aren't VAT-reported, so they never get the period column. */
  annualExpensesTableFields: IColumnDataTable<ExpenseFormColumns, ExpenseFormHebrewColumns>[] =
    this.baseExpensesTableFields.filter(c => c.name !== ExpenseFormColumns.PNL_CATEGORY);

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
      this.updateExpensesColumns(this.selectedBusinessNumber());
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
    this.updateExpensesColumns(initialBusiness);
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

    this.updateExpensesColumns(effectiveBusiness);

    const { startDate, endDate } = this.gs.getPeriodDatesFromForm(this.form);
    this.startDate = startDate;
    this.endDate = endDate;

    this.fetchExpenses(effectiveBusiness, startDate, endDate);
  }

  // ===========================
  // Rebuild main-table columns for the selected business
  // ===========================
  /**
   * A VAT-licensed business (monthly / bimonthly filer) gets the
   * "תקופת דיווח מע"מ" column inserted right after the date; exempt
   * businesses don't file VAT reports, so the period is meaningless and the
   * column is left out.
   */
  private updateExpensesColumns(businessNumber: string): void {
    const business = this.gs.businesses().find(b => b.businessNumber === businessNumber);
    const vatLicensed =
      business?.vatReportingType === VATReportingType.MONTHLY_REPORT ||
      business?.vatReportingType === VATReportingType.DUAL_MONTH_REPORT;

    if (!vatLicensed) {
      this.expensesTableFields = [...this.baseExpensesTableFields];
      return;
    }

    const cols = [...this.baseExpensesTableFields];
    const dateIdx = cols.findIndex(c => c.name === ExpenseFormColumns.DATE);
    cols.splice(dateIdx + 1, 0, this.vatReportPeriodField);
    this.expensesTableFields = cols;
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
            // the column. pnlCategory column: since Phase 4.4 (D3) the P&L
            // grouping is the expense's accounting-section snapshot
            // (sectionNameSnapshot) — the old resolvedPnlCategory precedence
            // chain is gone; "—" means the expense has no section (unmapped
            // or posted to a technical account).
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
              pnlCategory: row.sectionNameSnapshot ?? '—',
              // VAT report period as stamped on the expense — single month
              // ("1/2024") or dual month ("1-2/2024") per the business's
              // cadence. Legacy rows without a stamp show "—".
              vatReportingDate: row.vatReportingDate ?? '—',
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
        showWhen: (row: IRowDataTable) => this.hasFile(row),
        action: (event: any, row: IRowDataTable) => {
          this.onPreviewFile(row);
        }
      },
      {
        // When the row has no attached file, surface an "add file" action
        // instead of the (useless) preview icon. Opens the edit dialog where
        // the user can attach the missing file.
        name: 'addFile',
        icon: 'pi pi-upload',
        title: 'הוסף קובץ',
        alwaysShow: true,
        showWhen: (row: IRowDataTable) => !this.hasFile(row),
        action: (event: any, row: IRowDataTable) => {
          this.onAddFile(row);
        }
      }
    ]);
  }

  /** True when the row has a stored file path. */
  private hasFile(row: IRowDataTable): boolean {
    const filePath = row?.file as string | undefined;
    return !!filePath && filePath !== '';
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
      focusOnShow: false,
      data: { editMode: true, expense: row }
    });
    ref.onClose.subscribe((result) => {
      if (result != null) {
        this.fetchExpenses(this.selectedBusinessNumber(), this.startDate, this.endDate);
      }
    });
  }

  onDeleteExpense(row: IRowDataTable): void {
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

  /**
   * הוספת קובץ להוצאה שאין לה קובץ – פותח בורר קבצים, מעלה את הקובץ ומצרף
   * אותו להוצאה (ללא פתיחת דיאלוג העריכה). מבוסס על אותו זרם של טבלת מע"מ.
   */
  onAddFile(row: IRowDataTable): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.jpg,.jpeg,.png';
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) {
        this.uploadFileToExpense(row, file);
      }
    };
    input.click();
  }

  /** Upload a file via Firebase and attach it to the expense, then refresh. */
  private uploadFileToExpense(row: IRowDataTable, file: File): void {
    this.gs.getLoader().subscribe();
    this.filesService.addFileToExpense(row, this.selectedBusinessNumber(), file)
      .pipe(
        catchError(err => {
          console.error('Error attaching file to expense:', err);
          this.messageService.add({
            severity: 'error',
            summary: 'שגיאה',
            detail: 'שגיאה בהעלאת הקובץ',
            life: 3000,
            key: 'br'
          });
          return EMPTY;
        }),
        finalize(() => this.gs.dismissLoader())
      )
      .subscribe(() => {
        this.fetchExpenses(this.selectedBusinessNumber(), this.startDate, this.endDate);
        this.messageService.add({
          severity: 'success',
          summary: 'הצלחה',
          detail: 'הקובץ הועלה בהצלחה',
          life: 3000,
          key: 'br'
        });
      });
  }

  /** תצוגה מקדימה של קובץ – כמו בטבלת הכנסות */
  onPreviewFile(row: IRowDataTable): void {
    const filePath = row.file as string | undefined;
    if (filePath && filePath !== '') {
      this.filesService.previewFile(filePath).subscribe();
    } else {
      this.messageService.add({
        severity: 'info',
        summary: 'אין קובץ',
        detail: 'לא נשמר קובץ עבור הוצאה זו',
        life: 3000,
        key: 'br'
      });
    }
  }
}

