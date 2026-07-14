import { Component, computed, effect, inject, input, OnInit, output, signal } from '@angular/core';
import { ButtonComponent } from "../button/button.component";
import { InputSelectComponent } from "../input-select/input-select.component";
import { LeftPanelComponent } from "../left-panel/left-panel.component";
import { FormArray, FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonColor, ButtonSize } from '../button/button.enum';
import { inputsSize } from 'src/app/shared/enums';
import { IRowDataTable, ISelectItem } from 'src/app/shared/interface';
import { InputTextComponent } from "../input-text/input-text.component";
import { TransactionsService } from 'src/app/pages/transactions/transactions.page.service';
import { CommonModule } from '@angular/common';
import { CheckboxModule } from 'primeng/checkbox';
import { catchError, EMPTY, finalize } from 'rxjs';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { AuthService } from 'src/app/services/auth.service';
import { GenericService } from 'src/app/services/generic.service';
import { MyPermissionsService } from 'src/app/services/my-permissions.service';

@Component({
  selector: 'app-add-category',
  templateUrl: './add-category.component.html',
  styleUrls: ['./add-category.component.scss'],
  standalone: true,
  imports: [
    ToastModule,
    CheckboxModule,
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    ButtonComponent,
    InputSelectComponent,
    InputTextComponent,
    LeftPanelComponent,
  ],
})
export class AddCategoryComponent implements OnInit {
  // === Services & utils ===
  transactionService = inject(TransactionsService);
  authService = inject(AuthService);
  genericService = inject(GenericService);
  messageService = inject(MessageService);
  myPermissionsService = inject(MyPermissionsService);
  fb = inject(FormBuilder);

  // === Inputs ===
  isVisible = input<boolean>(false);
  incomeMode = input<boolean>(false);
  subCategoryMode = input<boolean>(false);
  categoryName = input<string>('');
  rowData = input<IRowDataTable>();

  businessNumber = computed(() => {
    const businessName = this.rowData()?.businessNumber;
    const businessesList = this.genericService.businessSelectItems();
    const business = businessesList.find((b) => b.value === businessName);

    this.authService.setActiveBusinessNumber(business?.value as string);
  });

  // === Outputs ===
  visibleChange = output<{ visible: boolean; data?: boolean }>();

  // === Signals & UI constants ===
  isLoading = signal<boolean>(false);
  categoryList = signal<ISelectItem[]>([]);
  /** Whether an accountant services this client (ACTIVE delegation) — gates
   *  the "השאר לרואה החשבון" option (D5: a client without an accountant must
   *  pick a mapping, the backend 400s a defer without a delegation). */
  hasAccountant = signal<boolean>(false);

  isEquipmentValues: ISelectItem[] = [
    { value: true, name: 'כן' },
    { value: false, name: 'לא' },
  ];

  defaultRecognitionOptions: ISelectItem[] = [
    { name: 'ללא ברירת מחדל', value: '' },
    { name: 'מוכרת', value: 'RECOGNIZED' },
    { name: 'לא מוכרת', value: 'NOT_RECOGNIZED' },
  ];

  buttonSize = ButtonSize;
  buttonColor = ButtonColor;
  inputsSize = inputsSize;

  // === Main form ===
  mainForm: FormGroup;

  constructor() {
    this.initForm();

    // Reactively update enable/disable for categoryName
    effect(() => {
      const subMode = this.subCategoryMode();
      const ctrl = this.mainForm.get('categoryName')!;
      if (subMode) {
        ctrl.disable({ emitEvent: false });
        ctrl.patchValue(this.categoryName(), { emitEvent: false });
      } else {
        ctrl.enable({ emitEvent: false });
      }
    });

    // Reactively update income/expense flag
    effect(() => {
      const isIncome = this.incomeMode();
      const isExpense = !isIncome;
      this.mainForm.patchValue({ isExpense });
    });
  }

  ngOnInit(): void {
    this.categoryList = this.transactionService.categories;
    if (!this.incomeMode()) {
      this.loadHasAccountant();
    }
  }

