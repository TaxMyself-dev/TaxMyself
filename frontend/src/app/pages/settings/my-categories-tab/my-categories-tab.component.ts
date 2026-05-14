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
import { Business, ISelectItem } from 'src/app/shared/interface';

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

  businesses = input<Business[]>([]);

  selectedBusinessNumber = signal<string | null>(null);
  rules = signal<UserRuleRow[]>([]);
  categoryGroups = signal<UserCategoryGroup[]>([]);
  loading = signal(false);
  errorText = signal<string | null>(null);
  expandedCategories = signal<Set<string>>(new Set());

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

  toggleCategory(name: string): void {
    const next = new Set(this.expandedCategories());
    if (next.has(name)) {
      next.delete(name);
    } else {
      next.add(name);
    }
    this.expandedCategories.set(next);
  }

  isExpanded(name: string): boolean {
    return this.expandedCategories().has(name);
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
  openEditSub(sub: UserCategoryGroup['subCategories'][number]): void {
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

  confirmDeleteCategory(group: UserCategoryGroup): void {
    if (!group.userCategory) return;
    this.confirmationService.confirm({
      message: `למחוק את הקטגוריה "${group.categoryName}" וכל תתי-הקטגוריות שלה (${group.subCategories.length})?`,
      header: 'מחיקת קטגוריה',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'מחק',
      rejectLabel: 'ביטול',
      accept: () => this.deleteCategory(group.userCategory!.id),
    });
  }

  confirmDeleteSubCategory(sub: UserCategoryGroup['subCategories'][number]): void {
    this.confirmationService.confirm({
      message: `למחוק את תת-הקטגוריה "${sub.subCategoryName}"?`,
      header: 'מחיקת תת-קטגוריה',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'מחק',
      rejectLabel: 'ביטול',
      accept: () => this.deleteSubCategory(sub.id),
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
        this.categoryGroups.set((groups ?? []) as UserCategoryGroup[]);
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
