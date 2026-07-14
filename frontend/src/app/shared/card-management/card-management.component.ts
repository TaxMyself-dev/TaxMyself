import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup } from '@angular/forms';
import { ConfirmationService } from 'primeng/api';
import { finalize } from 'rxjs/operators';
import { ButtonSize, ButtonColor } from 'src/app/components/button/button.enum';
import { FilterField } from 'src/app/components/filter-tab/filter-fields-model.component';
import {
  BookkeepingCatalogService,
  IBookingAccountRow,
  IAccountingSectionOption,
  IAccountUsage,
} from 'src/app/services/bookkeeping-catalog.service';

const OWNER_TYPE_LABELS: Record<string, string> = {
  SYSTEM: 'מערכת',
  ACCOUNTANT: 'רואה חשבון',
  CLIENT: 'לקוח',
};

const RECOGNITION_OPTIONS = [
  { label: 'מוכר', value: 'RECOGNIZED' },
  { label: 'לא מוכר', value: 'NOT_RECOGNIZED' },
  { label: 'לא רלוונטי (לא הוצאה עסקית)', value: 'NOT_APPLICABLE' },
];

const REPORT_SCOPE_LABELS: Record<string, string> = {
  pnl: 'רווח והפסד',
  annual: 'דוח שנתי בלבד',
  technical: 'טכני',
};

const REPORT_SCOPE_OPTIONS = [
  { label: 'רווח והפסד', value: 'pnl' },
  { label: 'דוח שנתי בלבד', value: 'annual' },
  { label: 'טכני', value: 'technical' },
];

/**
 * "כרטיסים" — standalone booking_account (card) management, admin-only.
 * Separate from category-management (which edits sub_category rows and, as
 * of this same session, only REPOINTS at a card — never edits a card's own
 * fields, D10). This screen is the direct-editing counterpart D10's comment
 * presupposes: every field here is a real in-place UPDATE of the card row.
 */
@Component({
  selector: 'app-card-management',
  templateUrl: './card-management.component.html',
  styleUrls: ['./card-management.component.scss'],
  standalone: false,
})
export class CardManagementComponent implements OnInit {
  private destroyRef = inject(DestroyRef);
  private bookkeepingCatalogService = inject(BookkeepingCatalogService);
  private confirmationService = inject(ConfirmationService);
  private fb = inject(FormBuilder);

  readonly buttonSize = ButtonSize;
  readonly ButtonColor = ButtonColor;
  readonly recognitionOptions = RECOGNITION_OPTIONS;
  readonly reportScopeOptions = REPORT_SCOPE_OPTIONS;

  accounts = signal<IBookingAccountRow[]>([]);
  sections = signal<IAccountingSectionOption[]>([]);
  loading = signal<boolean>(false);

  // ── Filter ───────────────────────────────────────────────────────────────
  filterOwnerType = signal<string>('');
  filterForm: FormGroup = this.fb.group({});

  private readonly ownerTypeFilterOptions = [
    { name: 'הכל', value: '' },
    { name: 'מערכת', value: 'SYSTEM' },
    { name: 'רואה חשבון', value: 'ACCOUNTANT' },
    { name: 'לקוח', value: 'CLIENT' },
  ];

  readonly filterConfig: FilterField[] = [
    { type: 'select', controlName: 'ownerType', label: 'היקף בעלות', options: this.ownerTypeFilterOptions, defaultValue: '' },
  ];

  filteredAccounts = computed(() => {
    const owner = this.filterOwnerType();
    return this.accounts().filter((a) => !owner || a.ownerType === owner);
  });

  onApplyFilter(value: any): void {
    this.filterOwnerType.set(value?.ownerType ?? '');
  }

