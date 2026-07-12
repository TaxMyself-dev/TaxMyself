import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup } from '@angular/forms';
import { catchError, of } from 'rxjs';
import { Workbook, Worksheet } from 'exceljs';
import { ExpenseDataService } from 'src/app/services/expense-data.service';
import { LedgerReportService } from 'src/app/pages/ledger-report/ledger-report.service';
import { ConfirmationService } from 'primeng/api';
import { ButtonSize, ButtonColor } from 'src/app/components/button/button.enum';
import { FilterField } from 'src/app/components/filter-tab/filter-fields-model.component';
import { finalize } from 'rxjs/operators';

const NECESSITY_LABELS: Record<string, string> = {
  MANDATORY: 'הכרחי',
  IMPORTANT: 'חשוב',
  OPTIONAL: 'רשות',
};

const NECESSITY_OPTIONS = [
  { label: 'הכרחי', value: 'MANDATORY' },
  { label: 'חשוב', value: 'IMPORTANT' },
  { label: 'רשות', value: 'OPTIONAL' },
];

const REPORT_SCOPE_LABELS: Record<string, string> = {
  pnl: 'רווח והפסד',
  annual: 'דוח שנתי בלבד',
};

const REPORT_SCOPE_OPTIONS = [
  { label: 'רווח והפסד', value: 'pnl' },
  { label: 'דוח שנתי בלבד', value: 'annual' },
];

@Component({
  selector: 'app-category-management',
  templateUrl: './category-management.component.html',
  styleUrls: ['./category-management.component.scss'],
  standalone: false,
})
export class CategoryManagementComponent implements OnInit {
  private destroyRef = inject(DestroyRef);
  private expenseDataService = inject(ExpenseDataService);
  private ledgerReportService = inject(LedgerReportService);
  private confirmationService = inject(ConfirmationService);
  private fb = inject(FormBuilder);

  readonly buttonSize = ButtonSize;
  readonly ButtonColor = ButtonColor;
  necessityOptions = NECESSITY_OPTIONS;
  reportScopeOptions = REPORT_SCOPE_OPTIONS;
  readonly NEW_CATEGORY_VALUE = '__NEW__';

  subCategories = signal<any[]>([]);
  loading = signal<boolean>(false);
  showAddDialog = signal<boolean>(false);

  // ── Filters ─────────────────────────────────────────────────────────────
  // '' = no filter (show all). Boolean filters use 'true' / 'false' strings.
  filterCategory = signal<string>('');
  filterIsExpense = signal<string>('');       // '' | 'true' | 'false'
  filterIsRecognized = signal<string>('');    // '' | 'true' | 'false'
  filterReportScope = signal<string>('');     // '' | 'pnl' | 'annual'
  filterIsEquipment = signal<string>('');     // '' | 'true' | 'false'

  /** Form for the shared filter-tab component. Controls are created lazily
   *  by FilterTabComponent from `filterConfig` — no need to declare them here. */
  filterForm: FormGroup = this.fb.group({});

  /** Distinct category names sourced from loaded subcategories (signal-backed,
   *  so the dropdown refreshes when subCategories() changes). */
  private categorySelectItems = computed(() => {
    const names = [...new Set(this.subCategories().map((s) => s.categoryName).filter(Boolean))].sort();
    return [{ name: 'הכל', value: '' }, ...names.map((n) => ({ name: n, value: n }))];
  });

  /** Yes/no/all tri-state used by isExpense / isRecognized / isEquipment. */
  private readonly triStateOptions = [
    { name: 'הכל', value: '' },
    { name: 'כן',  value: 'true' },
    { name: 'לא',  value: 'false' },
  ];

  /** reportScope options for the filter (PNL / ANNUAL / all). */
  private readonly reportScopeFilterOptions = [
    { name: 'הכל', value: '' },
    { name: 'רווח והפסד', value: 'pnl' },
    { name: 'דוח שנתי בלבד', value: 'annual' },
  ];

