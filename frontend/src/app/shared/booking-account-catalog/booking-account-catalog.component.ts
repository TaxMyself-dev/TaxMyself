import { Component, DestroyRef, ElementRef, Input, OnChanges, OnInit, SimpleChanges, ViewChild, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup } from '@angular/forms';
import { Workbook } from 'exceljs';
import { ConfirmationService } from 'primeng/api';
import { finalize } from 'rxjs/operators';
import { ButtonSize, ButtonColor } from 'src/app/components/button/button.enum';
import { FilterField } from 'src/app/components/filter-tab/filter-fields-model.component';
import {
  BookkeepingCatalogService,
  IBookingAccountRow,
  IAccountingSectionOption,
  IAccountUsage,
  IActivateBookingAccountPayload,
  IBlockingSubCategory,
  ICreateAccountPayload,
  FormPart,
} from 'src/app/services/bookkeeping-catalog.service';
import { BusinessFieldType, businessFieldTypeOptionsList } from 'src/app/shared/enums';

const RECOGNITION_OPTIONS = [
  { label: 'מוכר', value: 'RECOGNIZED' },
  { label: 'לא מוכר', value: 'NOT_RECOGNIZED' },
  { label: 'לא רלוונטי (לא הוצאה עסקית)', value: 'NOT_APPLICABLE' },
];

const TYPE_OPTIONS = [
  { label: 'הוצאה', value: 'expense' },
  { label: 'הכנסה', value: 'income' },
];

const FORM_PART_LABELS: Record<string, string> = {
  A: 'רווח והפסד',
  B: 'התאמה למס',
  C: 'מאזן',
};

/** Same three values card-management's REPORT_SCOPE_LABELS/OPTIONS use —
 *  duplicated rather than shared since each admin card screen owns its own
 *  small label/option constants (same pattern as RECOGNITION_OPTIONS above). */
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

/** Owner-scope display label for a chartOwnerKey, e.g. 'ACCOUNTANT_<id>' /
 *  'CLIENT_<businessNumber>' / 'SYSTEM' — used in the deactivate blocking-
 *  list dialog. Same three-way split as card-management's OWNER_TYPE_LABELS,
 *  derived from the raw key since blockingSubCategories only carries that. */
function scopeLabel(chartOwnerKey: string): string {
  if (chartOwnerKey === 'SYSTEM') return 'מערכת';
  if (chartOwnerKey.startsWith('ACCOUNTANT_')) return 'רואה חשבון';
  if (chartOwnerKey.startsWith('CLIENT_')) return 'לקוח';
  return chartOwnerKey;
}

/** A reference row's `name` is always "category – subcategory" (or just
 *  "category" with no subcategory) — see
 *  2026-08-11_import-6111-reference-cards.js. Used both for the table's
 *  קטגוריה column and to pre-fill the activate dialog's categoryName. */
function deriveCategoryFromName(name: string): string {
  const idx = name.indexOf(' – ');
  return idx >= 0 ? name.slice(0, idx) : name;
}

interface ActivateFormState {
  type: 'expense' | 'income' | null;
  sectionId: number | null;
  vatPercent: number | null;
  taxPercent: number | null;
  reductionPercent: number | null;
  isEquipment: boolean;
  recognitionType: string | null;
  categoryName: string;
  /** Phase 3 Step 3 (2026-08-17, revised model) — required, at least one. */
  visibleBusinessTypes: BusinessFieldType[];
}

/** Same two options (no NOT_APPLICABLE) the existing clients-panel "כרטיס
 *  חדש" dialog offers — matches ICreateAccountPayload's own narrower
 *  recognitionType type, not the full RecognitionType enum. */
const ADD_RECOGNITION_OPTIONS = [
  { label: 'מוכרת', value: 'RECOGNIZED' },
  { label: 'לא מוכרת', value: 'NOT_RECOGNIZED' },
];

