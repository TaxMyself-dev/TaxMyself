# סיכום: טבלת "אישור הוצאות" (report-review table)

מסמך זה מסכם את כל הקוד הרלוונטי לעמוד `report-review` (frontend + backend) לקראת סבב עדכונים. זהו מסמך תיעוד בלבד — לא מוצעים בו שינויים.

## 1. קובץ הקומפוננטה הראשית

הקומפוננטה `ReportReviewPage` חיה ב-`frontend/src/app/pages/report-review/`. שלושה קבצים: `.page.ts` (2029 שורות), `.page.html` (467 שורות), `.page.scss` (699 שורות).

### frontend/src/app/pages/report-review/report-review.page.ts — imports + interfaces (שורות 1–197)

```typescript
import {
  Component,
  computed,
  ElementRef,
  inject,
  OnInit,
  signal,
  TemplateRef,
  ViewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { MessageService } from 'primeng/api';
import { EMPTY, catchError, finalize } from 'rxjs';

import { ButtonColor, ButtonSize } from '../../components/button/button.enum';
import { GenericService } from 'src/app/services/generic.service';
import { AuthService } from 'src/app/services/auth.service';
import { VATReportingType } from 'src/app/shared/enums';
import { IColumnDataTable, IRowDataTable, ITableRowAction } from 'src/app/shared/interface';
import {
  CatalogRow,
  ReportPreviewResponse,
  ReportReviewService,
  ReviewMappingStatus,
  ReviewOverrides,
  ReviewRow,
} from 'src/app/services/report-review.service';
import { ExpenseEditFieldValues } from 'src/app/components/report-review-edit-dialog/report-review-edit-dialog.component';

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
   *  ANNUAL rows get the "מסמך שנתי — ממתין לתיוק" badge + "תייק" action
   *  (never approve); UNIDENTIFIED rows get the triage actions. Null for
   *  tx_only rows and legacy docs — treated as EXPENSE_INVOICE.
   *  A row can only ever be ANNUAL here pre-filing (fileDocumentAsAnnual
   *  flips status to NOT_AN_EXPENSE, which drops it from the
   *  PENDING_REVIEW query this table is sourced from) — the badge must not
   *  claim the doc is already saved before תייק is actually clicked. */
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
```

### frontend/src/app/pages/report-review/report-review.page.ts — Component decorator + state/computed (שורות 199–428)

```typescript
@Component({
  selector: 'app-report-review',
  templateUrl: './report-review.page.html',
  styleUrls: ['./report-review.page.scss'],
  standalone: false,
})
export class ReportReviewPage implements OnInit {
  // ---- Route-derived state ----------------------------------------------
  businessNumber = signal<string>('');
  startDate = signal<string>('');
  endDate = signal<string>('');
  /** Route to navigate back to once the review is done — 'vat-report' or
   *  'pnl-report', carried in as a query param by the page that sent the
   *  user here. Defaults to 'vat-report' if missing. */
  private returnRoute = signal<string>('vat-report');

  // ---- Deps ------------------------------------------------------------
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private reviewService = inject(ReportReviewService);
  private authService = inject(AuthService);
  private messageService = inject(MessageService);
  private genericService = inject(GenericService);
  private sanitizer = inject(DomSanitizer);

  @ViewChild('uploadInput') uploadInputRef?: ElementRef<HTMLInputElement>;
  /** Row a tx_only "upload" hover action was triggered on — read by
   *  onHiddenUploadChange once the (shared, page-level) file input fires. */
  private pendingUploadRow: EditableReviewRow | null = null;

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

  /**
   * D9 view mode. Persisted per user in localStorage; first-ever default is
   * professional for accountants/admins (the ACTOR's role — while
   * impersonating a client, the accountant still lands on professional),
   * regular for everyone else. The toggle itself is available to everyone —
   * permissions gate capabilities, not visibility.
   */
  viewMode = signal<ReviewViewMode>('regular');

  /** True when the ACTOR (real logged-in user, not the impersonated client)
   *  is an accountant/admin — decides the first-ever view-mode default. */
  isActorAccountant = false;

  /** Inline link picker state: which tx is in link-mode + the doc selected. */
  linkingTxId = signal<number | null>(null);
  selectedDocForLink = signal<number | null>(null);
  /** The tx_only row currently in link-mode, for the link-picker dialog body. */
  linkingRow = computed<EditableReviewRow | null>(() =>
    this.rows().find(r => r.slimTransactionId === this.linkingTxId()) ?? null,
  );

  /** Inline D8 triage picker state: which UNIDENTIFIED row is mid-decision
   *  ("קבע כחשבונית הוצאה" / "קבע כמסמך שנתי"). rowKey, matching the
   *  edit-lock/link-picker pattern above. */
  triagingRowKey = signal<string | null>(null);
  /** The row currently mid-triage, for the triage-picker dialog body. */
  triagingRow = computed<EditableReviewRow | null>(() =>
    this.rows().find(r => r.rowKey === this.triagingRowKey()) ?? null,
  );

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
  // Only ever opened from inside the edit dialog now — the confirmed
  // value is written onto `editDraft`, not a row directly (null = dialog
  // closed). `customPeriodValue` is the text the user is typing right
  // now; bound via [ngModel].
  customPeriodVisible = signal<boolean>(false);
  customPeriodValue = signal<string>('');

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
      ? (localStorage.getItem(ReportReviewPage.VIEW_MODE_KEY_PREFIX + realUser.firebaseId) as ReviewViewMode | null)
      : null;
    this.viewMode.set(
      stored === 'regular' || stored === 'professional'
        ? stored
        : this.isActorAccountant ? 'professional' : 'regular',
    );
  }
```

### frontend/src/app/pages/report-review/report-review.page.ts — lifecycle + loadPreview (שורות 430–553)

```typescript
  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    this.businessNumber.set(params.get('businessNumber') ?? '');
    this.startDate.set(params.get('startDate') ?? '');
    this.endDate.set(params.get('endDate') ?? '');
    this.returnRoute.set(params.get('returnTo') ?? 'vat-report');
    this.loadPreview();
  }

  private static readonly VIEW_MODE_KEY_PREFIX = 'reviewViewMode:';

  /** The regular/professional toggle — available to everyone (D9);
   *  persisted per real user. */
  setViewMode(mode: ReviewViewMode): void {
    this.viewMode.set(mode);
    const realUser = this.authService.getRealUserDataFromLocalStorage();
    if (realUser?.firebaseId) {
      localStorage.setItem(ReportReviewPage.VIEW_MODE_KEY_PREFIX + realUser.firebaseId, mode);
    }
  }

  // ---- Lifecycle -------------------------------------------------------

  /** Review done (nothing left to review, or the user skipped/finished) —
   *  navigate back to whichever report page sent us here. */
  onClose(): void {
    this.router.navigate([this.returnRoute()], {
      queryParams: {
        businessNumber: this.businessNumber(),
        startDate: this.startDate(),
        endDate: this.endDate(),
        reviewed: 1,
      },
    });
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
      this.onClose();
      return;
    }

    this.isLoading.set(true);
    this.rows.set([]);

    // Loading state shows the app's global loader (with a tailored message)
    // instead of an in-dialog spinner — the dialog itself stays hidden until
    // there are rows to review (see [visible] gate in the template).
    this.genericService.updateLoaderMessage(ReportReviewPage.LOADING_MESSAGE);
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
          this.onClose();
        }
      });
  }
```

### frontend/src/app/pages/report-review/report-review.page.ts — toEditableRow mapping (שורות 555–671)

```typescript
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
```

### frontend/src/app/pages/report-review/report-review.page.ts — edit dialog wiring (שורות 673–872)

```typescript
  // ---- Edit dialog (report-review-edit-dialog) --------------------------

  /** Row the edit dialog is open for; null = dialog closed. */
  editDialogRow = signal<EditableReviewRow | null>(null);
  editDialogVisible = signal<boolean>(false);
  editDialogTitleLabel = computed<string>(() => {
    const row = this.editDialogRow();
    if (!row) return '';
    return `${row.supplier || row.description} — ${row.sumLabel}`;
  });
  /** The dialog's local draft — seeded from the row on open, mutated only
   *  here (never touches the row directly) so Cancel can discard it with
   *  zero side effects. Save is the only path that writes it onto the row. */
  editDraft = signal<ExpenseEditFieldValues | null>(null);

  /** Sub-categories for the draft's current category — recomputed as the
   *  user picks a category inside the (still-open) dialog. */
  editDraftSubCategoryOptions = computed<string[]>(() => {
    const draft = this.editDraft();
    if (!draft) return [];
    return this.subCategoriesForCategory(draft.category).map(c => c.subCategory);
  });

  /** Period dropdown options for the draft — same 6-month-forward window
   *  as the old inline picker, now keyed off the draft's date instead of
   *  the row directly so it updates live as the user edits the date. */
  editDraftPeriodOptions = computed<{ value: string; label: string; isCustom?: boolean }[]>(() => {
    const draft = this.editDraft();
    if (!draft) return [];
    return this.periodOptionsForRow(draft).map(opt => ({
      value: opt,
      label: this.periodOptionLabel(opt),
      isCustom: opt === ReportReviewPage.CUSTOM_PERIOD_SENTINEL,
    }));
  });

  /** "ערוך הוצאה" — open the popup with a fresh draft seeded from the row. */
  openEditDialog(row: EditableReviewRow): void {
    this.editDialogRow.set(row);
    this.editDraft.set({
      category: row.category,
      subCategory: row.subCategory,
      subCategoryId: row.subCategoryId,
      accountId: row.accountId,
      vatPercent: row.vatPercent,
      taxPercent: row.taxPercent,
      date: row.date,
      amount: row.amount,
      supplierId: row.supplierId,
      supplier: row.supplier,
      reportPeriod: row.reportPeriod,
      reportPeriodOverridden: row.reportPeriodOverridden,
      applyCascadeToSuppliers: true,
      allocationNumber: row.allocationNumber,
      documentType: row.documentType,
      saveAsSupplier: row.saveAsSupplier,
    });
    this.editDialogVisible.set(true);
  }

  private closeEditDialog(): void {
    this.editDialogVisible.set(false);
    this.editDialogRow.set(null);
    this.editDraft.set(null);
  }

  /** X / Escape / "ביטול" — discard the draft. Nothing was ever written
   *  to the row, so there's nothing to roll back. */
  onEditDialogCancel(): void {
    this.closeEditDialog();
  }

  /** "שמור" — write the draft onto the row and close. Purely a local
   *  mutation: no approve/network call here, matching the exact semantics
   *  of the old inline toggleEditRow/saveEditRow pair. The actual
   *  approve/commit only ever happens later via bulkApproveSelected or
   *  confirmSaveAnyway. */
  onEditDialogSave(): void {
    const row = this.editDialogRow();
    const draft = this.editDraft();
    if (!row || !draft) return;

    const entry = draft.subCategoryId != null
      ? this.catalog().find(c => c.subCategoryId === draft.subCategoryId)
      : undefined;
    if (entry) this.applyCatalogRow(row, entry);
    else this.clearClassification(row, draft.category);

    row.vatPercent = draft.vatPercent;
    row.taxPercent = draft.taxPercent;
    row.date = draft.date;
    this.onAmountChange(row, draft.amount);
    row.supplierId = draft.supplierId;
    row.supplier = draft.supplier;
    row.reportPeriod = draft.reportPeriod;
    row.reportPeriodOverridden = draft.reportPeriodOverridden;
    if (row.type !== 'tx_only') {
      row.allocationNumber = draft.allocationNumber ?? '';
      row.documentType = draft.documentType ?? null;
      row.documentTypeLabel = this.documentTypeLabel(draft.documentType ?? null);
      row.saveAsSupplier = draft.saveAsSupplier ?? true;
    }

    if (draft.applyCascadeToSuppliers) {
      if (entry) this.cascadeToSupplierSiblings(row, (s) => this.applyCatalogRow(s, entry));
      else this.cascadeToSupplierSiblings(row, (s) => this.clearClassification(s, draft.category));
      this.markSupplierTouched(row);
    }

    this.bumpRows();
    this.closeEditDialog();
  }

  /** Classification pickers inside the dialog — same resolution rules as
   *  the old onCategoryChange/onSubCategoryChange/onCardChange, just
   *  targeting the local draft instead of the row directly (no cascade
   *  here — cascade only runs once, at Save, see onEditDialogSave). */
  onEditDraftCategoryChange(picked: string): void {
    this.editDraft.update(d => d && ({
      ...d,
      category: picked,
      subCategory: '',
      subCategoryId: null,
      accountId: null,
      vatPercent: 0,
      taxPercent: 0,
    }));
  }

  onEditDraftSubCategoryChange(picked: string): void {
    this.editDraft.update(d => {
      if (!d) return d;
      if (!picked) {
        return { ...d, subCategory: '', subCategoryId: null, accountId: null, vatPercent: 0, taxPercent: 0 };
      }
      const entry = this.catalog().find(c => c.subCategory === picked && c.category === d.category)
        ?? this.catalog().find(c => c.subCategory === picked);
      if (entry) {
        return {
          ...d,
          category: entry.category ?? d.category,
          subCategory: entry.subCategory,
          subCategoryId: entry.subCategoryId,
          accountId: entry.accountId,
          vatPercent: Number(entry.vatPercent ?? 0),
          taxPercent: Number(entry.taxPercent ?? 0),
        };
      }
      return { ...d, subCategory: picked, subCategoryId: null };
    });
  }

  onEditDraftCardChange(accountId: number | null): void {
    this.editDraft.update(d => {
      if (!d) return d;
      if (accountId == null) {
        return { ...d, category: '', subCategory: '', subCategoryId: null, accountId: null, vatPercent: 0, taxPercent: 0 };
      }
      const card = this.cardOptions().find(o => o.accountId === accountId);
      if (!card) return d;
      const entry =
        this.catalog().find(c => c.accountId === accountId && c.subCategoryId === d.subCategoryId)
        ?? this.catalog().find(c => c.subCategoryId === card.subCategoryId)!;
      return {
        ...d,
        category: entry.category ?? '',
        subCategory: entry.subCategory,
        subCategoryId: entry.subCategoryId,
        accountId: entry.accountId,
        vatPercent: Number(entry.vatPercent ?? 0),
        taxPercent: Number(entry.taxPercent ?? 0),
      };
    });
  }

  /** Non-sentinel period pick — sentinel ("אחר") is intercepted by the
   *  dialog itself, which fires customPeriodRequested instead. */
  onEditDraftPeriodChange(picked: string): void {
    this.editDraft.update(d => {
      if (!d) return d;
      const derived = this.derivePeriod(d.date);
      return { ...d, reportPeriod: picked, reportPeriodOverridden: picked !== derived };
    });
  }

  /** Generic patch for every draft field with no cascade/resolution
   *  side-effect (see ExpenseEditFieldValues.fieldsChange on the dialog). */
  onEditDraftFieldsPatch(patch: Partial<ExpenseEditFieldValues>): void {
    this.editDraft.update(d => {
      if (!d) return d;
      const next = { ...d, ...patch };
      // Keep the auto-derived period in sync with a new date unless the
      // user separately picked an explicit period override (same rule as
      // the old inline onDateChange).
      if (patch.date !== undefined && !next.reportPeriodOverridden) {
        next.reportPeriod = this.derivePeriod(patch.date);
      }
      return next;
    });
  }

  /** tx_only "upload new doc" — routes through one shared, page-level
   *  hidden file input (see #uploadInput in the template) since the
   *  trigger now lives in the hover panel, not inside the row itself. */
  triggerUpload(row: EditableReviewRow): void {
    this.pendingUploadRow = row;
    this.uploadInputRef?.nativeElement.click();
  }

  onHiddenUploadChange(input: HTMLInputElement): void {
    const row = this.pendingUploadRow;
    this.pendingUploadRow = null;
    if (!row) {
      input.value = '';
      return;
    }
    this.onUploadDocForTx(row, input);
  }
```

