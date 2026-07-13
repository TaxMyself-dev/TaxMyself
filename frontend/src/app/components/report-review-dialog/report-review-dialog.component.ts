import { CommonModule } from '@angular/common';
import {
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  TemplateRef,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { DialogModule } from 'primeng/dialog';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';
import { EMPTY, catchError, finalize } from 'rxjs';

import { ButtonComponent } from '../button/button.component';
import { ButtonColor, ButtonSize } from '../button/button.enum';
import { GenericTableComponent } from '../generic-table/generic-table.component';
import { GenericService } from 'src/app/services/generic.service';
import { AuthService } from 'src/app/services/auth.service';
import { FormTypes, ICellRenderer, VATReportingType } from 'src/app/shared/enums';
import { IColumnDataTable, IRowDataTable } from 'src/app/shared/interface';
import {
  CatalogRow,
  ReportPreviewResponse,
  ReportReviewService,
  ReviewMappingStatus,
  ReviewOverrides,
  ReviewRow,
} from 'src/app/services/report-review.service';

/** D9 view modes — one screen, two column sets. Persisted per user. */
type ReviewViewMode = 'regular' | 'professional';

/** A card (booking account) entry for the professional-view classification
 *  dropdown and the mapping-completion picker — derived by grouping the
 *  merged catalog's mapped rows by accountId. Picking a card resolves to
 *  `subCategoryId` (its representative sub_category) since an expense is
 *  always classified through a sub_category (D1 thin-pointer model). */
interface CardOption {
  accountId: number;
  accountCode: string;
  accountName: string;
  sectionName: string;
  vatPercent: number;
  taxPercent: number;
  reductionPercent: number;
  isEquipment: boolean;
  /** Representative catalog row: same-named sub_category when one exists,
   *  otherwise the card's first sub_category alphabetically. */
  subCategoryId: number;
  categoryName: string;
  subCategoryName: string;
}

/**
 * Flat row shape consumed by GenericTableComponent. Built from the
 * discriminated-union ReviewRow returned by the preview endpoint; carries
 * BOTH source-side identities (documentId / slimTransactionId — one or
 * both populated) plus the editable classification fields. Edits made
 * in-cell ride along in the approve call's `overrides`.
 */
interface EditableReviewRow {
  /** Stable key for trackBy; not a DB id (multi-invoice files share
   *  documentId, so we compose). */
  rowKey: string;
  type: 'matched' | 'doc_only' | 'tx_only';

  /** Bulk-approve marker — defaults to true on load; the user can uncheck
   *  to exclude this row from the footer "אשר נבחרות" action. */
  selected: boolean;

  // Source ids — one or both populated, never neither.
  documentId: number | null;
  slimTransactionId: number | null;

  // Doc-side display (matched + doc_only). Empty strings for tx_only rows
  // so the GenericTableComponent renders an empty cell instead of "null".
  driveFileId: string;
  driveFileName: string;
  invoiceNumber: string;
  /** Israeli tax allocation number (מספר הקצאה). Empty when the doc
   *  doesn't carry one (most receipts + invoices below the threshold). */
  allocationNumber: string;
  /** Hebrew display label for the document type ("חשבונית", "טופס 106",
   *  etc.). Empty for tx_only. Derived once in toEditableRow so the
   *  template doesn't have to re-map every change-detection cycle. */
  documentTypeLabel: string;
  /** Raw documentType enum value from the backend ("invoice", "receipt",
   *  "invoice_receipt_pair", ...). Used by the template to decide whether
   *  to show the "פצל" (unpair) action — only invoice_receipt_pair rows
   *  expose it. Null for tx_only and for legacy rows without an OCR'd type. */
  documentType: string | null;
  /** D8 routing kind: EXPENSE_INVOICE | ANNUAL_DOCUMENT | UNIDENTIFIED.
   *  ANNUAL rows get the "לא הוצאה — נשמר לדוח השנתי" badge + "תייק" action
   *  (never approve); UNIDENTIFIED rows get the triage actions. Null for
   *  tx_only rows and legacy docs — treated as EXPENSE_INVOICE. */
  documentKind: string | null;

  // Display fields used by the read-only columns.
  supplier: string;
  supplierId: string;
  date: string;      // YYYY-MM-DD
  amount: number;    // raw positive number, used by internal logic (link picker etc.)

  // Currency display fields — wired to the SUM_WITH_FX cellRenderer:
  //   • sumLabel: formatted display string (e.g. "20 ש״ח" or "$50.00")
  //   • currency: ISO code; the renderer's foreign-currency branch only
  //     fires when currency !== 'ILS'
  //   • ilsAmount: pre-converted absolute ILS value for non-ILS rows;
  //     shown in parens under the foreign amount. null for ILS rows.
  sumLabel: string;
  currency: string;
  ilsAmount: number | null;

  // Editable classification — initially populated from the preview's
  // server-side classification block (canonical merged-catalog names), with
  // the raw doc/slim names as the UNCLASSIFIED fallback. User can change
  // inline before approve; every change re-resolves against the local
  // catalog (D9 live-resolution preview).
  category: string;
  subCategory: string;
  /** Effective merged-catalog sub_category id — sent in overrides so the
   *  backend resolves by id, not by name pair. Null when UNCLASSIFIED. */
  subCategoryId: number | null;
  vatPercent: number;
  taxPercent: number;
  isEquipment: boolean;

  // ---- D9 resolution preview (recomputed on every classification change,
  //      frozen server-side into snapshots at approval) ----
  mappingStatus: ReviewMappingStatus;
  /** D7 description — the professional view's single classification column. */
  description: string;
  /** Effective sub_category is accountant-owned / accountant-approved —
   *  drives the "מופה ע״י רו״ח" badge + override icon. */
  mappedByAccountant: boolean;
  sectionName: string;
  accountId: number | null;
  accountCode: string;
  accountName: string;
  /** Card display label for the professional account column: "name (code)". */
  accountLabel: string;
  reductionPercent: number;

  // Editable period label ("M/YYYY" or "M1-M2/YYYY"). overridden=true when
  // the user picks a non-derived value — only then do we send it as an
  // override (otherwise backend recomputes from date + business cadence).
  reportPeriod: string;
  reportPeriodOverridden: boolean;

  // Status-column labels (read-only display). Computed once in
  // toEditableRow so the cellTemplate doesn't have to re-derive them.
  /** "מסמך + תנועה" | "מסמך בלבד" | "תנועה בלבד" */
  matchedTypeLabel: string;
  /** "ספק מוכר" | "ספק חדש" — null for tx_only rows (no supplier concept). */
  supplierStatusLabel: string | null;

  /** Per-row choice for "add this supplier to my master list on approve".
   *  Defaults to true. The red flag icon on doc rows is a toggle: click to
   *  flip this to false (won't add to Supplier table), click again to
   *  flip back to true. Ignored when supplierStatusLabel !== 'ספק חדש'
   *  (no flag rendered, nothing to toggle). The approve call sends this
   *  through `overrides.saveAsSupplier`. */
  saveAsSupplier: boolean;

  // Per-row UI state
  saveStatus: null | 'pending' | 'failed';
  saveError: string | null;
  /** Set when the backend rejected this row with DUPLICATE_WARNING — a soft
   *  duplicate (same supplier/sum/date, different/missing doc number). The
   *  row stays visible with an inline "save anyway / skip" prompt instead of
   *  a plain failure. Cleared once resolved. */
  duplicateWarning?: boolean;
  /** Set to true when the user clicks "save anyway" on a duplicateWarning
   *  row; threaded into overrides.acknowledgeDuplicate so the retried
   *  approve bypasses the soft block. */
  acknowledgeDuplicate?: boolean;
}

/**
 * One supplier group in the bulk-approve queue whose rows disagree on at
 * least one field that would be persisted to the Supplier master row.
 * Only the first row processed per supplierId actually writes to the
 * master (the backend's find-or-create skips the rest), so divergent
 * values on the others would be silently dropped. We surface this to the
 * user before the approve runs so they can either align the values or
 * opt the divergent rows out of supplier-save via the per-row flag.
 */
interface SupplierConflict {
  supplierId: string;
  supplierName: string;
  rowCount: number;
  /** Hebrew field labels that differ across the group's rows. */
  conflictingFields: string[];
}

@Component({
  selector: 'app-report-review-dialog',
  standalone: true,
  templateUrl: './report-review-dialog.component.html',
  styleUrls: ['./report-review-dialog.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    DialogModule,
    TooltipModule,
    ButtonComponent,
    GenericTableComponent,
  ],
})
export class ReportReviewDialogComponent {
  // ---- Inputs / outputs ------------------------------------------------
  visible = input.required<boolean>();
  businessNumber = input.required<string>();
  startDate = input.required<string>();
  endDate = input.required<string>();

  visibleChange = output<boolean>();
  processComplete = output<{ hasRows: boolean }>();

  // ---- Deps ------------------------------------------------------------
  private reviewService = inject(ReportReviewService);
  private authService = inject(AuthService);
  private messageService = inject(MessageService);
  private genericService = inject(GenericService);
  private sanitizer = inject(DomSanitizer);

  readonly ButtonColor = ButtonColor;
  readonly ButtonSize = ButtonSize;

  // ---- State -----------------------------------------------------------
  isLoading = signal<boolean>(false);
  isActioning = signal<boolean>(false);
  mode = signal<'documents_only' | 'with_banking' | null>(null);
  rows = signal<EditableReviewRow[]>([]);
  /** Counts from the preview, kept in sync as rows leave. */
  counts = signal<{ matched: number; docOnly: number; txOnly: number }>({
    matched: 0, docOnly: 0, txOnly: 0,
  });

  /** Merged expense catalog WITH card law + section per row
   *  (GET bookkeeping/expense-catalog?includePrivate=true) — single data
   *  source for the cascading pickers, the professional card dropdown and
   *  the client-side live-resolution preview. Loaded once per dialog open. */
  catalog = signal<CatalogRow[]>([]);

  /** D9: does the business owner have an ACTIVE delegation (an accountant
   *  services them)? From the preview response. Missing-mapping rows show
   *  "אצל הרו״ח" when true; the simple picker when false. */
  clientHasActiveDelegation = signal<boolean>(false);

  /**
   * D9 view mode. Persisted per user in localStorage; first-ever default is
   * professional for accountants/admins (the ACTOR's role — while
   * impersonating a client, the accountant still lands on professional),
   * regular for everyone else. The toggle itself is available to everyone —
   * permissions gate capabilities, not visibility.
   */
  viewMode = signal<ReviewViewMode>('regular');

  /** True when the ACTOR (real logged-in user, not the impersonated client)
   *  is an accountant/admin — gates the inline mapping-completion flow.
   *  The backend enforces the same gate on complete-mapping. */
  isActorAccountant = false;

  // ---- Mapping-completion dialog state (accountant, D9 inline row) ----
  completionVisible = signal<boolean>(false);
  completionAccountId = signal<number | null>(null);
  /** "החל גם על סיווגים עתידיים" — checked = repoint the sub_category. */
  completionApplyFuture = signal<boolean>(true);
  private completionRow: EditableReviewRow | null = null;
  completionRowLabel = signal<string>('');

  // ---- Simple-picker dialog state (client without an accountant, D9) ----
  simplePickerVisible = signal<boolean>(false);
  simplePickerChoice = signal<number | null>(null); // accountId
  private simplePickerRow: EditableReviewRow | null = null;
  simplePickerRowLabel = signal<string>('');

  /** Inline link picker state: which tx is in link-mode + the doc selected. */
  linkingTxId = signal<number | null>(null);
  selectedDocForLink = signal<number | null>(null);

  /** SupplierIds the user has touched (picked a category/sub-category on at
   *  least one row sharing that supplier). All rows with a matching
   *  supplierId render with the warning background — lets the user see at
   *  a glance which suppliers are mid-classification across the table.
   *  Empty supplierIds aren't added (tx_only rows have no supplierId, so
   *  one tx_only edit shouldn't paint every other tx_only row). */
  private highlightedSupplierIds = signal<Set<string>>(new Set<string>());

  /** Drive file currently shown in the side preview panel, or null when
   *  the panel is closed. Setting this slides a Drive iframe in on the
   *  RTL-right of the dialog body and compresses the table to share
   *  space. Cleared by closePreview() or onClose(). */
  previewDriveFileId = signal<string | null>(null);
  previewDriveFileName = signal<string>('');

  // Custom-period entry dialog state. Replaces the browser's native
  // `window.prompt` so it matches the rest of the app's modal styling.
  // `customPeriodRow` is the row we'll write the typed value back to
  // (null = dialog closed). `customPeriodValue` is the text the user is
  // typing right now; bound via [ngModel].
  customPeriodVisible = signal<boolean>(false);
  customPeriodValue = signal<string>('');
  private customPeriodRow: EditableReviewRow | null = null;

  // Supplier-conflict pre-flight dialog state. Opened by bulkApproveSelected
  // when the queue contains multiple rows for the same NEW supplier with
  // divergent classification — the user has to resolve before approval can
  // proceed (either align the values or click the flag on divergent rows).
  supplierConflictsVisible = signal<boolean>(false);
  supplierConflicts = signal<SupplierConflict[]>([]);

  /** SafeResourceUrl for the iframe — Angular's default sanitizer refuses
   *  to render any src on <iframe> without explicit trust. Recomputes
   *  only when previewDriveFileId() changes. */
  previewUrl = computed<SafeResourceUrl | null>(() => {
    const fid = this.previewDriveFileId();
    if (!fid) return null;
    return this.sanitizer.bypassSecurityTrustResourceUrl(
      `https://drive.google.com/file/d/${fid}/preview`,
    );
  });

  // ---- Derived ---------------------------------------------------------
  hasAnyRows = computed<boolean>(() => this.rows().length > 0);

  /** Business's VAT cadence — drives the period dropdown's option set
   *  (12 monthly options vs 6 bi-monthly options per year). */
  private vatReportingType = computed<VATReportingType>(() => {
    const bn = this.businessNumber();
    const biz = this.genericService.businesses().find(b => b.businessNumber === bn);
    return biz?.vatReportingType ?? VATReportingType.MONTHLY_REPORT;
  });

  /** Unique sorted category names from the catalog. */
  categoryOptions = computed<string[]>(() => {
    const seen = new Set<string>();
    for (const c of this.catalog()) { if (c.category) seen.add(c.category); }
    return Array.from(seen).sort((a, b) => a.localeCompare(b, 'he'));
  });

  /** Sub-categories grouped by parent — O(1) lookup per render. */
  private subCategoriesByCategory = computed<Map<string, CatalogRow[]>>(() => {
    const out = new Map<string, CatalogRow[]>();
    for (const c of this.catalog()) {
      const key = c.category ?? '';
      const list = out.get(key) ?? [];
      list.push(c);
      out.set(key, list);
    }
    for (const list of out.values()) {
      list.sort((a, b) => a.subCategory.localeCompare(b.subCategory, 'he'));
    }
    return out;
  });

  /**
   * D9 professional view: classification is by CARD. Group the catalog's
   * mapped rows by accountId — one option per card, labelled
   * "name (code)", grouped by section for the <optgroup> render. The
   * representative sub_category (same-named > alphabetical) is what the
   * expense actually gets classified to (D1 thin-pointer model). Cards
   * with no sub_category (technical cards) never appear here — they are
   * not classifiable, only postable via manual journal entries.
   */
  cardOptions = computed<CardOption[]>(() => {
    const byAccount = new Map<number, CatalogRow[]>();
    for (const c of this.catalog()) {
      if (c.accountId == null || c.isPrivate) continue;
      const list = byAccount.get(c.accountId) ?? [];
      list.push(c);
      byAccount.set(c.accountId, list);
    }
    const options: CardOption[] = [];
    for (const rows of byAccount.values()) {
      rows.sort((a, b) => a.subCategory.localeCompare(b.subCategory, 'he'));
      const rep = rows.find(r => r.subCategory === r.accountName) ?? rows[0];
      options.push({
        accountId: rep.accountId!,
        accountCode: rep.accountCode ?? '',
        accountName: rep.accountName ?? '',
        sectionName: rep.sectionName ?? '',
        vatPercent: Number(rep.vatPercent ?? 0),
        taxPercent: Number(rep.taxPercent ?? 0),
        reductionPercent: Number(rep.reductionPercent ?? 0),
        isEquipment: !!rep.isEquipment,
        subCategoryId: rep.subCategoryId,
        categoryName: rep.category ?? '',
        subCategoryName: rep.subCategory,
      });
    }
    options.sort((a, b) =>
      a.sectionName.localeCompare(b.sectionName, 'he') ||
      a.accountName.localeCompare(b.accountName, 'he'),
    );
    return options;
  });

  /** Card options grouped by section — feeds <optgroup> in the professional
   *  account dropdown and the completion/simple pickers. */
  cardOptionsBySection = computed<{ section: string; cards: CardOption[] }[]>(() => {
    const groups = new Map<string, CardOption[]>();
    for (const opt of this.cardOptions()) {
      const list = groups.get(opt.sectionName) ?? [];
      list.push(opt);
      groups.set(opt.sectionName, list);
    }
    return Array.from(groups.entries()).map(([section, cards]) => ({ section, cards }));
  });

  /** Doc_only rows — feeds the link picker dropdown on tx_only rows. */
  docOnlyRows = computed<EditableReviewRow[]>(() =>
    this.rows().filter(r => r.type === 'doc_only'),
  );

  constructor() {
    // D9 view mode: the ACTOR's role decides the first-ever default
    // (accountant → professional); after that the user's persisted choice
    // wins. Keyed per real user so an accountant's preference doesn't leak
    // into the client's own session on a shared browser.
    const realUser = this.authService.getRealUserDataFromLocalStorage();
    this.isActorAccountant =
      !!realUser?.role?.includes('ACCOUNTANT') || !!realUser?.role?.includes('ADMIN');
    const stored = realUser?.firebaseId
      ? (localStorage.getItem(ReportReviewDialogComponent.VIEW_MODE_KEY_PREFIX + realUser.firebaseId) as ReviewViewMode | null)
      : null;
    this.viewMode.set(
      stored === 'regular' || stored === 'professional'
        ? stored
        : this.isActorAccountant ? 'professional' : 'regular',
    );

    // Auto-load preview + catalog when the dialog becomes visible.
    let wasOpen = false;
    effect(() => {
      const open = this.visible();
      if (open && !wasOpen) {
        wasOpen = true;
        this.loadPreview();
      } else if (!open) {
        wasOpen = false;
      }
    });
  }

  private static readonly VIEW_MODE_KEY_PREFIX = 'reviewViewMode:';

  /** The regular/professional toggle — available to everyone (D9);
   *  persisted per real user. */
  setViewMode(mode: ReviewViewMode): void {
    this.viewMode.set(mode);
    const realUser = this.authService.getRealUserDataFromLocalStorage();
    if (realUser?.firebaseId) {
      localStorage.setItem(ReportReviewDialogComponent.VIEW_MODE_KEY_PREFIX + realUser.firebaseId, mode);
    }
  }

  // ---- Lifecycle -------------------------------------------------------

  onClose(): void {
    this.visibleChange.emit(false);
    this.rows.set([]);
    this.mode.set(null);
    this.catalog.set([]);
    this.linkingTxId.set(null);
    this.selectedDocForLink.set(null);
    this.isLoading.set(false);
    this.isActioning.set(false);
    this.highlightedSupplierIds.set(new Set<string>());
    this.previewDriveFileId.set(null);
    this.previewDriveFileName.set('');
    this.customPeriodVisible.set(false);
    this.customPeriodValue.set('');
    this.customPeriodRow = null;
    this.completionVisible.set(false);
    this.completionAccountId.set(null);
    this.completionRow = null;
    this.simplePickerVisible.set(false);
    this.simplePickerChoice.set(null);
    this.simplePickerRow = null;
  }

  /** Open the Drive preview side panel for a doc-side row. tx_only rows
   *  have no driveFileId so the eye icon isn't rendered for them. */
  openPreview(row: EditableReviewRow): void {
    if (!row.driveFileId) return;
    this.previewDriveFileId.set(row.driveFileId);
    this.previewDriveFileName.set(row.driveFileName ?? '');
  }

  closePreview(): void {
    this.previewDriveFileId.set(null);
    this.previewDriveFileName.set('');
  }

  /** Two-line message shown in the global loader while the preview builds
   *  (inbox OCR + bank matching). Rendered as two lines via the loader's
   *  `white-space: pre-line` styling. */
  private static readonly LOADING_MESSAGE =
    'אוספים את כל ההוצאות שלך.\nמעבדים נתונים ואוטוטו הדוח מוכן';

  private loadPreview(): void {
    const bn = this.businessNumber()?.trim();
    if (!bn) {
      this.processComplete.emit({ hasRows: false });
      this.onClose();
      return;
    }

    this.isLoading.set(true);
    this.rows.set([]);

    // Loading state shows the app's global loader (with a tailored message)
    // instead of an in-dialog spinner — the dialog itself stays hidden until
    // there are rows to review (see [visible] gate in the template).
    this.genericService.updateLoaderMessage(ReportReviewDialogComponent.LOADING_MESSAGE);
    this.genericService.getLoader().subscribe();

    // Fetch catalog in parallel — independent of preview, doesn't block.
    this.reviewService.getCatalog(bn)
      .pipe(catchError(() => EMPTY))
      .subscribe(catalog => this.catalog.set(catalog));

    this.reviewService
      .getPreview(bn, this.startDate(), this.endDate())
      .pipe(
        catchError(err => {
          const detail = err?.error?.message ?? err?.message ?? 'טעינת הסקירה נכשלה';
          this.messageService.add({ severity: 'error', summary: 'שגיאה', detail, life: 5000, key: 'br' });
          this.processComplete.emit({ hasRows: false });
          this.onClose();
          return EMPTY;
        }),
        finalize(() => {
          this.isLoading.set(false);
          this.genericService.dismissLoader();
        }),
      )
      .subscribe(preview => {
        this.mode.set(preview.mode);
        this.counts.set(preview.counts);
        this.clientHasActiveDelegation.set(!!preview.clientHasActiveDelegation);

        // Non-blocking notice: the inbox scan auto-rejected byte-identical
        // re-uploads (same file dropped twice). They never become review
        // rows, so tell the user it happened. Uses the app-level 'br' toast
        // so it survives even when the dialog closes (no rows to review).
        if (preview.duplicatesSkipped > 0) {
          this.messageService.add({
            severity: 'info',
            summary: 'קבצים כפולים',
            detail: `דולגו ${preview.duplicatesSkipped} קבצים כפולים שכבר קיימים במערכת`,
            life: 6000,
            key: 'br',
          });
        }

        const editable = preview.rows.map(r => this.toEditableRow(r));
        // Sort alphabetically by supplier name so rows from the same vendor
        // group together — easier to spot duplicates, easier to bulk-edit
        // category/sub-category across siblings. Hebrew collation handles
        // mixed Hebrew/Latin names correctly (e.g. "Anthropic" sorts under
        // 'A' while "בזק" sorts in Hebrew alpha order). Empty supplier
        // names (rare; tx_only with a merchant that OCR'd blank) sort first.
        editable.sort((a, b) =>
          (a.supplier || '').localeCompare(b.supplier || '', 'he'),
        );
        this.rows.set(editable);
        if (editable.length === 0) {
          this.processComplete.emit({ hasRows: false });
          this.onClose();
        } else {
          this.processComplete.emit({ hasRows: true });
        }
      });
  }

  // ---- ReviewRow → EditableReviewRow mapping ---------------------------

  private toEditableRow(r: ReviewRow): EditableReviewRow {
    const docSide   = r.type === 'tx_only' ? null : r.document;
    const txSide    = r.type === 'doc_only' ? null : r.transaction;
    const supplier  = docSide?.supplier ?? txSide?.merchantName ?? '';
    const date      = docSide?.date ?? txSide?.date ?? '';
    const amount    = Number(docSide?.amount ?? txSide?.amount ?? 0);

    // Currency display setup. Two foreign-currency paths feed into the
    // SUM_WITH_FX renderer:
    //   • doc_only / matched: the document's own currency (from Claude OCR).
    //   • tx_only / matched:  the bank transaction's original currency
    //                         (only present for non-ILS card/bank entries).
    // For matched rows the doc-side wins when present, because the
    // approve path also uses the doc-side amount.
    const docCurrency = docSide?.currency ?? null;
    const docIsNonIls = !!(docCurrency && docCurrency !== 'ILS');
    const txIsNonIls = !!(txSide?.originalCurrency && txSide.originalCurrency !== 'ILS');

    let sumLabel: string;
    let currency: string;
    let ilsAmount: number | null;
    if (docIsNonIls) {
      // OCR'd foreign-currency doc — `amount` is in `docCurrency`. Since
      // the OCR pipeline now stamps `docSide.ilsAmount` at insert time
      // (BOI rate via FxRateService), we can render the "(₪Y)" parenthesis
      // under the foreign amount directly. Falls back to null when the
      // backend couldn't resolve a rate (legacy rows pre-this-migration,
      // or unsupported currency) — SUM_WITH_FX then renders only the
      // foreign top line.
      sumLabel = `${this.currencySymbol(docCurrency!)}${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
      currency = docCurrency!;
      ilsAmount = docSide?.ilsAmount ?? null;
    } else if (txIsNonIls) {
      // Bank tx in non-ILS — tx.amount is already the pre-converted ILS
      // value; tx.originalAmount is the foreign amount.
      sumLabel = `${this.currencySymbol(txSide!.originalCurrency!)}${(txSide!.originalAmount ?? 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
      currency = txSide!.originalCurrency!;
      ilsAmount = amount;
    } else {
      // Plain ILS — just append the suffix.
      sumLabel = `${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ש״ח`;
      currency = 'ILS';
      ilsAmount = null;
    }
    // D9: the server's classification block carries the canonical names +
    // the resolved card law (exactly what approval would post). Raw doc/slim
    // strings remain the display fallback for UNCLASSIFIED rows; their
    // percents remain the fallback law so legacy behavior survives until
    // the row is (re)classified against the catalog.
    const c = r.classification;
    const category    = c.categoryName    ?? docSide?.category    ?? txSide?.category    ?? '';
    const subCategory = c.subCategoryName ?? docSide?.subCategory ?? txSide?.subCategory ?? '';
    const vatPercent  = Number(c.vatPercent  ?? docSide?.vatPercent  ?? txSide?.vatPercent  ?? 0);
    const taxPercent  = Number(c.taxPercent  ?? docSide?.taxPercent  ?? txSide?.taxPercent  ?? 0);
    const isEquipment = !!(c.isEquipment ?? docSide?.isEquipment ?? txSide?.isEquipment ?? false);

    return {
      rowKey: `${r.type}:${docSide?.documentId ?? 'x'}:${txSide?.slimTransactionId ?? 'x'}`,
      type: r.type,
      // Default-checked per spec (V = ✓) — but ONLY approvable rows (D9:
      // missing-mapping / unclassified / annual / unidentified rows cannot
      // be approved, so they never enter the bulk queue pre-checked).
      selected:
        (c.status === 'READY' || c.status === 'PRIVATE') &&
        docSide?.documentKind !== 'ANNUAL_DOCUMENT' &&
        docSide?.documentKind !== 'UNIDENTIFIED',
      documentId: docSide?.documentId ?? null,
      slimTransactionId: txSide?.slimTransactionId ?? null,
      driveFileId: docSide?.driveFileId ?? '',
      driveFileName: docSide?.driveFileName ?? '',
      invoiceNumber: docSide?.invoiceNumber ?? '',
      allocationNumber: docSide?.allocationNumber ?? '',
      documentTypeLabel: this.documentTypeLabel(docSide?.documentType ?? null),
      documentType: docSide?.documentType ?? null,
      documentKind: docSide?.documentKind ?? null,
      supplier,
      supplierId: docSide?.supplierId ?? '',
      date,
      amount,
      sumLabel,
      currency,
      ilsAmount,
      category,
      subCategory,
      subCategoryId: c.subCategoryId,
      vatPercent,
      taxPercent,
      isEquipment,
      mappingStatus: c.status,
      description: c.description,
      mappedByAccountant: c.mappedByAccountant,
      sectionName: c.sectionName ?? '',
      accountId: c.accountId,
      accountCode: c.accountCode ?? '',
      accountName: c.accountName ?? '',
      accountLabel: c.accountName ? `${c.accountName} (${c.accountCode})` : '',
      reductionPercent: Number(c.reductionPercent ?? 0),
      reportPeriod: this.derivePeriod(date),
      reportPeriodOverridden: false,
      matchedTypeLabel: this.matchedTypeLabel(r.type),
      // Supplier-known/new is a doc-side concept; tx_only rows have a
      // merchant (from the bank statement) but no Supplier-table linkage.
      supplierStatusLabel:
        docSide != null
          ? (docSide.matchedSupplierKnown ? 'ספק מוכר' : 'ספק חדש')
          : null,
      // Default true — auto-save the supplier to the master list on
      // approve. User clicks the red flag in the supplier cell to flip
      // to false (one-off vendor). Known suppliers don't render the flag
      // so the value stays at default and the backend silently no-ops
      // (existing supplier → find-or-create skips).
      saveAsSupplier: true,
      saveStatus: null,
      saveError: null,
    };
  }

  /** Symbol for a currency code — used in the foreign-currency sumLabel.
   *  Only the codes the rest of the app handles get short symbols; the
   *  raw code falls through (e.g. "CHF") so the user still sees what
   *  the transaction was in. */
  private currencySymbol(code: string): string {
    switch (code.toUpperCase()) {
      case 'USD': return '$';
      case 'EUR': return '€';
      case 'GBP': return '£';
      case 'ILS': return '₪';
      default:    return `${code} `;
    }
  }

  /** Hebrew label for Claude's document_type enum. Matches what the old
   *  PullDriveDocsDialog displayed in its docType column. Unknown values
   *  pass through (defensive — backend should only emit the 5 known
   *  values, but we don't want to render "(empty)" if it slips). */
  private documentTypeLabel(raw: string | null): string {
    if (!raw) return '';
    const map: Record<string, string> = {
      invoice: 'חשבונית',
      receipt: 'קבלה',
      tax_invoice_receipt: 'חשבונית מס קבלה',
      credit_invoice: 'חשבונית זיכוי',
      invoice_receipt_pair: 'חשבונית + קבלה',
      form_106: 'טופס 106',
      tax_form: 'טופס מס',
      contract: 'חוזה',
      unknown: 'לא ידוע',
    };
    return map[raw] ?? raw;
  }

  /** Hebrew label for the matched-type status column. Visible per the
   *  user's column-13 spec; the row tinting (green/yellow/blue background)
   *  still also signals the type at a glance. */
  private matchedTypeLabel(type: EditableReviewRow['type']): string {
    switch (type) {
      case 'matched':  return 'מסמך + תנועה';
      case 'doc_only': return 'מסמך בלבד';
      case 'tx_only':  return 'תנועה בלבד';
    }
  }

  // ---- Cascading dropdown handlers ------------------------------------

  subCategoriesForCategory(cat: string): CatalogRow[] {
    if (!cat) return [];
    return this.subCategoriesByCategory().get(cat) ?? [];
  }

  /**
   * D9 live-resolution preview: write one catalog row's full resolution
   * onto a review row — names + id + card law + section/account display
   * fields + mapping status + the D7 description. This is the single
   * client-side mirror of the backend's classifyReviewRow, applied on
   * every classification change so the professional columns always show
   * what approval would post.
   */
  private applyCatalogRow(row: EditableReviewRow, entry: CatalogRow): void {
    row.category = entry.category ?? '';
    row.subCategory = entry.subCategory;
    row.subCategoryId = entry.subCategoryId;
    row.vatPercent = Number(entry.vatPercent ?? 0);
    row.taxPercent = Number(entry.taxPercent ?? 0);
    row.reductionPercent = Number(entry.reductionPercent ?? 0);
    row.isEquipment = !!entry.isEquipment;
    row.sectionName = entry.sectionName ?? '';
    row.accountId = entry.accountId;
    row.accountCode = entry.accountCode ?? '';
    row.accountName = entry.accountName ?? '';
    row.accountLabel = entry.accountName ? `${entry.accountName} (${entry.accountCode})` : '';
    row.mappingStatus = entry.isPrivate
      ? 'PRIVATE'
      : entry.accountId != null && entry.approvalStatus === 'APPROVED'
        ? 'READY'
        : 'MISSING_MAPPING';
    row.mappedByAccountant = entry.ownerType === 'ACCOUNTANT';
    // D7 branch 1 — a classified row's description is always the pair.
    row.description = `${row.category}/${row.subCategory}`;
  }

  /** Clear a row's classification back to UNCLASSIFIED (keeps the picked
   *  category when `keepCategory`). */
  private clearClassification(row: EditableReviewRow, keepCategory: string): void {
    row.category = keepCategory;
    row.subCategory = '';
    row.subCategoryId = null;
    row.vatPercent = 0;
    row.taxPercent = 0;
    row.reductionPercent = 0;
    row.isEquipment = false;
    row.sectionName = '';
    row.accountId = null;
    row.accountCode = '';
    row.accountName = '';
    row.accountLabel = '';
    row.mappingStatus = 'UNCLASSIFIED';
    row.mappedByAccountant = false;
    row.description = this.documentTypeLabel(row.documentType) || 'מסמך לא מזוהה';
  }

  /** Category changed — clear sub-category + derived fields. The user
   *  must repick a sub-category (which then cascades the card's law
   *  back onto the row). Cascade: every other row sharing this supplierId
   *  picks up the same category change. User's stated intent — "all my
   *  Bezeq invoices are the same category". Touched siblings are visually
   *  highlighted via markSupplierTouched + row-highlighted class. */
  onCategoryChange(row: EditableReviewRow, picked: string): void {
    this.clearClassification(row, picked);
    this.cascadeToSupplierSiblings(row, (s) => this.clearClassification(s, picked));
    this.markSupplierTouched(row);
    this.bumpRows();
  }

  /** Sub-category changed — apply the catalog row's full resolution (card
   *  law + section/account + status) onto the row. Same supplier-sibling
   *  cascade as onCategoryChange: change one Bezeq invoice's sub-category,
   *  every Bezeq invoice in the table picks it up. */
  onSubCategoryChange(row: EditableReviewRow, picked: string): void {
    if (!picked) {
      this.clearClassification(row, row.category);
      this.cascadeToSupplierSiblings(row, (s) => this.clearClassification(s, s.category));
      this.markSupplierTouched(row);
      this.bumpRows();
      return;
    }
    const entry = this.catalog().find(c => c.subCategory === picked && c.category === row.category)
      ?? this.catalog().find(c => c.subCategory === picked);
    if (entry) {
      this.applyCatalogRow(row, entry);
      this.cascadeToSupplierSiblings(row, (s) => this.applyCatalogRow(s, entry));
    } else {
      row.subCategory = picked;
      row.subCategoryId = null;
      row.mappingStatus = 'UNCLASSIFIED';
      this.cascadeToSupplierSiblings(row, (s) => { s.subCategory = picked; s.subCategoryId = null; s.mappingStatus = 'UNCLASSIFIED'; });
    }
    this.markSupplierTouched(row);
    this.bumpRows();
  }

  /** D9 professional view — classification by CARD. Picking a card is a
   *  complete classification (the card carries the full accounting law);
   *  under the hood the row is classified to the card's representative
   *  sub_category. Same supplier-sibling cascade as the regular pickers. */
  onCardChange(row: EditableReviewRow, accountId: number | null): void {
    if (accountId == null) {
      this.clearClassification(row, '');
      this.cascadeToSupplierSiblings(row, (s) => this.clearClassification(s, ''));
      this.markSupplierTouched(row);
      this.bumpRows();
      return;
    }
    const card = this.cardOptions().find(o => o.accountId === accountId);
    if (!card) return;
    // Prefer a sub_category the row is ALREADY on when it points at this
    // card (re-picking the same card must not silently rename the row's
    // classification); otherwise the card's representative row.
    const entry =
      this.catalog().find(c => c.accountId === accountId && c.subCategoryId === row.subCategoryId)
      ?? this.catalog().find(c => c.subCategoryId === card.subCategoryId)!;
    this.applyCatalogRow(row, entry);
    this.cascadeToSupplierSiblings(row, (s) => this.applyCatalogRow(s, entry));
    this.markSupplierTouched(row);
    this.bumpRows();
  }

  /** Apply `mutate` to every row that represents the same supplier as
   *  `source` (other than `source` itself).
   *
   *  Primary match: trimmed supplierId — the strongest identity signal.
   *  Fallback: when both source AND sibling have an empty supplierId,
   *  match by trimmed supplier name. Covers receipt-only vendors (דואר
   *  ישראל, supermarkets, anything without an Israeli tax ID printed on
   *  the document) — without this, every קבלה row stayed un-cascadable.
   *  The "both empty" guard prevents leaking edits between two rows
   *  with the same name but different tax IDs (those ARE different
   *  legal entities — e.g. two stores sharing a chain brand). */
  private cascadeToSupplierSiblings(
    source: EditableReviewRow,
    mutate: (sibling: EditableReviewRow) => void,
  ): void {
    const sid = source.supplierId?.trim();
    const sname = source.supplier?.trim();
    if (!sid && !sname) return; // tx_only rows with no merchant info
    for (const r of this.rows()) {
      if (r === source) continue;
      const rsid = r.supplierId?.trim();
      const rsname = r.supplier?.trim();
      if (sid) {
        if (rsid !== sid) continue;
      } else {
        // source has no supplierId → only match siblings that ALSO have
        // no supplierId AND share the trimmed name.
        if (rsid) continue;
        if (!rsname || rsname !== sname) continue;
      }
      mutate(r);
    }
  }

  /** Click handler for the red flag icon — toggles the per-row choice
   *  of whether to register this supplier in the user's master list when
   *  approving. The flag is only rendered for "ספק חדש" rows so this
   *  method only runs when there's a meaningful choice; no need to guard. */
  toggleSaveAsSupplier(row: EditableReviewRow, event: MouseEvent): void {
    // Defensive — the click bubbles from inside the cell; without this
    // the row-level handler (if any added later) would also fire.
    event.stopPropagation();
    row.saveAsSupplier = !row.saveAsSupplier;
    this.bumpRows();
  }

  /** Derive the identity key used for the blue-highlight grouping.
   *  Matches the cascade rule: supplierId when present, otherwise the
   *  trimmed supplier name. Tagged so an empty-id row named "123" can't
   *  collide with a real supplierId "123". Returns null for tx-only rows
   *  with no merchant info at all (nothing to group by). */
  private supplierGroupKey(row: EditableReviewRow): string | null {
    const sid = row.supplierId?.trim();
    if (sid) return `id:${sid}`;
    const sname = row.supplier?.trim();
    if (sname) return `name:${sname}`;
    return null;
  }

  /** Add the row's supplier identity to the highlighted set so every row
   *  sharing the same supplier picks up the warning-background tint. */
  private markSupplierTouched(row: EditableReviewRow): void {
    const key = this.supplierGroupKey(row);
    if (!key) return;
    this.highlightedSupplierIds.update(set => {
      if (set.has(key)) return set;
      const next = new Set(set);
      next.add(key);
      return next;
    });
  }

  /** True when at least one row sharing this row's supplier identity has
   *  been touched. Drives the per-row .row-highlighted class. */
  isSupplierHighlighted(row: EditableReviewRow): boolean {
    const key = this.supplierGroupKey(row);
    if (!key) return false;
    return this.highlightedSupplierIds().has(key);
  }

  /** Icon class for the status column — three buckets aligned with the
   *  ReviewRow discriminator. Hebrew tooltip lives next to the icon in
   *  the cell template via [pTooltip]. */
  statusIconFor(type: EditableReviewRow['type']): string {
    switch (type) {
      case 'matched':  return 'pi pi-check-circle';
      case 'doc_only': return 'pi pi-file';
      case 'tx_only':  return 'pi pi-arrow-right-arrow-left';
    }
  }

  /** Hebrew description used as the tooltip for the source icon. */
  statusTooltipFor(type: EditableReviewRow['type']): string {
    switch (type) {
      case 'matched':  return 'מסמך הותאם לתנועת בנק';
      case 'doc_only': return 'מסמך בלבד - לא נמצאה תנועה מתאימה';
      case 'tx_only':  return 'תנועת בנק בלבד - לא נמצא מסמך מתאים';
    }
  }

  // ---- D9 status badge + approvability ---------------------------------

  /** True when the row is a D8 annual document — never an expense. */
  isAnnualRow(row: EditableReviewRow): boolean {
    return row.documentKind === 'ANNUAL_DOCUMENT';
  }

  /** True when the row is a D8 unidentified document — pending triage. */
  isUnidentifiedRow(row: EditableReviewRow): boolean {
    return row.documentKind === 'UNIDENTIFIED';
  }

  /**
   * The D9 status badge. One of:
   *   לא הוצאה — נשמר לדוח השנתי (D8 annual) / לא מזוהה — יש להחליט (D8
   *   triage) / מוכן / מופה ע״י רו״ח (override icon) / פרטי /
   *   חסר מיפוי — אצל הרו״ח (client w/ accountant) / חסר מיפוי / יש לסווג.
   */
  statusBadge(row: EditableReviewRow): { label: string; cls: string; icon: string | null } {
    if (this.isAnnualRow(row)) {
      return { label: 'לא הוצאה — נשמר לדוח השנתי', cls: 'badge-annual', icon: 'pi pi-bookmark' };
    }
    if (this.isUnidentifiedRow(row)) {
      return { label: 'לא מזוהה — יש להחליט', cls: 'badge-unidentified', icon: 'pi pi-question-circle' };
    }
    switch (row.mappingStatus) {
      case 'READY':
        return row.mappedByAccountant
          ? { label: 'מופה ע״י רו״ח', cls: 'badge-ready badge-accountant', icon: 'pi pi-user-edit' }
          : { label: 'מוכן', cls: 'badge-ready', icon: 'pi pi-check' };
      case 'PRIVATE':
        return { label: 'פרטי — לא עסקי', cls: 'badge-private', icon: 'pi pi-lock' };
      case 'MISSING_MAPPING':
        return this.isActorAccountant
          ? { label: 'חסר מיפוי', cls: 'badge-missing', icon: 'pi pi-exclamation-circle' }
          : this.clientHasActiveDelegation()
            ? { label: 'חסר מיפוי — אצל הרו״ח', cls: 'badge-missing', icon: 'pi pi-exclamation-circle' }
            : { label: 'חסר מיפוי', cls: 'badge-missing', icon: 'pi pi-exclamation-circle' };
      case 'UNCLASSIFIED':
      default:
        return { label: 'יש לסווג', cls: 'badge-unclassified', icon: 'pi pi-pencil' };
    }
  }

  /** D9: rows with missing mapping cannot be approved; D8 annual/
   *  unidentified rows are not expenses. Only READY and PRIVATE rows pass. */
  canApprove(row: EditableReviewRow): boolean {
    if (this.isAnnualRow(row) || this.isUnidentifiedRow(row)) return false;
    return row.mappingStatus === 'READY' || row.mappingStatus === 'PRIVATE';
  }

  /** The accountant's inline completion entry point is offered on
   *  missing-mapping rows only (D9). */
  showCompletionButton(row: EditableReviewRow): boolean {
    return this.isActorAccountant
      && row.mappingStatus === 'MISSING_MAPPING'
      && !this.isAnnualRow(row) && !this.isUnidentifiedRow(row);
  }

  /** The unaccompanied client's simple picker — never stuck (D9). Needs a
   *  concrete sub_category to repoint, so UNCLASSIFIED rows (no row at all)
   *  go through the normal pickers instead. */
  showSimplePickerButton(row: EditableReviewRow): boolean {
    return !this.isActorAccountant
      && !this.clientHasActiveDelegation()
      && row.mappingStatus === 'MISSING_MAPPING'
      && row.subCategoryId != null
      && !this.isAnnualRow(row) && !this.isUnidentifiedRow(row);
  }

  // ---- D8 actions: תייק + kind triage ----------------------------------

  /** "תייק" on an ANNUAL_DOCUMENT row — files it for the annual report
   *  (terminal not_an_expense; no expense, no journal, ever). */
  fileDocRow(row: EditableReviewRow): void {
    if (!row.documentId) return;
    this.runAction(row, this.reviewService.fileDoc(row.documentId), 'תיוק המסמך נכשל');
  }

  /** UNIDENTIFIED-row triage (or fixing a mis-detected annual doc): re-kind
   *  the document in place. The row STAYS in the table with its badge and
   *  available actions recomputed — unlike runAction flows, nothing leaves
   *  the review here. */
  markDocKind(row: EditableReviewRow, kind: 'EXPENSE_INVOICE' | 'ANNUAL_DOCUMENT'): void {
    if (!row.documentId || this.isActioning()) return;
    row.saveStatus = 'pending';
    this.isActioning.set(true);
    this.bumpRows();
    this.reviewService.setDocKind(row.documentId, kind)
      .pipe(
        catchError(err => {
          this.applySaveFailure(row, err, 'עדכון סוג המסמך נכשל');
          this.messageService.add({
            severity: 'error', summary: 'שגיאה', detail: row.saveError ?? '', life: 5000, key: 'br',
          });
          return EMPTY;
        }),
        finalize(() => this.isActioning.set(false)),
      )
      .subscribe(() => {
        row.documentKind = kind;
        row.saveStatus = null;
        row.saveError = null;
        this.bumpRows();
      });
  }

  // ---- D9 inline mapping completion (accountant) ------------------------

  openCompletion(row: EditableReviewRow): void {
    this.completionRow = row;
    this.completionRowLabel.set(`${row.supplier || row.description} — ${row.sumLabel}`);
    this.completionAccountId.set(row.accountId);
    this.completionApplyFuture.set(true);
    this.completionVisible.set(true);
  }

  cancelCompletion(): void {
    this.completionVisible.set(false);
    this.completionRow = null;
    this.completionAccountId.set(null);
  }

  /**
   * The approve→complete chain (approved design): approve creates the
   * expense (lands MISSING_ACCOUNTING_MAPPING, unjournaled), then
   * POST complete-mapping applies the picked card — one-off snapshot
   * override, or repoint-the-sub_category when "החל גם על סיווגים
   * עתידיים" is checked — and the backend approves + journals in one tx.
   * A failure between the calls leaves a retryable MISSING expense (the
   * row leaves the review; completion continues from the expenses table).
   */
  confirmCompletion(): void {
    const row = this.completionRow;
    const accountId = this.completionAccountId();
    if (!row || accountId == null || this.isActioning()) return;
    const applyFuture = this.completionApplyFuture();
    this.completionVisible.set(false);
    this.completionRow = null;

    const approve$ = this.approveObsForRow(row);
    if (!approve$) return;

    row.saveStatus = 'pending';
    this.isActioning.set(true);
    this.bumpRows();
    approve$
      .pipe(
        catchError(err => {
          this.applySaveFailure(row, err, 'אישור השורה נכשל');
          this.isActioning.set(false);
          return EMPTY;
        }),
      )
      .subscribe(({ expenseId }) => {
        this.reviewService.completeExpenseMapping(expenseId, accountId, applyFuture)
          .pipe(
            catchError(err => {
              // The expense exists but is still MISSING — honest state:
              // drop the row (its source doc/tx is consumed) and tell the
              // user where to finish.
              const detail = err?.error?.message ?? err?.message ?? '';
              this.messageService.add({
                severity: 'warn',
                summary: 'ההוצאה נשמרה אך המיפוי לא הושלם',
                detail: `ניתן להשלים את המיפוי מטבלת ההוצאות. ${detail}`,
                life: 8000, key: 'br',
              });
              return EMPTY;
            }),
            finalize(() => {
              this.isActioning.set(false);
              this.rows.update(rs => rs.filter(r => r !== row));
              this.adjustCount(row.type, -1);
              this.maybeAutoClose();
            }),
          )
          .subscribe();
      });
  }

  // ---- D9 simple picker (client without an accountant) ------------------

  /** Curated "למה ההוצאה שייכת?" quick choices, resolved against the live
   *  catalog by SYSTEM seed names (fuel / vehicle maintenance / office /
   *  advertising / rent). Only entries that exist AND carry a card are
   *  offered; the full by-section select below the buttons covers "אחר". */
  simplePickerOptions = computed<{ label: string; accountId: number }[]>(() => {
    const curated: { label: string; category: string; subCategory: string }[] = [
      { label: 'דלק',            category: 'רכב ותחבורה', subCategory: 'דלק' },
      { label: 'אחזקת רכב',      category: 'רכב ותחבורה', subCategory: 'טיפולים' },
      { label: 'ציוד משרדי',     category: 'עסק',          subCategory: 'הוצאות משרד' },
      { label: 'פרסום ושיווק',   category: 'עסק',          subCategory: 'שיווק ופרסום' },
      { label: 'שכירות',         category: 'עסק',          subCategory: 'שכירות משרד' },
    ];
    const out: { label: string; accountId: number }[] = [];
    for (const c of curated) {
      const entry = this.catalog().find(e => e.category === c.category && e.subCategory === c.subCategory);
      if (entry?.accountId != null) out.push({ label: c.label, accountId: entry.accountId });
    }
    return out;
  });

  openSimplePicker(row: EditableReviewRow): void {
    this.simplePickerRow = row;
    this.simplePickerRowLabel.set(`${row.supplier || row.description} — ${row.sumLabel}`);
    this.simplePickerChoice.set(null);
    this.simplePickerVisible.set(true);
  }

  cancelSimplePicker(): void {
    this.simplePickerVisible.set(false);
    this.simplePickerRow = null;
    this.simplePickerChoice.set(null);
  }

  pickSimpleOption(accountId: number): void {
    this.simplePickerChoice.set(accountId);
    this.confirmSimplePicker();
  }

  /**
   * Repoint the row's unmapped sub_category at the chosen card
   * (PATCH bookkeeping/sub-categories/:id/account — the D9 future-mapping
   * primitive; the client keeps their own name, e.g. "איתוראן", now backed
   * by a system card). On success every review row on that sub_category
   * flips to מוכן, and the local catalog row is patched so re-picks see
   * the completed mapping.
   */
  confirmSimplePicker(): void {
    const row = this.simplePickerRow;
    const accountId = this.simplePickerChoice();
    if (!row || row.subCategoryId == null || accountId == null || this.isActioning()) return;
    const subCategoryId = row.subCategoryId;
    this.simplePickerVisible.set(false);
    this.simplePickerRow = null;

    const card = this.cardOptions().find(o => o.accountId === accountId);
    this.isActioning.set(true);
    this.reviewService.repointSubCategory(subCategoryId, accountId)
      .pipe(
        catchError(err => {
          const detail = err?.error?.message ?? err?.message ?? 'השלמת המיפוי נכשלה';
          this.messageService.add({ severity: 'error', summary: 'שגיאה', detail, life: 5000, key: 'br' });
          return EMPTY;
        }),
        finalize(() => this.isActioning.set(false)),
      )
      .subscribe((updated) => {
        // The repoint may have landed a CLIENT override row (SYSTEM/
        // ACCOUNTANT-owned originals are never edited) — adopt the id the
        // backend actually mapped.
        const effectiveSubId = updated?.id ?? subCategoryId;
        this.catalog.update(rows => rows.map(c =>
          c.subCategoryId === subCategoryId || c.subCategoryId === effectiveSubId
            ? {
                ...c,
                subCategoryId: effectiveSubId,
                accountId,
                approvalStatus: 'APPROVED',
                accountCode: card?.accountCode ?? c.accountCode,
                accountName: card?.accountName ?? c.accountName,
                sectionName: card?.sectionName ?? c.sectionName,
                vatPercent: card?.vatPercent ?? c.vatPercent,
                taxPercent: card?.taxPercent ?? c.taxPercent,
                reductionPercent: card?.reductionPercent ?? c.reductionPercent,
                isEquipment: card?.isEquipment ?? c.isEquipment,
              }
            : c,
        ));
        for (const r of this.rows()) {
          if (r.subCategoryId !== subCategoryId && r.subCategoryId !== effectiveSubId) continue;
          const entry = this.catalog().find(c => c.subCategoryId === effectiveSubId);
          if (entry) this.applyCatalogRow(r, entry);
        }
        this.bumpRows();
      });
  }

  /** The approve observable for a row per its type — shared by the bulk
   *  queue and the completion chain. Null when ids are missing. */
  private approveObsForRow(row: EditableReviewRow): import('rxjs').Observable<{ expenseId: number }> | null {
    return row.type === 'matched' && row.documentId && row.slimTransactionId
      ? this.reviewService.approveMatched(
          this.businessNumber(), row.documentId, row.slimTransactionId, this.overridesFromRow(row),
        )
      : row.type === 'doc_only' && row.documentId
        ? this.reviewService.approveDocCash(
            this.businessNumber(), row.documentId, this.overridesFromRow(row),
          )
      : row.type === 'tx_only' && row.slimTransactionId
        ? this.reviewService.approveTxNoDoc(
            this.businessNumber(), row.slimTransactionId, this.overridesFromRow(row),
          )
        : null;
  }

  // ---- Period dropdown -------------------------------------------------

  /** Special sentinel value for the "אחר" (other) option. Picking it
   *  pops a prompt where the user types a custom period label, instead
   *  of selecting from the predefined list. */
  private static readonly CUSTOM_PERIOD_SENTINEL = '__custom__';

  /**
   * Period options scoped to the row's date — 6 months forward from
   * the doc's date:
   *   - DUAL_MONTH_REPORT (bi-monthly): the bi-monthly period the date
   *     falls in, plus the next two bi-monthly periods. Year suffix
   *     auto-rolls when crossing December (e.g. row dated 23/12/2025
   *     → "11-12/2025", "1-2/2026", "3-4/2026").
   *   - MONTHLY_REPORT: 6 individual months starting from the date's
   *     month, same year wraparound rule.
   * Plus an "אחר" sentinel at the bottom so the user can type a custom
   * period for periods that don't fit the 6-month forward window
   * (back-fill into an earlier closed period, for example).
   * If row.reportPeriod was set previously to something outside the
   * generated list (manual edit on a prior open of this dialog), we
   * also include it at the top so the dropdown can re-display it.
   */
  periodOptionsForRow(row: EditableReviewRow): string[] {
    const opts: string[] = [];
    const date = this.parseRowDate(row.date);
    const isDual = this.vatReportingType() === VATReportingType.DUAL_MONTH_REPORT;

    if (date) {
      let month = date.getUTCMonth() + 1;
      let year = date.getUTCFullYear();
      if (isDual) {
        // Align to bi-monthly bucket start (1, 3, 5, 7, 9, 11).
        let start = month % 2 === 1 ? month : month - 1;
        for (let i = 0; i < 3; i++) {
          opts.push(`${start}-${start + 1}/${year}`);
          start += 2;
          if (start > 12) { start = 1; year++; }
        }
      } else {
        for (let i = 0; i < 6; i++) {
          opts.push(`${month}/${year}`);
          month++;
          if (month > 12) { month = 1; year++; }
        }
      }
    } else {
      // No date — fall back to the current calendar year's first period
      // so the dropdown still has something to pick. Edge case (tx_only
      // rows with a missing cache.transactionDate).
      const year = new Date().getFullYear();
      opts.push(isDual ? `1-2/${year}` : `1/${year}`);
    }

    // Preserve any prior custom period that isn't in the generated set
    // so the select still has a valid selected value to render.
    if (row.reportPeriod && !opts.includes(row.reportPeriod)) {
      opts.unshift(row.reportPeriod);
    }
    opts.push(ReportReviewDialogComponent.CUSTOM_PERIOD_SENTINEL);
    return opts;
  }

  /** Display label for an option — "אחר" for the sentinel, the option
   *  string verbatim for everything else. Template binds via this so
   *  the underlying value stays a sentinel until the user picks it. */
  periodOptionLabel(opt: string): string {
    return opt === ReportReviewDialogComponent.CUSTOM_PERIOD_SENTINEL ? 'אחר' : opt;
  }

  /** User picked from the period dropdown — flag as overridden only if
   *  the choice differs from what we'd derive automatically, so unchanged
   *  rows still let the backend compute the period from the date.
   *  "אחר" branches to a window.prompt for free-form entry. */
  onPeriodChange(row: EditableReviewRow, picked: string): void {
    if (picked === ReportReviewDialogComponent.CUSTOM_PERIOD_SENTINEL) {
      // Open the styled custom-period dialog instead of window.prompt
      // so the look matches the rest of the modal stack. The <select>
      // briefly shows the sentinel as its value; bumpRows() inside
      // confirmCustomPeriod/cancelCustomPeriod resets the display.
      this.openCustomPeriod(row);
      return;
    }
    const derived = this.derivePeriod(row.date);
    row.reportPeriod = picked;
    row.reportPeriodOverridden = picked !== derived;
    this.bumpRows();
  }

  /** Open the "אחר" dialog for the given row, prefilled with the row's
   *  current period (so the user can edit instead of retyping). */
  openCustomPeriod(row: EditableReviewRow): void {
    this.customPeriodRow = row;
    this.customPeriodValue.set(row.reportPeriod ?? '');
    this.customPeriodVisible.set(true);
  }

  /** User pressed cancel / clicked X / pressed Escape on the custom-period
   *  dialog. Discard input and rewind the <select>'s display from the
   *  sentinel back to the row's previous period. */
  cancelCustomPeriod(): void {
    this.customPeriodVisible.set(false);
    this.customPeriodRow = null;
    this.customPeriodValue.set('');
    this.bumpRows();
  }

  /** User confirmed — write the typed period onto the row, mark it as
   *  overridden so the approve call passes it through, then close. Empty
   *  / whitespace-only input is treated as cancel. */
  confirmCustomPeriod(): void {
    const value = this.customPeriodValue().trim();
    const row = this.customPeriodRow;
    if (!row || !value) {
      this.cancelCustomPeriod();
      return;
    }
    row.reportPeriod = value;
    row.reportPeriodOverridden = true;
    this.customPeriodVisible.set(false);
    this.customPeriodRow = null;
    this.customPeriodValue.set('');
    this.bumpRows();
  }

  /** YYYY-MM-DD → Date in UTC. Returns null on bad/missing input. */
  private parseRowDate(date: string): Date | null {
    if (!date) return null;
    const [yStr, mStr, dStr] = date.split('-');
    const y = Number(yStr);
    const m = Number(mStr);
    const d = Number(dStr);
    if (!y || !m || !d) return null;
    return new Date(Date.UTC(y, m - 1, d));
  }

  private yearOfRow(row: EditableReviewRow): number {
    const fromDate = Number((row.date || '').split('-')[0]);
    if (fromDate) return fromDate;
    const fromPeriod = Number((row.reportPeriod || '').split('/').pop());
    return fromPeriod || new Date().getFullYear();
  }

  private derivePeriod(date: string): string {
    if (!date) return '';
    const [yStr, mStr] = date.split('-');
    const year = Number(yStr);
    const month = Number(mStr);
    if (!year || !month || month < 1 || month > 12) return '';
    if (this.vatReportingType() === VATReportingType.DUAL_MONTH_REPORT) {
      const start = month % 2 === 1 ? month : month - 1;
      return `${start}-${start + 1}/${year}`;
    }
    return `${month}/${year}`;
  }

  // ---- Row actions -----------------------------------------------------

  approveMatched(row: EditableReviewRow): void {
    if (!row.documentId || !row.slimTransactionId) return;
    this.runAction(row, this.reviewService.approveMatched(
      this.businessNumber(), row.documentId, row.slimTransactionId, this.overridesFromRow(row),
    ), 'אישור השורה נכשל');
  }

  approveDocCash(row: EditableReviewRow): void {
    if (!row.documentId) return;
    this.runAction(row, this.reviewService.approveDocCash(
      this.businessNumber(), row.documentId, this.overridesFromRow(row),
    ), 'אישור המסמך נכשל');
  }

  approveTxNoDoc(row: EditableReviewRow): void {
    if (!row.slimTransactionId) return;
    this.runAction(row, this.reviewService.approveTxNoDoc(
      this.businessNumber(), row.slimTransactionId, this.overridesFromRow(row),
    ), 'אישור התנועה ללא מסמך נכשל');
  }

  archiveDoc(row: EditableReviewRow): void {
    if (!row.documentId) return;
    this.runAction(row, this.reviewService.archiveDoc(row.documentId), 'ארכוב המסמך נכשל');
  }

  /** Hard-delete the document row (DB row removed, Drive file → archive/).
   *  Only available for rows with a document side; tx_only rows use reject
   *  instead, which has equivalent UX intent (remove from view). */
  deleteRow(row: EditableReviewRow): void {
    if (!row.documentId) return;
    this.runAction(row, this.reviewService.deleteDoc(row.documentId), 'מחיקת המסמך נכשלה');
  }

  /** "פצל" on an invoice_receipt_pair row — splits the pair back into
   *  two separate rows. After success, the receipt reverts to plain
   *  RECEIPT and the invoice re-appears as a doc_only row on the next
   *  preview. We drop the current row from the local set (relies on a
   *  fresh preview to bring the split halves back in correctly). */
  unpairRow(row: EditableReviewRow): void {
    if (!row.documentId) return;
    this.runAction(
      row,
      this.reviewService.unpair(row.documentId),
      'פיצול הזוג נכשל',
    );
  }

  rejectTx(row: EditableReviewRow): void {
    if (!row.slimTransactionId) return;
    this.runAction(row, this.reviewService.rejectTx(
      this.businessNumber(), row.slimTransactionId,
    ), 'דחיית התנועה נכשלה');
  }

  /**
   * "העלה מסמך" on a tx_only row — the hidden file input fires this on
   * change. We POST the file to the backend which uploads to Drive, runs
   * Claude, persists the extracted_document row, and auto-links it to
   * this slim transaction. On success we drop the row (preview re-fetch
   * is left to the next dialog open — same pattern as approve actions).
   *
   * Synchronous OCR on the backend can take 5-10s; the row picks up the
   * standard `saveStatus='pending'` overlay during the wait. Reset the
   * file input afterward so picking the SAME file twice still triggers
   * the change event (otherwise the browser dedups it).
   */
  onUploadDocForTx(row: EditableReviewRow, input: HTMLInputElement): void {
    const file = input.files?.[0];
    if (!file) return;
    if (!row.slimTransactionId) {
      input.value = '';
      return;
    }
    this.runAction(
      row,
      this.reviewService.uploadDocToTx(this.businessNumber(), row.slimTransactionId, file),
      'העלאת המסמך וקישורו לתנועה נכשלה',
    );
    // Clear so a re-pick of the same filename still fires `change`.
    input.value = '';
  }

  /** Common per-row action wrapper — marks row pending, fires the call,
   *  drops the row on success, surfaces error on failure. */
  private runAction(
    row: EditableReviewRow,
    obs$: import('rxjs').Observable<unknown>,
    errPrefix: string,
  ): void {
    if (this.isActioning() || row.saveStatus === 'pending') return;
    row.saveStatus = 'pending';
    this.isActioning.set(true);
    this.bumpRows();
    obs$
      .pipe(
        catchError(err => {
          // Soft duplicates surface inline (no error toast); everything
          // else is a real failure and gets the toast.
          const soft = this.applySaveFailure(row, err, errPrefix);
          if (!soft) {
            this.messageService.add({
              severity: 'error', summary: 'שגיאה', detail: row.saveError ?? errPrefix, life: 5000, key: 'br',
            });
          }
          return EMPTY;
        }),
        finalize(() => this.isActioning.set(false)),
      )
      .subscribe(() => {
        this.rows.update(rs => rs.filter(r => r !== row));
        this.adjustCount(row.type, -1);
        this.maybeAutoClose();
      });
  }

  /**
   * Shared save/approve failure handler. The backend's two-tier duplicate
   * guard returns `code: 'DUPLICATE_WARNING'` for a soft duplicate (same
   * supplier/sum/date, but a different or missing document number) — that
   * row stays visible with an inline "save anyway / skip" prompt rather
   * than a plain failure. Any other error (including the hard
   * `DUPLICATE_EXACT` block) is a normal failure. Returns true when the
   * row was put into the soft-duplicate state.
   */
  private applySaveFailure(
    row: EditableReviewRow,
    err: any,
    fallback: string,
  ): boolean {
    row.saveStatus = 'failed';
    row.saveError = err?.error?.message ?? err?.message ?? fallback;
    row.duplicateWarning = err?.error?.code === 'DUPLICATE_WARNING';
    this.bumpRows();
    return row.duplicateWarning;
  }

  /** "שמור בכל זאת" on a soft-duplicate row — acknowledge the warning and
   *  retry the approve. overridesFromRow now carries acknowledgeDuplicate,
   *  so the backend skips the soft block (the hard block still applies). */
  confirmSaveAnyway(row: EditableReviewRow): void {
    if (this.isActioning() || row.saveStatus === 'pending') return;
    row.acknowledgeDuplicate = true;
    row.duplicateWarning = false;
    row.saveError = null;
    row.saveStatus = null;
    this.bumpRows();
    if (row.type === 'matched') this.approveMatched(row);
    else if (row.type === 'doc_only') this.approveDocCash(row);
    else if (row.type === 'tx_only') this.approveTxNoDoc(row);
  }

  /** "דלג" on a soft-duplicate row — clear the warning and leave the row
   *  in the table un-approved. The user chose not to save this one. */
  dismissDuplicate(row: EditableReviewRow): void {
    row.duplicateWarning = false;
    row.acknowledgeDuplicate = false;
    row.saveError = null;
    row.saveStatus = null;
    this.bumpRows();
  }

  // ---- Link flow -------------------------------------------------------

  startLink(row: EditableReviewRow): void {
    if (!row.slimTransactionId) return;
    this.linkingTxId.set(row.slimTransactionId);
    this.selectedDocForLink.set(null);
  }

  cancelLink(): void {
    this.linkingTxId.set(null);
    this.selectedDocForLink.set(null);
  }

  confirmLink(row: EditableReviewRow): void {
    const docId = this.selectedDocForLink();
    if (!docId || !row.slimTransactionId) {
      this.messageService.add({
        severity: 'warn', summary: 'לא נבחר מסמך',
        detail: 'יש לבחור מסמך מהרשימה', life: 4000, key: 'br',
      });
      return;
    }
    if (this.isActioning()) return;
    this.isActioning.set(true);

    this.reviewService.linkDocToTx(this.businessNumber(), docId, row.slimTransactionId)
      .pipe(
        catchError(err => {
          const detail = err?.error?.message ?? err?.message ?? 'קישור המסמך לתנועה נכשל';
          this.messageService.add({ severity: 'error', summary: 'שגיאה', detail, life: 5000, key: 'br' });
          return EMPTY;
        }),
        finalize(() => this.isActioning.set(false)),
      )
      .subscribe(() => {
        // Optimistic: replace the doc_only + tx_only rows with a synthesized
        // matched row in-place. Avoids a full preview re-fetch (which would
        // re-run inbox OCR).
        const txRow = row;
        const docRow = this.rows().find(r => r.type === 'doc_only' && r.documentId === docId);
        if (!docRow) return;
        const merged: EditableReviewRow = {
          ...docRow,
          rowKey: `matched:${docRow.documentId}:${txRow.slimTransactionId}`,
          type: 'matched',
          slimTransactionId: txRow.slimTransactionId,
        };
        this.rows.update(rs => rs
          .filter(r => r !== txRow && r !== docRow)
          .concat([merged]),
        );
        this.counts.update(c => ({
          matched: c.matched + 1,
          docOnly: c.docOnly - 1,
          txOnly: c.txOnly - 1,
        }));
        this.linkingTxId.set(null);
        this.selectedDocForLink.set(null);
      });
  }

  // ---- Helpers ---------------------------------------------------------

  private overridesFromRow(row: EditableReviewRow): ReviewOverrides {
    return {
      // D1/Phase 6.1: the id wins over the name pair in the backend's
      // resolution — sent whenever the row's classification is a concrete
      // catalog row (always, except UNCLASSIFIED free-text leftovers).
      subCategoryId: row.subCategoryId ?? undefined,
      category: row.category,
      subCategory: row.subCategory,
      vatPercent: row.vatPercent,
      taxPercent: row.taxPercent,
      isEquipment: row.isEquipment,
      // Only send a period override when the user actually picked one —
      // otherwise the backend recomputes from date + business cadence.
      reportPeriod: row.reportPeriodOverridden ? row.reportPeriod : undefined,
      saveAsSupplier: row.saveAsSupplier,
      acknowledgeDuplicate: row.acknowledgeDuplicate,
    };
  }

  /** Trigger signal update without mutating shape — needed when in-row
   *  edits should refresh derived computeds + the generic-table view. */
  private bumpRows(): void {
    this.rows.update(rs => [...rs]);
  }

  private adjustCount(type: EditableReviewRow['type'], delta: number): void {
    this.counts.update(c => ({
      matched: type === 'matched' ? c.matched + delta : c.matched,
      docOnly: type === 'doc_only' ? c.docOnly + delta : c.docOnly,
      txOnly: type === 'tx_only' ? c.txOnly + delta : c.txOnly,
    }));
  }

  private maybeAutoClose(): void {
    if (this.hasAnyRows()) return;
    this.processComplete.emit({ hasRows: false });
    this.onClose();
  }

  subtitleText(): string {
    const m = this.mode();
    if (!m) return '';
    const c = this.counts();
    if (m === 'documents_only') {
      return `סקירה של ${c.docOnly} מסמכים`;
    }
    return `סקירה של ${this.rows().length} פריטים — ${c.matched} מקושרים, ${c.docOnly} מסמכים בלבד, ${c.txOnly} תנועות בלבד`;
  }

  // ---- Per-row row-class for generic-table tinting --------------------

  /** Row tinting is no longer driven by row type (matched/doc/tx are
   *  distinguished by the status-column icon now, not by background).
   *  The only color the row picks up is a warning-yellow when the user
   *  has touched a category/sub-category on any row sharing this row's
   *  supplierId — useful for tracking "which suppliers am I working on"
   *  across a long table. Failure/pending overlays still apply. */
  rowClassFn = (row: IRowDataTable): string => {
    const r = row as unknown as EditableReviewRow;
    const classes: string[] = [];
    if (this.isSupplierHighlighted(r)) classes.push('row-highlighted');
    if (r.saveStatus === 'failed') classes.push('row-error');
    if (r.saveStatus === 'pending') classes.push('row-pending');
    return classes.join(' ');
  };

  // ---- Columns builder -------------------------------------------------

  /** Cache so generic-table doesn't see a new array reference on every
   *  CD cycle. Same pattern PullDriveDocsDialog uses. Keyed by view mode —
   *  the D9 toggle swaps the whole column set. */
  private columnsCache: {
    mode: ReviewViewMode;
    tpls: TemplateRef<any>[];
    cols: IColumnDataTable<string, string>[];
  } | null = null;

  /**
   * D9 column sets — one screen, two view modes.
   *
   * Regular (client language): checkbox · supplier · supplier-id · doc-type ·
   *   doc-number · allocation-number · date · sum · category · sub-category ·
   *   vat% · tax% · period · STATUS BADGE · source icon · actions.
   *
   * Professional (accountant language): checkbox · supplier · doc-type ·
   *   doc-number · date · DESCRIPTION (single D7 column replacing the
   *   category/sub pair) · sum · SECTION · ACCOUNT (card picker — grouped by
   *   section; picking a card IS the classification) · vat% · tax% ·
   *   depreciation% · period · STATUS BADGE · source icon · actions.
   *   Percents are read-only here — they are the card's law (D1); supplier-id
   *   and allocation-number stay one toggle away in the regular view to keep
   *   the professional row width sane.
   */
  buildColumns(
    selectCellTpl: TemplateRef<any>,
    categoryCellTpl: TemplateRef<any>,
    subCategoryCellTpl: TemplateRef<any>,
    cardCellTpl: TemplateRef<any>,
    periodCellTpl: TemplateRef<any>,
    supplierCellTpl: TemplateRef<any>,
    statusBadgeCellTpl: TemplateRef<any>,
    sourceIconCellTpl: TemplateRef<any>,
    actionsCellTpl: TemplateRef<any>,
  ): IColumnDataTable<string, string>[] {
    const mode = this.viewMode();
    const tpls = [
      selectCellTpl, categoryCellTpl, subCategoryCellTpl, cardCellTpl, periodCellTpl,
      supplierCellTpl, statusBadgeCellTpl, sourceIconCellTpl, actionsCellTpl,
    ];
    if (
      this.columnsCache &&
      this.columnsCache.mode === mode &&
      tpls.every((t, i) => this.columnsCache!.tpls[i] === t)
    ) {
      return this.columnsCache.cols;
    }

    const shared = {
      select:   { name: 'selected', value: '', cellTemplate: selectCellTpl, width: '50px' },
      supplier: { name: 'supplier', value: 'ספק', cellTemplate: supplierCellTpl, width: '210px' },
      docType:  { name: 'documentTypeLabel', value: 'סוג', width: '140px' },
      invoice:  { name: 'invoiceNumber', value: 'מס׳ חשבונית', width: '200px' },
      date:     { name: 'date', value: 'תאריך', width: '115px' },
      sum:      { name: 'sumLabel', value: 'סכום', cellRenderer: ICellRenderer.SUM_WITH_FX, width: '110px' },
      period:   { name: 'reportPeriod', value: 'תקופה', cellTemplate: periodCellTpl, width: '105px' },
      badge:    { name: 'mappingStatus', value: 'סטטוס', cellTemplate: statusBadgeCellTpl, width: '170px' },
      source:   { name: 'matchedTypeLabel', value: 'מקור', cellTemplate: sourceIconCellTpl, width: '60px' },
      actions:  { name: 'actions', value: 'פעולות', cellTemplate: actionsCellTpl, width: '90px' },
    };

    const cols: IColumnDataTable<string, string>[] =
      mode === 'regular'
        ? [
            shared.select,
            shared.supplier,
            { name: 'supplierId', value: 'מס׳ עוסק', width: '110px' },
            shared.docType,
            shared.invoice,
            // Israeli tax allocation number (מספר הקצאה) — the user can spot
            // a missing allocation number on a high-value invoice pre-approve.
            { name: 'allocationNumber', value: 'מס׳ הקצאה', width: '120px' },
            shared.date,
            shared.sum,
            { name: 'category', value: 'קטגוריה', cellTemplate: categoryCellTpl, width: '125px' },
            { name: 'subCategory', value: 'תת קטגוריה', cellTemplate: subCategoryCellTpl, width: '140px' },
            { name: 'vatPercent', value: '% מע״מ', type: FormTypes.NUMBER, editable: true, width: '85px' },
            { name: 'taxPercent', value: '% מס',   type: FormTypes.NUMBER, editable: true, width: '85px' },
            shared.period,
            shared.badge,
            shared.source,
            shared.actions,
          ]
        : [
            shared.select,
            shared.supplier,
            shared.docType,
            shared.invoice,
            shared.date,
            // D7 — the single classification column of the professional view.
            { name: 'description', value: 'תיאור', width: '190px' },
            shared.sum,
            { name: 'sectionName', value: 'חתך', width: '135px' },
            { name: 'accountLabel', value: 'כרטיס', cellTemplate: cardCellTpl, width: '220px' },
            { name: 'vatPercent', value: '% מע״מ', width: '80px' },
            { name: 'taxPercent', value: '% מס', width: '80px' },
            { name: 'reductionPercent', value: '% פחת', width: '80px' },
            shared.period,
            shared.badge,
            shared.source,
            shared.actions,
          ];

    this.columnsCache = { mode, tpls, cols };
    return cols;
  }

  /** Checkbox template handler — the select column is a cellTemplate now
   *  (not FormTypes.CHECKBOX) so non-approvable rows can render a DISABLED
   *  box per D9. */
  onRowSelectedChange(row: EditableReviewRow, checked: boolean): void {
    row.selected = checked;
    this.bumpRows();
  }

  /** Count of rows the user wants in the bulk approve. Drives the footer
   *  button's label + disabled state. */
  selectedCount = computed<number>(() =>
    this.rows().filter(r => r.selected).length,
  );

  /** "Select all" toggle for the footer. Updates every APPROVABLE row's
   *  selected flag in one signal write — non-approvable rows (missing
   *  mapping, annual, unidentified, unclassified) stay unchecked (D9). */
  toggleAll(checked: boolean): void {
    this.rows.update(rs => rs.map(r =>
      this.canApprove(r) ? { ...r, selected: checked } : { ...r, selected: false },
    ));
  }

  /** Rows eligible for the bulk queue — drives "בחר הכל" checked state. */
  approvableCount = computed<number>(() =>
    this.rows().filter(r => this.canApprove(r)).length,
  );

  /**
   * Bulk-approve all checked rows. Each row's approve flavor depends on
   * its type:
   *   matched  → approveMatched  (commits doc + tx as one Expense)
   *   doc_only → approveDocCash  (cash-receipt path)
   *   tx_only  → approveTxNoDoc  ("no doc needed")
   *
   * Run sequentially via a recursive runner — parallel would be faster
   * but each approve does a DB transaction and an Expense insert, so
   * back-pressure helps avoid lock contention on the slim_transactions
   * / extracted_document tables. Each success drops its row from the
   * table; failures stay visible with `saveStatus='failed'` and the
   * backend's error message in the row's `saveError` field.
   */
  bulkApproveSelected(): void {
    const queue = this.rows().filter(r =>
      r.selected && r.saveStatus !== 'pending' && this.canApprove(r),
    );
    if (queue.length === 0) {
      this.messageService.add({
        severity: 'warn',
        summary: 'לא נבחר',
        detail: 'יש לסמן לפחות שורה אחת לאישור',
        life: 4000,
        key: 'br',
      });
      return;
    }
    if (this.isActioning()) return;

    // Pre-flight: catch the "multiple rows for the same new supplier with
    // different classification" case before any DB writes happen. Only one
    // row per supplierId ever reaches the Supplier master (find-or-create
    // — see expenses.service.ts:1340-1359) so divergent rows would lose
    // their edits silently. Surface the conflict and let the user resolve.
    const conflicts = this.findSupplierConflicts(queue);
    if (conflicts.length > 0) {
      this.supplierConflicts.set(conflicts);
      this.supplierConflictsVisible.set(true);
      return;
    }

    this.runBulkQueue(queue, 0);
  }

  /**
   * Group the queue's "ספק חדש" rows by supplierId. A supplier with 2+
   * rows is a conflict when any of the fields persisted to the Supplier
   * master differ across the group — those edits would be silently dropped
   * by the backend's find-or-create. Returns one entry per conflicting
   * supplier with the list of diverging field labels. Tx-only rows and
   * rows the user already opted out via the flag (saveAsSupplier=false)
   * are excluded — they don't try to write to the master.
   */
  private findSupplierConflicts(queue: EditableReviewRow[]): SupplierConflict[] {
    const candidates = queue.filter(r =>
      r.saveAsSupplier
      && r.supplierId?.trim()
      && r.supplierStatusLabel === 'ספק חדש',
    );
    const byId = new Map<string, EditableReviewRow[]>();
    for (const r of candidates) {
      const sid = r.supplierId.trim();
      const list = byId.get(sid) ?? [];
      list.push(r);
      byId.set(sid, list);
    }
    const conflicts: SupplierConflict[] = [];
    for (const [sid, rows] of byId) {
      if (rows.length < 2) continue;
      const fields: string[] = [];
      if (new Set(rows.map(r => (r.category ?? '').trim())).size > 1) fields.push('קטגוריה');
      if (new Set(rows.map(r => (r.subCategory ?? '').trim())).size > 1) fields.push('תת קטגוריה');
      if (new Set(rows.map(r => String(r.vatPercent ?? ''))).size > 1) fields.push('מע״מ %');
      if (new Set(rows.map(r => String(r.taxPercent ?? ''))).size > 1) fields.push('מס %');
      if (new Set(rows.map(r => r.isEquipment === true)).size > 1) fields.push('ציוד');
      if (fields.length === 0) continue;
      conflicts.push({
        supplierId: sid,
        supplierName: rows[0].supplier?.trim() || sid,
        rowCount: rows.length,
        conflictingFields: fields,
      });
    }
    return conflicts;
  }

  closeSupplierConflicts(): void {
    this.supplierConflictsVisible.set(false);
  }

  private runBulkQueue(queue: EditableReviewRow[], idx: number): void {
    if (idx >= queue.length) {
      this.isActioning.set(false);
      this.maybeAutoClose();
      return;
    }
    const row = queue[idx];
    this.isActioning.set(true);
    const obs$ = this.approveObsForRow(row);

    if (!obs$) {
      // Missing ids — should never happen for a well-formed row, but skip
      // gracefully rather than abort the whole queue.
      this.runBulkQueue(queue, idx + 1);
      return;
    }

    row.saveStatus = 'pending';
    this.bumpRows();
    obs$
      .pipe(
        catchError(err => {
          // Soft duplicates leave the row in place with an inline prompt;
          // hard failures keep the row flagged. Either way the queue moves
          // on to the next selected row.
          this.applySaveFailure(row, err, 'אישור השורה נכשל');
          return EMPTY;
        }),
      )
      .subscribe({
        next: () => {
          this.rows.update(rs => rs.filter(r => r !== row));
          this.adjustCount(row.type, -1);
        },
        complete: () => this.runBulkQueue(queue, idx + 1),
      });
  }

  /** Used to expose row.linkingTxId state into the template. */
  isLinking(row: EditableReviewRow): boolean {
    return this.linkingTxId() === row.slimTransactionId;
  }
}
