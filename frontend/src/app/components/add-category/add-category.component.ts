import { Component, effect, inject, input, OnInit, output, signal, WritableSignal } from '@angular/core';
import { ButtonComponent } from "../button/button.component";
import { InputSelectComponent } from "../input-select/input-select.component";
import { LeftPanelComponent } from "../left-panel/left-panel.component";
import { FormArray, FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonColor, ButtonSize, iconPosition } from '../button/button.enum';
import { inputsSize } from 'src/app/shared/enums';
import { ISelectItem } from 'src/app/shared/interface';
import { InputTextComponent } from "../input-text/input-text.component";
import { TransactionsService } from 'src/app/pages/transactions/transactions.page.service';
import { CommonModule } from '@angular/common';
import { CheckboxModule } from 'primeng/checkbox';
import { catchError, EMPTY, finalize } from 'rxjs';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';

@Component({
  selector: 'app-add-category',
  templateUrl: './add-category.component.html',
  styleUrls: ['./add-category.component.scss'],
  imports: [ToastModule, CheckboxModule, CommonModule, ReactiveFormsModule, FormsModule,ButtonComponent, InputSelectComponent, LeftPanelComponent, InputTextComponent],
  providers: [],
})
export class AddCategoryComponent  implements OnInit {
  transactionService = inject(TransactionsService);
    messageService = inject(MessageService);
  
  formBuilder = inject(FormBuilder);
  isVisible = input<boolean>(false);
  incomeMode = input<boolean>(false);
  subCategoryMode = input<boolean>(false);
  categoryName = input<string>('');
  categoryList = signal<ISelectItem[]>([]);
  isRecognized = signal<boolean>(false);

  visibleChange = output<{visible: boolean, data?: boolean}>();
  // classifyTranButtonClicked = output<any>();
  openAddCategoryClicked = output<{state: boolean; subCategoryMode: boolean }>();
  openAddSubCategoryClicked = output<{state: boolean; subCategoryMode: boolean }>();

  isLoading: WritableSignal<boolean> = signal(false);
  groupedSubCategory = signal([{ label: "", items: [] }]);

  isEquipmentValues = [{ value: true, name:'כן', }, { value: false, name: "לא" }]

  // userData: IUserData;

  buttonSize = ButtonSize;
  buttonColor = ButtonColor;
  inputsSize = inputsSize;
  iconPos = iconPosition;
  
  isRecognizedForm: FormGroup;
  unRecognizedForm: FormGroup;

  constructor() {
    this.isRecognizedForm = this.formBuilder.group({
    categoryName: new FormControl(
      { value: '', disabled: this.subCategoryMode() },Validators.required
    ),
    subCategories: this.formBuilder.array([ this.createSubCatGroup() ]
    ),
    isRecognized: new FormControl(
      true, Validators.required
    ),
    isExpense: new FormControl(
      !this.incomeMode(), Validators.required
    ),

    });

    this.unRecognizedForm = this.formBuilder.group({
      categoryName: new FormControl(
        { value: '', disabled: this.subCategoryMode() },Validators.required
      ),
      subCategoryName: new FormControl(
        '', Validators.required
      ),
      isRecognized: new FormControl(
        false, Validators.required
      ),
      isExpense: new FormControl(
        !this.incomeMode(), Validators.required
      ),
      isEquipment: new FormControl(
        false, Validators.required
      ),
      taxPercent: new FormControl(
        0, [Validators.required, Validators.pattern(/^\d+$/)]
      ),
      vatPercent: new FormControl(
        0, [Validators.required, Validators.pattern(/^\d+$/)]
      ),
      reductionPercent: new FormControl(
        0, [Validators.required, Validators.pattern(/^\d+$/)]
      ),

    });
    
    // whenever subCategoryMode() flips, enable/disable the category control:
    effect(() => {
      const subMode = this.subCategoryMode();
      const catCtrl = this.isRecognizedForm.get('categoryName')!;
      subMode ? catCtrl.disable({ emitEvent: false }) : catCtrl.enable({ emitEvent: false });
    });
  }

  ngOnInit() {
    // this.groupedSubCategory.set([])
    this.categoryList = this.transactionService.categories;
  }

   /** getter to access subCategories FormArray */
   get subCategories(): FormArray {
    return this.isRecognizedForm?.get('subCategories') as FormArray;
  }

  getSubCategoryFormByIndex(index: number): FormGroup {
    return this.subCategories?.at(index) as FormGroup;
  }

  /** factory for each sub-category FormGroup */
  private createSubCatGroup(): FormGroup {
    return this.formBuilder.group({
      subCategoryName:   ['', Validators.required],
      isEquipment:       [null, Validators.required],
      taxPercent:        ['', [Validators.required, Validators.pattern(/^\d+$/)]],
      vatPercent:        ['', [Validators.required, Validators.pattern(/^\d+$/)]],
      reductionPercent:  ['', [Validators.required, Validators.pattern(/^\d+$/)]],
    });
  }

  /** add new sub-category group */
  AddSubCategory(): void {
    this.subCategories.push(this.createSubCatGroup());
    console.log("subCategories", this.subCategories);
    
  }

  /** remove sub-category group (keep at least one) */
  removeSubCategory(i: number): void {
    if (this.subCategories.length > 1) {
      this.subCategories.removeAt(i);
    }
  }

  onVisibleChange(visible: boolean) {
    this.visibleChange.emit({visible});
  }

  addCategory(): void {
    console.log("🚀 ~ AddCategoryComponent ~ addCategory ~ this.unRecognizedForm.value:", this.unRecognizedForm.value)
    this.isLoading.set(true);
    this.transactionService.addCategory(this.isRecognized() ? this.isRecognizedForm.value : this.unRecognizedForm.value)
    .pipe(
      catchError((err) => {
        console.log("error in add category", err);
        this.isLoading.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          sticky: true,
          detail:"הוספת הקטגוריה נכשלה",
          life: 3000,
          key: 'br'
        })
        return EMPTY;
      }),
      finalize(() => {
        this.isLoading.set(false);
      })
    )
    .subscribe((res) => {
      console.log("add category response", res);
      this.visibleChange.emit({visible: false, data: true});
      this.messageService.add({
        severity: 'success',
        summary: 'Success',
        detail:"הוספת הקטגוריה בוצעה בהצלחה",
        life: 3000,
        key: 'br'
      })
    })
  }

  onBackEnabled(visible: boolean): void {
    this.visibleChange.emit({visible});
  }

  onCheckboxClicked(event: any): void {
    this.isRecognized.set(event.checked);
  }
}
