import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup } from '@angular/forms';
import { ExpenseDataService } from 'src/app/services/expense-data.service';
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

  onCategoriesUploaded(event: { status: boolean; message: string }): void {
    if (event?.status) {
      this.loadSubCategories();
    }
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
}
