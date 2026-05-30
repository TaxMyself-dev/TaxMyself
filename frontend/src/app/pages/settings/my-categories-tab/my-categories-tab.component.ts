import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { DialogModule } from 'primeng/dialog';
import { CheckboxModule } from 'primeng/checkbox';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { ConfirmationService, MessageService } from 'primeng/api';
import { TransactionsService } from 'src/app/pages/transactions/transactions.page.service';
import { ExpenseDataService } from 'src/app/services/expense-data.service';
import { Business, IColumnDataTable, IRowDataTable, ISelectItem, ITableRowAction } from 'src/app/shared/interface';
import { ButtonComponent } from 'src/app/components/button/button.component';
import { ButtonColor, ButtonSize } from 'src/app/components/button/button.enum';
import { GenericTableComponent } from 'src/app/components/generic-table/generic-table.component';

export interface UserRuleRow {
  id: number;
  userId: string;
  transactionName: string;
  billId: number;
  billName: string | null;
  category: string;
  subCategory: string;
  vatPercent: number;
  taxPercent: number;
  reductionPercent: number;
  isEquipment: boolean;
  isRecognized: boolean;
  isExpense: boolean;
  startDate: string | null;
  endDate: string | null;
  minAbsSum: number | null;
  maxAbsSum: number | null;
  commentPattern: string | null;
  commentMatchType: 'equals' | 'contains';
  businessNumber: string | null;
  updatedAt: string;
}

export interface UserCategoryGroup {
  categoryName: string;
  userCategory: { id: number; categoryName: string; isExpense: boolean } | null;
  subCategories: Array<{
    id: number;
    subCategoryName: string;
    categoryName: string;
    taxPercent: number;
    vatPercent: number;
    reductionPercent: number;
    isEquipment: boolean;
    isRecognized: boolean;
    isExpense: boolean;
    necessity: string;
    isDefault?: boolean;
  }>;
}

@Component({
  selector: 'app-my-categories-tab',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    SelectModule,
    ConfirmDialogModule,
    ToastModule,
    DialogModule,
    CheckboxModule,
    InputNumberModule,
    InputTextModule,
    ButtonComponent,
    GenericTableComponent,
  ],
  templateUrl: './my-categories-tab.component.html',
  styleUrls: ['./my-categories-tab.component.scss'],
  providers: [ConfirmationService, MessageService],
})
export class MyCategoriesTabComponent {
  private transactionsService = inject(TransactionsService);
  private expenseDataService = inject(ExpenseDataService);
  private confirmationService = inject(ConfirmationService);
  private messageService = inject(MessageService);

  readonly buttonColor = ButtonColor;
  readonly buttonSize = ButtonSize;

  businesses = input<Business[]>([]);

  selectedBusinessNumber = signal<string | null>(null);
  rules = signal<UserRuleRow[]>([]);
  categoriesTableData = signal<IRowDataTable[]>([]);
  loading = signal(false);
  errorText = signal<string | null>(null);

  // Lookup map for the edit-sub dialog: sub id → raw sub-category object
  private readonly subCategoryRawById = new Map<number, UserCategoryGroup['subCategories'][number]>();

  categoriesColumns: IColumnDataTable<string, string>[] = [
    { name: 'categoryName',    value: 'קטגוריה' },
    { name: 'subCategoryName', value: 'תת-קטגוריה' },
    { name: 'badge',           value: 'סוג' },
    { name: 'vatPercent',       value: 'מע"מ %' },
    { name: 'taxPercent',       value: 'מס %' },
    { name: 'reductionPercent', value: 'הפחתה %' },
    { name: 'isEquipment',  value: 'ציוד' },
    { name: 'isRecognized', value: 'מוכרת' },
    { name: 'isExpense',    value: 'הוצאה' },
    { name: 'necessity',    value: 'הכרחיות' },
  ];

  readonly categoriesRowClass = (row: IRowDataTable): string =>
    row['rowType'] === 'category' ? 'gt-row--group-header' : '';

  categoriesRowActions: ITableRowAction[] = [
    {
      name: 'deleteCategory',
      icon: 'pi pi-trash',
      title: 'מחק קטגוריה',
      showWhen: (row) => row['rowType'] === 'category' && !!row['userCategoryId'],
      action: (_, row) => row && this.confirmDeleteCategory(row),
    },
    {
      name: 'editSub',
      icon: 'pi pi-pencil',
      title: 'ערוך',
      showWhen: (row) => row['rowType'] === 'subCategory',
      action: (_, row) => row && this.openEditSub(row),
    },
    {
      name: 'deleteSub',
      icon: 'pi pi-trash',
      title: 'מחק',
      showWhen: (row) => row['rowType'] === 'subCategory',
      action: (_, row) => row && this.confirmDeleteSubCategory(row),
    },
  ];