  ngOnInit() {
    this.loadAccounts();
    // Section options for the edit dialog's picker. Covers SYSTEM sections
    // (the common case — most cards, and every SYSTEM card, use one) plus
    // the admin's own ACCOUNTANT_<id> sections if any; an ACCOUNTANT/CLIENT
    // card whose OWN custom section isn't SYSTEM won't show that section as
    // a picker option (rare — accountant/client-scoped sections are
    // uncommon), but its current value still displays correctly.
    this.bookkeepingCatalogService
      .getSections()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (sections) => this.sections.set(sections),
        error: () => this.sections.set([]),
      });
  }

  loadAccounts(): void {
    this.loading.set(true);
    this.bookkeepingCatalogService
      .listAccounts()
      .pipe(finalize(() => this.loading.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => this.accounts.set(Array.isArray(data) ? data : []),
        error: () => this.accounts.set([]),
      });
  }

  ownerLabel(row: IBookingAccountRow): string {
    if (row.ownerType === 'SYSTEM') return OWNER_TYPE_LABELS['SYSTEM'];
    const who = row.ownerName ?? row.businessNumber ?? row.accountantId ?? '—';
    return `${OWNER_TYPE_LABELS[row.ownerType]} — ${who}`;
  }

  recognitionLabel(rt: string | null): string {
    return rt === 'RECOGNIZED' ? 'מוכר'
      : rt === 'NOT_RECOGNIZED' ? 'לא מוכר'
      : rt === 'NOT_APPLICABLE' ? 'לא רלוונטי'
      : '—';
  }

  reportScopeLabel(scope: string): string {
    return REPORT_SCOPE_LABELS[scope] ?? scope;
  }

  // ── Edit dialog ──────────────────────────────────────────────────────────
  editRow = signal<IBookingAccountRow | null>(null);
  showEditDialog = signal<boolean>(false);
  editForm: Record<string, any> = {};
  usage = signal<IAccountUsage | null>(null);
  loadingUsage = signal<boolean>(false);

  openEdit(row: IBookingAccountRow): void {
    this.editRow.set(row);
    this.editForm = {
      name: row.name,
      code: row.code,
      sectionId: row.sectionId,
      code6111: row.code6111,
      vatPercent: row.vatPercent,
      taxPercent: row.taxPercent,
      reductionPercent: row.reductionPercent,
      isEquipment: row.isEquipment,
      recognitionType: row.recognitionType,
      reportScope: row.reportScope,
    };
    this.usage.set(null);
    // Shared-impact warning: only meaningful for SYSTEM cards (ACCOUNTANT/
    // CLIENT cards are already scoped to one owner, editing them can't
    // spill onto another tenant the same way).
    if (row.ownerType === 'SYSTEM') {
      this.loadingUsage.set(true);
      this.bookkeepingCatalogService
        .getAccountUsage(row.id)
        .pipe(finalize(() => this.loadingUsage.set(false)), takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (usage) => this.usage.set(usage),
          error: () => this.usage.set(null),
        });
    }
    this.showEditDialog.set(true);
  }

  closeEditDialog(): void {
    this.showEditDialog.set(false);
    this.editRow.set(null);
    this.usage.set(null);
  }

  confirmAndSaveEdit(): void {
    const row = this.editRow();
    if (!row) return;
    const usage = this.usage();
    const message =
      row.ownerType === 'SYSTEM'
        ? usage
          ? `כרטיס זה משותף לכלל המערכת — העדכון ישפיע על ${usage.subCategoryCount} תתי-קטגוריות ב-${usage.businessCount} עסקים לפחות (לא כולל עסקים שיורשים את הכרטיס באופן משתמע, ללא שורת דריסה משלהם). האם להמשיך?`
          : 'כרטיס זה משותף לכלל המערכת. האם אתה בטוח שברצונך לעדכן אותו?'
        : 'האם אתה בטוח שברצונך לעדכן כרטיס זה?';
    this.confirmationService.confirm({
      message,
      header: 'אישור עדכון כרטיס',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'כן, עדכן',
      rejectLabel: 'ביטול',
      accept: () => {
        this.saveEdit(row);
        this.closeEditDialog();
      },
    });
  }

  private saveEdit(row: IBookingAccountRow): void {
    this.loading.set(true);
    this.bookkeepingCatalogService
      .updateAccount(row.id, this.editForm)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.loadAccounts(),
        error: () => this.loading.set(false),
        complete: () => this.loading.set(false),
      });
  }
}
