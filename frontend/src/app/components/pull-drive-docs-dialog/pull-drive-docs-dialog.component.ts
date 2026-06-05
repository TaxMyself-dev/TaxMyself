import { CommonModule } from '@angular/common';
import { Component, computed, inject, input, output, signal, TemplateRef } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { DialogModule } from 'primeng/dialog';
import { MessageService } from 'primeng/api';
import { catchError, EMPTY, finalize } from 'rxjs';

import { PeriodSelectComponent } from '../period-select/period-select.component';
import { ButtonComponent } from '../button/button.component';
import { ButtonColor, ButtonSize } from '../button/button.enum';
import { GenericTableComponent } from '../generic-table/generic-table.component';
import { FormTypes, ReportingPeriodType, VATReportingType } from 'src/app/shared/enums';
import { IColumnDataTable, IRowDataTable } from 'src/app/shared/interface';
import { GenericService } from 'src/app/services/generic.service';
import {
  ConfirmFromDriveItem,
  DriveDocsService,
  DriveSyncRangeResult,
  DuplicateExpenseMatch,
  ReviewableExtractedDoc,
  SubCategoryCatalogEntry,
} from 'src/app/services/drive-docs.service';

interface EditableRow {
  documentId: number;
  driveFileId: string;
  driveFileName: string;
  month: string;
  isMatched: boolean;
  isEquipment: boolean;
  selected: boolean;
  saveAsSupplier: boolean;
  supplier: string;
  supplierID: string;
  allocationNumber: string;
  date: string;          // YYYY-MM-DD
  sum: number;
  category: string;
  subCategory: string;
  vatPercent: number;
  taxPercent: number;
  // Per-row outcome after submit
  saveStatus: null | 'pending' | 'ok' | 'failed';
  saveError: string | null;
  supplierCreated: boolean;
  /** When non-null, overrides the auto-derived period for this row. Sent as
   *  ConfirmFromDriveItem.reportPeriod so the backend stamps vatReportingDate
   *  with the user's choice instead of computing from date. */
  reportPeriodOverride: string | null;
}

@Component({
  selector: 'app-pull-drive-docs-dialog',
  standalone: true,
  templateUrl: './pull-drive-docs-dialog.component.html',
  styleUrls: ['./pull-drive-docs-dialog.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    DialogModule,
    PeriodSelectComponent,
    ButtonComponent,
    GenericTableComponent,
  ],
})
export class PullDriveDocsDialogComponent {
  visible = input.required<boolean>();
  businessNumber = input.required<string>();
  visibleChange = output<boolean>();

  private fb = inject(FormBuilder);
  private driveDocsService = inject(DriveDocsService);
  private messageService = inject(MessageService);
  private sanitizer = inject(DomSanitizer);
  private genericService = inject(GenericService);

  /** VAT reporting type of the business this dialog is operating on — drives
   *  how each row's date is formatted into a report-period label. Falls back
   *  to monthly when the business profile hasn't set one. */
  private vatReportingType = computed<VATReportingType>(() => {
    const bn = this.businessNumber();
    const biz = this.genericService.businesses().find(b => b.businessNumber === bn);
    return biz?.vatReportingType ?? VATReportingType.MONTHLY_REPORT;
  });

  readonly ButtonColor = ButtonColor;
  readonly ButtonSize = ButtonSize;
  readonly allowedPeriodModes = [
    ReportingPeriodType.MONTHLY,
    ReportingPeriodType.BIMONTHLY,
    ReportingPeriodType.ANNUAL,
  ];

  form: FormGroup = this.fb.group({});

  isLoading = signal<boolean>(false);
  isConfirming = signal<boolean>(false);
  syncSummary = signal<DriveSyncRangeResult['totals'] | null>(null);
  rows = signal<EditableRow[]>([]);
  previewRow = signal<EditableRow | null>(null);
  /** Post-save summary — drives the "X expenses added" dialog. */
  savedSummary = signal<{ succeeded: number; failed: number } | null>(null);
  /** Pre-save duplicate matches — drives the "expense already exists" dialog
   *  that blocks confirmSelected() until the user deselects the dupes. */
  duplicateMatches = signal<DuplicateExpenseMatch[] | null>(null);