### frontend/src/app/pages/report-review/report-review.page.ts — reviewRowActions (שורות 900–991)

*(מפורט במלואו גם בסעיף 7 — "Action buttons / hover icons".)*

```typescript
  readonly reviewRowActions: ITableRowAction[] = [
    {
      name: 'edit',
      icon: 'pi pi-pencil',
      title: 'ערוך הוצאה',
      isLoading: () => this.isActioning(),
      showWhen: (row) => {
        const r = row as unknown as EditableReviewRow;
        return !this.isAnnualRow(r) && !this.isUnidentifiedRow(r);
      },
      action: (_event, row) => this.openEditDialog(row as unknown as EditableReviewRow),
    },
    {
      name: 'preview',
      icon: 'pi pi-eye',
      title: 'צפה במסמך לצד הטבלה',
      showWhen: (row) => {
        const r = row as unknown as EditableReviewRow;
        return !!r.driveFileId && !this.isAnnualRow(r);
      },
      action: (_event, row) => this.openPreview(row as unknown as EditableReviewRow),
    },
    {
      name: 'triage',
      icon: 'pi pi-question-circle',
      title: 'מיין — קבע מה המסמך הזה',
      isLoading: () => this.isActioning(),
      showWhen: (row) => {
        const r = row as unknown as EditableReviewRow;
        return this.isUnidentifiedRow(r) && !this.isTriaging(r);
      },
      action: (_event, row) => this.startTriage(row as unknown as EditableReviewRow),
    },
    {
      name: 'unpair',
      icon: 'pi pi-link',
      title: 'פצל — הפרד בחזרה לחשבונית וקבלה נפרדות',
      isLoading: () => this.isActioning(),
      showWhen: (row) => {
        const r = row as unknown as EditableReviewRow;
        return r.type !== 'tx_only' && r.documentType === 'invoice_receipt_pair';
      },
      action: (_event, row) => this.unpairRow(row as unknown as EditableReviewRow),
    },
    {
      name: 'upload',
      icon: 'pi pi-upload',
      title: 'העלה מסמך חדש — סורק ומקשר לתנועה',
      isLoading: () => this.isActioning(),
      showWhen: (row) => (row as unknown as EditableReviewRow).type === 'tx_only',
      action: (_event, row) => this.triggerUpload(row as unknown as EditableReviewRow),
    },
    {
      name: 'link',
      icon: 'pi pi-link',
      title: 'קשר למסמך קיים — שייך לאחת השורות מסוג \'מסמך בלבד\'',
      showWhen: (row) => {
        const r = row as unknown as EditableReviewRow;
        return r.type === 'tx_only' && this.docOnlyRows().length > 0;
      },
      action: (_event, row) => this.startLink(row as unknown as EditableReviewRow),
    },
    {
      name: 'archive',
      icon: 'pi pi-inbox',
      title: 'העבר לארכיון',
      isLoading: () => this.isActioning(),
      // tx_only rows have no document to archive — there is no distinct
      // "archive a transaction" backend concept, so this maps onto the
      // same rejectTx call as "מחק" for that row type (product decision:
      // both buttons stay visible so the action is always available, even
      // though they're functionally identical for a tx_only row).
      showWhen: (row) => !this.isAnnualRow(row as unknown as EditableReviewRow),
      action: (_event, row) => {
        const r = row as unknown as EditableReviewRow;
        if (r.type === 'tx_only') this.rejectTx(r);
        else this.archiveDoc(r);
      },
    },
    {
      name: 'delete',
      icon: 'pi pi-trash',
      title: 'מחק',
      isLoading: () => this.isActioning(),
      showWhen: (row) => !this.isAnnualRow(row as unknown as EditableReviewRow),
      action: (_event, row) => {
        const r = row as unknown as EditableReviewRow;
        if (r.type === 'tx_only') this.rejectTx(r);
        else this.deleteRow(r);
      },
    },
  ];
```

### frontend/src/app/pages/report-review/report-review.page.ts — helper labels + cascade helpers + supplier flag (שורות 993–1196)

