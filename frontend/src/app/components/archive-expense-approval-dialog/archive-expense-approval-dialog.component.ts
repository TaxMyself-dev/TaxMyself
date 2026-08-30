import { Component, computed, EventEmitter, inject, Input, OnChanges, Output, signal, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EMPTY, forkJoin } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';
import { ConfirmationService, MessageService } from 'primeng/api';

import {
  ExpenseEditCardOption,
  ExpenseEditFieldValues,
  ReportReviewEditDialogComponent,
} from '../report-review-edit-dialog/report-review-edit-dialog.component';
import {
  CatalogRow,
  ReportReviewService,
  ReviewDocSummary,
  ReviewOverrides,
} from '../../services/report-review.service';
import { AuthService } from '../../services/auth.service';
import { GenericService } from '../../services/generic.service';
import { VATReportingType } from '../../shared/enums';

type ReviewViewMode = 'regular' | 'professional';

interface CardOption extends ExpenseEditCardOption {
  sectionName: string;
  subCategoryId: number;
}

/**
 * Archive-specific controller around the shared expense edit form. It loads a
 * side-effect-free, focused preview for one pending document and approves it
 * directly; the full report-review page is never opened.
 */
@Component({
  selector: 'app-archive-expense-approval-dialog',
  standalone: true,
  imports: [CommonModule, ReportReviewEditDialogComponent],
  templateUrl: './archive-expense-approval-dialog.component.html',
})
export class ArchiveExpenseApprovalDialogComponent implements OnChanges {
  private readonly reviewService = inject(ReportReviewService);
  private readonly authService = inject(AuthService);
  private readonly genericService = inject(GenericService);
  private readonly messageService = inject(MessageService);
  private readonly confirmationService = inject(ConfirmationService);

  @Input() visible = false;
  @Input() businessNumber = '';
  @Input() documentId: number | null = null;
  @Input() documentDate: string | null = null;

  @Output() closed = new EventEmitter<void>();
  @Output() approved = new EventEmitter<void>();

  readonly draft = signal<ExpenseEditFieldValues | null>(null);
  readonly catalog = signal<CatalogRow[]>([]);
  readonly document = signal<ReviewDocSummary | null>(null);
  readonly matchedTransactionId = signal<number | null>(null);
  readonly isBusy = signal(false);
  readonly viewMode = signal<ReviewViewMode>('regular');

  private acknowledgeDuplicate = false;
  private loadSequence = 0;

  readonly titleLabel = computed(() => {
    const doc = this.document();
    if (!doc) return 'אישור מסמך כהוצאה';
    const amount = Number(doc.amount ?? 0).toLocaleString('he-IL', { maximumFractionDigits: 2 });
    return `${doc.supplier || doc.driveFileName} — ${amount} ₪`;
  });

  readonly categoryOptions = computed(() => Array.from(new Set(
    this.catalog().map(row => row.category).filter((value): value is string => !!value),
  )).sort((a, b) => a.localeCompare(b, 'he')));

  readonly subCategoryOptions = computed(() => {
    const category = this.draft()?.category;
    if (!category) return [];
    return this.catalog()
      .filter(row => row.category === category)
      .map(row => row.subCategory)
      .sort((a, b) => a.localeCompare(b, 'he'));
  });

  readonly cardOptions = computed<CardOption[]>(() => {
    const byAccount = new Map<number, CatalogRow[]>();
    for (const row of this.catalog()) {
      if (row.accountId == null || row.isPrivate) continue;
      const rows = byAccount.get(row.accountId) ?? [];
      rows.push(row);
      byAccount.set(row.accountId, rows);
    }
    return Array.from(byAccount.values()).map(rows => {
      rows.sort((a, b) => a.subCategory.localeCompare(b.subCategory, 'he'));
      const row = rows.find(item => item.subCategory === item.accountName) ?? rows[0];
      return {
        accountId: row.accountId!,
        accountName: row.accountName ?? '',
        accountCode: row.accountCode ?? '',
        sectionName: row.sectionName ?? '',
        subCategoryId: row.subCategoryId,
      };
    }).sort((a, b) =>
      a.sectionName.localeCompare(b.sectionName, 'he') || a.accountName.localeCompare(b.accountName, 'he'),
    );
  });