  /** Sub-category options for the dropdowns — loaded once on submit. */
  catalog = signal<SubCategoryCatalogEntry[]>([]);

  /** Unique sorted category names — populates the category dropdown. */
  categoryOptions = computed<string[]>(() => {
    const seen = new Set<string>();
    for (const c of this.catalog()) seen.add(c.categoryName);
    return Array.from(seen).sort((a, b) => a.localeCompare(b, 'he'));
  });

  /**
   * Sub-categories grouped by parent category, sorted Hebrew. Built once per
   * catalog change so the cascading dropdown lookup is O(1) per render
   * instead of re-filtering the whole catalog every change-detection cycle.
   */
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

  /** Sub-categories filtered by category — used by the cascading dropdown. */
  subCategoriesForCategory(category: string): SubCategoryCatalogEntry[] {
    if (!category) return [];
    return this.subCategoriesByCategory().get(category) ?? [];
  }

  /**
   * Drive's `/preview` URL is meant to be embedded in an iframe but Angular's
   * URL sanitizer strips iframe srcs by default. Mark it as trusted so the
   * iframe binds without crashing into "unsafe value used in a resource URL
   * context".
   */
  previewSafeUrl = computed<SafeResourceUrl | null>(() => {
    const row = this.previewRow();
    if (!row) return null;
    return this.sanitizer.bypassSecurityTrustResourceUrl(
      `https://drive.google.com/file/d/${row.driveFileId}/preview`,
    );
  });

  readonly periodDefaults = {
    periodMode: ReportingPeriodType.MONTHLY,
    year: new Date().getFullYear(),
    month: String(new Date().getMonth() + 1),
  };

  // Derived: are any rows selected?
  selectedCount = computed(() => this.rows().filter(r => r.selected).length);

  onClose(): void {
    this.visibleChange.emit(false);
    this.isLoading.set(false);
    this.isConfirming.set(false);
    this.syncSummary.set(null);
    this.rows.set([]);
    this.previewRow.set(null);
    this.savedSummary.set(null);
    this.duplicateMatches.set(null);
  }

  onSubmit(): void {
    if (this.form.invalid || this.isLoading()) return;
    const businessNumber = this.businessNumber()?.trim();
    if (!businessNumber) {
      this.messageService.add({
        severity: 'warn',
        summary: 'לא נבחר עסק',
        detail: 'יש לבחור עסק במסך ההוצאות לפני המשיכה',
        life: 4000,
        key: 'br',
      });
      return;
    }
    const months = this.periodToMonths();
    // Diagnostic so we can spot UI-vs-form mismatches (e.g. dropdown shows
    // one period but form.value holds another). Remove once stable.
    console.log('[DriveSync] submit', { formValue: this.form.value, months });
    if (months.length === 0) {
      this.messageService.add({
        severity: 'warn',
        summary: 'תקופה לא תקינה',
        detail: 'נא לבחור תקופה לפני המשיכה',
        life: 4000,
        key: 'br',
      });
      return;
    }

    this.isLoading.set(true);
    this.syncSummary.set(null);
    this.rows.set([]);

    // Catalog can load in parallel with sync — it doesn't depend on extraction.
    if (this.catalog().length === 0) {
      this.driveDocsService.getMySubCategoryCatalog(businessNumber)
        .pipe(catchError(() => EMPTY))
        .subscribe(catalog => this.catalog.set(catalog));
    }

    this.driveDocsService.syncMyDriveMonths(businessNumber, months)
      .pipe(
        catchError(err => {
          const detail = err?.error?.message ?? err?.message ?? 'הסינכרון נכשל';
          this.messageService.add({ severity: 'error', summary: 'שגיאה', detail, life: 5000, key: 'br' });
          this.isLoading.set(false);
          return EMPTY;
        }),
      )
      .subscribe(syncResult => {
        this.syncSummary.set(syncResult.totals);
        this.driveDocsService.getMyReviewableDocs(businessNumber, months)
          .pipe(
            catchError(err => {
              const detail = err?.error?.message ?? err?.message ?? 'טעינת המסמכים נכשלה';
              this.messageService.add({ severity: 'error', summary: 'שגיאה', detail, life: 5000, key: 'br' });
              return EMPTY;
            }),
            finalize(() => this.isLoading.set(false)),
          )
          .subscribe(docs => this.rows.set(this.sortBySupplier(docs.map(d => this.toEditableRow(d)))));
      });
  }