```typescript
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

  /** Hebrew label for Claude's document_type enum. */
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

  /** "סוג" column value — "תנועה" for tx_only rows, the OCR'd document type
   *  otherwise (falling back to "מסמך לא מזוהה"). */
  sourceTypeLabel(row: EditableReviewRow): string {
    return row.type === 'tx_only' ? 'תנועה' : (row.documentTypeLabel || 'מסמך לא מזוהה');
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

  private onAmountChange(row: EditableReviewRow, value: number): void {
    row.amount = value;
    const amt = Number(value) || 0;
    row.sumLabel = row.currency !== 'ILS'
      ? `${this.currencySymbol(row.currency)}${amt.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
      : `${amt.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ש״ח`;
  }

  readonly documentTypeOptions: { value: string; label: string }[] = [
    'invoice', 'receipt', 'tax_invoice_receipt', 'credit_invoice',
    'invoice_receipt_pair', 'form_106', 'tax_form', 'contract', 'unknown',
  ].map(value => ({ value, label: this.documentTypeLabel(value) }));

  /** Click handler for the red flag icon — toggles the per-row choice
   *  of whether to register this supplier in the user's master list when
   *  approving. */
  toggleSaveAsSupplier(row: EditableReviewRow, event: MouseEvent): void {
    event.stopPropagation();
    row.saveAsSupplier = !row.saveAsSupplier;
    this.bumpRows();
  }

  /** Derive the identity key used for the blue-highlight grouping.
   *  Matches the cascade rule: supplierId when present, otherwise the
   *  trimmed supplier name. */
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
```

*(`cascadeToSupplierSiblings`, שממוקם באזור זה בקוד המקור (שורות 1118–1150), מוצג במלואו בסעיף 6 להלן.)*

### frontend/src/app/pages/report-review/report-review.page.ts — status/approvability + approve dispatch (שורות 1198–1233)

```typescript
  // ---- D9 status badge + approvability ---------------------------------

  /** True when the row is a D8 annual document — never an expense. */
  isAnnualRow(row: EditableReviewRow): boolean {
    return row.documentKind === 'ANNUAL_DOCUMENT';
  }

  /** True when the row is a D8 unidentified document — pending triage. */
  isUnidentifiedRow(row: EditableReviewRow): boolean {
    return row.documentKind === 'UNIDENTIFIED';
  }

  /** D9: rows with missing mapping cannot be approved; D8 annual/
   *  unidentified rows are not expenses. Only READY and PRIVATE rows pass. */
  canApprove(row: EditableReviewRow): boolean {
    if (this.isAnnualRow(row) || this.isUnidentifiedRow(row)) return false;
    return row.mappingStatus === 'READY' || row.mappingStatus === 'PRIVATE';
  }

  /** The approve observable for a row per its type — shared by the bulk
   *  queue. Null when ids are missing. */
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
```

### frontend/src/app/pages/report-review/report-review.page.ts — period dropdown logic (שורות 1235–1367)

```typescript
  // ---- Period dropdown -------------------------------------------------

  /** Special sentinel value for the "אחר" (other) option. */
  private static readonly CUSTOM_PERIOD_SENTINEL = '__custom__';

  /**
   * Period options scoped to the row's date — 6 months forward from
   * the doc's date:
   *   - DUAL_MONTH_REPORT (bi-monthly): the bi-monthly period the date
   *     falls in, plus the next two bi-monthly periods.
   *   - MONTHLY_REPORT: 6 individual months starting from the date's month.
   * Plus an "אחר" sentinel at the bottom.
   */
  periodOptionsForRow(row: { date: string; reportPeriod: string }): string[] {
    const opts: string[] = [];
    const date = this.parseRowDate(row.date);
    const isDual = this.vatReportingType() === VATReportingType.DUAL_MONTH_REPORT;

    if (date) {
      let month = date.getUTCMonth() + 1;
      let year = date.getUTCFullYear();
      if (isDual) {
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
      const year = new Date().getFullYear();
      opts.push(isDual ? `1-2/${year}` : `1/${year}`);
    }

    if (row.reportPeriod && !opts.includes(row.reportPeriod)) {
      opts.unshift(row.reportPeriod);
    }
    opts.push(ReportReviewPage.CUSTOM_PERIOD_SENTINEL);
    return opts;
  }

  periodOptionLabel(opt: string): string {
    return opt === ReportReviewPage.CUSTOM_PERIOD_SENTINEL ? 'אחר' : opt;
  }

  openCustomPeriod(): void {
    const draft = this.editDraft();
    if (!draft) return;
    this.customPeriodValue.set(draft.reportPeriod ?? '');
    this.customPeriodVisible.set(true);
  }

  cancelCustomPeriod(): void {
    this.customPeriodVisible.set(false);
    this.customPeriodValue.set('');
  }

  confirmCustomPeriod(): void {
    const value = this.customPeriodValue().trim();
    if (!value) {
      this.cancelCustomPeriod();
      return;
    }
    this.editDraft.update(d => d && ({ ...d, reportPeriod: value, reportPeriodOverridden: true }));
    this.customPeriodVisible.set(false);
    this.customPeriodValue.set('');
  }

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
```

### frontend/src/app/pages/report-review/report-review.page.ts — row actions: approve/archive/delete/unpair/reject/upload (שורות 1369–1531)

```typescript
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
   *  instead. */
  deleteRow(row: EditableReviewRow): void {
    if (!row.documentId) return;
    this.runAction(row, this.reviewService.deleteDoc(row.documentId), 'מחיקת המסמך נכשלה');
  }

  /** "פצל" on an invoice_receipt_pair row — splits the pair back into
   *  two separate rows. Drops the current row from the local set (relies
   *  on a fresh preview to bring the split halves back in correctly). */
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
   * change. POST the file to the backend which uploads to Drive, runs
   * Claude, persists the extracted_document row, and auto-links it to
   * this slim transaction. On success we drop the row.
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
   * Shared save/approve failure handler. `code: 'DUPLICATE_WARNING'` is a
   * soft duplicate — stays visible with "save anyway / skip"; any other
   * error (incl. hard DUPLICATE_EXACT) is a normal failure.
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
   *  retry the approve. */
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

  /** "דלג" on a soft-duplicate row — clear the warning, leave un-approved. */
  dismissDuplicate(row: EditableReviewRow): void {
    row.duplicateWarning = false;
    row.acknowledgeDuplicate = false;
    row.saveError = null;
    row.saveStatus = null;
    this.bumpRows();
  }
```

### frontend/src/app/pages/report-review/report-review.page.ts — link flow + D8 triage flow (שורות 1533–1636)

```typescript
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

  // ---- D8 triage flow (UNIDENTIFIED rows) -------------------------------

  isTriaging(row: EditableReviewRow): boolean {
    return this.triagingRowKey() === row.rowKey;
  }

  startTriage(row: EditableReviewRow): void {
    this.triagingRowKey.set(row.rowKey);
  }

  cancelTriage(): void {
    this.triagingRowKey.set(null);
  }

  /** "קבע כחשבונית הוצאה" / "קבע כמסמך שנתי" — patches documentKind in
   *  place rather than re-running loadPreview() (which would re-trigger
   *  inbox OCR for every pending document). */
  confirmTriage(row: EditableReviewRow, documentKind: 'EXPENSE_INVOICE' | 'ANNUAL_DOCUMENT'): void {
    if (!row.documentId || this.isActioning()) return;
    this.isActioning.set(true);

    this.reviewService.setDocKind(row.documentId, documentKind)
      .pipe(
        catchError(err => {
          const detail = err?.error?.message ?? err?.message ?? 'סיווג המסמך נכשל';
          this.messageService.add({ severity: 'error', summary: 'שגיאה', detail, life: 5000, key: 'br' });
          return EMPTY;
        }),
        finalize(() => this.isActioning.set(false)),
      )
      .subscribe(() => {
        row.documentKind = documentKind;
        this.triagingRowKey.set(null);
        this.bumpRows();
      });
  }
```

### frontend/src/app/pages/report-review/report-review.page.ts — helpers: overridesFromRow, bumpRows, subtitleText, rowClassFn (שורות 1637–1709)

```typescript
  // ---- Helpers ---------------------------------------------------------

  private overridesFromRow(row: EditableReviewRow): ReviewOverrides {
    return {
      subCategoryId: row.subCategoryId ?? undefined,
      category: row.category,
      subCategory: row.subCategory,
      vatPercent: row.vatPercent,
      taxPercent: row.taxPercent,
      isEquipment: row.isEquipment,
      reportPeriod: row.reportPeriodOverridden ? row.reportPeriod : undefined,
      saveAsSupplier: row.saveAsSupplier,
      acknowledgeDuplicate: row.acknowledgeDuplicate,
      invoiceNumber: row.invoiceNumber || undefined,
      allocationNumber: row.allocationNumber || undefined,
      supplierId: row.supplierId || undefined,
      supplier: row.supplier || undefined,
      documentType: row.documentType || undefined,
      date: row.date || undefined,
      amount: row.amount,
    };
  }

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

  rowClassFn = (row: IRowDataTable): string => {
    const r = row as unknown as EditableReviewRow;
    const classes: string[] = [];
    if (this.isSupplierHighlighted(r)) classes.push('row-highlighted');
    if (r.saveStatus === 'failed') classes.push('row-error');
    if (r.saveStatus === 'pending') classes.push('row-pending');
    return classes.join(' ');
  };
```

### frontend/src/app/pages/report-review/report-review.page.ts — buildColumns (שורות 1711–1829)

```typescript
  // ---- Columns builder -------------------------------------------------

  private columnsCache: {
    mode: ReviewViewMode;
    tpls: TemplateRef<any>[];
    cols: IColumnDataTable<string, string>[];
  } | null = null;

  buildColumns(
    selectCellTpl: TemplateRef<any>,
    categoryCellTpl: TemplateRef<any>,
    subCategoryCellTpl: TemplateRef<any>,
    cardCellTpl: TemplateRef<any>,
    periodCellTpl: TemplateRef<any>,
    supplierCellTpl: TemplateRef<any>,
    vatPercentCellTpl: TemplateRef<any>,
    taxPercentCellTpl: TemplateRef<any>,
    dateCellTpl: TemplateRef<any>,
    amountCellTpl: TemplateRef<any>,
    invoiceNumberCellTpl: TemplateRef<any>,
    docTypeCellTpl: TemplateRef<any>,
  ): IColumnDataTable<string, string>[] {
    const mode = this.viewMode();
    const tpls = [
      selectCellTpl, categoryCellTpl, subCategoryCellTpl, cardCellTpl, periodCellTpl,
      supplierCellTpl,
      vatPercentCellTpl, taxPercentCellTpl, dateCellTpl, amountCellTpl,
      invoiceNumberCellTpl, docTypeCellTpl,
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
      supplier: { name: 'supplier', value: 'ספק', cellTemplate: supplierCellTpl, width: '250px' },
      docType:  { name: 'documentTypeLabel', value: 'סוג', cellTemplate: docTypeCellTpl, width: '160px' },
      invoice:  { name: 'invoiceNumber', value: 'מס׳ חשבונית', cellTemplate: invoiceNumberCellTpl, width: '220px' },
      date:     { name: 'date', value: 'תאריך', cellTemplate: dateCellTpl, width: '145px' },
      sum:      { name: 'sumLabel', value: 'סכום', cellTemplate: amountCellTpl, width: '130px' },
      period:   { name: 'reportPeriod', value: 'תקופה', cellTemplate: periodCellTpl, width: '125px' },
      vatPercent: { name: 'vatPercent', value: '% מע״מ', cellTemplate: vatPercentCellTpl, width: '100px' },
      taxPercent: { name: 'taxPercent', value: '% מס',   cellTemplate: taxPercentCellTpl, width: '100px' },
    };

    const cols: IColumnDataTable<string, string>[] =
      mode === 'regular'
        ? [
            shared.select,
            shared.supplier,
            shared.docType,
            shared.date,
            shared.sum,
            { name: 'category', value: 'קטגוריה', cellTemplate: categoryCellTpl, width: '150px' },
            { name: 'subCategory', value: 'תת קטגוריה', cellTemplate: subCategoryCellTpl, width: '170px' },
            shared.vatPercent,
            shared.taxPercent,
            shared.period,
          ]
        : [
            shared.select,
            shared.supplier,
            shared.docType,
            shared.invoice,
            shared.date,
            { name: 'description', value: 'תיאור', width: '260px' },
            shared.sum,
            { name: 'accountLabel', value: 'כרטיס', cellTemplate: cardCellTpl, width: '220px' },
            shared.vatPercent,
            shared.taxPercent,
            { name: 'reductionPercent', value: '% פחת', width: '80px' },
            shared.period,
          ];

    this.columnsCache = { mode, tpls, cols };
    return cols;
  }
```

### frontend/src/app/pages/report-review/report-review.page.ts — select/bulk-approve (שורות 1831–2028)

*(מפורט גם בסעיף 5 להלן — "endpoint/service לאישור הוצאות".)*

```typescript
  onRowSelectedChange(row: EditableReviewRow, checked: boolean): void {
    row.selected = checked;
    this.bumpRows();
  }

  selectedCount = computed<number>(() =>
    this.rows().filter(r => r.selected).length,
  );

  toggleAll(checked: boolean): void {
    this.rows.update(rs => rs.map(r =>
      this.canApprove(r) ? { ...r, selected: checked } : { ...r, selected: false },
    ));
  }

  approvableCount = computed<number>(() =>
    this.rows().filter(r => this.canApprove(r)).length,
  );

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
    // different classification" case before any DB writes happen.
    const conflicts = this.findSupplierConflicts(queue);
    if (conflicts.length > 0) {
      this.supplierConflicts.set(conflicts);
      this.supplierConflictsVisible.set(true);
      return;
    }

    this.runBulkQueue(queue, 0, { succeeded: 0, failed: 0 });
  }

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

  private runBulkQueue(
    queue: EditableReviewRow[],
    idx: number,
    stats: { succeeded: number; failed: number },
  ): void {
    if (idx >= queue.length) {
      this.isActioning.set(false);
      this.reportBulkApproveResult(stats);
      this.maybeAutoClose();
      return;
    }
    const row = queue[idx];
    this.isActioning.set(true);
    const obs$ = this.approveObsForRow(row);

    if (!obs$) {
      this.runBulkQueue(queue, idx + 1, stats);
      return;
    }

    row.saveStatus = 'pending';
    this.bumpRows();
    obs$
      .pipe(
        catchError(err => {
          this.applySaveFailure(row, err, 'אישור השורה נכשל');
          stats.failed++;
          return EMPTY;
        }),
      )
      .subscribe({
        next: () => {
          this.rows.update(rs => rs.filter(r => r !== row));
          this.adjustCount(row.type, -1);
          stats.succeeded++;
        },
        complete: () => this.runBulkQueue(queue, idx + 1, stats),
      });
  }

  private reportBulkApproveResult(stats: { succeeded: number; failed: number }): void {
    if (!this.hasAnyRows()) return; // dialog is about to auto-close — no need to toast
    if (stats.succeeded === 0 && stats.failed === 0) return;

    const remaining = this.rows().length;
    const parts: string[] = [];
    if (stats.succeeded > 0) parts.push(`אושרו ${stats.succeeded} הוצאות`);
    if (stats.failed > 0) parts.push(`${stats.failed} נכשלו — ראה פירוט בטבלה`);
    parts.push(`נותרו ${remaining} שורות לטיפול`);

    this.messageService.add({
      severity: stats.failed > 0 ? 'warn' : 'success',
      summary: 'האישור הסתיים',
      detail: parts.join(', '),
      life: 6000,
      key: 'br',
    });
  }

  isLinking(row: EditableReviewRow): boolean {
    return this.linkingTxId() === row.slimTransactionId;
  }
}
```

### frontend/src/app/pages/report-review/report-review.page.html — מלא (467 שורות)

```html
<div class="report-review-page" *ngIf="!isLoading()">
  <div class="report-review-header">
    <span class="report-review-title">סקירה לפני הצגת הדוח</span>
  </div>

  <div class="dialog-body" [class.with-preview]="previewDriveFileId() !== null">
    <!-- Drive preview panel — visible only when an eye icon was clicked.
         Lives on the RTL-right of the body (DOM order = visual right under
         RTL) so the table on the left keeps its natural reading order. -->
    <aside *ngIf="previewDriveFileId()" class="preview-panel">
      <header class="preview-panel__header">
        <button type="button" class="preview-panel__close"
                pTooltip="סגור תצוגה מקדימה"
                tooltipPosition="bottom"
                (click)="closePreview()">
          <i class="pi pi-times"></i>
        </button>
        <span class="preview-panel__title" [title]="previewDriveFileName()">
          {{ previewDriveFileName() }}
        </span>
      </header>
      <iframe
        class="preview-panel__iframe"
        [src]="previewUrl()"
        title="Drive preview"></iframe>
    </aside>

    <div class="dialog-main">

  <!-- Subtitle + the D9 regular/professional toggle. The toggle is
       available to EVERYONE (permissions gate capabilities, not
       visibility); the chosen mode persists per user, and accountants
       land on professional by default. -->
  <div *ngIf="mode() !== null" class="toolbar-row">
    <div class="subtitle">{{ subtitleText() }}</div>
    <div class="view-toggle" role="group" aria-label="מצב תצוגה">
      <button type="button"
              class="view-toggle__btn"
              [class.view-toggle__btn--active]="viewMode() === 'regular'"
              (click)="setViewMode('regular')">תצוגה רגילה</button>
      <button type="button"
              class="view-toggle__btn"
              [class.view-toggle__btn--active]="viewMode() === 'professional'"
              (click)="setViewMode('professional')">תצוגה מקצועית</button>
    </div>
  </div>

  <!-- Loading state is shown via the app's global loader (driven from
       loadPreview), not an in-dialog spinner — the dialog stays hidden
       until the preview returns rows to review. -->

  <!-- Cell templates declared once, projected into generic-table via
       buildColumns(). Plain (non-template) columns — supplier, supplierId,
       docType label, invoice number, date, sum, matched-type label — use
       generic-table's built-in cell rendering. -->

  <!-- Bulk-select checkbox — a template (not the generic CHECKBOX column)
       so non-approvable rows render it DISABLED per D9: missing-mapping /
       unclassified / annual / unidentified rows can't join the queue. -->
  <ng-template #selectCell let-row>
    <input type="checkbox" class="row-select"
           [checked]="row.selected"
           [disabled]="!canApprove(row)"
           [title]="canApprove(row) ? '' : 'לא ניתן לאשר — ראה עמודת סטטוס'"
           (change)="onRowSelectedChange(row, $any($event.target).checked)" />
  </ng-template>

  <!-- Every column below is permanently read-only now — editing moved
       into the app-report-review-edit-dialog popup (see the "עריכה" row
       action). Kept as plain <span>s (not disabled inputs/selects):
       identical markup/font/sizing to a genuinely non-editable column
       like "תיאור", and disabled native controls (especially date/number)
       can't be relied on to render identically to text across browsers. -->

  <ng-template #categoryCell let-row>
    <span class="cell-readonly">{{ row.category || '—' }}</span>
  </ng-template>

  <ng-template #subCategoryCell let-row>
    <span class="cell-readonly">{{ row.subCategory || '—' }}</span>
  </ng-template>

  <!-- Professional view: classification by CARD (D9 revised) — booking
       accounts grouped by section; picking a card IS the classification
       (the card carries the full accounting law, D1). -->
  <ng-template #cardCell let-row>
    <span class="cell-readonly">{{ row.accountLabel || '—' }}</span>
  </ng-template>

  <!-- Note: reductionPercent (% פחת, professional view only) stays
       read-only everywhere — it's derived from the chosen card/
       sub_category's accounting law (D1), the backend has no override
       slot for it. -->
  <ng-template #vatPercentCell let-row>
    <span class="cell-readonly">{{ row.vatPercent }}</span>
  </ng-template>

  <ng-template #taxPercentCell let-row>
    <span class="cell-readonly">{{ row.taxPercent }}</span>
  </ng-template>

  <ng-template #dateCell let-row>
    <span class="cell-readonly">{{ row.date | dateFormat }}</span>
  </ng-template>

  <ng-template #amountCell let-row>
    <span class="cell-readonly">
      {{ row.sumLabel }}
      <span *ngIf="row.currency !== 'ILS' && row.ilsAmount != null" class="sum-ils">
        ({{ row.ilsAmount | number:'1.0-2' }} ₪)
      </span>
    </span>
  </ng-template>

  <!-- Professional-view-only column (shared.invoice). Regular view drops
       invoice/supplier-id/allocation-number from the table entirely — see
       buildColumns — those stay edit-dialog-only fields there. -->
  <ng-template #invoiceNumberCell let-row>
    <span class="cell-readonly">{{ row.invoiceNumber || '—' }}</span>
  </ng-template>

  <!-- Document type / source (סוג) — "תנועה" for tx_only rows (folds in
       what used to be a separate "מקור" source-icon column), the OCR'd
       document type otherwise. Document type itself is edited via the
       popup (matched/doc_only only; no document on tx_only rows). -->
  <ng-template #docTypeCell let-row>
    <span class="cell-readonly">{{ sourceTypeLabel(row) }}</span>
  </ng-template>

  <ng-template #periodCell let-row>
    <span class="cell-readonly" [class.overridden]="row.reportPeriodOverridden">
      {{ periodOptionLabel(row.reportPeriod) }}
    </span>
  </ng-template>

  <!-- Supplier name + "new supplier" icon. The icon (pi pi-question-circle)
       only renders when supplierStatusLabel === 'ספק חדש' — i.e. the doc's
       supplier_id wasn't found in the user's Supplier table. tx_only rows
       have supplierStatusLabel = null (no doc-side supplier concept) and
       therefore never show the icon. -->
  <!-- Icons come BEFORE the name in DOM order so under RTL they render
       to the right of the supplier name (the start of the visual line).
       The Drive-preview eye lives in the row-actions hover strip; only the
       new-supplier flag stays attached to the name here. -->
  <ng-template #supplierCell let-row>
    <span class="supplier-cell">
      <span *ngIf="row.supplierStatusLabel === 'ספק חדש'"
         class="supplier-new-square"
         [class.supplier-new-square--opt-out]="!row.saveAsSupplier"
         [pTooltip]="row.saveAsSupplier
           ? 'ספק חדש - יתווסף לרשימת הספקים בעת האישור. לחץ כדי לדלג.'
           : 'ספק חדש - לא יתווסף לרשימת הספקים. לחץ להחזיר.'"
         tooltipPosition="top"
         (click)="toggleSaveAsSupplier(row, $event)"></span>
      <span class="cell-readonly supplier-name-input">{{ row.supplier }}</span>
      <!-- Hard failure — small icon + hover tooltip with backend error.
           Soft duplicates render the inline prompt below instead. -->
      <span *ngIf="row.saveStatus === 'failed' && !row.duplicateWarning"
            class="action-error" [title]="row.saveError ?? ''">⚠</span>
    </span>
    <!-- Soft-duplicate prompt — the backend flagged this row as a possible
         duplicate (same supplier/sum/date, different/missing document
         number). The user decides: save anyway (acknowledges the warning
         and retries), or skip and leave the row un-approved. -->
    <div *ngIf="row.duplicateWarning" class="dup-warning">
      <span class="dup-warning__text">
        <i class="pi pi-exclamation-triangle"></i>
        {{ row.saveError || 'ייתכן שזו הוצאה כפולה' }}
      </span>
      <button type="button" class="act act-approve"
              [disabled]="isActioning()"
              (click)="confirmSaveAnyway(row)">שמור בכל זאת</button>
      <button type="button" class="act act-archive"
              [disabled]="isActioning()"
              (click)="dismissDuplicate(row)">דלג</button>
    </div>
  </ng-template>

  <!-- Hidden page-level upload input for the tx_only "upload" hover action
       (see reviewRowActions in the .ts) — one shared input, not one per
       row, since only the hover panel (not the row) triggers it. -->
  <input type="file"
         #uploadInput
         class="hidden-file-input"
         accept="application/pdf,image/jpeg,image/png,image/webp"
         (change)="onHiddenUploadChange(uploadInput)" />

  <app-generic-table
    *ngIf="rows().length > 0"
    class="review-table"
    [showRowActionIcons]="true"
    [columnsTitle]="buildColumns(selectCell, categoryCell, subCategoryCell, cardCell, periodCell, supplierCell, vatPercentCell, taxPercentCell, dateCell, amountCell, invoiceNumberCell, docTypeCell)"
    [dataTable]="$any(rows())"
    [rowClass]="rowClassFn"
    [rowActions]="reviewRowActions"
    [tableHeight]="'480px'">
  </app-generic-table>

  <!-- Bulk approve + skip. Both buttons live here side-by-side rather than
       in the p-dialog footer template so the user reads them in one row
       together with the selection-status text on the right. -->
  <div *ngIf="rows().length > 0" class="footer-bar">
    <div class="select-info">
      <label class="select-all-toggle">
        <input type="checkbox"
               [checked]="approvableCount() > 0 && selectedCount() === approvableCount()"
               [disabled]="approvableCount() === 0"
               (change)="toggleAll($any($event.target).checked)" />
        בחר הכל
      </label>
      <span>נבחרו {{ selectedCount() }} מתוך {{ approvableCount() }} ניתנות לאישור</span>
    </div>
    <div class="footer-actions">
      <app-p-button
        [buttonText]="'אישור הוצאות נבחרות'"
        [buttonColor]="ButtonColor.BLACK"
        [buttonSize]="ButtonSize.AUTO"
        [isLoading]="isActioning()"
        [disabled]="selectedCount() === 0"
        (onButtonClicked)="bulkApproveSelected()">
      </app-p-button>
      <app-p-button
        [buttonText]="'דלג'"
        [buttonColor]="ButtonColor.BLACK"
        [buttonSize]="ButtonSize.AUTO"
        [variant]="'outlined'"
        (onButtonClicked)="onClose()">
      </app-p-button>
    </div>
  </div>

    </div><!-- /.dialog-main -->
  </div><!-- /.dialog-body -->