interface AddCardFormState {
  name: string;
  code: string;
  sectionId: number | null;
  code6111: string;
  recognitionType: 'RECOGNIZED' | 'NOT_RECOGNIZED';
  vatPercent: number | null;
  taxPercent: number | null;
  reductionPercent: number | null;
  isEquipment: boolean;
  technicalOnly: boolean;
  categoryName: string;
  /** Phase 3 Step 3 (2026-08-17, revised model) — required, at least one. */
  visibleBusinessTypes: BusinessFieldType[];
}

/**
 * Form 6111 reference-card project, Phase 2 (2026-08-14) — shared admin/
 * accountant booking-account catalog screen. Originally built alongside the
 * older standalone "כרטיסים" admin screen (shared/card-management), mirroring
 * its patterns as closely as the two extra capabilities (activate a
 * reference card, deactivate with a blocking-list dialog) allowed. That
 * screen was consolidated into this one and removed 2026-08-16 (single
 * unified card-management surface, SYSTEM-only by design — ACCOUNTANT/CLIENT
 * card visibility was deliberately left out of scope, see
 * docs/redesign/card-management-tabs-gap-analysis.md) — this component now
 * covers everything that screen used to.
 *
 * `mode='admin'`: lists chartOwnerKey='SYSTEM' rows (68 operational + 321
 * reference), full row actions (activate/edit/deactivate).
 * `mode='accountant'`: lists, for one client business (`businessNumber`
 * required): the browsable SYSTEM reference cards (activate-only) PLUS the
 * business's own active CLIENT_<businessNumber>/ACCOUNTANT_<agentId> cards
 * (edit/deactivate/add-new, 2026-08-17) — never a SYSTEM row, enforced
 * server-side inside CatalogService itself (updateAccountFields/
 * deactivateAccount/getAccountUsage's `allowedChartOwnerKeys` parameter),
 * not just by which buttons this component renders. `isOwnedRow()` below
 * drives the same active/reference-style branching admin mode uses for its
 * own row actions.
 */
@Component({
  selector: 'app-booking-account-catalog',
  templateUrl: './booking-account-catalog.component.html',
  styleUrls: ['./booking-account-catalog.component.scss'],
  standalone: false,
})
export class BookingAccountCatalogComponent implements OnInit, OnChanges {
  @Input() mode: 'admin' | 'accountant' = 'admin';
  /** Required when mode='accountant'. */
  @Input() businessNumber?: string;

  private destroyRef = inject(DestroyRef);
  private catalogService = inject(BookkeepingCatalogService);
  private confirmationService = inject(ConfirmationService);
  private fb = inject(FormBuilder);

  readonly buttonSize = ButtonSize;
  readonly ButtonColor = ButtonColor;
  readonly recognitionOptions = RECOGNITION_OPTIONS;
  readonly addRecognitionOptions = ADD_RECOGNITION_OPTIONS;
  readonly typeOptions = TYPE_OPTIONS;
  readonly reportScopeOptions = REPORT_SCOPE_OPTIONS;
  readonly scopeLabel = scopeLabel;
  /** Phase 3 Step 3 (2026-08-17, revised model): the 3 business types a card
   *  can be made visible to — נותן שירותים / עסק מסחרי / קבלן. Reused as-is
   *  from the business-settings screen's own option list (single source for
   *  the enum's Hebrew labels). */
  readonly businessTypeOptions = businessFieldTypeOptionsList;

  /** Toggle one business type's membership in a form's visibleBusinessTypes
   *  array — shared by the activate/add/edit dialogs' checkbox rows.
   *  Untyped `form` param (not `{ visibleBusinessTypes: ... }`) so this
   *  also accepts `editForm`'s `Record<string, any>` shape — Angular's
   *  template type checker (stricter here than plain tsc) rejects an index-
   *  signature type against a required specific property. */
  isBusinessTypeChecked(form: any, type: BusinessFieldType): boolean {
    return (form.visibleBusinessTypes ?? []).includes(type);
  }

