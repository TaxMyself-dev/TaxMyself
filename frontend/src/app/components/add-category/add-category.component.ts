import { Component, computed, effect, inject, input, OnInit, output, signal } from '@angular/core';
import { ButtonComponent } from "../button/button.component";
import { InputSelectComponent } from "../input-select/input-select.component";
import { LeftPanelComponent } from "../left-panel/left-panel.component";
import { AbstractControl, FormArray, FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ButtonColor, ButtonSize } from '../button/button.enum';
import { inputsSize } from 'src/app/shared/enums';
import { IRowDataTable, ISelectItem } from 'src/app/shared/interface';
import { InputTextComponent } from "../input-text/input-text.component";
import { TransactionsService } from 'src/app/pages/transactions/transactions.page.service';
import { CommonModule } from '@angular/common';
import { CheckboxModule } from 'primeng/checkbox';
import { RadioButtonModule } from 'primeng/radiobutton';
import { catchError, EMPTY, finalize } from 'rxjs';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { AuthService } from 'src/app/services/auth.service';
import { GenericService } from 'src/app/services/generic.service';
import { ExpenseDataService } from 'src/app/services/expense-data.service';
import { MyPermissionsService } from 'src/app/services/my-permissions.service';

/** D5 per-sub-category recognition choice (PRIVATE is a sub_category concept,
 *  not a card recognition — see the redesign plan). */
type RecognitionChoice = 'RECOGNIZED' | 'NOT_RECOGNIZED' | 'PRIVATE';

@Component({
  selector: 'app-add-category',
  templateUrl: './add-category.component.html',
  styleUrls: ['./add-category.component.scss'],
  standalone: true,
  imports: [
    ToastModule,
    CheckboxModule,
    RadioButtonModule,
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
  expenseDataService = inject(ExpenseDataService);
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
  /** D9 simple-picker options: merged expense catalog rows that carry a card.
   *  value = accountId (the card the new sub_category will point at). */
  mappingOptions = signal<ISelectItem[]>([]);

  recognitionOptions: { label: string; value: RecognitionChoice }[] = [
    { label: 'הוצאה מוכרת', value: 'RECOGNIZED' },
    { label: 'הוצאה עסקית לא מוכרת', value: 'NOT_RECOGNIZED' },
    { label: 'הוצאה פרטית', value: 'PRIVATE' },
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
      this.loadMappingOptions();
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
   * One sub-category row, D5 three-option flow:
   * PRIVATE — no card, never journaled;
   * NOT_RECOGNIZED — 0% card, posts to the ledger but not deductible;
   * RECOGNIZED — either pick a card (the simple "למה ההוצאה שייכת?" picker)
   * or leave the mapping to the accountant. The card carries the full
   * accounting law (D1) — there are no percent inputs here.
   */
  private createSubCategoryGroup(): FormGroup {
    const preset = (this.mainForm?.get('defaultRecognitionType')?.value || 'RECOGNIZED') as RecognitionChoice;
    return this.fb.group({
      subCategoryName: ['', Validators.required],
      recognition: [preset as RecognitionChoice, Validators.required],
      deferToAccountant: [false],
      accountId: [null as number | null],
      isExpense: [!this.incomeMode()],
    }, { validators: [this.mappingRequiredValidator] });
  }

  /** RECOGNIZED without defer must carry a picked card (income rows and the
   *  other recognition choices need no mapping from the client). */
  private mappingRequiredValidator = (group: AbstractControl): ValidationErrors | null => {
    if (this.incomeMode()) return null;
    const recognition = group.get('recognition')?.value;
    const defer = group.get('deferToAccountant')?.value;
    const accountId = group.get('accountId')?.value;
    if (recognition === 'RECOGNIZED' && !defer && accountId == null) {
      return { mappingRequired: true };
    }
    return null;
  };

  private loadMappingOptions(): void {
    const businessNumber =
      this.authService.getActiveBusinessNumber() ||
      this.authService.getUserDataFromLocalStorage()?.businessNumber;
    if (!businessNumber) return;
    this.expenseDataService.getExpenseCatalog(businessNumber)
      .pipe(catchError(() => EMPTY))
      .subscribe((rows) => {
        // One option per card-bearing row; the client picks in their own
        // language ("דלק", "שכירות") and the card rides behind the scenes.
        this.mappingOptions.set(
          (rows ?? [])
            .filter((r) => r.accountId != null)
            .map((r) => ({
              name: r.category ? `${r.category} / ${r.subCategory}` : r.subCategory,
              value: r.accountId as number,
            })),
        );
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

  isRecognizedRow(i: number): boolean {
    return this.getSubCategoryFormByIndex(i).get('recognition')?.value === 'RECOGNIZED';
  }

  isDeferredRow(i: number): boolean {
    return !!this.getSubCategoryFormByIndex(i).get('deferToAccountant')?.value;
  }

  onRecognitionChange(i: number): void {
    // Leaving RECOGNIZED clears mapping state so a stale pick isn't sent.
    const group = this.getSubCategoryFormByIndex(i);
    if (group.get('recognition')?.value !== 'RECOGNIZED') {
      group.patchValue({ deferToAccountant: false, accountId: null });
    }
  }

  onDeferChange(i: number): void {
    const group = this.getSubCategoryFormByIndex(i);
    if (group.get('deferToAccountant')?.value) {
      group.patchValue({ accountId: null });
    }
  }

  /** Map a form row to the CreateUserSubCategoryDto shape (D5). */
  private toSubCategoryDto(row: any): any {
    const base = {
      subCategoryName: (row.subCategoryName ?? '').trim(),
      isExpense: !this.incomeMode(),
    };
    if (this.incomeMode()) {
      // Income rows keep the legacy shape — the D5 flow is an expense concept.
      return { ...base, isRecognized: false, taxPercent: 0, vatPercent: 0, reductionPercent: 0 };
    }
    switch (row.recognition as RecognitionChoice) {
      case 'PRIVATE':
        return { ...base, isPrivate: true };
      case 'NOT_RECOGNIZED':
        return { ...base, isRecognized: false };
      default:
        return row.deferToAccountant
          ? { ...base, deferToAccountant: true }
          : { ...base, accountId: row.accountId };
    }
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
