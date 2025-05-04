import { Component, inject, input, OnInit, output, signal, WritableSignal } from '@angular/core';
import { LeftPanelComponent } from "../left-panel/left-panel.component";
import { InputSelectComponent } from "../input-select/input-select.component";
import { ButtonComponent } from "../button/button.component";
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { ISelectItem } from 'src/app/shared/interface';
import { ButtonSize } from '../button/button.enum';
import { inputsSize } from 'src/app/shared/enums';
import { ExpenseDataService } from 'src/app/services/expense-data.service';
import { map, takeUntil, zip } from 'rxjs';
import { TransactionsService } from 'src/app/pages/transactions/transactions.page.service';
@Component({
  selector: 'app-classify-tran',
  templateUrl: './classify-tran.component.html',
  styleUrls: ['./classify-tran.component.scss'],
  imports: [LeftPanelComponent, InputSelectComponent, ButtonComponent, ToastModule],
  providers: [MessageService],
})
export class ClassifyTranComponent  implements OnInit {

  messageService = inject(MessageService);
  transactionService = inject(TransactionsService);
  expenseDataService = inject(ExpenseDataService);

  formBuilder = inject(FormBuilder);
  isVisible = input<boolean>(false);
  visibleChange = output<boolean>();
  classifyTranButtonClicked = output<any>();
  openAddCategoryClicked = output<{state: boolean; editMode: boolean }>();
  openAddSubCategoryClicked = output<{state: boolean; editMode: boolean }>();

  isLoading: WritableSignal<boolean> = signal(false);
  categoryList = signal<ISelectItem[]>([]);
  groupedSubCategory: WritableSignal<{ label: string; items: any; }[]> = signal([{ label: "", items: [] }]);


  // userData: IUserData;

  buttonSize = ButtonSize;
  inputsSize = inputsSize;
  myForm: FormGroup;

  constructor() {
    this.myForm = this.formBuilder.group({
      category: new FormControl(
        '', [Validators.required]
      ),
      subCategory: new FormControl(
        '', [Validators.required]
      ),
    });
  }

  ngOnInit() {
    // this.userData = this.authService.getUserDataFromLocalStorage();
    // if (this.userData.isTwoBusinessOwner) {
    //   this.myForm.get('businessNumber')?.setValidators([Validators.required]);
    // }
    this.getCategories();
    this.categoryList = this.transactionService.categories;
    console.log("category list", this.categoryList());
    
    this.getSubCategory('דיור');
  }

  onVisibleChange(visible: boolean) {
    this.visibleChange.emit(visible);
  }

  onButtonClicked(event: any): void {
    this.isLoading.set(true);
    const category = event.controls?.['category']?.value;
    const subCategory = event.controls?.['subCategory']?.value;
  }

  getCategories(): void {
    this.transactionService.getCategories(null)
      // .pipe(
      //   // takeUntil(this.destroy$),
      //   map((res) => {
      //     return res.map((item: any) => ({
      //       name: item.categoryName,
      //       value: item.categoryName
      //     })
      //     )
      //   }))
      .subscribe((res) => {
        console.log("category", res);
        // this.categoryList.set(res);
      })
  }

  onChangeInputSelect(event: string): void {
    console.log(event);
    this.getSubCategory(event);
  }

  getSubCategory(event: string): void {
      // this.subCategorySelected = false;
      // this.combinedListSubCategory = [];
      console.log(event);
  
      // const isEquipmentSubCategory = this.expenseDataService.getSubCategory(event.value, true, !this.incomeMode);
      // const notEquipmentSubCategory = this.expenseDataService.getSubCategory(event.value, false, !this.incomeMode);
      const isEquipmentSubCategory = this.expenseDataService.getSubCategory(event, true);
      const notEquipmentSubCategory = this.expenseDataService.getSubCategory(event, false);
  
      zip(isEquipmentSubCategory, notEquipmentSubCategory)
        .pipe(
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

            this.groupedSubCategory.set([
              {
                label: "הוצאות שוטפות",
                items: notEquipmentSubCategoryList
              },
              isEquipmentSubCategoryList.length > 0 ? {
                label: "רכוש קבוע",
                items: isEquipmentSubCategoryList
              } : null,
              
            ].filter(Boolean)) // to remove null values

            return this.groupedSubCategory;
          })
        )
        .subscribe((res) => {
          console.log("combine sub category :", res);
          console.log(this.groupedSubCategory());
          
        })
  }

  openAddCategory(): void {
    this.openAddCategoryClicked.emit({state: true, editMode: false})
  }

  openAddSubCategory(): void {
    this.openAddSubCategoryClicked.emit({state: true, editMode: true})
  }
  

}
