import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';

import { ButtonComponent } from '../button/button.component';
import { ButtonColor, ButtonSize } from '../button/button.enum';

/**
 * Field values edited by this dialog — mirrors the Supplier entity
 * (backend/src/expenses/suppliers.entity.ts), not any one review row's
 * current classification. Deliberately generic, same reasoning as
 * ExpenseEditFieldValues in report-review-edit-dialog: no report-review-
 * specific types leak in here.
 */
export interface SupplierDraft {
  supplier: string;
  supplierID: string;
  category: string;
  subCategory: string;
  subCategoryId: number | null;
  vatPercent: number;
  taxPercent: number;
  reductionPercent: number;
  isEquipment: boolean;
}

/**
 * Presentational, fully-controlled supplier create/edit dialog — same
 * pattern as ReportReviewEditDialogComponent: holds no state of its own
 * beyond what's passed in via `fields`. The caller owns the draft; every
 * edit is relayed upward via the Outputs below and the caller recomputes
 * `fields` and passes it back down.
 */
@Component({
  selector: 'app-supplier-management-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, DialogModule, ButtonComponent],
  templateUrl: './supplier-management-dialog.component.html',
  styleUrls: ['./supplier-management-dialog.component.scss'],
})
export class SupplierManagementDialogComponent {
  readonly ButtonColor = ButtonColor;
  readonly ButtonSize = ButtonSize;

  @Input() visible = false;
  @Input() mode: 'create' | 'edit' = 'create';
  @Input() titleLabel = '';
  @Input() fields: SupplierDraft | null = null;
  @Input() categoryOptions: string[] = [];
  /** Pre-filtered by the caller for the current fields.category. */
  @Input() subCategoryOptions: string[] = [];
  @Input() isSaving = false;
  /** Non-null while the caller is running the post-save supplier cascade
   *  (updating every other row sharing this supplier) — e.g. "מעדכן 3/12
   *  שורות...". Replaces the footer buttons with this text and blocks
   *  Cancel/Save until the cascade finishes. */
  @Input() progressLabel: string | null = null;

  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() save = new EventEmitter<void>();
  @Output() categoryChange = new EventEmitter<string>();
  @Output() subCategoryChange = new EventEmitter<string>();
  /** Generic patch for every field with no cascade/resolution side-effect
   *  (supplier, supplierID, vatPercent, taxPercent, reductionPercent,
   *  isEquipment — the caller zeroes taxPercent/reductionPercent as
   *  appropriate when isEquipment flips, same rule as AddSupplierComponent). */
  @Output() fieldsChange = new EventEmitter<Partial<SupplierDraft>>();
}