  // Rule edit modal state
  editRuleVisible = signal(false);
  editRuleSaving = signal(false);
  editRuleOriginal = signal<UserRuleRow | null>(null);
  editRuleForm = signal<{
    category: string;
    subCategory: string;
    vatPercent: number;
    taxPercent: number;
    reductionPercent: number;
    isEquipment: boolean;
    isRecognized: boolean;
    isExpense: boolean;
    minAbsSum: number | null;
    maxAbsSum: number | null;
    commentPattern: string | null;
    commentMatchType: 'equals' | 'contains';
  } | null>(null);
  editRuleCategoryOptions = signal<ISelectItem[]>([]);
  editRuleSubCategoryOptions = signal<ISelectItem[]>([]);

  // Sub-category edit modal state
  editSubVisible = signal(false);
  editSubSaving = signal(false);
  editSubOriginal = signal<UserCategoryGroup['subCategories'][number] | null>(null);
  editSubForm = signal<{
    vatPercent: number;
    taxPercent: number;
    reductionPercent: number;
    isEquipment: boolean;
    isRecognized: boolean;
    isExpense: boolean;
    necessity: string;
  } | null>(null);
  necessityOptions: ISelectItem[] = [
    { name: 'הכרחי', value: 'MANDATORY' },
    { name: 'חשוב', value: 'IMPORTANT' },
    { name: 'רשות', value: 'OPTIONAL' },
  ];

  businessOptions = computed(() =>
    this.businesses()
      .filter(b => !!b.businessNumber)
      .map(b => ({
        label: b.businessName ?? b.businessNumber,
        value: b.businessNumber as string,
      })),
  );

  constructor() {
    // Default to the first business once the list arrives.
    effect(() => {
      const options = this.businessOptions();
      if (!this.selectedBusinessNumber() && options.length > 0) {
        this.selectedBusinessNumber.set(options[0].value);
      }
    });

    // Refetch when the selected business changes.
    effect(() => {
      const bn = this.selectedBusinessNumber();
      if (bn) {
        this.loadData(bn);
      }
    });
  }

  onBusinessChange(value: string): void {
    this.selectedBusinessNumber.set(value);
  }

  formatAmountRange(min: number | null, max: number | null): string {
    if (min == null && max == null) return '—';
    if (min != null && max != null && min === max) return `₪${min}`;
    return `${min != null ? `₪${min}` : '...'} – ${max != null ? `₪${max}` : '...'}`;
  }

  formatDateRange(start: string | null, end: string | null): string {
    if (!start && !end) return '—';
    const s = start ? new Date(start).toLocaleDateString('he-IL') : '...';
    const e = end ? new Date(end).toLocaleDateString('he-IL') : '...';
    return `${s} – ${e}`;
  }

  // -----------------------------
  // Edit rule modal
  // -----------------------------
  openEditRule(rule: UserRuleRow): void {
    this.editRuleOriginal.set(rule);
    this.editRuleForm.set({
      category: rule.category,
      subCategory: rule.subCategory,
      vatPercent: rule.vatPercent ?? 0,
      taxPercent: rule.taxPercent ?? 0,
      reductionPercent: rule.reductionPercent ?? 0,
      isEquipment: rule.isEquipment ?? false,
      isRecognized: rule.isRecognized ?? false,
      isExpense: rule.isExpense ?? false,
      minAbsSum: rule.minAbsSum != null ? Number(rule.minAbsSum) : null,
      maxAbsSum: rule.maxAbsSum != null ? Number(rule.maxAbsSum) : null,
      commentPattern: rule.commentPattern ?? null,
      commentMatchType: rule.commentMatchType ?? 'equals',
    });
    this.editRuleVisible.set(true);
    this.loadCategoryOptions();
    this.loadSubCategoryOptions(rule.category);
  }

  onEditRuleCategoryChange(category: string): void {
    const form = this.editRuleForm();
    if (!form) return;
    this.editRuleForm.set({ ...form, category, subCategory: '' });
    this.loadSubCategoryOptions(category);
  }

  updateEditRuleField(key: string, value: any): void {
    const form = this.editRuleForm();
    if (!form) return;
    this.editRuleForm.set({ ...form, [key]: value } as typeof form);
  }

  saveEditRule(): void {
    const original = this.editRuleOriginal();
    const form = this.editRuleForm();
    if (!original || !form) return;
    this.editRuleSaving.set(true);
    this.transactionsService.updateUserRule(original.id, form).subscribe({
      next: () => {
        this.editRuleSaving.set(false);
        this.editRuleVisible.set(false);
        this.messageService.add({ severity: 'success', summary: 'נשמר', detail: 'הכלל עודכן.' });
        const bn = this.selectedBusinessNumber();
        if (bn) this.loadData(bn);
      },
      error: (err) => {
        this.editRuleSaving.set(false);
        console.error('[MyCategoriesTab] updateUserRule failed', err);
        this.messageService.add({ severity: 'error', summary: 'שגיאה', detail: 'עדכון הכלל נכשל' });
      },
    });
  }

