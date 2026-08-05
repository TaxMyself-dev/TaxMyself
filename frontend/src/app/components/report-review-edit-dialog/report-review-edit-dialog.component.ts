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