  /**
   * Convert a backend row into the local editable shape — pre-fills any fields
   * we have data for. Matched supplier overrides the OCR'd supplier name
   * (matching is on supplier id, so the canonical name in the supplier table
   * is more authoritative than the Claude extraction).
   */
  private toEditableRow(d: ReviewableExtractedDoc): EditableRow {
    const matched = d.matchedSupplier;
    // Matched supplier values take precedence; Claude's extraction is the
    // fallback for unmatched rows. Sub-category / tax% / vat% / isEquipment
    // all flow through this same hierarchy.
    return {
      documentId: d.id,
      driveFileId: d.driveFileId,
      driveFileName: d.driveFileName,
      month: d.month,
      isMatched: !!matched,
      // Equipment-ness is a property of the sub-category, NOT of the supplier.
      // Old supplier rows may have stale isEquipment=false; trust the extracted
      // value from Claude (which looked it up from the canonical catalog).
      isEquipment: d.isEquipment ?? matched?.isEquipment ?? false,
      selected: true,                // default-selected, user can uncheck
      saveAsSupplier: !matched,      // default ON for unknown suppliers
      supplier: matched?.supplier ?? d.supplier ?? '',
      supplierID: matched?.supplierID ?? d.supplierId ?? '',
      allocationNumber: d.allocationNumber ?? '',
      date: d.date ?? '',
      sum: d.amount != null ? Number(d.amount) : 0,
      category: matched?.category ?? d.category ?? '',
      subCategory: matched?.subCategory ?? d.subCategory ?? '',
      vatPercent: matched?.vatPercent != null ? Number(matched.vatPercent)
                : d.vatPercent != null ? Number(d.vatPercent)
                : 0,
      taxPercent: matched?.taxPercent != null ? Number(matched.taxPercent)
                : d.taxPercent != null ? Number(d.taxPercent)
                : 0,
      saveStatus: null,
      saveError: null,
      supplierCreated: false,
      reportPeriodOverride: null,
    };
  }

  /**
   * Triggered when user changes the category dropdown. Clears the sub-category
   * (and its dependent fields) because the prior sub-category may not belong
   * to the newly picked category.
   */
  onCategoryChange(row: EditableRow, picked: string): void {
    row.category = picked;
    row.subCategory = '';
    row.vatPercent = 0;
    row.taxPercent = 0;
    row.isEquipment = false;
    this.propagateClassificationToSameSupplier(row);
    this.onRowFieldChange();
  }

  /**
   * Triggered when user picks a sub-category from the dropdown. Cascades the
   * canonical values (parent category, vat%, tax%, isEquipment) from the
   * catalog onto the row, so the user can't accidentally save inconsistent
   * combos (e.g., a "מחשב נייד" sub-category as a non-equipment expense).
   */
  onSubCategoryChange(row: EditableRow, picked: string): void {
    if (!picked) {
      row.subCategory = '';
      this.onRowFieldChange();
      return;
    }
    // The sub-category dropdown only shows items in the picked category, but
    // a lookup is still safer than trusting the option text.
    const entry = this.catalog().find(c => c.subCategoryName === picked && c.categoryName === row.category)
      ?? this.catalog().find(c => c.subCategoryName === picked);
    if (!entry) {
      row.subCategory = picked;
      this.onRowFieldChange();
      return;
    }
    row.subCategory = entry.subCategoryName;
    row.category = entry.categoryName;
    row.vatPercent = Number(entry.vatPercent);
    row.taxPercent = Number(entry.taxPercent);
    row.isEquipment = !!entry.isEquipment;
    this.propagateClassificationToSameSupplier(row);
    this.onRowFieldChange();
  }