</div><!-- /.report-review-page -->

<!-- Edit-expense popup. Opened by the "עריכה" row action (openEditDialog);
     replaces the old inline classification editing entirely. Two-column
     (with Drive preview) vs single full-width column is decided by
     hasDocument = !!row.driveFileId. Fully controlled: the dialog holds no
     state of its own, every keystroke relays up to editDraft and the
     updated draft flows back down via [fields] — Save/Cancel semantics
     live in onEditDialogSave/onEditDialogCancel. -->
<app-report-review-edit-dialog
  [visible]="editDialogVisible()"
  [hasDocument]="!!editDialogRow()?.driveFileId"
  [driveFileId]="editDialogRow()?.driveFileId ?? null"
  [driveFileName]="editDialogRow()?.driveFileName ?? ''"
  [titleLabel]="editDialogTitleLabel()"
  [viewMode]="viewMode()"
  [fields]="editDraft()"
  [categoryOptions]="categoryOptions()"
  [subCategoryOptions]="editDraftSubCategoryOptions()"
  [cardOptionsBySection]="cardOptionsBySection()"
  [documentTypeOptions]="documentTypeOptions"
  [periodOptions]="editDraftPeriodOptions()"
  [showNewSupplierFlag]="editDialogRow()?.supplierStatusLabel === 'ספק חדש'"
  (visibleChange)="$event ? null : onEditDialogCancel()"
  (save)="onEditDialogSave()"
  (categoryChange)="onEditDraftCategoryChange($event)"
  (subCategoryChange)="onEditDraftSubCategoryChange($event)"
  (cardChange)="onEditDraftCardChange($event)"
  (periodChange)="onEditDraftPeriodChange($event)"
  (customPeriodRequested)="openCustomPeriod()"
  (fieldsChange)="onEditDraftFieldsPatch($event)">
</app-report-review-edit-dialog>

<!-- Custom-period entry dialog. Opened when the user picks "אחר" in the
     edit dialog's period dropdown (see openCustomPeriod). Styled to match
     the rest of the app's modals instead of using window.prompt. Stacks
     on top of the edit dialog (both are plain p-dialogs — PrimeNG handles
     the z-index). -->
<p-dialog
  header="הזנת תקופת דיווח ידנית"
  [visible]="customPeriodVisible()"
  (visibleChange)="$event ? null : cancelCustomPeriod()"
  [modal]="true"
  [style]="{ width: '460px', maxWidth: '95vw' }"
  [rtl]="true"
  [draggable]="false"
  [resizable]="false">

  <div class="custom-period-body">
    <p class="custom-period-explanation">
      לפי הוראות רשות המיסים, ניתן לדווח הוצאות במע״מ
      <strong>עד 6 חודשים אחורה</strong> ממועד הפקת המסמך.
      במקרים חריגים ניתן להזין כאן תקופת דיווח אחרת ידנית.
    </p>
    <label class="custom-period-label" for="customPeriodInput">תקופת דיווח</label>
    <input
      id="customPeriodInput"
      type="text"
      class="custom-period-input"
      [ngModel]="customPeriodValue()"
      (ngModelChange)="customPeriodValue.set($event)"
      (keydown.enter)="confirmCustomPeriod()"
      placeholder="לדוגמה: 5-6/2026 או 5/2026"
      autocomplete="off" />
  </div>

  <ng-template pTemplate="footer">
    <div class="custom-period-footer">
      <app-p-button
        [buttonText]="'ביטול'"
        [buttonColor]="ButtonColor.BLACK"
        [buttonSize]="ButtonSize.AUTO"
        [variant]="'outlined'"
        (onButtonClicked)="cancelCustomPeriod()">
      </app-p-button>
      <app-p-button
        [buttonText]="'אישור'"
        [buttonColor]="ButtonColor.BLACK"
        [buttonSize]="ButtonSize.AUTO"
        [disabled]="!customPeriodValue().trim()"
        (onButtonClicked)="confirmCustomPeriod()">
      </app-p-button>
    </div>
  </ng-template>

</p-dialog>

<!-- Supplier-conflict pre-flight dialog. Opens when the bulk approve
     queue has multiple rows for the same NEW supplier with divergent
     classification fields (only the first row's values would land in the
     Supplier master). User must close + resolve before approve runs. -->
