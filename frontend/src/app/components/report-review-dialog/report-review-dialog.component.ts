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
import {
  DriveDocsService,
  SubCategoryCatalogEntry,
} from 'src/app/services/drive-docs.service';
import { FormTypes, ICellRenderer, VATReportingType } from 'src/app/shared/enums';
import { IColumnDataTable, IRowDataTable } from 'src/app/shared/interface';
import {
  ReportPreviewResponse,
  ReportReviewService,
  ReviewOverrides,
  ReviewRow,
} from 'src/app/services/report-review.service';

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

  // Editable classification — initially populated from doc-side (matched,
  // doc_only) or slim-side (tx_only). User can change inline before approve.
  category: string;
  subCategory: string;
  vatPercent: number;
  taxPercent: number;
  isEquipment: boolean;

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
  private driveDocsService = inject(DriveDocsService);
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

  /** Sub-category catalog — populates the cascading dropdowns. Same source
   *  as PullDriveDocsDialog uses. Loaded once per dialog open. */
  catalog = signal<SubCategoryCatalogEntry[]>([]);

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
    for (const c of this.catalog()) seen.add(c.categoryName);
    return Array.from(seen).sort((a, b) => a.localeCompare(b, 'he'));
  });

  /** Sub-categories grouped by parent — O(1) lookup per render. */
  private subCategoriesByCategory = computed<Map<string, SubCategoryCatalogEntry[]>>(() => {
    const out = new Map<string, SubCategoryCatalogEntry[]>();
    for (const c of this.catalog()) {
      const list = out.get(c.categoryName) ?? [];
      list.push(c);
      out.set(c.categoryName, list);
    }
    for (const list of out.values()) {
      list.sort((a, b) => a.subCategoryName.localeCompare(b.subCategoryName, 'he'));
    }
    return out;
  });

  /** Doc_only rows — feeds the link picker dropdown on tx_only rows. */
  docOnlyRows = computed<EditableReviewRow[]>(() =>
    this.rows().filter(r => r.type === 'doc_only'),
  );

  constructor() {
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
    this.driveDocsService.getMySubCategoryCatalog(bn)
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
    const category    = docSide?.category    ?? txSide?.category    ?? '';
    const subCategory = docSide?.subCategory ?? txSide?.subCategory ?? '';
    const vatPercent  = Number(docSide?.vatPercent  ?? txSide?.vatPercent  ?? 0);
    const taxPercent  = Number(docSide?.taxPercent  ?? txSide?.taxPercent  ?? 0);
    const isEquipment = !!(docSide?.isEquipment ?? txSide?.isEquipment ?? false);

    return {
      rowKey: `${r.type}:${docSide?.documentId ?? 'x'}:${txSide?.slimTransactionId ?? 'x'}`,
      type: r.type,
      // Default-checked per spec (V = ✓). User unchecks to skip bulk approve.
      selected: true,
      documentId: docSide?.documentId ?? null,
      slimTransactionId: txSide?.slimTransactionId ?? null,
      driveFileId: docSide?.driveFileId ?? '',
      driveFileName: docSide?.driveFileName ?? '',
      invoiceNumber: docSide?.invoiceNumber ?? '',
      allocationNumber: docSide?.allocationNumber ?? '',
      documentTypeLabel: this.documentTypeLabel(docSide?.documentType ?? null),
      documentType: docSide?.documentType ?? null,
      supplier,
      supplierId: docSide?.supplierId ?? '',
      date,
      amount,
      sumLabel,
      currency,
      ilsAmount,
      category,
      subCategory,
      vatPercent,
      taxPercent,
      isEquipment,
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

  subCategoriesForCategory(cat: string): SubCategoryCatalogEntry[] {
    if (!cat) return [];
    return this.subCategoriesByCategory().get(cat) ?? [];
  }

  /** Category changed — clear sub-category + derived fields. The user
   *  must repick a sub-category (which then cascades VAT%/tax%/isEquipment
   *  back onto the row). Matches PullDriveDocsDialog behavior.
   *  Cascade: every other row sharing this supplierId picks up the same
   *  category change. User's stated intent — "all my Bezeq invoices are
   *  the same category". Touched siblings are visually highlighted (blue)
   *  via the existing markSupplierTouched + row-highlighted class. */
  onCategoryChange(row: EditableReviewRow, picked: string): void {
    row.category = picked;
    row.subCategory = '';
    row.vatPercent = 0;
    row.taxPercent = 0;
    row.isEquipment = false;
    this.cascadeToSupplierSiblings(row, (s) => {
      s.category = picked;
      s.subCategory = '';
      s.vatPercent = 0;
      s.taxPercent = 0;
      s.isEquipment = false;
    });
    this.markSupplierTouched(row);
    this.bumpRows();
  }

  /** Sub-category changed — cascade the catalog's canonical values onto
   *  the row so the resulting Expense gets consistent VAT/tax/equipment
   *  values from the same catalog entry. Same supplier-sibling cascade
   *  as onCategoryChange: change one Bezeq invoice's sub-category, every
   *  Bezeq invoice in the table picks it up. */
  onSubCategoryChange(row: EditableReviewRow, picked: string): void {
    if (!picked) {
      row.subCategory = '';
      this.cascadeToSupplierSiblings(row, (s) => { s.subCategory = ''; });
      this.markSupplierTouched(row);
      this.bumpRows();
      return;
    }
    const entry = this.catalog().find(c => c.subCategoryName === picked && c.categoryName === row.category)
      ?? this.catalog().find(c => c.subCategoryName === picked);
    if (entry) {
      row.subCategory = entry.subCategoryName;
      row.category = entry.categoryName;
      row.vatPercent = Number(entry.vatPercent);
      row.taxPercent = Number(entry.taxPercent);
      row.isEquipment = !!entry.isEquipment;
      this.cascadeToSupplierSiblings(row, (s) => {
        s.subCategory = entry.subCategoryName;
        s.category = entry.categoryName;
        s.vatPercent = Number(entry.vatPercent);
        s.taxPercent = Number(entry.taxPercent);
        s.isEquipment = !!entry.isEquipment;
      });
    } else {
      row.subCategory = picked;
      this.cascadeToSupplierSiblings(row, (s) => { s.subCategory = picked; });
    }
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

  /** Hebrew description used as the tooltip for the status icon. */
  statusTooltipFor(type: EditableReviewRow['type']): string {
    switch (type) {
      case 'matched':  return 'מסמך הותאם לתנועת בנק';
      case 'doc_only': return 'מסמך בלבד - לא נמצאה תנועה מתאימה';
      case 'tx_only':  return 'תנועת בנק בלבד - לא נמצא מסמך מתאים';
    }
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
   *  CD cycle. Same pattern PullDriveDocsDialog uses. */
  private columnsCache: { tpls: TemplateRef<any>[]; cols: IColumnDataTable<string, string>[] } | null = null;

  buildColumns(
    categoryCellTpl: TemplateRef<any>,
    subCategoryCellTpl: TemplateRef<any>,
    periodCellTpl: TemplateRef<any>,
    supplierCellTpl: TemplateRef<any>,
    statusIconCellTpl: TemplateRef<any>,
    actionsCellTpl: TemplateRef<any>,
  ): IColumnDataTable<string, string>[] {
    const tpls = [categoryCellTpl, subCategoryCellTpl, periodCellTpl, supplierCellTpl, statusIconCellTpl, actionsCellTpl];
    if (this.columnsCache && tpls.every((t, i) => this.columnsCache!.tpls[i] === t)) {
      return this.columnsCache.cols;
    }
    // Column order:
    //   1 checkbox · 2 supplier (name + new-supplier icon) · 3 supplier-id ·
    //   4 doc-type · 5 doc-number · 6 date · 7 sum · 8 category ·
    //   9 sub-category · 10 vat% · 11 tax% · 12 period · 13 status-icon ·
    //   14 actions
    // The old "ספק חדש/מוכר" chip column (was #14) is gone — the new-supplier
    // signal now lives as an icon next to the supplier name (#2). The
    // matched-type label column (was #13) is now an icon-only column.
    const cols: IColumnDataTable<string, string>[] = [
      { name: 'selected', value: '', type: FormTypes.CHECKBOX, editable: true,
        width: '50px', onChange: this.fieldChangeHandler },
      // Supplier name + "ספק חדש" icon when matchedSupplierKnown is false.
      { name: 'supplier', value: 'ספק', cellTemplate: supplierCellTpl, width: '210px' },
      { name: 'supplierId', value: 'מס׳ עוסק', width: '110px' },
      // Widened from 90px → 140px so "חשבונית + קבלה" (the longest label
      // after pairing was added) fits on one line without truncation.
      { name: 'documentTypeLabel', value: 'סוג', width: '140px' },
      // Bumped to 200px — invoice numbers like "01020566646-043005-26" (~18 chars)
      // were overflowing 165px and visually bleeding into the date column.
      { name: 'invoiceNumber', value: 'מס׳ חשבונית', width: '200px' },
      // New column: Israeli tax allocation number (מספר הקצאה / Confirmation
      // Number). Surfaced separately so the user can see at a glance whether
      // a high-value invoice carries the legally-required allocation number
      // before approving it. 120px is comfortable for the canonical 9-digit
      // value (normalizeAllocationNumber in documents.service.ts truncates
      // anything longer to the rightmost 9 digits).
      { name: 'allocationNumber', value: 'מס׳ הקצאה', width: '120px' },
      { name: 'date', value: 'תאריך', width: '115px' },
      { name: 'sumLabel', value: 'סכום', cellRenderer: ICellRenderer.SUM_WITH_FX, width: '110px' },
      { name: 'category', value: 'קטגוריה', cellTemplate: categoryCellTpl, width: '125px' },
      { name: 'subCategory', value: 'תת קטגוריה', cellTemplate: subCategoryCellTpl, width: '140px' },
      { name: 'vatPercent', value: '% מע״מ', type: FormTypes.NUMBER, editable: true, width: '85px' },
      { name: 'taxPercent', value: '% מס',   type: FormTypes.NUMBER, editable: true, width: '85px' },
      { name: 'reportPeriod', value: 'תקופה', cellTemplate: periodCellTpl, width: '105px' },
      // Status — icon only. Was a wide text label ("מסמך + תנועה"); the
      // tooltip on the icon carries the same meaning. Narrower to match.
      { name: 'matchedTypeLabel', value: 'סטטוס', cellTemplate: statusIconCellTpl, width: '70px' },
      { name: 'actions', value: 'פעולות', cellTemplate: actionsCellTpl, width: '90px' },
    ];
    this.columnsCache = { tpls, cols };
    return cols;
  }

  /** Shared change handler for editable cells — re-emits the rows signal
   *  so derived computeds (selectedCount, bulk-approve disabled state)
   *  refresh. Same pattern PullDriveDocsDialog uses. */
  private readonly fieldChangeHandler = (): void => this.bumpRows();

  /** Count of rows the user wants in the bulk approve. Drives the footer
   *  button's label + disabled state. */
  selectedCount = computed<number>(() =>
    this.rows().filter(r => r.selected).length,
  );

  /** "Select all" toggle for the footer. Updates every row's selected
   *  flag in one signal write. */
  toggleAll(checked: boolean): void {
    this.rows.update(rs => rs.map(r => ({ ...r, selected: checked })));
  }

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
    const queue = this.rows().filter(r => r.selected && r.saveStatus !== 'pending');
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
    const obs$ =
      row.type === 'matched' && row.documentId && row.slimTransactionId
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