  /**
   * When a row's classification (category / sub-category and the derived
   * vat%/tax%/isEquipment) changes, mirror it onto every other row that shares
   * the same supplier — typing the category once for "ספק X" should fill in
   * the rest of "ספק X"'s invoices in the same batch. Matched first by
   * supplierID (tax-id is canonical), then by trimmed supplier name as a
   * fallback for un-IDed suppliers.
   */
  private propagateClassificationToSameSupplier(source: EditableRow): void {
    const key = this.supplierKey(source);
    if (!key) return;
    this.rows.update(rs => rs.map(r => {
      if (r.documentId === source.documentId) return r;
      if (this.supplierKey(r) !== key) return r;
      r.category = source.category;
      r.subCategory = source.subCategory;
      r.vatPercent = source.vatPercent;
      r.taxPercent = source.taxPercent;
      r.isEquipment = source.isEquipment;
      return r;
    }));
  }

  private supplierKey(row: EditableRow): string {
    const id = row.supplierID?.trim();
    if (id) return `id:${id}`;
    const name = row.supplier?.trim().toLowerCase();
    if (name) return `name:${name}`;
    return '';
  }

  /** Group rows so all invoices from the same supplier appear together. */
  private sortBySupplier(rows: EditableRow[]): EditableRow[] {
    return [...rows].sort((a, b) =>
      (a.supplier || '').localeCompare(b.supplier || '', 'he'));
  }

  /**
   * Format a row's `YYYY-MM-DD` date into the business's VAT report-period
   * label. Mirrors the backend's `buildReportPeriodLabel()` so what's shown
   * here matches what gets stamped on the saved expense:
   *   MONTHLY_REPORT     → "M/YYYY"           e.g. "3/2026"
   *   DUAL_MONTH_REPORT  → "M1-M2/YYYY"       e.g. "3-4/2026" (pair starts on
   *                                            the odd month)
   * Returns "—" when the date is missing/unparseable.
   */
  formatReportPeriod(date: string | null | undefined): string {
    if (!date) return '—';
    const [yStr, mStr] = date.split('-');
    const year = Number(yStr);
    const month = Number(mStr);
    if (!year || !month || month < 1 || month > 12) return '—';

    if (this.vatReportingType() === VATReportingType.DUAL_MONTH_REPORT) {
      const start = month % 2 === 1 ? month : month - 1;
      return `${start}-${start + 1}/${year}`;
    }
    return `${month}/${year}`;
  }

  /** The effective period for a row — manual override wins, else derived. */
  effectiveReportPeriod(row: EditableRow): string {
    return row.reportPeriodOverride?.trim() || this.formatReportPeriod(row.date);
  }

  /**
   * Dropdown options for the period column. Lists all 12 (monthly) or 6
   * (bi-monthly) labels for the row's year, so the user can pick any
   * in-year period — typical case is shifting a late-arriving invoice into
   * the previous period. Cross-year corrections still require editing the
   * date field (deliberately scoped to keep the dropdown short).
   */
  periodOptionsForRow(row: EditableRow): string[] {
    const year = this.yearOfRow(row);
    const dual = this.vatReportingType() === VATReportingType.DUAL_MONTH_REPORT;
    if (dual) {
      return [1, 3, 5, 7, 9, 11].map(m => `${m}-${m + 1}/${year}`);
    }
    return Array.from({ length: 12 }, (_, i) => `${i + 1}/${year}`);
  }

  /** Pull the row's year off the date, falling back to the current calendar
   *  year so the dropdown still has sane options for date-less rows. */
  private yearOfRow(row: EditableRow): number {
    const fromDate = Number((row.date || '').split('-')[0]);
    if (fromDate) return fromDate;
    const fromOverride = Number((row.reportPeriodOverride || '').split('/').pop());
    if (fromOverride) return fromOverride;
    return new Date().getFullYear();
  }

  /** User picked a period from the dropdown. Store as override only when it
   *  differs from the auto-derived value — that way unchanged rows omit the
   *  override field from the payload and the backend keeps its date-driven
   *  default behavior. */
  onReportPeriodChange(row: EditableRow, picked: string): void {
    const derived = this.formatReportPeriod(row.date);
    row.reportPeriodOverride = picked && picked !== derived ? picked : null;
    this.onRowFieldChange();
  }

  isRowProblematic(row: EditableRow): boolean {
    return (
      !row.supplier?.trim()
      || !row.date
      || !(row.sum > 0)
      || !row.subCategory?.trim()
    );
  }