<p-dialog
  header="התאמת נתוני ספק"
  [visible]="supplierConflictsVisible()"
  (visibleChange)="$event ? null : closeSupplierConflicts()"
  [modal]="true"
  [style]="{ width: '520px', maxWidth: '95vw' }"
  [rtl]="true"
  [draggable]="false"
  [resizable]="false">

  <div class="supplier-conflict-body">
    <p class="supplier-conflict-explanation">
      איתרנו ספקים חדשים שמופיעים במספר שורות עם <strong>נתונים שונים</strong>.
      רק שורה אחת תישמר לרשימת הספקים שלך, כך שהערכים בשורות האחרות
      <strong>לא ייכנסו לכרטיס הספק</strong>.
    </p>

    <ul class="supplier-conflict-list">
      <li *ngFor="let c of supplierConflicts()">
        <span class="supplier-conflict-name">{{ c.supplierName }}</span>
        <span class="supplier-conflict-meta">({{ c.rowCount }} שורות)</span>
        <div class="supplier-conflict-fields">
          שדות שונים: {{ c.conflictingFields.join(', ') }}
        </div>
      </li>
    </ul>

    <p class="supplier-conflict-howto">
      כדי להמשיך: השוו את הערכים בין השורות, או לחצו על סימון הספק
      (<span class="supplier-new-square supplier-conflict-flag-icon"></span>)
      בשורות שאתם <strong>לא</strong> רוצים שיישמרו לכרטיס הספק.
    </p>
  </div>

  <ng-template pTemplate="footer">
    <div class="supplier-conflict-footer">
      <app-p-button
        [buttonText]="'סגור'"
        [buttonColor]="ButtonColor.BLACK"
        [buttonSize]="ButtonSize.AUTO"
        (onButtonClicked)="closeSupplierConflicts()">
      </app-p-button>
    </div>
  </ng-template>

</p-dialog>

<!-- tx_only "קשר למסמך קיים" — was an inline picker in the (now-removed)
     status column; same p-dialog idiom as the rest of this stack, opened
     from the row-actions hover strip's "link" action (startLink). -->
<p-dialog
  header="קישור לתנועה"
  [visible]="linkingTxId() !== null"
  (visibleChange)="$event ? null : cancelLink()"
  [modal]="true"
  [style]="{ width: '480px', maxWidth: '95vw' }"
  [rtl]="true"
  [draggable]="false"
  [resizable]="false">

  <div class="link-dialog-body" *ngIf="linkingRow() as row">
    <p class="link-dialog-row-label">{{ row.supplier || '(ללא ספק)' }} — {{ row.sumLabel }}</p>
    <label class="link-dialog-label" for="linkDocSelect">מסמך לקישור</label>
    <select id="linkDocSelect"
            class="cell-editable link-dialog-select"
            [ngModel]="selectedDocForLink()"
            (ngModelChange)="selectedDocForLink.set($event)">
      <option [ngValue]="null">— בחר מסמך —</option>
      <option *ngFor="let dr of docOnlyRows()" [ngValue]="dr.documentId">
        {{ dr.supplier || '(ללא ספק)' }} — ₪{{ dr.amount }} — {{ dr.date }}
      </option>
    </select>
  </div>

  <ng-template pTemplate="footer">
    <div class="link-dialog-footer">
      <app-p-button
        [buttonText]="'ביטול'"
        [buttonColor]="ButtonColor.BLACK"
        [buttonSize]="ButtonSize.AUTO"
        [variant]="'outlined'"
        (onButtonClicked)="cancelLink()">
      </app-p-button>
      <app-p-button
        [buttonText]="'אישור'"
        [buttonColor]="ButtonColor.BLACK"
        [buttonSize]="ButtonSize.AUTO"
        [isLoading]="isActioning()"
        [disabled]="!selectedDocForLink() || !linkingRow()"
        (onButtonClicked)="confirmLink(linkingRow()!)">
      </app-p-button>
    </div>
  </ng-template>

</p-dialog>

<!-- D8 triage — "מיין" on an UNIDENTIFIED row. Same conversion: was an
     inline picker in the (now-removed) status column, now a p-dialog
     opened from the row-actions hover strip's "triage" action (startTriage). -->
<p-dialog
  header="מה המסמך הזה?"
  [visible]="triagingRowKey() !== null"
  (visibleChange)="$event ? null : cancelTriage()"
  [modal]="true"
  [style]="{ width: '420px', maxWidth: '95vw' }"
  [rtl]="true"
  [draggable]="false"
  [resizable]="false">

  <div class="triage-dialog-body" *ngIf="triagingRow() as row">
    <p class="triage-dialog-row-label">{{ row.supplier || '(ללא ספק)' }} — {{ row.sumLabel }}</p>
  </div>

  <ng-template pTemplate="footer">
    <div class="triage-dialog-footer">
      <app-p-button
        [buttonText]="'ביטול'"
        [buttonColor]="ButtonColor.BLACK"
        [buttonSize]="ButtonSize.AUTO"
        [variant]="'outlined'"
        (onButtonClicked)="cancelTriage()">
      </app-p-button>
      <app-p-button
        [buttonText]="'מסמך שנתי'"
        [buttonColor]="ButtonColor.BLACK"
        [buttonSize]="ButtonSize.AUTO"
        [isLoading]="isActioning()"
        [disabled]="!triagingRow()"
        (onButtonClicked)="confirmTriage(triagingRow()!, 'ANNUAL_DOCUMENT')">
      </app-p-button>
      <app-p-button
        [buttonText]="'חשבונית הוצאה'"
        [buttonColor]="ButtonColor.BLACK"
        [buttonSize]="ButtonSize.AUTO"
        [isLoading]="isActioning()"
        [disabled]="!triagingRow()"
        (onButtonClicked)="confirmTriage(triagingRow()!, 'EXPENSE_INVOICE')">
      </app-p-button>
    </div>
  </ng-template>

</p-dialog>
```

### frontend/src/app/pages/report-review/report-review.page.scss

השמטתי את גוף ה-CSS המלא (699 שורות) — הוא נקרא במלואו אך אין בו לוגיקה עסקית, רק עיצוב. סיכום מבני:
- `.report-review-page` / `.report-review-header` / `.report-review-title` — עטיפת העמוד (מקסימום 1700px, RTL).
- `.dialog-body` / `.dialog-main` / `.preview-panel*` — פיצול 58%/40% טבלה/תצוגה מקדימה של Drive כשנפתח.
- `:host ::ng-deep .review-table` — עיצוב הטבלה עצמה: גופן 0.78rem, `table-layout: fixed`, גובה שורה אוטומטי, ריפוד תאים, `.cell-readonly` (טקסט קריאה-בלבד קבוע לכל התאים כעת), צביעת שורות (`.row-highlighted` כחול, `.row-pending` דהוי, `.row-error` אדום).
- `.cell-readonly.overridden` — צביעה כתומה לתקופת דיווח שנדרסה ידנית.
- `.act` / `.icon-act` (ואריאציות `icon-archive` / `icon-delete` / `icon-link` / `icon-edit` / `icon-preview` / `icon-upload` / `icon-unpair`) — כפתורי פעולה מרחפים בעיצוב אחיד, צבע hover ייחודי לכל פעולה.
- `.hidden-file-input` — קלט קובץ מוסתר.
- `.custom-period-*`, `.supplier-conflict-*` — עיצוב שני דיאלוגי המשנה (תקופה מותאמת, קונפליקט ספקים).
- `.supplier-cell` / `.supplier-new-square` (+ `--opt-out`) — הריבוע הירוק/אפור לצד שם הספק (ספק חדש: יתווסף / לא יתווסף).
- `.footer-bar` / `.select-info` / `.footer-actions` / `.select-all-toggle` — פס תחתון עם "בחר הכל" ואישור מרוכז.
- `.link-picker`, `.dup-warning` — עיצוב פס הקישור הפנימי ופרומפט הכפילות הרכה (ענבר).
- `.toolbar-row`, `.view-toggle` (+ `__btn`, `__btn--active`) — מתג "תצוגה רגילה"/"תצוגה מקצועית".
- `.row-select` — checkbox הבחירה בשורה.
- `.link-dialog-*`, `.triage-dialog-*` — עיצוב דיאלוגי הקישור והמיון (D8).

---

## 2. report-review-edit-dialog — דיאלוג העריכה

קומפוננטה standalone עצמאית ב-`frontend/src/app/components/report-review-edit-dialog/`.

### חוזה הנתונים בין ההורה (report-review.page.ts) לילד (הדיאלוג)

הדיאלוג הוא **fully-controlled** — אין לו state פנימי משלו מעבר למה שמגיע דרך `[fields]`. כל שינוי משתמש משודר כלפי מעלה דרך Output ייעודי (או `fieldsChange` הגנרי), ההורה מעדכן את `editDraft` signal ומזרים אותו בחזרה דרך `[fields]`. Cancel = ההורה פשוט לא מיישם את הדראפט על השורה; Save = ההורה כותב את הדראפט האחרון על השורה (`onEditDialogSave`).

**Inputs (@Input):**

| Input | טיפוס | תיאור |
|---|---|---|
| `visible` | `boolean` | האם הדיאלוג פתוח |
| `hasDocument` | `boolean` | קובע פריסה: עמודה כפולה (עם תצוגה מקדימה) מול עמודה יחידה רחבה |
| `driveFileId` | `string \| null` | מזהה קובץ Drive לתצוגה מקדימה |
| `driveFileName` | `string` | שם הקובץ המוצג בכותרת התצוגה המקדימה |
| `titleLabel` | `string` | כותרת הדיאלוג (ספק — סכום) |
| `viewMode` | `'regular' \| 'professional'` | קובע האם להציג קטגוריה/תת-קטגוריה או בורר כרטיס |
| `fields` | `ExpenseEditFieldValues \| null` | הדראפט הנוכחי — מקור האמת היחיד לתצוגה |
| `categoryOptions` | `string[]` | רשימת קטגוריות (תצוגה רגילה) |
| `subCategoryOptions` | `string[]` | תת-קטגוריות מסוננות מראש ע"י ההורה לפי `fields.category` |
| `cardOptionsBySection` | `{section, cards}[]` | כרטיסי הנהלת חשבונות מקובצים לפי חתך (תצוגה מקצועית) |
| `documentTypeOptions` | `{value,label}[]` | אפשרויות סוג מסמך |
| `periodOptions` | `{value,label,isCustom?}[]` | אפשרויות תקופת דיווח; `isCustom` מסמן את הסנטינל "אחר" |
| `showNewSupplierFlag` | `boolean` | האם להציג צ'קבוקס "הוסף ספק זה לרשימת הספקים שלי" |

**Outputs (@Output):**

| Output | Payload | תיאור |
|---|---|---|
| `visibleChange` | `boolean` | נפלט `false` בסגירה (X/Escape/ביטול) |
| `save` | `void` | נפלט בלחיצת "שמור" |
| `categoryChange` | `string` | קטגוריה חדשה נבחרה (regular view) |
| `subCategoryChange` | `string` | תת-קטגוריה חדשה נבחרה (regular view) |
| `cardChange` | `number \| null` | כרטיס חדש נבחר (professional view, accountId) |
| `periodChange` | `string` | תקופה לא-סנטינל נבחרה |
| `customPeriodRequested` | `void` | המשתמש בחר "אחר" בבורר התקופה |
| `fieldsChange` | `Partial<ExpenseEditFieldValues>` | פאץ' גנרי לכל שדה ללא לוגיקת cascade/resolution (ספק, מס' עוסק, תאריך, סכום, סוג מסמך, מס' הקצאה, מע"מ%, מס%, saveAsSupplier, applyCascadeToSuppliers) |

**סוגי הממשק (מיוצאים מהקומפוננטה):**

```typescript
export interface ExpenseEditFieldValues {
  category: string;
  subCategory: string;
  subCategoryId: number | null;
  accountId: number | null;
  vatPercent: number;
  taxPercent: number;
  date: string;
  amount: number;
  supplierId: string;
  supplier: string;
  reportPeriod: string;
  reportPeriodOverridden: boolean;
  applyCascadeToSuppliers: boolean;
  allocationNumber?: string;
  documentType?: string | null;
  saveAsSupplier?: boolean;
}

