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
  viewChildren,
} from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormGroup, FormsModule } from '@angular/forms';

import { ConfirmationService } from 'primeng/api';

import { ButtonComponent } from '../button/button.component';
import { InputTextComponent } from '../input-text/input-text.component';
import { InputDateComponent } from '../input-date/input-date.component';
import { InputSelectComponent } from '../input-select/input-select.component';
import { SegmentedControlComponent } from '../segmented-control/segmented-control.component';
import { ButtonSize, ButtonColor } from '../button/button.enum';
import { FormTypes, inputsSize, paymentMethodOptions } from 'src/app/shared/enums';
import { IDocCreateFieldData, SectionKeysEnum } from 'src/app/pages/doc-create/doc-create.interface';
import { DocCreateBuilderService } from 'src/app/pages/doc-create/doc-create-builder.service';

@Component({
  selector: 'app-doc-create-payments-mobile',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    ButtonComponent,
    InputTextComponent,
    InputDateComponent,
    InputSelectComponent,
    SegmentedControlComponent,
    DecimalPipe,
    DatePipe,
  ],
  templateUrl: './doc-create-payments-mobile.component.html',
  styleUrl: './doc-create-payments-mobile.component.scss',
})
export class DocCreatePaymentsMobileComponent {

  // ── Inputs ────────────────────────────────────────────────────
  paymentForm    = input.required<FormGroup>();
  paymentFields  = input<IDocCreateFieldData[]>([]);
  paymentsDraft  = input<any[]>([]);
  activeMethodId = input<string>('CREDIT_CARD');

  // ── Outputs ───────────────────────────────────────────────────
  save          = output<void>();
  deletePayment = output<number>();
  methodChange  = output<string>();
  updatePayment = output<{ index: number; formValue: any; method: string }>();

  // ── Services ──────────────────────────────────────────────────
  private readonly builderService      = inject(DocCreateBuilderService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly injector            = inject(Injector);

  // ── Exposed constants ─────────────────────────────────────────
  readonly FormTypes   = FormTypes;
  readonly inputsSize  = inputsSize;
  readonly ButtonSize  = ButtonSize;
  readonly ButtonColor = ButtonColor;

  // ── Payment method pills ───────────────────────────────────────
  readonly methodOptions = paymentMethodOptions.map(m => ({
    label: m.label,
    value: m.id,
  }));

  // ── View queries ──────────────────────────────────────────────
  private readonly newPaymentCard = viewChild<ElementRef<HTMLDivElement>>('newPaymentCard');
  private readonly summaryCards   = viewChildren<ElementRef<HTMLDivElement>>('summaryCard');

  // ── Internal state ────────────────────────────────────────────
  private readonly showNewForm  = signal(true);
  readonly editingIndex         = signal<number | null>(null);
  private readonly _editForm    = signal<FormGroup | null>(null);
  readonly editingMethod        = signal<string>('CREDIT_CARD');

  // ── Computed ──────────────────────────────────────────────────
  readonly showForm = computed(() =>
    this.paymentsDraft().length === 0 || this.showNewForm()
  );

  readonly showAddButton = computed(() =>
    this.paymentsDraft().length > 0 && !this.showNewForm() && this.editingIndex() === null
  );

  readonly paymentNumber = computed(() => this.paymentsDraft().length + 1);

  readonly editForm = computed(() => this._editForm());

  readonly editFormFields = computed(() =>
    this.builderService.getBaseFieldsBySection(this.editingMethod() as SectionKeysEnum)
  );

  // ── Event handlers — NEW payment ──────────────────────────────

  onMethodChange(methodId: string): void {
    this.methodChange.emit(methodId);
  }

  onSave(): void {
    this.showNewForm.set(false);
    this.save.emit();
  }

  onClear(): void {
    this.paymentForm().reset();
  }

  onAddNew(): void {
    this.editingIndex.set(null);
    this.showNewForm.set(true);
    afterNextRender(
      () => this.newPaymentCard()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      { injector: this.injector }
    );
  }

  // ── Event handlers — EDIT payment ─────────────────────────────

  startEdit(index: number): void {
    this.showNewForm.set(false);
    const payment = this.paymentsDraft()[index];
    const method = payment.paymentMethod ?? 'CREDIT_CARD';
    this.editingMethod.set(method);
    const built = this.builderService.buildDocCreateForm([method as SectionKeysEnum]);
    const sectionForm = (built.get(method) as FormGroup) ?? built;
    sectionForm.patchValue(payment);
    this._editForm.set(sectionForm);
    this.editingIndex.set(index);
  }

  onEditMethodChange(methodId: string): void {
    this.editingMethod.set(methodId);
    const built = this.builderService.buildDocCreateForm([methodId as SectionKeysEnum]);
    const sectionForm = (built.get(methodId) as FormGroup) ?? built;
    this._editForm.set(sectionForm);
  }

  onSaveEdit(): void {
    const form = this._editForm();
    if (!form || !form.valid) return;
    const savedIndex = this.editingIndex()!;
    this.updatePayment.emit({
      index: savedIndex,
      formValue: form.value,
      method: this.editingMethod(),
    });
    this.editingIndex.set(null);
    this._editForm.set(null);
    afterNextRender(
      () => this.summaryCards()[savedIndex]?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      { injector: this.injector }
    );
  }

  onClearEdit(): void {
    const index = this.editingIndex();
    if (index === null) return;
    const payment = this.paymentsDraft()[index];
    this._editForm()?.patchValue(payment);
  }

  onCancelEdit(): void {
    this.editingIndex.set(null);
    this._editForm.set(null);
  }

  // ── Event handlers — DELETE payment ───────────────────────────

  onDeleteRequest(index: number): void {
    this.confirmationService.confirm({
      message: 'האם אתה בטוח שברצונך למחוק את התשלום?',
      header: 'מחיקת תשלום',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'מחק',
      rejectLabel: 'ביטול',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        if (this.editingIndex() === index) {
          this.editingIndex.set(null);
          this._editForm.set(null);
        }
        this.deletePayment.emit(index);
      },
    });
  }

  // ── Helpers ───────────────────────────────────────────────────

  getFieldsForMethod(methodId: string): IDocCreateFieldData[] {
    return this.builderService.getBaseFieldsBySection(methodId as SectionKeysEnum);
  }

  getMethodLabel(methodId: string): string {
    return paymentMethodOptions.find(m => m.id === methodId)?.label ?? methodId;
  }

  getDisplayValue(payment: any, field: IDocCreateFieldData): string {
    if (field.value === 'bankName') {
      const name   = payment.hebrewBankName ?? '';
      const number = payment.bankNumber ?? '';
      return name ? `${name}${number ? ' (' + number + ')' : ''}` : '-';
    }
    const val = payment[field.value];
    if (val == null || val === '') return '-';
    if ((field.enumValues as any[])?.length) {
      return (field.enumValues as any[]).find(e => e.value === val)?.name ?? String(val);
    }
    return String(val);
  }
}
