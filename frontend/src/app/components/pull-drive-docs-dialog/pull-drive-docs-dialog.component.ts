import { CommonModule } from '@angular/common';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { DialogModule } from 'primeng/dialog';
import { MessageService } from 'primeng/api';
import { catchError, EMPTY, finalize } from 'rxjs';

import { PeriodSelectComponent } from '../period-select/period-select.component';
import { ButtonComponent } from '../button/button.component';
import { ButtonColor, ButtonSize } from '../button/button.enum';
import { ReportingPeriodType } from 'src/app/shared/enums';
import {
  ConfirmFromDriveItem,
  DriveDocsService,
  DriveSyncRangeResult,
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
          .subscribe(docs => this.rows.set(docs.map(d => this.toEditableRow(d))));
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
          this.messageService.add({
            severity: 'success',
            summary: 'הצלחה',
            detail: `נשמרו ${succeeded} הוצאות${failed > 0 ? `, ${failed} נכשלו` : ''}`,
            life: 5000,
            key: 'br',
          });
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
