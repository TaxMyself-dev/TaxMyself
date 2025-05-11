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

@Component({
  selector: 'app-add-category',
  templateUrl: './add-category.component.html',
  styleUrls: ['./add-category.component.scss'],
  imports: [CheckboxModule, CommonModule, ReactiveFormsModule, FormsModule,ButtonComponent, InputSelectComponent, LeftPanelComponent, InputTextComponent],
})
export class AddCategoryComponent  implements OnInit {
  transactionService = inject(TransactionsService);
  formBuilder = inject(FormBuilder);
  isVisible = input<boolean>(false);
  subCategoryMode = input<boolean>(false);
  categoryName = input<string>('');
  categoryList = signal<ISelectItem[]>([]);
  isRecognized = signal<boolean>(false);

  visibleChange = output<boolean>();
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
  notRecognizedForm: FormGroup;

  constructor() {
    this.isRecognizedForm = this.formBuilder.group({
      category: new FormControl(
        { value: '', disabled: this.subCategoryMode() },Validators.required
      ),
      subCategories: this.formBuilder.array([ this.createSubCatGroup() ]
    ),
    isRecognized: new FormControl(
      true, Validators.required
    ),

    });

    this.notRecognizedForm = this.formBuilder.group({
      category: new FormControl(
        { value: '', disabled: this.subCategoryMode() },Validators.required
      ),
      subCategory: new FormControl(
        '', Validators.required
      ),
      isRecognized: new FormControl(
        false, Validators.required
      ),
    });
    
    // whenever subCategoryMode() flips, enable/disable the category control:
    effect(() => {
      const subMode = this.subCategoryMode();
      const catCtrl = this.isRecognizedForm.get('category')!;
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
    this.visibleChange.emit(visible);
  }

  onButtonClicked(): void {
    this.isLoading.set(true);
  }

  onBackEnabled(visible: boolean): void {
    this.visibleChange.emit(visible);
  }

  onCheckboxClicked(event: any): void {
    console.log(event);
    this.isRecognized.set(event.checked);
    // this.myForm.get('isSingleUpdate')?.setValue(event.checked);
    // console.log("🚀 ~ ClassifyTranComponent ~ onCheckboxClicked ~ this.myForm.get('isSingleUpdate')?.setValue(event.checked):", this.myForm.get('isSingleUpdate')?.value)
  }
}