  // === Init form ===
  private initForm(): void {
    this.mainForm = this.fb.group({
      categoryName: new FormControl(
        { value: '', disabled: this.subCategoryMode() },
        Validators.required
      ),
      // Optional UI hint (D5): pre-fills the recognition choice on future
      // sub-categories of this category. '' = none.
      defaultRecognitionType: new FormControl<string>(''),
      subCategories: this.fb.array([this.createSubCategoryGroup()]),
      isExpense: new FormControl(!this.incomeMode(), Validators.required),
    });
  }

  /**
   * One sub-category row. The checkbox ("האם ההוצאה הינה הוצאה מוכרת?")
   * picks between D5's two client-facing outcomes:
   * unchecked — isPrivate, no card, never journaled;
   * checked — a business expense whose accounting law (D1: vat/tax/
   * reduction/equipment %) is submitted as the legacy `law` shape, which
   * the backend resolves to a card via findOrCreateVariantAccount (find or
   * create a booking_account matching that exact law, then point this
   * sub_category's accountId at it) — unless deferred to the accountant.
   */
  private createSubCategoryGroup(): FormGroup {
    const hint = this.mainForm?.get('defaultRecognitionType')?.value;
    const isRecognized = hint === 'RECOGNIZED';
    return this.fb.group({
      subCategoryName: ['', Validators.required],
      isRecognized: [isRecognized],
      deferToAccountant: [false],
      isEquipment: [false],
      taxPercent: [0, [Validators.pattern(/^\d+$/)]],
      vatPercent: [0, [Validators.pattern(/^\d+$/)]],
      reductionPercent: [0, [Validators.pattern(/^\d+$/)]],
      pnlCategory: [null as string | null],
      isExpense: [!this.incomeMode()],
    });
  }

  private loadHasAccountant(): void {
    this.myPermissionsService.getMyPermissions()
      .pipe(catchError(() => EMPTY))
      .subscribe((agents) => this.hasAccountant.set((agents ?? []).length > 0));
  }

  // === Helpers ===
  get subCategories(): FormArray {
    return this.mainForm.get('subCategories') as FormArray;
  }

  getSubCategoryFormByIndex(index: number): FormGroup {
    return this.subCategories.at(index) as FormGroup;
  }

  AddSubCategory(): void {
    this.subCategories.push(this.createSubCategoryGroup());
  }

  removeSubCategory(i: number): void {
    if (this.subCategories.length > 1) this.subCategories.removeAt(i);
  }

  isDeferredRow(i: number): boolean {
    return !!this.getSubCategoryFormByIndex(i).get('deferToAccountant')?.value;
  }

  onCheckboxClicked(event: any, index: number): void {
    const group = this.getSubCategoryFormByIndex(index);
    const checked = !!event.checked;
    group.get('isRecognized')?.setValue(checked);
    if (!checked) {
      group.patchValue({
        deferToAccountant: false,
        isEquipment: false,
        taxPercent: 0,
        vatPercent: 0,
        reductionPercent: 0,
        pnlCategory: null,
      });
    }
  }

  onDeferChange(i: number): void {
    const group = this.getSubCategoryFormByIndex(i);
    if (group.get('deferToAccountant')?.value) {
      group.patchValue({ isEquipment: false, taxPercent: 0, vatPercent: 0, reductionPercent: 0, pnlCategory: null });
    }
  }

  /** Map a form row to the CreateUserSubCategoryDto shape. Unchecked → D5
   *  isPrivate (no card). Checked + deferred → D5 deferToAccountant.
   *  Checked + mapped → the legacy law shape, which findOrCreateVariantAccount
   *  resolves to a card (D1: the card carries vat/tax/reduction/equipment). */
  private toSubCategoryDto(row: any): any {
    const base = {
      subCategoryName: (row.subCategoryName ?? '').trim(),
      isExpense: !this.incomeMode(),
    };
    if (this.incomeMode()) {
      return { ...base, isRecognized: false, taxPercent: 0, vatPercent: 0, reductionPercent: 0 };
    }
    if (!row.isRecognized) {
      return { ...base, isPrivate: true };
    }
    if (row.deferToAccountant) {
      return { ...base, deferToAccountant: true };
    }
    return {
      ...base,
      isRecognized: true,
      isEquipment: !!row.isEquipment,
      taxPercent: Number(row.taxPercent) || 0,
      vatPercent: Number(row.vatPercent) || 0,
      reductionPercent: Number(row.reductionPercent) || 0,
      pnlCategory: row.pnlCategory || null,
    };
  }