  toggleAll(checked: boolean): void {
    this.rows.update(rs => rs.map(r => ({ ...r, selected: checked })));
  }

  onRowFieldChange(): void {
    // Trigger signal update so derived computeds re-evaluate.
    this.rows.update(rs => [...rs]);
  }

  confirmSelected(): void {
    const selected = this.rows().filter(r => r.selected);
    if (selected.length === 0) {
      this.messageService.add({
        severity: 'warn',
        summary: 'לא נבחר',
        detail: 'יש לבחור לפחות שורה אחת לאישור',
        life: 4000,
        key: 'br',
      });
      return;
    }

    // Quick client-side validation: required fields per row
    const invalid = selected.find(r =>
      !r.supplier?.trim() || !r.category?.trim() || !r.subCategory?.trim()
      || !r.date || !(r.sum > 0),
    );
    if (invalid) {
      this.messageService.add({
        severity: 'warn',
        summary: 'שדות חסרים',
        detail: `שורה "${invalid.driveFileName}" — נא למלא ספק, קטגוריה, תת קטגוריה, תאריך וסכום`,
        life: 6000,
        key: 'br',
      });
      return;
    }

    // Pre-flight: ask the backend whether any of the selected rows already
    // exist as expenses (same supplier+sum+date). Block the save and show a
    // dialog if so — user must deselect the duplicates and re-submit. This is
    // a deliberate hard-stop rather than a "save anyway" toggle because the
    // typical cause is a user re-running extraction over a folder they already
    // confirmed once.
    this.isConfirming.set(true);
    this.driveDocsService.checkDuplicatesFromDrive(
      this.businessNumber(),
      selected.map(r => ({
        documentId: r.documentId,
        supplier: r.supplier.trim(),
        sum: Number(r.sum),
        date: r.date,
      })),
    )
      .pipe(
        catchError(err => {
          const detail = err?.error?.message ?? err?.message ?? 'בדיקת כפילויות נכשלה';
          this.messageService.add({ severity: 'error', summary: 'שגיאה', detail, life: 5000, key: 'br' });
          this.isConfirming.set(false);
          return EMPTY;
        }),
      )
      .subscribe(matches => {
        if (matches.length > 0) {
          this.duplicateMatches.set(matches);
          this.isConfirming.set(false);
          return;
        }
        this.submitSelected(selected);
      });
  }

  /**
   * Actual bulk-confirm call. Split out from confirmSelected() so the
   * duplicate-check pre-flight can short-circuit before we mark rows pending.
   */
  private submitSelected(selected: EditableRow[]): void {
    const items: ConfirmFromDriveItem[] = selected.map(r => ({
      documentId: r.documentId,
      supplier: r.supplier.trim(),
      supplierID: r.supplierID?.trim() || null,
      date: r.date,
      sum: Number(r.sum),
      category: r.category.trim(),
      subCategory: r.subCategory.trim(),
      vatPercent: Number(r.vatPercent),
      taxPercent: Number(r.taxPercent),
      isEquipment: !!r.isEquipment,
      saveAsSupplier: !!r.saveAsSupplier && !!r.supplierID?.trim(),
      // Only send override when the user actually picked a non-default value;
      // otherwise let the backend derive it from date + business cadence.
      reportPeriod: r.reportPeriodOverride?.trim() || null,
    }));

    // Mark selected rows as pending
    this.rows.update(rs => rs.map(r => r.selected ? { ...r, saveStatus: 'pending', saveError: null } : r));
    this.isConfirming.set(true);

    this.driveDocsService.bulkConfirmFromDrive(this.businessNumber(), items)
      .pipe(
        catchError(err => {
          const detail = err?.error?.message ?? err?.message ?? 'אישור ההוצאות נכשל';
          this.messageService.add({ severity: 'error', summary: 'שגיאה', detail, life: 5000, key: 'br' });
          // Revert pending status
          this.rows.update(rs => rs.map(r => r.saveStatus === 'pending' ? { ...r, saveStatus: null } : r));
          this.isConfirming.set(false);
          return EMPTY;
        }),
      )
      .subscribe(response => {
        const byId = new Map(response.results.map(r => [r.documentId, r]));
        this.rows.update(rs =>
          rs
            .map(r => {
              const outcome = byId.get(r.documentId);
              if (!outcome) return r;
              return {
                ...r,
                saveStatus: outcome.ok ? 'ok' : 'failed',
                saveError: outcome.error ?? null,
                supplierCreated: !!outcome.supplierCreated,
              } as EditableRow;
            })
            // Successful rows fall out of the list — they're now expenses, no
            // longer pending review (matches the server's confirmedExpenseId filter).
            .filter(r => r.saveStatus !== 'ok'),
        );
        // If we were previewing a row that just got confirmed, close the preview.
        const previewing = this.previewRow();
        if (previewing) {
          const outcome = byId.get(previewing.documentId);
          if (outcome?.ok) this.previewRow.set(null);
        }
        this.isConfirming.set(false);

        const { succeeded, failed } = response.summary;
        if (succeeded > 0) {
          // Persistent dialog (instead of a toast) so the user sees exactly
          // how many expenses landed — toast can be missed mid-scroll on a
          // long list.
          this.savedSummary.set({ succeeded, failed });
        } else if (failed > 0) {
          this.messageService.add({
            severity: 'error',
            summary: 'שגיאה',
            detail: `${failed} שורות נכשלו — ראה פירוט בשורה`,
            life: 6000,
            key: 'br',
          });
        }
      });
  }