  // -----------------------------
  // Edit sub-category modal
  // -----------------------------
  openEditSub(row: IRowDataTable): void {
    const sub = this.subCategoryRawById.get(row['id'] as number);
    if (!sub) return;
    this.editSubOriginal.set(sub);
    this.editSubForm.set({
      vatPercent: Number(sub.vatPercent ?? 0),
      taxPercent: Number(sub.taxPercent ?? 0),
      reductionPercent: Number(sub.reductionPercent ?? 0),
      isEquipment: sub.isEquipment ?? false,
      isRecognized: sub.isRecognized ?? false,
      isExpense: sub.isExpense ?? true,
      necessity: sub.necessity ?? 'IMPORTANT',
    });
    this.editSubVisible.set(true);
  }

  updateEditSubField(key: string, value: any): void {
    const form = this.editSubForm();
    if (!form) return;
    this.editSubForm.set({ ...form, [key]: value } as typeof form);
  }

  saveEditSub(): void {
    const original = this.editSubOriginal();
    const form = this.editSubForm();
    const bn = this.selectedBusinessNumber();
    if (!original || !form || !bn) return;
    this.editSubSaving.set(true);
    this.expenseDataService.updateUserSubCategory(original.id, bn, form).subscribe({
      next: () => {
        this.editSubSaving.set(false);
        this.editSubVisible.set(false);
        this.messageService.add({ severity: 'success', summary: 'נשמר', detail: 'תת-הקטגוריה עודכנה.' });
        this.loadData(bn);
      },
      error: (err) => {
        this.editSubSaving.set(false);
        console.error('[MyCategoriesTab] updateUserSubCategory failed', err);
        this.messageService.add({ severity: 'error', summary: 'שגיאה', detail: 'עדכון תת-הקטגוריה נכשל' });
      },
    });
  }

  private loadCategoryOptions(): void {
    this.transactionsService.getCategories(undefined, true).subscribe({
      next: (items) => this.editRuleCategoryOptions.set(items ?? []),
      error: (err) => console.error('[MyCategoriesTab] getCategories failed', err),
    });
  }

  private loadSubCategoryOptions(categoryName: string): void {
    const bn = this.selectedBusinessNumber();
    if (!categoryName || !bn) {
      this.editRuleSubCategoryOptions.set([]);
      return;
    }
    this.expenseDataService.getSubCategory(categoryName, null as any, true, bn).subscribe({
      next: (items: any[]) => {
        const mapped: ISelectItem[] = (items ?? []).map((s) => ({
          name: s.subCategoryName,
          value: s.subCategoryName,
        }));
        this.editRuleSubCategoryOptions.set(mapped);
      },
      error: (err) => console.error('[MyCategoriesTab] getSubCategory failed', err),
    });
  }

  confirmDeleteRule(rule: UserRuleRow): void {
    this.confirmationService.confirm({
      message: `למחוק את כלל הסיווג עבור "${rule.transactionName}" (${rule.category} / ${rule.subCategory})?`,
      header: 'מחיקת כלל סיווג',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'מחק',
      rejectLabel: 'ביטול',
      accept: () => this.deleteRule(rule),
    });
  }

  confirmDeleteCategory(row: IRowDataTable): void {
    const catId = row['userCategoryId'] as number;
    const catName = row['categoryName'] as string;
    const subCount = row['subCategoryCount'] as number;
    if (!catId) return;
    this.confirmationService.confirm({
      message: `למחוק את הקטגוריה "${catName}" וכל תתי-הקטגוריות שלה (${subCount})?`,
      header: 'מחיקת קטגוריה',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'מחק',
      rejectLabel: 'ביטול',
      accept: () => this.deleteCategory(catId),
    });
  }

  confirmDeleteSubCategory(row: IRowDataTable): void {
    const subId = row['id'] as number;
    const subName = row['subCategoryName'] as string;
    this.confirmationService.confirm({
      message: `למחוק את תת-הקטגוריה "${subName}"?`,
      header: 'מחיקת תת-קטגוריה',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'מחק',
      rejectLabel: 'ביטול',
      accept: () => this.deleteSubCategory(subId),
    });
  }

  private deleteRule(rule: UserRuleRow): void {
    this.transactionsService.deleteUserRule(rule.id).subscribe({
      next: (res) => {
        this.messageService.add({
          severity: 'success',
          summary: 'נמחק',
          detail: `הכלל נמחק. ${res.unclassifiedCount} תנועות חזרו לסיווג.`,
        });
        const bn = this.selectedBusinessNumber();
        if (bn) this.loadData(bn);
      },
      error: (err) => this.handleDeleteError(err, 'מחיקת הכלל נכשלה'),
    });
  }