export interface ExpenseEditCardOption {
  accountId: number;
  accountName: string;
  accountCode: string;
}
```

### frontend/src/app/components/report-review-edit-dialog/report-review-edit-dialog.component.ts — מלא

```typescript
import { Component, EventEmitter, inject, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { DialogModule } from 'primeng/dialog';

import { ButtonComponent } from '../button/button.component';
import { ButtonColor, ButtonSize } from '../button/button.enum';

/**
 * Field values edited by this dialog. Deliberately generic — no
 * report-review-specific types (EditableReviewRow, CatalogRow, ...) leak
 * in here, so this component stays reusable by other "edit an expense"
 * entry points (e.g. components/mannual-expense) later.
 */
export interface ExpenseEditFieldValues {
  category: string;
  subCategory: string;
  subCategoryId: number | null;
  accountId: number | null;
  vatPercent: number;
  taxPercent: number;
  date: string;
  amount: number;
  supplierId: string;
  supplier: string;
  reportPeriod: string;
  reportPeriodOverridden: boolean;
  /** Checked by default — the caller cascades the classification onto
   *  every sibling row sharing this supplier when true. */
  applyCascadeToSuppliers: boolean;
  /** Doc-only fields — undefined/ignored when hasDocument is false. */
  allocationNumber?: string;
  documentType?: string | null;
  saveAsSupplier?: boolean;
}

export interface ExpenseEditCardOption {
  accountId: number;
  accountName: string;
  accountCode: string;
}

/**
 * Presentational, fully-controlled edit dialog — holds no state of its
 * own beyond what's passed in via `fields`. The caller owns the draft:
 * every user edit is relayed upward via the granular Outputs below, the
 * caller recomputes `fields` and passes it back down. Cancel simply means
 * the caller never applied the draft anywhere; Save means the caller
 * commits the last-known `fields` snapshot wherever it needs to.
 */
@Component({
  selector: 'app-report-review-edit-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, DialogModule, ButtonComponent],
  templateUrl: './report-review-edit-dialog.component.html',
  styleUrls: ['./report-review-edit-dialog.component.scss'],
})
export class ReportReviewEditDialogComponent {
  private sanitizer = inject(DomSanitizer);

  readonly ButtonColor = ButtonColor;
  readonly ButtonSize = ButtonSize;

  @Input() visible = false;
  /** Two-column (with document preview) vs single full-width column. */
  @Input() hasDocument = false;
  @Input() driveFileId: string | null = null;
  @Input() driveFileName = '';
  @Input() titleLabel = '';
  @Input() viewMode: 'regular' | 'professional' = 'regular';
  @Input() fields: ExpenseEditFieldValues | null = null;
  @Input() categoryOptions: string[] = [];
  /** Pre-filtered by the caller for the current fields.category. */
  @Input() subCategoryOptions: string[] = [];
  @Input() cardOptionsBySection: { section: string; cards: ExpenseEditCardOption[] }[] = [];
  @Input() documentTypeOptions: { value: string; label: string }[] = [];
  /** `isCustom` marks the "אחר" sentinel option — picking it fires
   *  customPeriodRequested instead of periodChange. */
  @Input() periodOptions: { value: string; label: string; isCustom?: boolean }[] = [];
  @Input() showNewSupplierFlag = false;

  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() save = new EventEmitter<void>();
  @Output() categoryChange = new EventEmitter<string>();
  @Output() subCategoryChange = new EventEmitter<string>();
  @Output() cardChange = new EventEmitter<number | null>();
  @Output() periodChange = new EventEmitter<string>();
  @Output() customPeriodRequested = new EventEmitter<void>();
  /** Generic patch for every field with no cascade/resolution side-effect
   *  (vatPercent, taxPercent, date, amount, supplierId, supplier,
   *  allocationNumber, documentType, saveAsSupplier, applyCascadeToSuppliers). */
  @Output() fieldsChange = new EventEmitter<Partial<ExpenseEditFieldValues>>();

  previewUrl(): SafeResourceUrl | null {
    if (!this.driveFileId) return null;
    return this.sanitizer.bypassSecurityTrustResourceUrl(
      `https://drive.google.com/file/d/${this.driveFileId}/preview`,
    );
  }

  onPeriodPicked(value: string): void {
    const opt = this.periodOptions.find(o => o.value === value);
    if (opt?.isCustom) {
      this.customPeriodRequested.emit();
      return;
    }
    this.periodChange.emit(value);
  }
}
```

### frontend/src/app/components/report-review-edit-dialog/report-review-edit-dialog.component.html — מלא

```html
<p-dialog
  [header]="titleLabel || 'עריכת הוצאה'"
  [visible]="visible"
  (visibleChange)="$event ? null : visibleChange.emit(false)"
  [modal]="true"
  [style]="hasDocument ? { width: '1100px', maxWidth: '95vw' } : { width: '640px', maxWidth: '95vw' }"
  [rtl]="true"
  [draggable]="false"
  [resizable]="false">

  <div class="edit-dialog-body" [class.with-preview]="hasDocument" *ngIf="fields as f">
    <div class="edit-dialog-main">
      <div class="field-grid">
        <label class="field">
          <span class="field-label">ספק</span>
          <input type="text" class="field-input"
                 [ngModel]="f.supplier"
                 (ngModelChange)="fieldsChange.emit({ supplier: $event })" />
        </label>
        <label class="field">
          <span class="field-label">מס׳ עוסק</span>
          <input type="text" class="field-input"
                 [ngModel]="f.supplierId"
                 (ngModelChange)="fieldsChange.emit({ supplierId: $event })" />
        </label>

        <label class="field">
          <span class="field-label">תאריך</span>
          <input type="date" class="field-input"
                 [ngModel]="f.date"
                 (ngModelChange)="fieldsChange.emit({ date: $event })" />
        </label>
        <label class="field">
          <span class="field-label">סכום</span>
          <input type="number" step="0.01" class="field-input"
                 [ngModel]="f.amount"
                 (ngModelChange)="fieldsChange.emit({ amount: $event })" />
        </label>

        <ng-container *ngIf="hasDocument">
          <label class="field">
            <span class="field-label">סוג מסמך</span>
            <select class="field-input"
                    [ngModel]="f.documentType"
                    (ngModelChange)="fieldsChange.emit({ documentType: $event })">
              <option [ngValue]="null">—</option>
              <option *ngFor="let opt of documentTypeOptions" [ngValue]="opt.value">{{ opt.label }}</option>
            </select>
          </label>
          <label class="field">
            <span class="field-label">מס׳ הקצאה</span>
            <input type="text" class="field-input"
                   [ngModel]="f.allocationNumber"
                   (ngModelChange)="fieldsChange.emit({ allocationNumber: $event })" />
          </label>
        </ng-container>

        <ng-container *ngIf="viewMode === 'regular'; else cardPicker">
          <label class="field">
            <span class="field-label">קטגוריה</span>
            <select class="field-input"
                    [ngModel]="f.category"
                    (ngModelChange)="categoryChange.emit($event)">
              <option [ngValue]="''">— בחר —</option>
              <option *ngFor="let cat of categoryOptions" [ngValue]="cat">{{ cat }}</option>
            </select>
          </label>
          <label class="field">
            <span class="field-label">תת קטגוריה</span>
            <select class="field-input"
                    [ngModel]="f.subCategory"
                    (ngModelChange)="subCategoryChange.emit($event)"
                    [disabled]="!f.category">
              <option [ngValue]="''">— בחר —</option>
              <option *ngFor="let sub of subCategoryOptions" [ngValue]="sub">{{ sub }}</option>
            </select>
          </label>
        </ng-container>
        <ng-template #cardPicker>
          <label class="field field--wide">
            <span class="field-label">כרטיס הנהלת חשבונות</span>
            <select class="field-input"
                    [ngModel]="f.accountId"
                    (ngModelChange)="cardChange.emit($event)">
              <option [ngValue]="null">— בחר כרטיס —</option>
              <optgroup *ngFor="let g of cardOptionsBySection" [label]="g.section || 'ללא חתך'">
                <option *ngFor="let card of g.cards" [ngValue]="card.accountId">
                  {{ card.accountName }} ({{ card.accountCode }})
                </option>
              </optgroup>
            </select>
          </label>
        </ng-template>

        <label class="field">
          <span class="field-label">% מע״מ</span>
          <input type="number" step="0.01" class="field-input"
                 [ngModel]="f.vatPercent"
                 (ngModelChange)="fieldsChange.emit({ vatPercent: $event })" />
        </label>
        <label class="field">
          <span class="field-label">% מס</span>
          <input type="number" step="0.01" class="field-input"
                 [ngModel]="f.taxPercent"
                 (ngModelChange)="fieldsChange.emit({ taxPercent: $event })" />
        </label>

        <label class="field field--wide">
          <span class="field-label">תקופת דיווח</span>
          <select class="field-input"
                  [ngModel]="f.reportPeriod"
                  (ngModelChange)="onPeriodPicked($event)">
            <option *ngFor="let opt of periodOptions" [ngValue]="opt.value">{{ opt.label }}</option>
          </select>
        </label>

        <label class="field field--wide checkbox-field">
          <input type="checkbox"
                 [ngModel]="f.applyCascadeToSuppliers"
                 (ngModelChange)="fieldsChange.emit({ applyCascadeToSuppliers: $event })" />
          <span>החל סיווג זה גם על שורות זהות בטבלה</span>
        </label>

        <label class="field field--wide checkbox-field" *ngIf="showNewSupplierFlag">
          <input type="checkbox"
                 [ngModel]="f.saveAsSupplier"
                 (ngModelChange)="fieldsChange.emit({ saveAsSupplier: $event })" />
          <span>הוסף ספק זה לרשימת הספקים שלי</span>
        </label>
      </div>
    </div>

    <aside class="edit-dialog-preview" *ngIf="hasDocument">
      <header class="edit-dialog-preview__header">
        <span class="edit-dialog-preview__title" [title]="driveFileName">{{ driveFileName }}</span>
      </header>
      <iframe class="edit-dialog-preview__iframe" [src]="previewUrl()" title="Drive preview"></iframe>
    </aside>
  </div>

  <ng-template pTemplate="footer">
    <div class="edit-dialog-footer">
      <app-p-button
        [buttonText]="'ביטול'"
        [buttonColor]="ButtonColor.BLACK"
        [buttonSize]="ButtonSize.AUTO"
        [variant]="'outlined'"
        (onButtonClicked)="visibleChange.emit(false)">
      </app-p-button>
      <app-p-button
        [buttonText]="'שמור'"
        [buttonColor]="ButtonColor.BLACK"
        [buttonSize]="ButtonSize.AUTO"
        (onButtonClicked)="save.emit()">
      </app-p-button>
    </div>
  </ng-template>
</p-dialog>
```

### frontend/src/app/components/report-review-edit-dialog/report-review-edit-dialog.component.scss — מלא

```scss
// Mirrors report-review.page.scss's .dialog-body/.preview-panel split
// (58/40 form|preview) at the scale of this dialog's own body instead of
// the whole page.
.edit-dialog-body {
  display: flex;
  flex-direction: row;
  gap: 14px;
  align-items: stretch;
  direction: rtl;
}
.edit-dialog-main {
  flex: 1 1 auto;
  min-width: 0;
}
.edit-dialog-body.with-preview .edit-dialog-main {
  flex: 0 0 55%;
}

.edit-dialog-preview {
  flex: 0 0 45%;
  display: flex;
  flex-direction: column;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #f9fafb;
  min-height: 70vh;
  max-height: 75vh;
}
.edit-dialog-preview__header {
  padding: 6px 10px;
  border-bottom: 1px solid #e5e7eb;
  background: white;
  border-radius: 6px 6px 0 0;
}
.edit-dialog-preview__title {
  display: block;
  font-size: 0.82rem;
  color: #374151;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  direction: ltr;
  text-align: start;
}
.edit-dialog-preview__iframe {
  flex: 1 1 auto;
  width: 100%;
  border: 0;
  border-radius: 0 0 6px 6px;
  background: white;
}

.field-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 16px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.85rem;
  color: #374151;

  &--wide {
    grid-column: 1 / -1;
  }
}
.field-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: #4b5563;
}
.field-input {
  padding: 6px 8px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 0.88rem;
  background: white;

  &:disabled {
    background: #f3f4f6;
    color: #9ca3af;
  }
  &:focus {
    outline: none;
    border-color: #1d4ed8;
    box-shadow: 0 0 0 3px #bfdbfe66;
  }
}

.checkbox-field {
  flex-direction: row;
  align-items: center;
  gap: 8px;
  cursor: pointer;

  input { cursor: pointer; }
}

