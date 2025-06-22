import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, output, signal, WritableSignal } from '@angular/core';
import { LeftPanelComponent } from "../left-panel/left-panel.component";
import { InputSelectComponent } from "../input-select/input-select.component";
import { ButtonComponent } from "../button/button.component";
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { IClassifyTrans, IGetSubCategory, IRowDataTable, ISelectItem } from 'src/app/shared/interface';
import { ButtonSize } from '../button/button.enum';
import { displayColumnsExpense, inputsSize } from 'src/app/shared/enums';
import { ExpenseDataService } from 'src/app/services/expense-data.service';
import { catchError, EMPTY, finalize, map, takeUntil, tap, zip } from 'rxjs';
import { TransactionsService } from 'src/app/pages/transactions/transactions.page.service';
import { CheckboxModule } from 'primeng/checkbox';
import { CommonModule } from '@angular/common';
@Component({
  selector: 'app-classify-tran',
  templateUrl: './classify-tran.component.html',
  styleUrls: ['./classify-tran.component.scss'],
  imports: [LeftPanelComponent, InputSelectComponent, ButtonComponent, ToastModule, CheckboxModule, CommonModule],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  // providers: [MessageService],
})
export class ClassifyTranComponent implements OnInit {

  messageService = inject(MessageService);
  transactionService = inject(TransactionsService);
  expenseDataService = inject(ExpenseDataService);

  formBuilder = inject(FormBuilder);
  isVisible = input<boolean>(false);
  incomeMode = input<boolean>(false);
  visibleChange = output<{visible: boolean, data: boolean}>();
  classifyTranButtonClicked = output<any>();
  openAddCategoryClicked = output<{ state: boolean; subCategoryMode: boolean }>();
  openAddSubCategoryClicked = output<{ state: boolean; subCategoryMode: boolean, category: string }>();
  rowData = input<IRowDataTable>();
  isLoading: WritableSignal<boolean> = signal(false);
  categoryList = signal<ISelectItem[]>([]);
  groupedSubCategory = signal([{ label: "", items: [] }]);
  originalSubCategoryList = signal<IGetSubCategory[]>([]);
  selectedSubCategory = signal<IGetSubCategory | null>(null);
  // selectedSubCategoryEntries: any
  // userData: IUserData;

  buttonSize = ButtonSize;
  inputsSize = inputsSize;
  myForm: FormGroup;

  readonly displayHebrew = displayColumnsExpense;

  orderedKeys: string[] = [
    'categoryName',
    'subCategoryName',
    'isRecognized',
    'isEquipment',
    'taxPercent',
    'vatPercent',
    'reductionPercent'

  ];

  selectedSubCategoryEntries = computed(() => {
    const subCat = this.selectedSubCategory();
    if (!subCat) return [];

    const isExpense = subCat.isRecognized;

    return this.orderedKeys
      .filter((key) => key in subCat)
      .filter((key) => {
        // if not an expense, only show name keys
        if (isExpense === false) {
          return key === 'categoryName' || key === 'subCategoryName';
        }
        return true; // if it's an expense, show all keys
      })
      .map((key) => ({
        key,
        value: subCat[key as keyof IGetSubCategory],
      }));
  });


  constructor() {
    this.myForm = this.formBuilder.group({
      categoryName: new FormControl(
        '', [Validators.required]
      ),
      subCategoryName: new FormControl(
        '', [Validators.required]
      ),
      isSingleUpdate: new FormControl(
        false, []
      ),
    });
  }

  ngOnInit() {
    // this.userData = this.authService.getUserDataFromLocalStorage();
    // if (this.userData.isTwoBusinessOwner) {
    //   this.myForm.get('businessNumber')?.setValidators([Validators.required]);
    // }
    console.log("rowData", this.rowData);
    
    this.getCategories();
    this.categoryList = this.transactionService.categories;
    console.log("category list", this.categoryList());

    //this.getSubCategory('דיור');
  }

  onVisibleChange(visible: boolean) {
    this.visibleChange.emit({visible: visible, data: false});
  }