  closeSavedSummary(): void {
    // Dismiss the count dialog AND the parent Drive-docs dialog — once the
    // user has acknowledged how many expenses were saved, they expect to land
    // back on the expenses tab, not on the (now-emptier) extraction list.
    this.savedSummary.set(null);
    this.onClose();
  }

  closeDuplicates(): void {
    this.duplicateMatches.set(null);
  }

  /** Convenience action from the duplicate dialog — uncheck every selected
   *  row that the backend flagged as already existing, so the user can hit
   *  "confirm" again without having to find them in the table. */
  deselectDuplicates(): void {
    const matches = this.duplicateMatches();
    if (!matches?.length) return;
    const dupeIds = new Set(matches.map(m => m.documentId));
    this.rows.update(rs => rs.map(r =>
      dupeIds.has(r.documentId) ? { ...r, selected: false } : r,
    ));
    this.duplicateMatches.set(null);
  }

  togglePreview(row: EditableRow): void {
    // Click same row again → close preview.
    const current = this.previewRow();
    this.previewRow.set(current?.documentId === row.documentId ? null : row);
  }

  closePreview(): void {
    this.previewRow.set(null);
  }

  // Open in a new browser tab — fallback when the embedded iframe can't load
  // (e.g. user logged into Drive with the wrong Google account).
  openInNewTab(fileId: string): void {
    window.open(`https://drive.google.com/file/d/${fileId}/view`, '_blank', 'noopener');
  }

  // ============================================================
  // Generic-table integration
  // ============================================================

  /** Single shared handler so every editable column can opt into re-emitting
   *  the rows signal — needed for `selectedCount`, `isRowProblematic`-driven
   *  row classes, etc. to recompute when an inline edit changes a field. */
  private readonly fieldChangeHandler = (): void => this.onRowFieldChange();

  /** Per-row CSS class callback for <app-generic-table [rowClass]="rowClassFn">.
   *  Drives the row background: red for any actionable issue (missing required
   *  fields or save-failed), green for a known/matched supplier, yellow for a
   *  brand-new supplier the user is about to create. Error wins over
   *  known/new so the user's eye lands on the rows that block confirmation. */
  rowClassFn = (row: IRowDataTable): string => {
    const r = row as unknown as EditableRow;
    const classes: string[] = [];
    const hasError = r.saveStatus === 'failed' || this.isRowProblematic(r);
    if (hasError) classes.push('row-error');
    else if (r.isMatched) classes.push('row-known');
    else classes.push('row-new');
    if (r.isEquipment) classes.push('equipment');
    return classes.join(' ');
  };

  /** Built once per pair of (template refs, catalog) changes and cached so
   *  generic-table doesn't see a new array reference on every CD cycle
   *  (which would churn its inputs and re-run downstream computeds). */
  private columnsCache: { tpls: TemplateRef<any>[]; cols: IColumnDataTable<string, string>[] } | null = null;