.edit-dialog-footer {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}
```

---

## 3. מודל שורת ההוצאה

### `EditableReviewRow` (frontend, `report-review.page.ts`, שורות 62–180) — טבלה מלאה

| שדה | טיפוס | תיאור |
|---|---|---|
| `rowKey` | `string` | מפתח יציב ל-trackBy — לא ID אמיתי במסד; נבנה מ-`type:documentId:slimTransactionId` |
| `type` | `'matched' \| 'doc_only' \| 'tx_only'` | סוג השורה |
| `selected` | `boolean` | סימון לתור האישור הקבוצתי |
| `documentId` | `number \| null` | מזהה מסמך (אחד משני השדות הבאים תמיד קיים) |
| `slimTransactionId` | `number \| null` | מזהה תנועה |
| `driveFileId` | `string` | מזהה קובץ ב-Drive |
| `driveFileName` | `string` | שם הקובץ |
| `invoiceNumber` | `string` | מס' חשבונית |
| `allocationNumber` | `string` | מספר הקצאה (מע"מ) |
| `documentTypeLabel` | `string` | תווית עברית לסוג המסמך |
| `documentType` | `string \| null` | ערך enum גולמי (`invoice`, `receipt`, וכו') |
| `documentKind` | `string \| null` | D8: `EXPENSE_INVOICE \| ANNUAL_DOCUMENT \| UNIDENTIFIED` |
| `supplier` | `string` | שם ספק |
| `supplierId` | `string` | ת.ז./ח.פ ספק |
| `date` | `string` | תאריך YYYY-MM-DD |
| `amount` | `number` | סכום גולמי חיובי |
| `sumLabel` | `string` | תווית תצוגה מעוצבת (כולל סמל מטבע) |
| `currency` | `string` | קוד מטבע ISO |
| `ilsAmount` | `number \| null` | ערך שקלי מומר עבור שורות מט"ח |
| `category` | `string` | קטגוריה |
| `subCategory` | `string` | תת-קטגוריה |
| `subCategoryId` | `number \| null` | מזהה תת-קטגוריה במאגר הממוזג |
| `vatPercent` | `number` | אחוז מע"מ |
| `taxPercent` | `number` | אחוז מס |
| `isEquipment` | `boolean` | ציוד/לא |
| `mappingStatus` | `ReviewMappingStatus` | `READY \| MISSING_MAPPING \| PRIVATE \| UNCLASSIFIED` |
| `description` | `string` | תיאור D7 (לעמודת "תיאור" בתצוגה המקצועית) |
| `mappedByAccountant` | `boolean` | מסווג ע"י רו"ח |
| `sectionName` | `string` | שם חתך |
| `accountId` | `number \| null` | מזהה כרטיס הנהלת חשבונות |
| `accountCode` | `string` | קוד כרטיס |
| `accountName` | `string` | שם כרטיס |
| `accountLabel` | `string` | "שם (קוד)" — תווית תצוגה |
| `reductionPercent` | `number` | % פחת |
| `reportPeriod` | `string` | תקופת דיווח ("M/YYYY" או "M1-M2/YYYY") |
| `reportPeriodOverridden` | `boolean` | האם המשתמש דרס את התקופה האוטומטית |
| `supplierStatusLabel` | `string \| null` | "ספק מוכר" / "ספק חדש" / null |
| `saveAsSupplier` | `boolean` | האם לרשום את הספק לרשימת הספקים באישור |
| `saveStatus` | `null \| 'pending' \| 'failed'` | מצב שמירה נוכחי |
| `saveError` | `string \| null` | הודעת שגיאה מהשרת |
| `duplicateWarning` | `boolean?` | סומן כאשר השרת דיווח DUPLICATE_WARNING |
| `acknowledgeDuplicate` | `boolean?` | המשתמש אישר "שמור בכל זאת" |

### `ReviewRow` (backend/frontend wire type, `report-review.service.ts` / `report-review.dto.ts`)

```typescript
export type ReviewRow =
  | { type: 'matched'; document: ReviewDocSummary; transaction: ReviewTxSummary; classification: ReviewClassification }
  | { type: 'doc_only'; document: ReviewDocSummary; classification: ReviewClassification }
  | { type: 'tx_only'; transaction: ReviewTxSummary; classification: ReviewClassification };
```

**`ReviewDocSummary`:**

| שדה | טיפוס |
|---|---|
| `documentId` | `number` |
| `driveFileId` | `string` |
| `driveFileName` | `string` |
| `supplier` | `string \| null` |
| `supplierId` | `string \| null` |
| `date` | `string \| null` |
| `invoiceNumber` | `string \| null` |
| `allocationNumber` | `string \| null` |
| `amount` | `number \| null` |
| `category` | `string \| null` |
| `subCategory` | `string \| null` |
| `vatPercent` | `number \| null` |
| `taxPercent` | `number \| null` |
| `isEquipment` | `boolean \| null` |
| `uploadDate` | `string \| null` |
| `documentType` | `string \| null` |
| `documentKind` | `string \| null` |
| `currency` | `string \| null` |
| `ilsAmount` | `number \| null` |
| `matchedSupplierKnown` | `boolean` |

**`ReviewTxSummary`:**

| שדה | טיפוס |
|---|---|
| `slimTransactionId` | `number` |
| `externalTransactionId` | `string` |
| `date` | `string` |
| `amount` | `number` |
| `merchantName` | `string` |
| `category` | `string` |
| `subCategory` | `string` |
| `vatPercent` | `number` |
| `taxPercent` | `number` |
| `isEquipment` | `boolean` |
| `originalAmount` | `number \| null` |
| `originalCurrency` | `string \| null` |

**`ReviewClassification`** (D9 — server-side resolution preview, מחושב לכל שורה מול הקטלוג הממוזג):

| שדה | טיפוס |
|---|---|
| `subCategoryId` | `number \| null` |
| `categoryName` | `string \| null` |
| `subCategoryName` | `string \| null` |
| `status` | `ReviewMappingStatus` |
| `description` | `string` (D7) |
| `mappedByAccountant` | `boolean` |
| `sectionCode` | `string \| null` |
| `sectionName` | `string \| null` |
| `accountId` | `number \| null` |
| `accountCode` | `string \| null` |
| `accountName` | `string \| null` |
| `vatPercent` | `number \| null` |
| `taxPercent` | `number \| null` |
| `reductionPercent` | `number \| null` |
| `isEquipment` | `boolean \| null` |

### `CatalogRow` (frontend, `report-review.service.ts`) — מקור לכל הפיקרים

```typescript
export interface CatalogRow {
  subCategoryId: number;
  category: string | null;
  subCategory: string;
  accountId: number | null;
  isPrivate: boolean;
  approvalStatus: string;
  ownerType: string;
  accountCode: string | null;
  accountName: string | null;
  sectionCode: string | null;
  sectionName: string | null;
  vatPercent: number | null;
  taxPercent: number | null;
  reductionPercent: number | null;
  isEquipment: boolean | null;
}
```

---

## 4. ה-service/API שמביא נתונים

### `getPreview` (frontend `ReportReviewService.getPreview`)

- **Endpoint:** `POST {apiUrl}reports/me/preview`
- **Body:** `{ businessNumber: string; startDate: string; endDate: string }`
- **Response:** `ReportPreviewResponse`

```typescript
export interface ReportPreviewResponse {
  mode: 'documents_only' | 'with_banking';
  rows: ReviewRow[];
  counts: { matched: number; docOnly: number; txOnly: number };
  duplicatesSkipped: number;
  clientHasActiveDelegation: boolean;
}
```

### `getCatalog` (frontend `ReportReviewService.getCatalog`)

- **Endpoint:** `GET {apiUrl}bookkeeping/expense-catalog`
- **Params:** `{ businessNumber, includePrivate: 'true' }`
- **Response:** `CatalogRow[]`

### `previewCheck` (frontend `ReportReviewService.previewCheck`)

- **Endpoint:** `GET {apiUrl}reports/me/preview-check`
- **Params:** `{ businessNumber, endDate }`
- **Response:** `{ hasPendingDocs: boolean; hasUnconfirmedExpenses: boolean }`

### צד ה-backend — `ReportsController` (`backend/src/reports/reports.controller.ts`)

```typescript
/** Cheap pre-flight (no OCR, no matcher) — does the user have anything
 *  worth reviewing before the report? Returns booleans for inbox files
 *  + unconfirmed-expense slim rows. The frontend uses this to decide
 *  whether to open the review modal at all. */
@Get('me/preview-check')
@UseGuards(FirebaseAuthGuard)
async previewCheck(
  @Req() request: AuthenticatedRequest,
  @Query() query: { businessNumber: string; endDate: string },
): Promise<{ hasPendingDocs: boolean; hasUnconfirmedExpenses: boolean }> {
  const firebaseId = request.user?.firebaseId;
  if (!firebaseId) throw new BadRequestException('Not authenticated');
  const bn = query?.businessNumber?.trim();
  if (!bn) throw new BadRequestException('businessNumber is required');
  const periodEnd = this.sharedService.convertStringToDateObject(query.endDate);
  if (!periodEnd) throw new BadRequestException('endDate is required ISO date');
  const isAgentRequest = request.user?.role === 'agent';
  return this.reviewService.previewCheck(firebaseId, bn, periodEnd, isAgentRequest);
}

/** Preview: process inbox, run matching (if Open Banking), return the
 *  unified review rows. Body: { businessNumber, startDate, endDate }. */