  private buildPayload(): any {
    const formValue = this.mainForm.getRawValue();
    const payload: any = {
      categoryName: formValue.categoryName,
      isExpense: formValue.isExpense,
      subCategories: (formValue.subCategories ?? []).map((row: any) => this.toSubCategoryDto(row)),
    };
    if (!this.subCategoryMode() && formValue.defaultRecognitionType) {
      payload.defaultRecognitionType = formValue.defaultRecognitionType;
    }
    return payload;
  }

  addSwitch(): void {
    if (this.subCategoryMode()) {
      this.addSubCategory();
    } else {
      this.addCategory();
    }
  }

  addSubCategory(): void {
    this.isLoading.set(true);
    const payload = this.buildPayload();

    this.transactionService
      .addSubCategory(payload, payload.categoryName)
      .pipe(
        catchError((err) => {
          this.isLoading.set(false);
          const detail =
            this.extractNestErrorDetail(err) ?? 'הוספת תתי קטגוריה נכשלה';
          this.messageService.add({
            severity: 'error',
            summary: 'שגיאה',
            detail,
            life: 5000,
            key: 'br',
          });
          return EMPTY;
        }),
        finalize(() => this.isLoading.set(false))
      )
      .subscribe(() => {
        this.visibleChange.emit({ visible: false, data: true });
        this.messageService.add({
          severity: 'success',
          summary: 'Success',
          detail: 'הוספת תת קטגוריה בוצעה בהצלחה',
          life: 3000,
          key: 'br',
        });
      });
  }

  addCategory(): void {
    this.isLoading.set(true);
    const payload = this.buildPayload();

    this.transactionService
      .addCategory(payload)
      .pipe(
        catchError((err) => {
          console.error('Error in add category', err);
          this.isLoading.set(false);
          const detail = this.extractNestErrorDetail(err) ?? 'הוספת הקטגוריה נכשלה';
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail,
            life: 5000,
            key: 'br',
          });
          return EMPTY;
        }),
        finalize(() => this.isLoading.set(false))
      )
      .subscribe(() => {
        this.visibleChange.emit({ visible: false, data: true });
        this.messageService.add({
          severity: 'success',
          summary: 'Success',
          detail: 'הוספת הקטגוריה בוצעה בהצלחה',
          life: 3000,
          key: 'br',
        });
      });
  }

  onVisibleChange(visible: boolean): void {
    this.visibleChange.emit({ visible });
  }

  onBackEnabled(visible: boolean): void {
    this.visibleChange.emit({ visible });
  }

  /**
   * מחלץ הודעה מ-Nest (ConflictException עם אובייקט { message, duplicates } וכו').
   */
  private extractNestErrorDetail(err: unknown): string | null {
    const e = err as { error?: unknown };
    const body = e?.error;
    if (body == null) return null;

    if (typeof body === 'string') {
      const t = body.trim();
      return t || null;
    }

    if (typeof body !== 'object') return null;

    const o = body as Record<string, unknown>;
    const msg = o['message'];

    if (typeof msg === 'string') {
      return msg.trim() || null;
    }

    if (msg && typeof msg === 'object') {
      const inner = msg as Record<string, unknown>;
      let text = '';
      if (typeof inner['message'] === 'string') {
        text = inner['message'].trim();
      }
      const dups = inner['duplicates'];
      if (Array.isArray(dups) && dups.length) {
        const names = dups.filter((x): x is string => typeof x === 'string').join(', ');
        if (names) {
          text = text ? `${text} (${names})` : names;
        }
      }
      return text || null;
    }

    if (Array.isArray(msg)) {
      return msg.map(String).join(', ');
    }

    return null;
  }
}