  private deleteCategory(categoryId: number): void {
    const bn = this.selectedBusinessNumber();
    if (!bn) return;
    this.expenseDataService.deleteUserCategory(categoryId, bn).subscribe({
      next: () => {
        this.messageService.add({ severity: 'success', summary: 'נמחק', detail: 'הקטגוריה נמחקה.' });
        this.loadData(bn);
      },
      error: (err) => this.handleDeleteError(err, 'מחיקת הקטגוריה נכשלה'),
    });
  }

  private deleteSubCategory(subId: number): void {
    const bn = this.selectedBusinessNumber();
    if (!bn) return;
    this.expenseDataService.deleteUserSubCategory(subId, bn).subscribe({
      next: () => {
        this.messageService.add({ severity: 'success', summary: 'נמחק', detail: 'תת-הקטגוריה נמחקה.' });
        this.loadData(bn);
      },
      error: (err) => this.handleDeleteError(err, 'מחיקת תת-הקטגוריה נכשלה'),
    });
  }

  private handleDeleteError(err: any, fallback: string): void {
    // 409 from the backend means a rule references this category/sub — surface
    // the list of affected rule ids so the user knows what to delete first.
    if (err?.status === 409) {
      const body = err.error ?? {};
      const ids: number[] = body.affectedRuleIds ?? [];
      this.messageService.add({
        severity: 'warn',
        summary: 'לא ניתן למחוק',
        detail: ids.length
          ? `קיימים ${ids.length} כללי סיווג שמשתמשים בקטגוריה. יש למחוק אותם תחילה.`
          : body.message || fallback,
        life: 6000,
      });
      return;
    }
    console.error('[MyCategoriesTab] delete failed', err);
    this.messageService.add({ severity: 'error', summary: 'שגיאה', detail: fallback });
  }

  private buildCategoriesTable(groups: UserCategoryGroup[]): void {
    this.subCategoryRawById.clear();
    const rows: IRowDataTable[] = [];

    for (const group of groups) {
      const userSubs = (group.subCategories ?? []).filter(sc => !sc.isDefault);

      // Skip groups that have no user involvement at all
      if (!group.userCategory && userSubs.length === 0) continue;

      rows.push({
        id: `cat_${group.categoryName}`,
        rowType: 'category',
        categoryName: group.categoryName,
        subCategoryName: '—',
        badge: group.userCategory ? 'מותאם' : 'מובנה',
        userCategoryId: group.userCategory?.id ?? 0,
        subCategoryCount: userSubs.length,
        vatPercent: '',
        taxPercent: '',
        reductionPercent: '',
        isEquipment: '',
        isRecognized: '',
        isExpense: '',
        necessity: '',
      });

      for (const sub of userSubs) {
        this.subCategoryRawById.set(sub.id, sub);
        rows.push({
          id: sub.id,
          rowType: 'subCategory',
          categoryName: group.categoryName,
          subCategoryName: sub.subCategoryName,
          badge: '',
          userCategoryId: 0,
          subCategoryCount: 0,
          vatPercent: sub.vatPercent,
          taxPercent: sub.taxPercent,
          reductionPercent: sub.reductionPercent,
          isEquipment: sub.isEquipment ? 'כן' : 'לא',
          isRecognized: sub.isRecognized ? 'כן' : 'לא',
          isExpense: sub.isExpense ? 'כן' : 'לא',
          necessity: sub.necessity,
        });
      }
    }

    this.categoriesTableData.set(rows);
  }

  private loadData(businessNumber: string): void {
    this.loading.set(true);
    this.errorText.set(null);

    let rulesDone = false;
    let categoriesDone = false;
    const settle = () => {
      if (rulesDone && categoriesDone) this.loading.set(false);
    };

    this.transactionsService.getUserRules(businessNumber).subscribe({
      next: (rows) => {
        this.rules.set((rows ?? []) as UserRuleRow[]);
        rulesDone = true;
        settle();
      },
      error: (err) => {
        console.error('[MyCategoriesTab] getUserRules failed', err);
        this.errorText.set('שגיאה בטעינת כללי הסיווג');
        rulesDone = true;
        settle();
      },
    });

    this.expenseDataService.getUserCategoriesGrouped(businessNumber).subscribe({
      next: (groups) => {
        this.buildCategoriesTable((groups ?? []) as UserCategoryGroup[]);
        categoriesDone = true;
        settle();
      },
      error: (err) => {
        console.error('[MyCategoriesTab] getUserCategoriesGrouped failed', err);
        this.errorText.set('שגיאה בטעינת הקטגוריות');
        categoriesDone = true;
        settle();
      },
    });
  }
}