  classifyTransaction(event: any): void {
    this.isLoading.set(true);
    const category = event.controls?.['categoryName']?.value;
    const subCategory = event.controls?.['subCategoryName']?.value;
    let formData: IClassifyTrans = {
      id: this.rowData().id as number,
      isSingleUpdate: event.controls?.['isSingleUpdate']?.value,
      // isNewCategory: false,
      name: this.rowData().name as string,
      billName: this.rowData().billName as string,
      category: event.controls?.['categoryName']?.value,
      subCategory: event.controls?.['subCategoryName']?.value,
      isRecognized: this.selectedSubCategory().isRecognized as boolean,
      vatPercent: +this.selectedSubCategory().vatPercent,
      taxPercent: +this.selectedSubCategory().taxPercent,
      isEquipment: this.selectedSubCategory().isEquipment as boolean,
      reductionPercent: +this.selectedSubCategory().reductionPercent,
      isExpense: this.selectedSubCategory().isExpense as boolean,
    }
    console.log("🚀 ~ ClassifyTranComponent ~ classifyTransaction ~ formData:", formData)

    this.transactionService.addClassifiction(formData)
    .pipe(
      catchError((err) => {
        console.log("error in classify transaction", err);
        // this.isLoading.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          sticky: true, 
          detail:"מיפוי התנועה נכשל",
          life: 3000,
          key: 'br'
        })
        return EMPTY;
      }),
      finalize(() => {
        this.isLoading.set(false);
      }),
    )
    .subscribe((res) => {
      console.log("res in classify transaction", res);
     this.visibleChange.emit({visible: false, data: true} );
      // this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Transaction classified successfully', key: 'br' });
      this.messageService.add({
        severity: 'success',
        summary: 'Success',
        detail:"מיפוי התנועה בוצע בהצלחה",
        life: 3000,
        key: 'br'
      })
    
    }
    )
  }
  

  getCategories(): void {
    this.transactionService.getCategories(null, !this.incomeMode())
      .subscribe((res) => {
        console.log("category", res);
      })
  }

  onChangeInputSelect(event: string): void {
    console.log(event);
    this.getSubCategory(event);
  }

  getSubCategory(event: string): void {
    console.log("🚀 ~ ClassifyTranComponent ~ getSubCategory ~ event:", event)
    this.myForm.patchValue({ 'subCategoryName': '' }); // reset subcategory when category changes for the change form to invlaid.
    this.selectedSubCategory.set(null); // For hidden the details subCategory section.
    const isEquipmentSubCategory = this.expenseDataService.getSubCategory(event, true, !this.incomeMode());
    const notEquipmentSubCategory = this.expenseDataService.getSubCategory(event, false, !this.incomeMode());

    zip(isEquipmentSubCategory, notEquipmentSubCategory)
      .pipe(
        tap(([isEquipmentSubCategory, notEquipmentSubCategory]) => {
          this.originalSubCategoryList.set([...isEquipmentSubCategory, ...notEquipmentSubCategory]);
          console.log("originalSubCategoryList", this.originalSubCategoryList());
        }),
        map(([isEquipmentSubCategory, notEquipmentSubCategory]) => {
          console.log(isEquipmentSubCategory, notEquipmentSubCategory);

          const isEquipmentSubCategoryList =
            isEquipmentSubCategory?.map((item: any) => ({
              name: item.subCategoryName,
              value: item.subCategoryName
            })
            )

          const notEquipmentSubCategoryList =
            notEquipmentSubCategory?.map((item: any) => ({
              name: item.subCategoryName,
              value: item.subCategoryName
            })
            )
          const group = [
            {
              label: "הוצאות שוטפות",
              items: notEquipmentSubCategoryList
            },
            isEquipmentSubCategoryList.length > 0 ? {
              label: "רכוש קבוע",
              items: isEquipmentSubCategoryList
            } : null,

          ].filter(Boolean); // To remove null values

          this.groupedSubCategory.set(group);
          console.log("groupedSubCategory", this.groupedSubCategory());
          
          return this.groupedSubCategory;
        })
      )
      .subscribe((res) => {
        console.log("combine sub category :", res());
        console.log(this.groupedSubCategory());

      })
  }

  openAddCategory(): void {
    this.openAddCategoryClicked.emit({ state: true, subCategoryMode: false })
  }

  openAddSubCategory(event: { state: true, subCategoryMode: true }): void {
    this.openAddSubCategoryClicked.emit({ state: event.state, subCategoryMode: event.subCategoryMode, category: this.myForm.get('categoryName')?.value })
  }

  onCheckboxClicked(event: any): void {
    this.myForm.patchValue({'isSingleUpdate': event.checked});
  }

  subCategorySelected(event: string): void {
    this.selectedSubCategory.set(this.originalSubCategoryList().find((item) => item.subCategoryName === event));
  }


}