@Post('me/preview')
@UseGuards(FirebaseAuthGuard)
async getReportPreview(
  @Req() request: AuthenticatedRequest,
  @Body() body: { businessNumber: string; startDate: string; endDate: string },
) {
  const firebaseId = request.user?.firebaseId;
  if (!firebaseId) throw new BadRequestException('Not authenticated');
  const bn = body?.businessNumber?.trim();
  if (!bn) throw new BadRequestException('businessNumber is required');
  const from = this.sharedService.convertStringToDateObject(body.startDate);
  const to = this.sharedService.convertStringToDateObject(body.endDate);
  if (!from || !to) throw new BadRequestException('startDate/endDate are required ISO dates');
  return this.reviewService.getReportPreview(firebaseId, bn, { from, to });
}
```

**`ReportReviewService.getReportPreview`** (backend, `report-review.service.ts` שורות 271–455) עושה, בסדר הזה:

1. **שלב 1** — `documentsService.processInboxForUser` — מעבד קבצים חדשים בתיקיית `inbox/` ב-Drive (OCR), best-effort (כשלים לא מפילים את התהליך). מחזיר `duplicatesSkipped` (כפילויות זהות-בית שנדחו אוטומטית).
2. **שלב 1.5** — `documentPairingService.pairInvoicesAndReceiptsForBusiness` — מזווג חשבוניות↔קבלות שמתארות אותה רכישה, לפני ההתאמה לתנועת בנק.
3. **שלב 2** — קובע `mode` (`with_banking` אם למשתמש יש Open Banking, אחרת `documents_only`); אם `with_banking` — מריץ `matchingService.matchDocumentsForBusiness` (±3 ימים, ±1 ש"ח, first-fit, אידמפוטנטי).
4. **שלב 3** — שולף `ExtractedDocument` בסטטוס `PENDING_REVIEW` (`date IS NULL OR date <= to`), ו-`SlimTransaction` מסווגות-כהוצאה-לא-מאושרות בטווח (`with_banking` בלבד). בונה מפת ספקים ידועים (`knownSupplierById`) כדי לתייג "ספק מוכר/חדש" ולהזרים סיווג שמור.
5. **שלב 3.5** — טוען את הקטלוג הממוזג (`catalogContextService.forUser` + `catalogService.getMergedExpenseCatalog`) פעם אחת, מודע-לדלגציה (הצ'ארט של הרואה-חשבון, אם קיים, נכנס למיזוג).
6. **שלב 4** — מרכיב שלוש קבוצות שורות: `matched` (מסמך+תנועה מקושרים), `doc_only` (מסמכים שלא נצרכו), `tx_only` (תנועות שלא נצרכו, רק ב-`with_banking`). לכל שורה קורא ל-`classifyReviewRow` (ראו סעיף 5).
7. מחזיר `{ mode, rows, counts, duplicatesSkipped, clientHasActiveDelegation }`.

`classifyReviewRow` (שורות 470–555) — פותר שם קטגוריה/תת-קטגוריה מול הקטלוג הממוזג בסדר: (1) התאמת זוג שמות מדויקת, (2) שם תת-קטגוריה בלבד, (3) `stampedSubCategoryId` שנשמר בזמן ה-OCR. אם אין התאמה — מחזיר `status: 'UNCLASSIFIED'`.

---

## 5. endpoint/service לאישור הוצאות

### payload — `ReviewOverrides` (frontend, `report-review.service.ts`)

```typescript
export interface ReviewOverrides {
  subCategoryId?: number;
  category?: string;
  subCategory?: string;
  vatPercent?: number;
  taxPercent?: number;
  isEquipment?: boolean;
  reportPeriod?: string;
  saveAsSupplier?: boolean;
  acknowledgeDuplicate?: boolean;
  invoiceNumber?: string;
  allocationNumber?: string;
  supplierId?: string;
  supplier?: string;
  documentType?: string;
  date?: string;
  amount?: number;
}
```

הבנייה מתבצעת ב-`overridesFromRow` (page.ts שורות 1639–1663) מיד לפני כל קריאת approve — כל שדה בשורה נשלח, פרט לתקופה שנשלחת רק כשהמשתמש בפועל דרס אותה (`row.reportPeriodOverridden`).

### שלושת מתודות ה-approve (frontend `ReportReviewService`)

| מתודה | Endpoint | Method | Body |
|---|---|---|---|
| `approveMatched` | `reports/me/review/approve-matched` | POST | `{ businessNumber, documentId, transactionId, overrides }` |
| `approveDocCash` | `reports/me/review/approve-doc-cash` | POST | `{ businessNumber, documentId, overrides }` |
| `approveTxNoDoc` | `reports/me/review/approve-tx-no-doc` | POST | `{ businessNumber, transactionId, overrides }` |

כולן מחזירות `{ expenseId: number }`.

### פעולות שורה נוספות (frontend `ReportReviewService`)

| מתודה | Endpoint | Method |
|---|---|---|
| `linkDocToTx` | `reports/me/review/link-doc-to-tx` | POST |
| `archiveDoc` | `reports/me/review/archive-doc/:documentId` | POST |
| `deleteDoc` | `reports/me/review/delete-doc/:documentId` | POST |
| `rejectTx` | `reports/me/review/reject-tx` | POST |
| `unpair` | `reports/me/review/unpair/:documentId` | POST |
| `fileDoc` | `reports/me/review/file-doc/:documentId` | POST |
| `setDocKind` | `reports/me/review/doc-kind/:documentId` | PATCH |
| `uploadDocToTx` | `reports/me/review/upload-doc-to-tx/:transactionId` | POST (multipart) |
| `completeExpenseMapping` | `expenses/:expenseId/complete-mapping` | POST |
| `repointSubCategory` | `bookkeeping/sub-categories/:subCategoryId/account` | PATCH |

### הזרימה הקבוצתית — `bulkApproveSelected` (page.ts)

1. מסנן `queue` = שורות מסומנות (`selected`), לא בטיפול (`saveStatus !== 'pending'`), ניתנות לאישור (`canApprove`).
2. **בדיקת פרה-פליט**: `findSupplierConflicts` מקבצת מועמדים "ספק חדש" לפי `supplierId`; אם קבוצה של 2+ שורות חלוקה על ערכים (קטגוריה/תת-קטגוריה/מע"מ%/מס%/ציוד) שיישמרו בכרטיס הספק (רק השורה הראשונה נשמרת ב-master) — נפתח דיאלוג "התאמת נתוני ספק" והתהליך נעצר עד שהמשתמש פותר.
3. `runBulkQueue` — רץ **סדרתי** (לא מקבילי) על התור, שורה-שורה, כדי למנוע נעילות DB. לכל שורה קורא ל-`approveObsForRow` (בורר לפי `type`), מסמן `saveStatus='pending'`, ובהצלחה מסיר את השורה ומעדכן מונים; בכישלון קורא ל-`applySaveFailure` (מבדיל בין DUPLICATE_WARNING רך להצגת prompt מוטבע, לבין כישלון אמיתי).
4. בסיום — `reportBulkApproveResult` מציג toast מסכם (הצליחו/נכשלו/נותרו), ו-`maybeAutoClose` סוגר וחוזר לדוח אם לא נותרו שורות.

### צד ה-backend — `ReportReviewService.approveMatched` / `approveDocCash` / `approveTxNoDoc`

שלושתן פועלות באותו דפוס כללי, בתוך טרנזקציית DB אחת (`this.dataSource.transaction`):

1. **חסימת D8**: מסמכים בסטטוס `documentKind === ANNUAL_DOCUMENT` נדחים — `BadRequestException('מסמך שנתי — לא הוצאה; יש לתייק אותו לדוח השנתי')`.
2. **פתרון ערכים סופיים**: `override ?? doc/slim value` לכל שדה (קטגוריה, תת-קטגוריה, מע"מ%, מס%). `isEquipment` נשאר `undefined` כשאין override מפורש — כדי לתת לכרטיס הממופה לנצח (ולא לערך ה-OCR/slim הישן).
3. **סכום**: `buildExpenseAmountFromDoc` בונה `{sum, originalCurrency, originalSum}` ממסמכי OCR (תומך FX); override על סכום מתעלם כאשר יש מטבע מקור זר.
4. קורא ל-`expensesService.addExpense(...)` בתוך אותה טרנזקציה (join, לא nested) — יוצר את ההוצאה, מחשב מע"מ/מס/FX.
5. מחשב ומדפיס תקופת דיווח (`sharedService.buildReportPeriodLabel`) — נכתבת **תמיד** על ה-Expense (לא רק ב-override).
6. מעדכן את `ExtractedDocument` (סטטוס→`APPROVED`, `confirmedExpenseId`, `documentKind=EXPENSE_INVOICE`, ואופציונלית `allocationNumber`/`documentType` שנדרסו) ו/או `SlimTransaction` (`confirmed=true`, `vatReportingDate`).
7. `approveMatched` בלבד: מקשקד אישור למסמך המזווג (`doc.pairedWithDocumentId`), אם קיים.

הבדלים ספציפיים:
- `approveMatched` — דורש `doc.matchedTransactionId === slimTransactionId`; משתמש הן ב-`doc` והן ב-`slim/cache`.
- `approveDocCash` — אין תנועת בנק מקושרת; תאריך/סכום ברירת מחדל בטוחים לדריסה תמיד.
- `approveTxNoDoc` — אין מסמך כלל; אין D7 doc context, אין `sourceDocumentId`.

---

## 6. לוגיקת cascade

### `cascadeToSupplierSiblings` (frontend, `report-review.page.ts` שורות 1118–1150) — מלא

```typescript
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
```

**כלל ההתאמה:**

1. **התאמה ראשית**: `supplierId` מנוקה (trim). אם ל-`source` יש `supplierId` — כל אח (`sibling`) שאין לו `supplierId` זהה (אחרי trim) **נפסל**.
2. **fallback**: רק כאשר ל-`source` **אין** `supplierId` בכלל — מתבצעת התאמה לפי שם ספק (`supplier`, מנוקה). האח חייב **גם הוא** להיות ללא `supplierId` **וגם** בעל שם זהה. השילוב הזה מונע דליפת עריכה בין שני ספקים שונים (ח.פ שונה) שבמקרה חולקים שם מותג (למשל שתי חנויות ברשת).
3. שורות `tx_only` ללא `supplierId` וללא `supplier` (`sid && sname` שניהם ריקים) — לא מבצעות cascade כלל (`return` מוקדם).

### היכן זה מופעל — `onEditDialogSave` (page.ts שורות 776–780)

```typescript
    if (draft.applyCascadeToSuppliers) {
      if (entry) this.cascadeToSupplierSiblings(row, (s) => this.applyCatalogRow(s, entry));
      else this.cascadeToSupplierSiblings(row, (s) => this.clearClassification(s, draft.category));
      this.markSupplierTouched(row);
    }
```

- `draft.applyCascadeToSuppliers` — צ'קבוקס "החל סיווג זה גם על שורות זהות בטבלה" בדיאלוג העריכה (`checked` כברירת מחדל — נקבע ב-`openEditDialog`: `applyCascadeToSuppliers: true`).
- כאשר יש `entry` תואם בקטלוג — כל אח מקבל את אותו `applyCatalogRow` (סיווג מלא: קטגוריה/תת-קטגוריה/מע"מ/מס/כרטיס/חתך).
- כאשר אין `entry` (המשתמש בחר טקסט חופשי / ניקה) — כל אח מקבל `clearClassification` (חזרה למצב UNCLASSIFIED, עם שמירת הקטגוריה שנבחרה).
- לאחר ה-cascade, `markSupplierTouched(row)` מוסיף את מזהה קבוצת הספק ל-`highlightedSupplierIds` — כל שורה שחולקת את אותו מזהה מקבלת רקע כחול (`.row-highlighted`) בטבלה, כך שהמשתמש רואה מיידית אילו שורות הושפעו.
- ה-cascade רץ **פעם אחת בלבד**, בזמן Save — לא בכל keystroke בדיאלוג (בניגוד לעריכות inline הישנות).

**חשוב**: ה-cascade הוא לוגיקה client-side בלבד (מתעדכן על ה-`rows` signal); כל שורה מעודכנת נשלחת בנפרד ל-approve עם ה-`overrides` שלה כשהמשתמש בוחר לאשר אותה (אין קריאת שרת אחת ל"cascade" — כל שורה עוברת בעצמאות דרך `approveMatched`/`approveDocCash`/`approveTxNoDoc` משלה).

---

## 7. Action buttons / hover icons

`reviewRowActions: ITableRowAction[]` (page.ts שורות 900–991) — הפעולות המרחפות (hover strip) שמוצגות ע"י `GenericTableComponent` בכל שורה.

| name | icon | title/tooltip | מתי מוצג (`showWhen`) | פעולה (`action`) |
|---|---|---|---|---|
| `edit` | `pi pi-pencil` | ערוך הוצאה | לא ANNUAL וגם לא UNIDENTIFIED | `openEditDialog(row)` — פותח את דיאלוג העריכה |
| `preview` | `pi pi-eye` | צפה במסמך לצד הטבלה | יש `driveFileId` וגם לא ANNUAL | `openPreview(row)` — פותח פאנל תצוגה מקדימה של Drive בצד הטבלה |
| `triage` | `pi pi-question-circle` | מיין — קבע מה המסמך הזה | שורה UNIDENTIFIED שאינה כרגע ב-triage | `startTriage(row)` — פותח דיאלוג "מה המסמך הזה?" (D8) |
| `unpair` | `pi pi-link` | פצל — הפרד בחזרה לחשבונית וקבלה נפרדות | `type !== 'tx_only'` וגם `documentType === 'invoice_receipt_pair'` | `unpairRow(row)` — קורא ל-`unpair` endpoint |
| `upload` | `pi pi-upload` | העלה מסמך חדש — סורק ומקשר לתנועה | `type === 'tx_only'` | `triggerUpload(row)` — פותח את בורר הקבצים המוסתר |
| `link` | `pi pi-link` | קשר למסמך קיים — שייך לאחת השורות מסוג 'מסמך בלבד' | `type === 'tx_only'` וגם יש `doc_only` rows זמינות | `startLink(row)` — פותח דיאלוג "קישור לתנועה" |
| `archive` | `pi pi-inbox` | העבר לארכיון | לא ANNUAL | tx_only → `rejectTx(row)`; אחרת → `archiveDoc(row)` |
| `delete` | `pi pi-trash` | מחק | לא ANNUAL | tx_only → `rejectTx(row)`; אחרת → `deleteRow(row)` |

הערות:
- כפתורי `edit`, `triage`, `unpair`, `upload`, `archive`, `delete` מקבלים `isLoading: () => this.isActioning()` — מוצגים כ-spinner בזמן קריאת שרת פעילה כלשהי (גלובלי ל-כל הטבלה, לא רק לשורה).
- שורות ANNUAL (D8 `documentKind === 'ANNUAL_DOCUMENT'`) לא מקבלות **אף אחת** מהפעולות האלה (למעט אולי preview אם `driveFileId` קיים — נבדק בנפרד) — לפי החלטת מוצר מפורשת: אין שום דבר "קשור לדוח שנתי" מוצג כאן.
- כפתורי `archive`/`delete` על שורת `tx_only` מתנהגים זהה פונקציונלית (שניהם קוראים ל-`rejectTx`) — נשמרו כשני כפתורים נפרדים כדי שהפעולה תמיד תהיה זמינה ויזואלית, למרות החפיפה.
- אין כפתור "אשר" בודד ברשימת ה-hover actions — אישור בודד מתבצע רק דרך אישור-קבוצתי (`bulkApproveSelected`, בפוטר) או retry אוטומטי אחרי "שמור בכל זאת" על שורת duplicate.

---

## סיכום ארכיטקטוני כללי

העמוד `ReportReviewPage` הוא ה-owner היחיד של כל ה-state (rows, קטלוג, viewMode וכו') כ-Angular signals. `GenericTableComponent` מרנדר את השורות דרך `buildColumns()` (שני סטים — regular/professional) עם cell-templates ייעודיים ורצועת פעולות hover (`reviewRowActions`). כל השדות בטבלה עצמה הם **קריאה בלבד** — עריכה מתבצעת אך ורק דרך הפופ-אפ `app-report-review-edit-dialog`, קומפוננטה מבוקרת-לגמרי (fully-controlled) שמקבלת draft (`ExpenseEditFieldValues`) ומשדרת שינויים כלפי מעלה דרך Outputs; ה-Save היחיד שכותב בפועל על ה-row הוא `onEditDialogSave` בעמוד, שגם מפעיל cascade לשורות-אחיות של אותו ספק כברירת מחדל. אין קריאת רשת בזמן העריכה עצמה — רק בזמן אישור. האישור (בודד או קבוצתי) עובר תמיד דרך `report-review.service.ts` (Angular HttpClient) אל שלושת ה-endpoints `approve-matched`/`approve-doc-cash`/`approve-tx-no-doc` עם payload `ReviewOverrides`, ומטופל ב-backend ע"י `ReportReviewService` בטרנזקציית DB אחת שיוצרת Expense (דרך `ExpensesService.addExpense`), מעדכנת את מקור הנתונים (`ExtractedDocument`/`SlimTransaction`) לסטטוס מאושר, ומחשבת/מדפיסה תקופת דיווח.