import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectButton } from 'primeng/selectbutton';

import { ButtonComponent } from '../button/button.component';
import { InputTextComponent } from '../input-text/input-text.component';
import { SegmentedControlComponent } from '../segmented-control/segmented-control.component';
import { ButtonSize, ButtonColor } from '../button/button.enum';
import { FieldsCreateDocValue, inputsSize, VatType } from 'src/app/shared/enums';
import { PartialLineItem } from 'src/app/pages/doc-create/doc-cerate.enum';

@Component({
  selector: 'app-doc-create-items-mobile',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    InputNumberModule,
    SelectButton,
    ButtonComponent,
    InputTextComponent,
    SegmentedControlComponent,
    DecimalPipe,
  ],
  templateUrl: './doc-create-items-mobile.component.html',
  styleUrl: './doc-create-items-mobile.component.scss',
})
export class DocCreateItemsMobileComponent {

  // ── Inputs ────────────────────────────────────────────────────
  /** The shared reactive form from the parent page */
  lineDetailsForm = input.required<FormGroup>();

  /** Current list of saved line items */
  items = input<PartialLineItem[]>([]);

  /** Index of the item currently being edited (null = none) */
  editingIndex = input<number | null>(null);

  /** Options array for the VAT p-selectbutton */
  vatOptions = input<any[]>([]);

  /** Show the VAT toggle (false for RECEIPT documents or EXEMPT businesses) */
  showVatOptions = input<boolean>(true);

  /**
   * Feature flag: expose % discount toggle in the UI.
   * Must remain FALSE until the backend supports percentage discounts.
   */
  allowPercentDiscount = input<boolean>(false);

  // ── Outputs ───────────────────────────────────────────────────
  /** User clicked "שמור" — parent should call addLineDetails() */
  save = output<void>();

  /** User clicked the edit icon on a saved item */
  edit = output<number>();

  /** User clicked the trash icon on a saved item */
  deleteItem = output<number>();

  /**
   * Parent can listen to this for any post-cancel logic,
   * but "נקה" no longer triggers it — it only resets fields.
   */
  cancelEdit = output<void>();

  // ── Exposed constants for template ────────────────────────────
  readonly FieldsCreateDocValue = FieldsCreateDocValue;
  readonly inputsSize = inputsSize;
  readonly ButtonSize = ButtonSize;
  readonly ButtonColor = ButtonColor;

  // ── Constants ─────────────────────────────────────────────────
  /**
   * Options for the discount-type toggle (₪ / %).
   * Only rendered when allowPercentDiscount() === true.
   * Uses same p-selectbutton pattern as the VAT toggle.
   */
  readonly discountTypeOptions = [
    { label: '₪', value: 'shekel' },
    { label: '%', value: 'percent' },
  ];

  // ── View queries ──────────────────────────────────────────────
  private readonly newItemCard = viewChild<ElementRef<HTMLDivElement>>('newItemCard');
  private readonly injector = inject(Injector);

  // ── Internal state ────────────────────────────────────────────
  /** Whether the "new item" edit card is visible */
  private readonly showNewItemForm = signal<boolean>(true);

  /** Discount mode — only active when allowPercentDiscount() flag is true */
  readonly discountMode = signal<'shekel' | 'percent'>('shekel');

  // ── Computed ──────────────────────────────────────────────────
  readonly showEditCard = computed(() =>
    this.items().length === 0 ||
    (this.showNewItemForm() && this.editingIndex() === null)
  );

  readonly showAddButton = computed(() =>
    this.items().length > 0 &&
    this.editingIndex() === null &&
    !this.showNewItemForm()
  );

  readonly newItemNumber = computed(() => this.items().length + 1);

  // ── Event handlers ────────────────────────────────────────────

  onSave(): void {
    this.showNewItemForm.set(false);
    this.save.emit();
    // After the parent adds the saved item and re-renders, scroll to the new edit card
    afterNextRender(() => this.scrollToNewItemCard(), { injector: this.injector });
  }

  /**
   * "נקה" — reset form fields ONLY. The card stays open.
   * Fix #8: never close the card or change editingIndex.
   */
  onClear(): void {
    this.lineDetailsForm().reset({
      [FieldsCreateDocValue.UNIT_AMOUNT]: 1,
    });
  }

  onAddNew(): void {
    this.showNewItemForm.set(true);
    afterNextRender(() => this.scrollToNewItemCard(), { injector: this.injector });
  }

  private scrollToNewItemCard(): void {
    this.newItemCard()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ── Helpers ───────────────────────────────────────────────────

  isItemBeingEdited(index: number): boolean {
    return this.editingIndex() === index;
  }

  getVatLabel(vatOpts: VatType | undefined): string {
    const map: Record<VatType, string> = {
      INCLUDE: 'כולל מע״מ',
      EXCLUDE: 'לא כולל מע״מ',
      WITHOUT: 'ללא מע״מ',
    };
    return vatOpts ? (map[vatOpts] ?? '') : '';
  }
}