  readonly cardOptionsBySection = computed(() => {
    const groups = new Map<string, CardOption[]>();
    for (const card of this.cardOptions()) {
      const cards = groups.get(card.sectionName) ?? [];
      cards.push(card);
      groups.set(card.sectionName, cards);
    }
    return Array.from(groups.entries()).map(([section, cards]) => ({ section, cards }));
  });

  readonly periodOptions = computed(() => {
    const draft = this.draft();
    if (!draft) return [];
    return this.buildPeriodOptions(draft.date, draft.reportPeriod).map(value => ({ value, label: value }));
  });

  readonly canApprove = computed(() => {
    const draft = this.draft();
    if (!draft || draft.subCategoryId == null) return false;
    const row = this.catalog().find(item => item.subCategoryId === draft.subCategoryId);
    return !!row && (row.isPrivate || (row.accountId != null && row.approvalStatus === 'APPROVED'));
  });

  readonly documentTypeOptions = [
    ['invoice', 'חשבונית'], ['receipt', 'קבלה'],
    ['tax_invoice_receipt', 'חשבונית מס קבלה'], ['credit_invoice', 'חשבונית זיכוי'],
    ['invoice_receipt_pair', 'חשבונית + קבלה'], ['form_106', 'טופס 106'],
    ['tax_form', 'טופס מס'], ['contract', 'חוזה'], ['unknown', 'לא ידוע'],
  ].map(([value, label]) => ({ value, label }));