  toggleBusinessType(form: any, type: BusinessFieldType): void {
    const current: BusinessFieldType[] = form.visibleBusinessTypes ?? [];
    form.visibleBusinessTypes = current.includes(type) ? current.filter((t) => t !== type) : [...current, type];
  }

  rows = signal<IBookingAccountRow[]>([]);
  sections = signal<IAccountingSectionOption[]>([]);
  loading = signal<boolean>(false);

  // ── Filters (client-side, same pattern as card-management) ─────────────
  filterForm: FormGroup = this.fb.group({});

  private readonly formPartFilterOptions = [
    { name: 'הכל', value: '' },
    { name: FORM_PART_LABELS['A'], value: 'A' },
    { name: FORM_PART_LABELS['B'], value: 'B' },
    { name: FORM_PART_LABELS['C'], value: 'C' },
  ];

  private readonly isActiveFilterOptions = [
    { name: 'הכל', value: '' },
    { name: 'פעיל', value: 'true' },
    { name: 'לא פעיל (כרטיס ייחוס)', value: 'false' },
  ];

  /** Computed once in ngOnInit (not a static field initializer like
   *  card-management's filterConfig, since it depends on `mode` — an
   *  @Input, not populated until after Angular constructs the component).
   *  isActive filter only makes sense in admin mode — accountant mode's
   *  referenceCards are already always isActive=false. */
  filterConfig: FilterField[] = [];

  private buildFilterConfig(): FilterField[] {
    return [
      { type: 'select', controlName: 'formPart', label: 'חלק בטופס 6111', options: this.formPartFilterOptions, defaultValue: '' },
      ...(this.mode === 'admin'
        ? [{ type: 'select' as const, controlName: 'isActive', label: 'סטטוס', options: this.isActiveFilterOptions, defaultValue: '' }]
        : []),
    ];
  }

  private filterFormPart = signal<string>('');
  private filterIsActive = signal<string>('');

  onApplyFilter(value: any): void {
    this.filterFormPart.set(value?.formPart ?? '');
    this.filterIsActive.set(value?.isActive ?? '');
  }

  // ── Free-text search — deliberately OUTSIDE app-filter-tab's config
  // (FilterTabComponent only emits `apply` on its "הצג" button click) so
  // this filters live as the admin types, same as app-filter-input's
  // (ionInput)-driven search used by the cash-flow table (shared/table).
  // Own row, below the dropdown filters, per design review 2026-08-16.
  filterSearch = signal<string>('');
  /** Plain ngModel-bound field for the standalone search input — the signal
   *  above is the derived, trimmed/lowercased value filteredRows() reads. */
  searchText = '';

  onSearchInput(value: string): void {
    this.filterSearch.set((value ?? '').trim().toLowerCase());
  }

  filteredRows = computed(() => {
    let list = this.rows();
    const formPart = this.filterFormPart();
    if (formPart) list = list.filter((r) => r.formPart === formPart);
    if (this.mode === 'admin') {
      const isActive = this.filterIsActive();
      if (isActive !== '') list = list.filter((r) => String(r.isActive) === isActive);
    }
    const search = this.filterSearch();
    if (search) list = list.filter((r) => r.code.toLowerCase().includes(search) || r.name.toLowerCase().includes(search));
    return list;
  });

  ngOnInit(): void {
    this.filterConfig = this.buildFilterConfig();
    this.loadSections();
    this.loadRows();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Accountant mode's businessNumber can change after init (e.g. switching
    // the selected client in the accountant panel) — reload when it does.
    if (changes['businessNumber'] && !changes['businessNumber'].firstChange) {
      this.loadRows();
    }
  }

