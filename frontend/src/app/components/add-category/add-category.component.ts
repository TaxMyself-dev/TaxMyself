import { Component, computed, effect, inject, input, OnInit, output, signal, WritableSignal } from '@angular/core';
import { ButtonComponent } from "../button/button.component";
import { InputSelectComponent } from "../input-select/input-select.component";
import { LeftPanelComponent } from "../left-panel/left-panel.component";
import { FormArray, FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonColor, ButtonSize, IconPosition } from '../button/button.enum';
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
  isEquipmentValues = [
    { value: true, name: 'כן' },
    { value: false, name: 'לא' },
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
      this.subCategories.controls.forEach((group) =>
        group.patchValue({ isExpense })
      );
    });
  }

  ngOnInit(): void {
    this.categoryList = this.transactionService.categories;
  }

  // === Init form ===
  private initForm(): void {
    this.mainForm = this.fb.group({
      categoryName: new FormControl(
        { value: '', disabled: this.subCategoryMode() },
        Validators.required
      ),
      subCategories: this.fb.array([this.createSubCategoryGroup()]),
      isExpense: new FormControl(!this.incomeMode(), Validators.required),
    });
  }

  private createSubCategoryGroup(isRecognized: boolean = false): FormGroup {
    return this.fb.group({
      subCategoryName: ['', Validators.required],
      isEquipment: [false],
      isRecognized: [isRecognized],
      isExpense: [!this.incomeMode()],
      taxPercent: [0, [Validators.pattern(/^\d+$/)]],
      vatPercent: [0, [Validators.pattern(/^\d+$/)]],
      reductionPercent: [0, [Validators.pattern(/^\d+$/)]],
    });
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

  onCheckboxClicked(event: any, index: number): void {
    const group = this.subCategories.at(index) as FormGroup;
    group.get('isRecognized')?.setValue(event.checked);

    // reset if unchecked
    if (!event.checked) {
      group.patchValue({
        taxPercent: 0,
        vatPercent: 0,
        reductionPercent: 0,
      });
    }
  }

  convertSubCategoriesToNumbers(): void {
    this.subCategories.controls.forEach((group) => {
      ['taxPercent', 'vatPercent', 'reductionPercent'].forEach((key) => {
        const ctrl = group.get(key);
        if (ctrl?.value !== null && ctrl?.value !== undefined)
          ctrl.setValue(Number(ctrl.value), { emitEvent: false });
      });
    });
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
    this.convertSubCategoriesToNumbers();

    const formValue = this.mainForm.getRawValue();

    this.transactionService
      .addSubCategory(formValue, formValue.categoryName)
      .pipe(
        catchError((err) => {
          this.isLoading.set(false);
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'הוספת תתי קטגוריה נכשלה',
            life: 3000,
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
    this.convertSubCategoriesToNumbers();

    const formValue = this.mainForm.getRawValue();
    console.log('🚀 addCategory formValue:', formValue);

    this.transactionService
      .addCategory(formValue)
      .pipe(
        catchError((err) => {
          console.error('Error in add category', err);
          this.isLoading.set(false);
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'הוספת הקטגוריה נכשלה',
            life: 3000,
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
}


// @Component({
//   selector: 'app-add-category',
//   templateUrl: './add-category.component.html',
//   styleUrls: ['./add-category.component.scss'],
//   imports: [ToastModule, CheckboxModule, CommonModule, ReactiveFormsModule, FormsModule, ButtonComponent, InputSelectComponent, LeftPanelComponent, InputTextComponent, InputDateComponent],
//   providers: [],
// })
// export class AddCategoryComponent  implements OnInit {
//   transactionService = inject(TransactionsService);
//     messageService = inject(MessageService);
  
//   formBuilder = inject(FormBuilder);
//   isVisible = input<boolean>(false);
//   incomeMode = input<boolean>(false);
//   subCategoryMode = input<boolean>(false);
//   categoryName = input<string>('');
//   categoryList = signal<ISelectItem[]>([]);
//   isRecognized = signal<boolean>(false);

//   visibleChange = output<{visible: boolean, data?: boolean}>();
//   // classifyTranButtonClicked = output<any>();
//   openAddCategoryClicked = output<{state: boolean; subCategoryMode: boolean }>();
//   openAddSubCategoryClicked = output<{state: boolean; subCategoryMode: boolean }>();

//   isLoading: WritableSignal<boolean> = signal(false);
//   groupedSubCategory = signal([{ label: "", items: [] }]);

//   isEquipmentValues = [{ value: true, name:'כן', }, { value: false, name: "לא" }]

//   // userData: IUserData;

//   buttonSize = ButtonSize;
//   buttonColor = ButtonColor;
//   inputsSize = inputsSize;
//   iconPos = iconPosition;
  
//   isRecognizedForm: FormGroup;
//   unRecognizedForm: FormGroup;

//   showAdvanceFields = false;

//   constructor() {

//     this.initForms();

//   effect(() => {
//     console.log("effect incomeMode", this.incomeMode());
    
//     const isIncome = this.incomeMode(); // reactive access to signal
//     const isExpense = !isIncome;

//     // Update isRecognizedForm main field
//     this.isRecognizedForm.patchValue({ isExpense });
//     this.unRecognizedForm.patchValue({ isExpense });

//     // Update subCategories in isRecognizedForm
//     const recognizedArray = this.isRecognizedForm.get('subCategories') as FormArray;
//     recognizedArray.controls.forEach(group => {
//       group.patchValue({ isExpense });
//     });

//     // Update subCategories in unRecognizedForm
//     const unrecognizedArray = this.unRecognizedForm.get('subCategories') as FormArray;
//     unrecognizedArray.controls.forEach(group => {
//       group.patchValue({ isExpense });
//     });
//   });
  
//     // whenever subCategoryMode() flips, enable/disable the category control:   
    
//     effect(() => {
//       const subMode = this.subCategoryMode();
//       const recCtrl   = this.isRecognizedForm.get('categoryName')!;
//       const unRecCtrl = this.unRecognizedForm.get('categoryName')!;
      
//       if (subMode) {
//         recCtrl.disable({ emitEvent: false });
//         unRecCtrl.disable({ emitEvent: false });
      
//       // patch the latest categoryName() into both controls
//       recCtrl.patchValue(this.categoryName(),    { emitEvent: false });
//       unRecCtrl.patchValue(this.categoryName(),  { emitEvent: false });
//       } else {
//         recCtrl.enable({ emitEvent: false });
//         unRecCtrl.enable({ emitEvent: false });
//       }
//     });

//   }

//   ngOnInit() {
//     // this.groupedSubCategory.set([])
//     this.categoryList = this.transactionService.categories;
//   }

//    /** getter to access subCategories FormArray */
//    get subCategories(): FormArray {
//     return this.isRecognized() ?  this.isRecognizedForm?.get('subCategories') as FormArray :this.unRecognizedForm?.get('subCategories') as FormArray;
//   }

//   private initForms() {
//     this.isRecognizedForm = this.formBuilder.group({
//       categoryName: new FormControl(
//         { value: '', disabled: this.subCategoryMode() },
//         Validators.required
//       ),
//       subCategories: this.formBuilder.array([this.createSubCatIsRecognizedGroup()]),
//       isExpense: new FormControl(!this.incomeMode(), Validators.required)
//     });
  
//     this.unRecognizedForm = this.formBuilder.group({
//       categoryName: new FormControl(
//         { value: '', disabled: this.subCategoryMode() },
//         Validators.required
//       ),
//       subCategories: this.formBuilder.array([this.createSubCatUnRecognizedGroup()]),
//       isExpense: new FormControl(!this.incomeMode(), Validators.required)

//     });
//   }
  

//   getSubCategoryFormByIndex(index: number): FormGroup {
//     return this.subCategories?.at(index) as FormGroup;
//   }

//   /** factory for each sub-category isRecognized FormGroup */
//   private createSubCatIsRecognizedGroup(): FormGroup {
//     return this.formBuilder.group({
//       subCategoryName:    ['', Validators.required],
//       isEquipment:       [null, Validators.required],
//       isRecognized:       [true, Validators.required],
//       isExpense:       [true, Validators.required],
//       taxPercent:        [Number, [Validators.required, Validators.pattern(/^\d+$/)]],
//       vatPercent:        [Number, [Validators.required, Validators.pattern(/^\d+$/)]],
//       reductionPercent:  [Number, [Validators.required, Validators.pattern(/^\d+$/)]],
//       startDate:         [Date, Validators.required],
//       endDate:         [Date, Validators.required],
//     });
//   }

//     /** factory for each sub-category unRecognized FormGroup */
//     private createSubCatUnRecognizedGroup(): FormGroup {
//       return this.formBuilder.group({
//         subCategoryName:    ['', Validators.required],
//         isEquipment:       [false, ],
//         isRecognized:       [false, ],
//         isExpense:       [!this.incomeMode(), ],
//         taxPercent:        [0, [, Validators.pattern(/^\d+$/)]],
//         vatPercent:        [0, [, Validators.pattern(/^\d+$/)]],
//         reductionPercent:  [0, [, Validators.pattern(/^\d+$/)]],
//       });
//     }

//   /** add new sub-category group */
//   AddSubCategory(): void {
//     this.subCategories.push(this.createSubCatIsRecognizedGroup());
//     console.log("subCategories", this.subCategories);
    
//   }

//   /** remove sub-category group (keep at least one) */
//   removeSubCategory(i: number): void {
//     if (this.subCategories.length > 1) {
//       this.subCategories.removeAt(i);
//     }
//   }

//   onVisibleChange(visible: boolean) {
//     this.visibleChange.emit({visible});
//   }
//   convertSubCategoriesToNumbers(): void {
//     const formData = this.isRecognized() ? this.isRecognizedForm : this.unRecognizedForm;
//     const subCategoriesArray = formData.get('subCategories') as FormArray;
//     subCategoriesArray.controls.forEach(group => {
//       const formGroup = group as FormGroup;
  
//       ['taxPercent', 'vatPercent', 'reductionPercent'].forEach(controlName => {
//         const value = formGroup.get(controlName)?.value;
  
//         if (value !== null && value !== undefined) {
//           formGroup.get(controlName)?.setValue(Number(value), { emitEvent: false });
//         }
//       });
//     });
//   }

//   addCategory(): void {
//     this.isLoading.set(true);
//     this.convertSubCategoriesToNumbers();
//     const formValue = this.isRecognized() ? this.isRecognizedForm.getRawValue() : this.unRecognizedForm.getRawValue();
//     console.log("🚀 ~ AddCategoryComponent ~ addCategory ~ formValue:", formValue)
  
//     this.transactionService.addCategory(formValue)
//     .pipe(
//       catchError((err) => {
//         console.log("error in add category", err);
//         this.isLoading.set(false);
//         this.messageService.add({
//           severity: 'error',
//           summary: 'Error',
//           sticky: true,
//           detail:"הוספת הקטגוריה נכשלה",
//           life: 3000,
//           key: 'br'
//         })
//         return EMPTY;
//       }),
//       finalize(() => {
//         this.isLoading.set(false);
//       })
//     )
//     .subscribe((res) => {
//       console.log("add category response", res);
//       this.visibleChange.emit({visible: false, data: true});
//       this.messageService.add({
//         severity: 'success',
//         summary: 'Success',
//         detail:"הוספת הקטגוריה בוצעה בהצלחה",
//         life: 3000,
//         key: 'br'
//       })
//     })
//   }

//   onBackEnabled(visible: boolean): void {
//     this.visibleChange.emit({visible});
//   }

//   // onCheckboxClicked(event: any): void {
//   //   this.isRecognized.set(event.checked);
//   // }

//   onCheckboxClicked(event: any, index: number) {
//     const control = this.subCategories.at(index).get('isRecognized');
//     control?.setValue(event.checked);
//   }


// }