  buildColumns(
    previewCellTpl: TemplateRef<any>,
    categoryCellTpl: TemplateRef<any>,
    subCategoryCellTpl: TemplateRef<any>,
    statusCellTpl: TemplateRef<any>,
    reportPeriodCellTpl: TemplateRef<any>,
  ): IColumnDataTable<string, string>[] {
    const tpls = [previewCellTpl, categoryCellTpl, subCategoryCellTpl, statusCellTpl, reportPeriodCellTpl];
    if (this.columnsCache && tpls.every((t, i) => this.columnsCache!.tpls[i] === t)) {
      return this.columnsCache.cols;
    }
    const cols: IColumnDataTable<string, string>[] = [
      // 1) row selection — built-in editable checkbox, fires onChange so the
      //    `selectedCount` computed re-evaluates.
      { name: 'selected', value: '', type: FormTypes.CHECKBOX, editable: true,
        width: '36px', onChange: this.fieldChangeHandler },
      // 2) preview button — cellTemplate keeps the button visible inline
      //    (rowActions would render as floating hover-actions instead).
      { name: 'preview', value: '', cellTemplate: previewCellTpl, width: '36px' },
      // 3) read-only filename
      { name: 'driveFileName', value: 'קובץ' },
      // 4–6) plain text editors
      { name: 'supplier', value: 'שם ספק *', type: FormTypes.TEXT, editable: true,
        onChange: this.fieldChangeHandler },
      { name: 'supplierID', value: 'מס׳ עוסק', type: FormTypes.TEXT, editable: true,
        onChange: this.fieldChangeHandler },
      { name: 'allocationNumber', value: 'מס׳ הקצאה', type: FormTypes.TEXT, editable: true },
      // 7) date editor
      { name: 'date', value: 'תאריך *', type: FormTypes.DATE, editable: true,
        onChange: this.fieldChangeHandler },
      // 7b) derived VAT report period — read-only, computed from row.date via
      //     formatReportPeriod() so it re-evaluates whenever the date is edited.
      { name: 'reportPeriod', value: 'תקופת דיווח', cellTemplate: reportPeriodCellTpl, width: '90px' },
      // 8) sum editor (right-aligned via .cell-editable--num)
      { name: 'sum', value: 'סכום *', type: FormTypes.NUMBER, editable: true,
        onChange: this.fieldChangeHandler },
      // 9–10) cascading category/sub-category — need cellTemplate because the
      //       built-in DDL editor doesn't support cascading or per-row option lists.
      { name: 'category', value: 'קטגוריה *', cellTemplate: categoryCellTpl },
      { name: 'subCategory', value: 'תת קטגוריה *', cellTemplate: subCategoryCellTpl },
      // 11–12) plain number editors
      { name: 'vatPercent', value: '% מע״מ', type: FormTypes.NUMBER, editable: true },
      { name: 'taxPercent', value: '% מס', type: FormTypes.NUMBER, editable: true },
      // 13) supplier-status column — known/new badge + (new only) save-supplier
      //     checkbox + equipment icon. Save-time states (pending/failed) take
      //     over the cell entirely. Standalone שמור-כספק column folded in here.
      { name: 'status', value: 'סטטוס ספק', cellTemplate: statusCellTpl, width: '150px' },
    ];
    this.columnsCache = { tpls, cols };
    return cols;
  }

  private periodToMonths(): string[] {
    const v = this.form.value as {
      periodMode?: ReportingPeriodType;
      year?: number | string;
      month?: number | string;
    };
    const mode = v.periodMode;
    const year = Number(v.year);
    if (!year || !Number.isFinite(year)) return [];

    if (mode === ReportingPeriodType.MONTHLY) {
      const m = Number(v.month);
      if (!m) return [];
      return [`${year}-${String(m).padStart(2, '0')}`];
    }
    if (mode === ReportingPeriodType.BIMONTHLY) {
      const first = Number(v.month);
      if (!first) return [];
      return [
        `${year}-${String(first).padStart(2, '0')}`,
        `${year}-${String(first + 1).padStart(2, '0')}`,
      ];
    }
    if (mode === ReportingPeriodType.ANNUAL) {
      return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
    }
    return [];
  }
}