  private loadSections(): void {
    this.catalogService
      .getSections()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (sections) => this.sections.set(sections),
        error: () => this.sections.set([]),
      });
  }

  loadRows(): void {
    if (this.mode === 'accountant' && !this.businessNumber) {
      this.rows.set([]);
      return;
    }
    this.loading.set(true);

    if (this.mode === 'admin') {
      this.catalogService
        .listAdminBookingAccounts({})
        .pipe(finalize(() => this.loading.set(false)), takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (data) => this.rows.set(Array.isArray(data) ? data : []),
          error: () => this.rows.set([]),
        });
      return;
    }

    // Accountant mode: referenceCards (browsable, activate-only) + the
    // business's own ownedAccounts (edit/deactivate-able) feed this table —
    // categories/subCategories (the business's own effective catalog) are a
    // different shape, out of scope for this booking_account-shaped screen.
    this.catalogService
      .getAccountantBookingAccountsCatalog(this.businessNumber!)
      .pipe(finalize(() => this.loading.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => this.rows.set([...(data?.ownedAccounts ?? []), ...(data?.referenceCards ?? [])]),
        error: () => this.rows.set([]),
      });
  }

  // ── Row helpers ──────────────────────────────────────────────────────────
  isReferenceRow(row: IBookingAccountRow): boolean {
    return row.code.startsWith('6111-');
  }

  /** A row this component's actor may edit/deactivate directly — never
   *  SYSTEM (admin mode's rows ARE all SYSTEM, so this is always true there;
   *  accountant mode's rows are a mix of owned CLIENT/ACCOUNTANT cards and
   *  browsable SYSTEM reference cards, so this is what tells them apart in
   *  the template). Mirrors the server-side allow-list check — see
   *  AccountantBookingAccountsController.ownedChartOwnerKeys — but is only
   *  ever a UI convenience: the real guarantee lives server-side. */
  isOwnedRow(row: IBookingAccountRow): boolean {
    return row.ownerType !== 'SYSTEM';
  }

  categoryLabel(row: IBookingAccountRow): string {
    return deriveCategoryFromName(row.name);
  }

  formPartLabel(formPart: FormPart | null): string {
    return formPart ? FORM_PART_LABELS[formPart] : '—';
  }

  // ── Hover-only row actions (design review 2026-08-16) — no dedicated
  // actions column/header; instead a floating strip is positioned over the
  // hovered row's own bounds and shown only while hovering it. Computed via
  // getBoundingClientRect() rather than relying on <tr> offsetTop, since
  // table-layout offsetParent resolution is inconsistent across browsers.
  //
  // The strip is NOT a descendant of the <tr> (it can't be — a <tr> may only
  // contain <td>/<th>), so it sits elsewhere in the DOM, overlapping the row
  // purely via CSS position. That means the row's own mouseleave fires the
  // instant the pointer crosses onto the strip (hit-testing now resolves to
  // a different element), and if the strip disappeared immediately on that
  // leave, it would vanish before the pointer ever reached a button —
  // exactly the "can't click the actions" bug hit in review. The fix, taken
  // directly from generic-table.component.ts's own floating-buttons strip
  // (onRowEnter/onFloatingEnter/onFloatingLeave there): track "hovering the
  // row" and "hovering the strip" as two independent flags, and only clear
  // hoveredRow after a short delay AND only if neither flag is true by then
  // — so leaving the row to enter the strip (or vice versa) cancels the
  // pending clear instead of racing it.
  @ViewChild('tableContainer') private tableContainerRef?: ElementRef<HTMLElement>;

  hoveredRow = signal<IBookingAccountRow | null>(null);
  hoveredRowTop = signal<number>(0);
  /** Measured from the actual hovered <tr>, not hardcoded — so the strip
   *  always matches this row's real rendered height exactly, flush with no
   *  gap, rather than an approximated fixed height that can mismatch. */
  hoveredRowHeight = signal<number>(0);
  private isRowHovered = false;
  private isOverlayHovered = false;
  private hoverClearTimeout: ReturnType<typeof setTimeout> | undefined;

  onRowEnter(row: IBookingAccountRow, event: MouseEvent): void {
    clearTimeout(this.hoverClearTimeout);
    this.isRowHovered = true;
    const container = this.tableContainerRef?.nativeElement;
    const tr = event.currentTarget as HTMLElement;
    if (container) {
      const trRect = tr.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      this.hoveredRowTop.set(trRect.top - containerRect.top + container.scrollTop);
      this.hoveredRowHeight.set(trRect.height);
    }
    this.hoveredRow.set(row);
  }

  onRowLeave(): void {
    this.isRowHovered = false;
    this.scheduleHoverClear();
  }

  onOverlayEnter(): void {
    clearTimeout(this.hoverClearTimeout);
    this.isOverlayHovered = true;
  }

  onOverlayLeave(): void {
    this.isOverlayHovered = false;
    this.scheduleHoverClear();
  }

  private scheduleHoverClear(): void {
    this.hoverClearTimeout = setTimeout(() => {
      if (!this.isRowHovered && !this.isOverlayHovered) {
        this.hoveredRow.set(null);
      }
    }, 100);
  }

  reportScopeLabel(scope: string): string {
    return REPORT_SCOPE_LABELS[scope] ?? scope;
  }

  /** Table-column display for a row's visibility (Phase 3 Step 3) — "הכל"
   *  when all 3 types are set (today's backfilled default for every active
   *  card), the Hebrew label list when narrowed to a subset, "—" (never
   *  "הכל") when empty — empty means visible to NOBODY, the opposite of
   *  universal, so it must never read the same as the all-3 case. */
  businessTypesLabel(row: IBookingAccountRow): string {
    const types = row.visibleBusinessTypes ?? [];
    if (types.length === 0) return '— (לא נראה לאף עסק)';
    if (types.length === this.businessTypeOptions.length) return 'הכל';
    return types.map((t) => this.businessTypeOptions.find((o) => o.value === t)?.name ?? t).join(', ');
  }

  // ── Edit dialog (admin: any SYSTEM row; accountant: owned rows only,
  // enforced server-side) ──────────────────────────────────────────────────
  editRow = signal<IBookingAccountRow | null>(null);
  showEditDialog = signal<boolean>(false);
  editForm: Record<string, any> = {};
  /** True while the save-time usage check (confirmAndSaveEdit) is in
   *  flight — disables the "עדכון" button so a second click can't fire a
   *  second usage request/confirm while the first is still resolving. */
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
      visibleBusinessTypes: [...row.visibleBusinessTypes],
    };
    // No usage check here — that only happens at save-time (confirmAndSaveEdit),
    // so opening the dialog to just look at a card never fires an extra
    // request or shows a warning the user hasn't earned yet.
    this.showEditDialog.set(true);
  }

  /** Same "at least one business type" rule as activate/add — editing a
   *  card to an empty set isn't allowed (deactivate instead to fully hide
   *  it). The other edit fields stay unvalidated here, unchanged behavior. */
  isEditFormValid(): boolean {
    return (this.editForm['visibleBusinessTypes']?.length ?? 0) > 0;
  }

  closeEditDialog(): void {
    this.showEditDialog.set(false);
    this.editRow.set(null);
  }

  /**
   * Save-time impact check (moved off dialog-open, 2026-08-16): fetch usage
   * first, then only interrupt with a confirm dialog when the card actually
   * has associated sub_categories. Zero usage saves straight through — no
   * point confirming an edit that can't ripple anywhere. A failed usage
   * fetch fails safe (generic confirm, no numbers) rather than saving blind.
   */
  confirmAndSaveEdit(): void {
    const row = this.editRow();
    if (!row) return;
    this.loadingUsage.set(true);
    const usage$ =
      this.mode === 'admin'
        ? this.catalogService.getAccountUsage(row.id)
        : this.catalogService.getAccountantBookingAccountUsage(this.businessNumber!, row.id);
    usage$
      .pipe(finalize(() => this.loadingUsage.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (usage) => this.proceedWithSave(row, usage),
        error: () => this.proceedWithSave(row, null),
      });
  }

  private proceedWithSave(row: IBookingAccountRow, usage: IAccountUsage | null): void {
    if (usage && usage.subCategoryCount === 0) {
      this.saveEdit(row);
      this.closeEditDialog();
      return;
    }
    const message = usage
      ? `כרטיס זה משותף לכלל המערכת — העדכון ישפיע על ${usage.subCategoryCount} תתי-קטגוריות ב-${usage.businessCount} עסקים לפחות (לא כולל עסקים שיורשים את הכרטיס באופן משתמע, ללא שורת דריסה משלהם). האם להמשיך?`
      : 'כרטיס זה משותף לכלל המערכת. לא ניתן היה לבדוק את היקף ההשפעה. האם אתה בטוח שברצונך לעדכן אותו?';
    this.confirmationService.confirm({
      message,
      header: 'אישור עדכון כרטיס',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'אישור',
      rejectLabel: 'ביטול',
      accept: () => {
        this.saveEdit(row);
        this.closeEditDialog();
      },
    });
  }

  private saveEdit(row: IBookingAccountRow): void {
    this.loading.set(true);
    const request$ =
      this.mode === 'admin'
        ? this.catalogService.updateAdminBookingAccount(row.id, this.editForm)
        : this.catalogService.updateAccountantBookingAccount(this.businessNumber!, row.id, this.editForm);
    request$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.loadRows(),
        error: () => this.loading.set(false),
        complete: () => this.loading.set(false),
      });
  }

  // ── Activate dialog (both modes) ────────────────────────────────────────
  activateRow = signal<IBookingAccountRow | null>(null);
  showActivateDialog = signal<boolean>(false);
  activateForm: ActivateFormState = this.emptyActivateForm();
  activating = signal<boolean>(false);
  activateError = signal<string | null>(null);

  private emptyActivateForm(): ActivateFormState {
    return {
      type: null,
      sectionId: null,
      vatPercent: null,
      taxPercent: null,
      reductionPercent: null,
      isEquipment: false,
      recognitionType: null,
      categoryName: '',
      visibleBusinessTypes: [],
    };
  }

  openActivate(row: IBookingAccountRow): void {
    this.activateRow.set(row);
    // Prefer the official category6111 (backfilled from the Tax Authority
    // CSV) — falls back to the name-derived heuristic only if a reference
    // row somehow doesn't have it set.
    const categoryName = row.category6111 || this.categoryLabel(row);
    this.activateForm = { ...this.emptyActivateForm(), categoryName };
    this.activateError.set(null);
    this.showActivateDialog.set(true);
  }

  closeActivateDialog(): void {
    this.showActivateDialog.set(false);
    this.activateRow.set(null);
  }

  /** Every field required — no defaults invented for a Form 6111 activation
   *  (same "no defaults invented here" rule the backend DTO enforces). */
  isActivateFormValid(): boolean {
    const f = this.activateForm;
    return (
      !!f.type &&
      f.sectionId != null &&
      f.vatPercent != null &&
      f.taxPercent != null &&
      f.reductionPercent != null &&
      !!f.recognitionType &&
      !!f.categoryName?.trim() &&
      f.visibleBusinessTypes.length > 0
    );
  }

  submitActivate(): void {
    const row = this.activateRow();
    if (!row || !this.isActivateFormValid()) return;

    const payload: IActivateBookingAccountPayload = {
      type: this.activateForm.type!,
      sectionId: this.activateForm.sectionId!,
      vatPercent: this.activateForm.vatPercent!,
      taxPercent: this.activateForm.taxPercent!,
      reductionPercent: this.activateForm.reductionPercent!,
      isEquipment: this.activateForm.isEquipment,
      recognitionType: this.activateForm.recognitionType as any,
      categoryName: this.activateForm.categoryName.trim(),
      visibleBusinessTypes: this.activateForm.visibleBusinessTypes,
    };

    this.activating.set(true);
    const request$ =
      this.mode === 'admin'
        ? this.catalogService.activateAdminBookingAccount(row.id, payload)
        : this.catalogService.activateAccountantBookingAccount(this.businessNumber!, { ...payload, referenceAccountId: row.id });

    request$
      .pipe(finalize(() => this.activating.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.closeActivateDialog();
          this.loadRows();
        },
        error: (err) => {
          this.activateError.set(err?.error?.message ?? 'הפעלת הכרטיס נכשלה. נסה שוב.');
        },
      });
  }

  // ── Deactivate + blocking-list dialog (admin: any SYSTEM row; accountant:
  // owned rows only, enforced server-side) ────────────────────────────────
  showBlockingDialog = signal<boolean>(false);
  blockingSubCategories = signal<IBlockingSubCategory[]>([]);
  blockingAccountLabel = signal<string>('');
  blockingAction = signal<'delete' | 'deactivate'>('deactivate');

  deleteCard(row: IBookingAccountRow): void {
    this.confirmationService.confirm({
      message: `האם למחוק את הכרטיס "${row.name}" (${row.code})?`,
      header: 'אישור מחיקת כרטיס',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'כן, מחק',
      rejectLabel: 'ביטול',
      accept: () => this.doDelete(row),
    });
  }

  private doDelete(row: IBookingAccountRow): void {
    this.loading.set(true);
    this.catalogService.deleteAdminBookingAccount(row.id)
      .pipe(finalize(() => this.loading.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.loadRows(),
        error: (err) => this.handleBlockingError(err, row, 'delete'),
      });
  }

  deactivate(row: IBookingAccountRow): void {
    this.confirmationService.confirm({
      message: `האם להשבית את הכרטיס "${row.name}" (${row.code})?`,
      header: 'אישור השבתת כרטיס',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'כן, השבת',
      rejectLabel: 'ביטול',
      accept: () => this.doDeactivate(row),
    });
  }

  private doDeactivate(row: IBookingAccountRow): void {
    this.loading.set(true);
    const request$ =
      this.mode === 'admin'
        ? this.catalogService.deactivateAdminBookingAccount(row.id)
        : this.catalogService.deactivateAccountantBookingAccount(this.businessNumber!, row.id);
    request$
      .pipe(finalize(() => this.loading.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.loadRows(),
        error: (err) => this.handleBlockingError(err, row, 'deactivate'),
      });
  }

  private handleBlockingError(err: any, row: IBookingAccountRow, action: 'delete' | 'deactivate'): void {
    // Show the linked rows, not a generic error, so the admin knows exactly
    // what must be repointed before retrying.
    if (err?.status === 409 && Array.isArray(err?.error?.blockingSubCategories)) {
      this.blockingAction.set(action);
      this.blockingAccountLabel.set(`${row.name} (${row.code})`);
      this.blockingSubCategories.set(err.error.blockingSubCategories);
      this.showBlockingDialog.set(true);
    }
  }

  closeBlockingDialog(): void {
    this.showBlockingDialog.set(false);
    this.blockingSubCategories.set([]);
    this.blockingAction.set('deactivate');
  }

  // ── Excel export — same exceljs pattern (RTL, bold header, download via
  // Blob) as card-management.component.ts's exportToExcel(), ported here
  // with this tab's own column set (official 6111 category/sub-category +
  // formPart, which the old export never had). ──────────────────────────
  exportingExcel = signal<boolean>(false);

  exportToExcel(): void {
    if (this.exportingExcel() || !this.filteredRows().length) return;
    this.exportingExcel.set(true);
    try {
      this.buildAndDownloadRowsWorkbook();
    } finally {
      this.exportingExcel.set(false);
    }
  }

  private buildAndDownloadRowsWorkbook(): void {
    const header = [
      'קוד מערכת', 'שם הכרטיס', 'חתך', 'קוד 6111', 'קטגוריה (6111)', 'תת-קטגוריה (6111)',
      'חלק', 'סטטוס', '% מע"מ', '% מס', 'פחת',
    ];

    const wb = new Workbook();
    const ws = wb.addWorksheet('כרטיסי טופס 6111', { views: [{ rightToLeft: true }] });
    const headerRow = ws.addRow(header);
    headerRow.font = { bold: true };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F6F9' } };

    for (const row of this.filteredRows()) {
      ws.addRow([
        row.code,
        row.name,
        row.sectionName || '',
        row.code6111 || '',
        row.category6111 || '',
        row.subCategory6111 || '',
        this.formPartLabel(row.formPart),
        row.isActive ? 'פעיל' : 'לא פעיל (ייחוס)',
        row.vatPercent ?? '',
        row.taxPercent ?? '',
        row.reductionPercent ?? '',
      ]);
    }

    for (let i = 1; i <= header.length; i++) {
      ws.getColumn(i).width = 16;
      ws.getColumn(i).alignment = { horizontal: 'right' };
    }

    wb.xlsx.writeBuffer().then((buffer) => {
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'כרטיסי-טופס-6111.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  // ── Add-from-scratch dialog (accountant mode only, 2026-08-17) — reuses
  // the exact same POST bookkeeping/accounts / createAccount() path the
  // clients-panel "כרטיס חדש" dialog uses (D11: full law + section +
  // category, one atomic createAccountWithSubCategory call). Only the
  // dialog UI is new — that existing flow isn't a standalone Angular
  // component (it's inline markup/state on ClientPanelPage itself), so
  // there was nothing to import; the backend/service path is untouched.
  // Fixed to availableFor=CURRENT_CLIENT for this tab's own businessNumber
  // — the ALL_MY_CLIENTS option stays exclusive to the clients-panel
  // dialog, since this tab is already scoped to one business. ────────────
  showAddDialog = signal<boolean>(false);
  addingCard = signal<boolean>(false);
  addError = signal<string | null>(null);
  addForm: AddCardFormState = this.emptyAddForm();

  private emptyAddForm(): AddCardFormState {
    return {
      name: '',
      code: '',
      sectionId: null,
      code6111: '',
      recognitionType: 'RECOGNIZED',
      vatPercent: 100,
      taxPercent: 100,
      reductionPercent: 0,
      isEquipment: false,
      technicalOnly: false,
      categoryName: '',
      visibleBusinessTypes: [],
    };
  }

  openAdd(): void {
    this.addForm = this.emptyAddForm();
    this.addError.set(null);
    this.showAddDialog.set(true);
  }

  closeAddDialog(): void {
    this.showAddDialog.set(false);
  }

  isAddFormValid(): boolean {
    const f = this.addForm;
    const pctOk = (v: number | null) => v != null && v >= 0 && v <= 100;
    return (
      !!f.name.trim() &&
      f.sectionId != null &&
      pctOk(f.vatPercent) &&
      pctOk(f.taxPercent) &&
      (f.reductionPercent == null || pctOk(f.reductionPercent)) &&
      (f.technicalOnly || !!f.categoryName.trim()) &&
      f.visibleBusinessTypes.length > 0
    );
  }

  submitAdd(): void {
    if (!this.isAddFormValid()) return;
    const f = this.addForm;
    const payload: ICreateAccountPayload = {
      name: f.name.trim(),
      code: f.code.trim() || undefined,
      sectionId: f.sectionId!,
      code6111: f.code6111.trim() || undefined,
      recognitionType: f.recognitionType,
      vatPercent: f.vatPercent!,
      taxPercent: f.taxPercent!,
      reductionPercent: f.reductionPercent ?? 0,
      isEquipment: f.isEquipment,
      availableFor: 'CURRENT_CLIENT',
      technicalOnly: f.technicalOnly,
      categoryName: f.technicalOnly ? undefined : f.categoryName.trim(),
      businessNumber: this.businessNumber,
      visibleBusinessTypes: f.visibleBusinessTypes,
    };

    this.addingCard.set(true);
    this.catalogService
      .createAccount(payload)
      .pipe(finalize(() => this.addingCard.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.closeAddDialog();
          this.loadRows();
        },
        error: (err) => {
          this.addError.set(err?.error?.message ?? 'יצירת הכרטיס נכשלה. נסה שוב.');
        },
      });
  }
}