  /** Shared filter-tab configuration — passed to <app-filter-tab>. */
  readonly filterConfig: FilterField[] = [
    { type: 'select', controlName: 'categoryName',  label: 'קטגוריה', options: this.categorySelectItems,        defaultValue: '' },
    { type: 'select', controlName: 'isExpense',     label: 'הוצאה',   options: this.triStateOptions,            defaultValue: '' },
    { type: 'select', controlName: 'isRecognized',  label: 'מוכר',    options: this.triStateOptions,            defaultValue: '' },
    { type: 'select', controlName: 'reportScope',   label: 'סוג דוח', options: this.reportScopeFilterOptions,   defaultValue: '' },
    { type: 'select', controlName: 'isEquipment',   label: 'ציוד',    options: this.triStateOptions,            defaultValue: '' },
  ];

  /** Filtered list bound to the table. '' on every filter ⇒ show all. */
  filteredSubCategories = computed(() => {
    const cat = this.filterCategory();
    const exp = this.filterIsExpense();
    const rec = this.filterIsRecognized();
    const scope = this.filterReportScope();
    const equip = this.filterIsEquipment();
    return this.subCategories().filter((s) => {
      if (cat   && s.categoryName !== cat) return false;
      if (exp   && String(!!s.isExpense)     !== exp)   return false;
      if (rec   && String(!!s.isRecognized)  !== rec)   return false;
      if (scope && (s.reportScope ?? 'pnl')  !== scope) return false;
      if (equip && String(!!s.isEquipment)   !== equip) return false;
      return true;
    });
  });

  /** Apply event from <app-filter-tab>: copy form values into signals. */
  onApplyFilter(value: any): void {
    this.filterCategory.set(value?.categoryName ?? '');
    this.filterIsExpense.set(value?.isExpense ?? '');
    this.filterIsRecognized.set(value?.isRecognized ?? '');
    this.filterReportScope.set(value?.reportScope ?? '');
    this.filterIsEquipment.set(value?.isEquipment ?? '');
  }
  addForm: Partial<{
    subCategoryName: string;
    categoryName: string;
    categoryChoice: string;
    taxPercent: number;
    vatPercent: number;
    reductionPercent: number;
    isEquipment: boolean;
    isRecognized: boolean;
    isExpense: boolean;
    necessity: string;
    reportScope: string;
    pnlCategory: string | null;
  }> = {};

  /** רשימת קטגוריות קיימות + "קטגוריה חדשה" לבחירה בדיאלוג הוספה */
  categoryOptionsForAdd = computed(() => {
    const names = [...new Set(this.subCategories().map((s) => s.categoryName).filter(Boolean))].sort();
    const existing = names.map((n) => ({ label: n, value: n }));
    return [...existing, { label: 'קטגוריה חדשה', value: this.NEW_CATEGORY_VALUE }];
  });

  ngOnInit() {
    this.loadSubCategories();
  }