  constructor() {
    const realUser = this.authService.getRealUserDataFromLocalStorage();
    const stored = realUser?.firebaseId
      ? localStorage.getItem(`reviewViewMode:${realUser.firebaseId}`)
      : null;
    const isProfessional = !!realUser?.role?.includes('ACCOUNTANT') || !!realUser?.role?.includes('ADMIN');
    this.viewMode.set(stored === 'professional' || stored === 'regular'
      ? stored
      : isProfessional ? 'professional' : 'regular');
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['visible'] || changes['documentId'] || changes['businessNumber']) && this.visible) {
      this.load();
    }
  }

  close(): void {
    if (this.isBusy()) return;
    this.reset();
    this.closed.emit();
  }

  onCategoryChange(category: string): void {
    this.draft.update(draft => draft && ({
      ...draft, category, subCategory: '', subCategoryId: null, accountId: null,
      vatPercent: 0, taxPercent: 0, reductionPercent: 0, isEquipment: false,
    }));
  }

  onSubCategoryChange(subCategory: string): void {
    this.draft.update(draft => {
      if (!draft) return draft;
      const row = this.catalog().find(item => item.category === draft.category && item.subCategory === subCategory);
      return row ? this.applyCatalogRow(draft, row) : { ...draft, subCategory, subCategoryId: null };
    });
  }

  onCardChange(accountId: number | null): void {
    this.draft.update(draft => {
      if (!draft) return draft;
      const card = this.cardOptions().find(item => item.accountId === accountId);
      const row = card && this.catalog().find(item => item.subCategoryId === card.subCategoryId);
      return row ? this.applyCatalogRow(draft, row) : {
        ...draft, category: '', subCategory: '', subCategoryId: null, accountId: null,
        vatPercent: 0, taxPercent: 0, reductionPercent: 0, isEquipment: false,
      };
    });
  }

  onPeriodChange(reportPeriod: string): void {
    this.draft.update(draft => draft && ({
      ...draft,
      reportPeriod,
      reportPeriodOverridden: reportPeriod !== this.derivePeriod(draft.date),
    }));
  }

  onFieldsChange(patch: Partial<ExpenseEditFieldValues>): void {
    this.draft.update(draft => {
      if (!draft) return draft;
      const next = { ...draft, ...patch };
      if (patch.date !== undefined && !next.reportPeriodOverridden) {
        next.reportPeriod = this.derivePeriod(patch.date);
      }
      return next;
    });
  }

  approveExpense(): void {
    const draft = this.draft();
    const doc = this.document();
    if (!draft || !doc || !this.documentId || !this.canApprove() || this.isBusy()) return;

    const overrides: ReviewOverrides = {
      subCategoryId: draft.subCategoryId ?? undefined,
      category: draft.category,
      subCategory: draft.subCategory,
      vatPercent: draft.vatPercent,
      taxPercent: draft.taxPercent,
      isEquipment: draft.isEquipment,
      reportPeriod: draft.reportPeriodOverridden ? draft.reportPeriod : undefined,
      acknowledgeDuplicate: this.acknowledgeDuplicate,
      invoiceNumber: doc.invoiceNumber || undefined,
      allocationNumber: draft.allocationNumber || undefined,
      supplierId: draft.supplierId || undefined,
      supplier: draft.supplier || undefined,
      documentType: draft.documentType || undefined,
      date: draft.date || undefined,
      amount: draft.amount,
    };

    this.isBusy.set(true);
    const transactionId = this.matchedTransactionId();
    const approval$ = transactionId
      ? this.reviewService.approveMatched(this.businessNumber, this.documentId, transactionId, overrides)
      : this.reviewService.approveDocCash(this.businessNumber, this.documentId, overrides);
    approval$
      .pipe(
        catchError(error => {
          if (error?.error?.code === 'DUPLICATE_WARNING' && !this.acknowledgeDuplicate) {
            this.confirmDuplicate(error?.error?.message);
            return EMPTY;
          }
          const detail = error?.error?.message ?? error?.message ?? 'אישור המסמך נכשל';
          this.messageService.add({ severity: 'error', summary: 'שגיאה', detail, life: 5000, key: 'br' });
          return EMPTY;
        }),
        finalize(() => this.isBusy.set(false)),
      )
      .subscribe(() => {
        this.messageService.add({
          severity: 'success', summary: 'ההוצאה אושרה',
          detail: 'ההוצאה נשמרה ונרשמה בהנהלת החשבונות', life: 4000, key: 'br',
        });
        this.reset();
        this.approved.emit();
      });
  }

  private load(): void {
    const documentId = Number(this.documentId);
    const businessNumber = this.businessNumber.trim();
    if (!documentId || !businessNumber) return;
    const sequence = ++this.loadSequence;
    const year = this.documentDate ? Number(this.documentDate.slice(0, 4)) : new Date().getFullYear();
    this.isBusy.set(true);
    this.acknowledgeDuplicate = false;
    this.draft.set(null);
    forkJoin({
      catalog: this.reviewService.getCatalog(businessNumber),
      preview: this.reviewService.getPreview(businessNumber, `${year}-01-01`, `${year}-12-31`, documentId),
    }).pipe(
      catchError(error => {
        const detail = error?.error?.message ?? error?.message ?? 'טעינת המסמך נכשלה';
        this.messageService.add({ severity: 'error', summary: 'שגיאה', detail, life: 5000, key: 'br' });
        this.closed.emit();
        return EMPTY;
      }),
      finalize(() => { if (sequence === this.loadSequence) this.isBusy.set(false); }),
    ).subscribe(({ catalog, preview }) => {
      if (sequence !== this.loadSequence) return;
      const row = preview.rows.find(item => item.type !== 'tx_only' && item.document.documentId === documentId);
      if (!row || row.type === 'tx_only') {
        this.messageService.add({ severity: 'warn', summary: 'המסמך אינו זמין', detail: 'המסמך כבר טופל או שאינו ממתין לאישור', life: 4000, key: 'br' });
        this.closed.emit();
        return;
      }
      this.catalog.set(catalog);
      this.document.set(row.document);
      this.matchedTransactionId.set(row.type === 'matched' ? row.transaction.slimTransactionId : null);
      const classification = row.classification;
      const date = row.document.date ?? this.documentDate ?? '';
      this.draft.set({
        category: classification.categoryName ?? row.document.category ?? '',
        subCategory: classification.subCategoryName ?? row.document.subCategory ?? '',
        subCategoryId: classification.subCategoryId,
        accountId: classification.accountId,
        vatPercent: Number(classification.vatPercent ?? row.document.vatPercent ?? 0),
        taxPercent: Number(classification.taxPercent ?? row.document.taxPercent ?? 0),
        reductionPercent: Number(classification.reductionPercent ?? 0),
        isEquipment: !!(classification.isEquipment ?? row.document.isEquipment),
        date,
        amount: Number(row.document.amount ?? 0),
        supplierId: row.document.supplierId ?? '',
        supplier: row.document.supplier ?? '',
        reportPeriod: this.derivePeriod(date),
        reportPeriodOverridden: false,
        allocationNumber: row.document.allocationNumber ?? '',
        documentType: row.document.documentType,
      });
    });
  }

  private applyCatalogRow(draft: ExpenseEditFieldValues, row: CatalogRow): ExpenseEditFieldValues {
    return {
      ...draft,
      category: row.category ?? '', subCategory: row.subCategory,
      subCategoryId: row.subCategoryId, accountId: row.accountId,
      vatPercent: Number(row.vatPercent ?? 0), taxPercent: Number(row.taxPercent ?? 0),
      reductionPercent: Number(row.reductionPercent ?? 0), isEquipment: !!row.isEquipment,
    };
  }

  private derivePeriod(date: string): string {
    const [year, month] = (date ?? '').split('-').map(Number);
    if (!year || !month) return '';
    if (this.vatReportingType() === VATReportingType.DUAL_MONTH_REPORT) {
      const start = month % 2 === 1 ? month : month - 1;
      return `${start}-${start + 1}/${year}`;
    }
    return `${month}/${year}`;
  }

  private buildPeriodOptions(date: string, current: string): string[] {
    const [yearValue, monthValue] = (date ?? '').split('-').map(Number);
    let year = yearValue || new Date().getFullYear();
    let month = monthValue || 1;
    const values: string[] = [];
    if (this.vatReportingType() === VATReportingType.DUAL_MONTH_REPORT) {
      let start = month % 2 === 1 ? month : month - 1;
      for (let i = 0; i < 3; i++) {
        values.push(`${start}-${start + 1}/${year}`);
        start += 2;
        if (start > 12) { start = 1; year++; }
      }
    } else {
      for (let i = 0; i < 6; i++) {
        values.push(`${month}/${year}`);
        month++;
        if (month > 12) { month = 1; year++; }
      }
    }
    if (current && !values.includes(current)) values.unshift(current);
    return values;
  }

  private vatReportingType(): VATReportingType {
    return this.genericService.businesses().find(business => business.businessNumber === this.businessNumber)?.vatReportingType
      ?? VATReportingType.MONTHLY_REPORT;
  }

  private confirmDuplicate(message?: string): void {
    this.confirmationService.confirm({
      header: 'ייתכן שזו הוצאה כפולה',
      message: message || 'נמצאה הוצאה דומה שכבר קיימת במערכת. האם לשמור ולאשר בכל זאת?',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'שמור ואשר בכל זאת',
      rejectLabel: 'חזרה לעריכה',
      accept: () => {
        this.acknowledgeDuplicate = true;
        this.approveExpense();
      },
    });
  }

  private reset(): void {
    this.loadSequence++;
    this.draft.set(null);
    this.catalog.set([]);
    this.document.set(null);
    this.matchedTransactionId.set(null);
    this.acknowledgeDuplicate = false;
  }
}