  loadSubCategories(): void {
    this.loading.set(true);
    this.expenseDataService
      .getAllDefaultSubCategories()
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (data) => {
          this.subCategories.set(Array.isArray(data) ? data : []);
        },
        error: () => {
          this.subCategories.set([]);
        },
      });
  }

  necessityLabel(necessity: string): string {
    return NECESSITY_LABELS[necessity] ?? necessity ?? '';
  }

  reportScopeLabel(scope: string): string {
    return REPORT_SCOPE_LABELS[scope] ?? 'רווח והפסד';
  }

  editRow = signal<any | null>(null);
  showEditDialog = signal<boolean>(false);
  editForm: Record<string, any> = {};

  openUpdateConfirm(row: any): void {
    this.editRow.set(row);
    this.editForm = {
      subCategoryName: row.subCategoryName,
      categoryName: row.categoryName,
      taxPercent: row.taxPercent,
      vatPercent: row.vatPercent,
      reductionPercent: row.reductionPercent,
      isEquipment: row.isEquipment,
      isRecognized: row.isRecognized,
      isExpense: row.isExpense,
      necessity: row.necessity,
      reportScope: row.reportScope ?? 'pnl',
      pnlCategory: row.pnlCategory ?? null,
    };
    this.showEditDialog.set(true);
  }

  closeEditDialog(): void {
    this.showEditDialog.set(false);
    this.editRow.set(null);
  }

  confirmAndSaveEdit(): void {
    const row = this.editRow();
    if (!row) return;
    this.confirmationService.confirm({
      message: 'האם אתה בטוח שברצונך לעדכן קטגוריה זו?',
      header: 'אישור עדכון',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'כן',
      rejectLabel: 'לא',
      accept: () => {
        this.updateSubCategory(row, this.editForm);
        this.closeEditDialog();
      },
    });
  }

  updateSubCategory(row: any, updated: any): void {
    this.loading.set(true);
    this.expenseDataService
      .updateDefaultSubCategory(row.id, updated)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.loadSubCategories();
        },
        error: () => this.loading.set(false),
        complete: () => this.loading.set(false),
      });
  }

  openAddSubCategory(): void {
    this.addForm = {
      subCategoryName: '',
      categoryName: '',
      categoryChoice: this.NEW_CATEGORY_VALUE,
      taxPercent: 0,
      vatPercent: 0,
      reductionPercent: 0,
      isEquipment: false,
      isRecognized: false,
      isExpense: true,
      necessity: 'IMPORTANT',
      reportScope: 'pnl',
      pnlCategory: null,
    };
    this.showAddDialog.set(true);
  }

  onAddCategoryChoiceChange(value: string): void {
    if (value === this.NEW_CATEGORY_VALUE) {
      this.addForm.categoryName = '';
    } else {
      this.addForm.categoryName = value ?? '';
    }
  }

  closeAddDialog(): void {
    this.showAddDialog.set(false);
  }

  confirmDelete(row: any): void {
    this.confirmationService.confirm({
      message: `האם אתה בטוח שברצונך למחוק את תת הקטגוריה "${row.subCategoryName}"?`,
      header: 'אישור מחיקה',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'כן, מחק',
      rejectLabel: 'ביטול',
      accept: () => {
        this.loading.set(true);
        this.expenseDataService
          .deleteDefaultSubCategory(row.id)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: () => this.loadSubCategories(),
            error: () => this.loading.set(false),
          });
      },
    });
  }

  saveAddSubCategory(): void {
    const categoryName = this.addForm.categoryChoice === this.NEW_CATEGORY_VALUE
      ? (this.addForm.categoryName ?? '').trim()
      : (this.addForm.categoryChoice ?? '');
    const body = { ...this.addForm, categoryName };
    delete (body as any).categoryChoice;
    this.loading.set(true);
    this.expenseDataService
      .addDefaultSubCategory(body)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.closeAddDialog();
          this.loadSubCategories();
        },
        error: () => this.loading.set(false),
      });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Excel export — all default sub-categories, split into "מוכרות" /
  // "לא מוכרות" sheets. Same exceljs pattern (RTL, bold header, download via
  // Blob) as ledger-report.page.ts's exportToExcel().
  // ──────────────────────────────────────────────────────────────────────────

  exportingExcel = signal<boolean>(false);

  exportToExcel(): void {
    if (this.exportingExcel() || !this.subCategories().length) return;
    this.exportingExcel.set(true);
    this.ledgerReportService.getLedgerAccounts()
      .pipe(
        catchError(() => of([])),
        finalize(() => this.exportingExcel.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((accounts) => {
        const accountNameByCode = new Map((accounts ?? []).map((a) => [a.code, a.name]));
        this.buildAndDownloadSubCategoriesWorkbook(accountNameByCode);
      });
  }

  private buildAndDownloadSubCategoriesWorkbook(accountNameByCode: Map<string, string>): void {
    const header = [
      'קטגוריה', 'תת קטגוריה', 'אחוז מוכר (מס)', 'אחוז מע"מ מוכר', 'אחוז הפחתה',
      'קוד חשבון', 'שם חשבון', 'קטגוריית רווח והפסד', 'ציוד (פחת)', 'הכרחיות', 'תחום דיווח',
    ];

    const HEADER_FILL: any = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F6F9' } };

    const wb = new Workbook();
    const recognized = this.subCategories().filter((s) => !!s.isRecognized);
    const notRecognized = this.subCategories().filter((s) => !s.isRecognized);

    for (const [sheetName, rows] of [
      ['הוצאות מוכרות', recognized],
      ['הוצאות לא מוכרות', notRecognized],
    ] as const) {
      const ws = wb.addWorksheet(sheetName, { views: [{ rightToLeft: true }] });
      const headerRow = ws.addRow(header);
      headerRow.font = { bold: true };
      headerRow.fill = HEADER_FILL;

      for (const row of rows) {
        ws.addRow([
          row.categoryName,
          row.subCategoryName,
          row.taxPercent,
          row.vatPercent,
          row.reductionPercent,
          row.accountCode || '',
          row.accountCode ? (accountNameByCode.get(row.accountCode) || '') : '',
          row.pnlCategory || '',
          row.isEquipment ? 'כן' : 'לא',
          this.necessityLabel(row.necessity),
          this.reportScopeLabel(row.reportScope),
        ]);
      }

      for (let i = 1; i <= header.length; i++) {
        ws.getColumn(i).width = 16;
      }
      this.alignAllCellsRight(ws);
    }

    this.addAccountantSheet(wb, accountNameByCode);

    wb.xlsx.writeBuffer().then((buffer) => {
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'תתי-קטגוריות.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  /** Pastel rotation used to give each accountCode block a distinct, uniform
   *  background across all its rows (not row-by-row alternating). */
  private static readonly ACCOUNT_BLOCK_COLORS = [
    'FFFCE4EC', 'FFE3F2FD', 'FFE8F5E9', 'FFFFF3E0', 'FFF3E5F5', 'FFE0F7FA',
  ];

  /**
   * Third sheet, laid out for the accountant: one row per sub-category
   * (recognized AND not-recognized combined — unlike the other two sheets),
   * sorted by accountCode then subCategoryName, with each accountCode's rows
   * sharing one solid pastel background so card boundaries are visible at a
   * glance even across many accounts.
   *
   * "קטגoריה ל-6111" has no backing field anywhere in the system yet (see
   * exportToExcel's repo-wide search — no form6111/reportCode/6111 column
   * exists on default_sub_category, default_booking_account, or elsewhere).
   * Left blank here for the accountant to fill in manually until such a
   * field is added.
   */
  private addAccountantSheet(wb: Workbook, accountNameByCode: Map<string, string>): void {
    const header = [
      'שם הכרטיס', 'מספר הכרטיס', 'הוצאה', 'קוד תת-חשבון', 'אחוז מוכר למס הכנסה', 'אחוז מוכר למע"מ',
      'פחת', 'אחוז פחת', 'קטגוריה לדוח רווח והפסד', 'קטגוריה ל-6111',
    ];
    const HEADER_FILL: any = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F6F9' } };

    const rows = [...this.subCategories()].sort((a, b) => {
      const codeA = a.accountCode || '';
      const codeB = b.accountCode || '';
      if (codeA !== codeB) {
        if (!codeA) return 1;
        if (!codeB) return -1;
        return codeA.localeCompare(codeB);
      }
      return (a.subCategoryName || '').localeCompare(b.subCategoryName || '');
    });

    const ws = wb.addWorksheet('רואה חשבון', { views: [{ rightToLeft: true }] });
    const headerRow = ws.addRow(header);
    headerRow.font = { bold: true };
    headerRow.fill = HEADER_FILL;

    let previousCode: string | null = null;
    let colorIndex = -1;
    for (const row of rows) {
      const code = row.accountCode || '';
      if (code !== previousCode) {
        colorIndex = (colorIndex + 1) % CategoryManagementComponent.ACCOUNT_BLOCK_COLORS.length;
        previousCode = code;
      }

      const dataRow = ws.addRow([
        code ? (accountNameByCode.get(code) || '') : '',
        code,
        row.subCategoryName,
        row.subAccountCode || '',
        row.taxPercent,
        row.vatPercent,
        row.isEquipment ? 'כן' : 'לא',
        row.reductionPercent,
        row.pnlCategory || '',
        '', // קטגוריה ל-6111 — no backing field in the system yet; filled manually.
      ]);
      dataRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: CategoryManagementComponent.ACCOUNT_BLOCK_COLORS[colorIndex] },
      } as any;
    }

    for (let i = 1; i <= header.length; i++) {
      ws.getColumn(i).width = 16;
    }
    this.alignAllCellsRight(ws);
  }

  /** Force right-alignment on every cell (header + data, text and numeric alike)
   *  so the RTL worksheet view doesn't leave numeric columns locale-aligned left. */
  private alignAllCellsRight(ws: Worksheet): void {
    ws.eachRow((row) => {
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.alignment = { horizontal: 'right' };
      });
    });
  }
}
