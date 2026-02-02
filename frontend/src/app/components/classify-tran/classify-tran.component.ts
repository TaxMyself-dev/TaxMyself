import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { CheckboxModule } from 'primeng/checkbox';
import { ToastModule } from 'primeng/toast';
import { catchError, EMPTY, finalize, map, tap, zip } from 'rxjs';
import { TransactionsService } from 'src/app/pages/transactions/transactions.page.service';
import { ExpenseDataService } from 'src/app/services/expense-data.service';
import { displayColumnsExpense, inputsSize } from 'src/app/shared/enums';
import { IRowDataTable, ISelectItem, ISubCategory } from 'src/app/shared/interface';
import { ButtonComponent } from "../button/button.component";
import { ButtonSize } from '../button/button.enum';
import { InputDateComponent } from '../input-date/input-date.component';
import { InputSelectComponent } from "../input-select/input-select.component";
import { InputTextComponent } from '../input-text/input-text.component';
import { LeftPanelComponent } from "../left-panel/left-panel.component";


@Component({
  selector: 'app-classify-tran',
  templateUrl: './classify-tran.component.html',
  styleUrls: ['./classify-tran.component.scss'],
  imports: [
    LeftPanelComponent,
    InputSelectComponent,
    InputTextComponent,
    InputDateComponent,
    ButtonComponent,
    ToastModule,
    CheckboxModule,
    CommonModule,
    ReactiveFormsModule,
  ],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClassifyTranComponent implements OnInit {
  messageService = inject(MessageService);
  transactionService = inject(TransactionsService);
  expenseDataService = inject(ExpenseDataService);
  formBuilder = inject(FormBuilder);

  // Inputs / Outputs
  isVisible = input<boolean>(false);
  incomeMode = input<boolean>(false);
  visibleChange = output<{ visible: boolean; data: boolean }>();
  openAddCategoryClicked = output<{ state: boolean; subCategoryMode: boolean; data: IRowDataTable }>();
  openAddSubCategoryClicked = output<{ state: boolean; subCategoryMode: boolean; data: IRowDataTable; category: string }>();
  rowData = input<IRowDataTable>();

  // Signals
  isLoading = signal<boolean>(false);
  categoryList = signal<ISelectItem[]>([]);
  groupedSubCategory = signal([{ label: '', items: [] }]);
  originalSubCategoryList = signal<ISubCategory[]>([]);
  selectedSubCategory = signal<ISubCategory | null>(null);
  showAdvancedSection = signal(false);

  // UI constants
  buttonSize = ButtonSize;
  inputsSize = inputsSize;
  readonly displayHebrew = displayColumnsExpense;

  orderedKeys: string[] = [
    'categoryName',
    'subCategoryName',
    'isRecognized',
    'isEquipment',
    'taxPercent',
    'vatPercent',
    'reductionPercent',
  ];

  // FORM
  myForm: FormGroup;

  // Computed display for subcategory details
  selectedSubCategoryEntries = computed(() => {
    const subCat = this.selectedSubCategory();
    if (!subCat) return [];

    const isExpense = subCat.isRecognized;
    return this.orderedKeys
      .filter((key) => key in subCat)
      .filter((key) => {
        if (isExpense === false) return key === 'categoryName' || key === 'subCategoryName';
        return true;
      })
      .map((key) => ({
        key,
        value: subCat[key as keyof ISubCategory],
      }));
  });

  constructor() {
    this.myForm = this.formBuilder.group({
      categoryName: ['', Validators.required],
      subCategoryName: ['', Validators.required],
      isSingleUpdate: [false],
      isRecognized: [false],
      isEquipment: [false],
      taxPercent: [null, [Validators.min(0), Validators.max(100)]],
      vatPercent: [null, [Validators.min(0), Validators.max(100)]],
      reductionPercent: [null, [Validators.min(0), Validators.max(100)]],
      isExpense: [false],
      // New advanced classification fields
      startDate: [null],
      endDate: [null],
      minSum: [null],
      maxSum: [null],
      comment: [null],
      commentMatchType: ['equals'],
    });
    this.toggleDetailControls(false);
  }

  ngOnInit() {
    this.getCategories();
    this.categoryList = this.transactionService.categories;
  }

  // =========================== FORM ACTIONS ===========================

  onVisibleChange(visible: boolean) {
    this.visibleChange.emit({ visible, data: false });
  }

  classifyTransaction(): void {
    this.isLoading.set(true);
    const raw = this.myForm.getRawValue() as any;
    const isSingle = !!raw.isSingleUpdate;
    const formData: any = {
      id: this.rowData().id,
      name: this.rowData().name,
      billName: this.rowData().billName,
      category: raw.categoryName,
      subCategory: raw.subCategoryName,
      isSingleUpdate: isSingle,
    };

    if (isSingle) {
      Object.assign(formData, {
        isRecognized: !!raw.isRecognized,
        vatPercent: +(raw.vatPercent ?? 0),
        taxPercent: +(raw.taxPercent ?? 0),
        isEquipment: !!raw.isEquipment,
        reductionPercent: +(raw.reductionPercent ?? 0),
        isExpense: !!raw.isExpense,
      });
    } else {
      Object.assign(formData, {
        startDate: raw.startDate,
        endDate: raw.endDate,
        minSum: raw.minSum,
        maxSum: raw.maxSum,
        comment: raw.comment,
        matchType: raw.commentMatchType,
      });
    }

    console.log('🚀 classifyTransaction formData:', formData);

    this.transactionService
      .addClassifiction(formData)
      .pipe(
        catchError((err) => {
          console.error('Error classify transaction', err);
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'מיפוי התנועה נכשל',
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
          detail: 'מיפוי התנועה בוצע בהצלחה',
          life: 3000,
          key: 'br',
        });
      });
  }

  // =========================== CATEGORY LOGIC ===========================
  getCategories(): void {
    this.transactionService.getCategories(null, !this.incomeMode()).subscribe();
  }

  getSubCategory(event: string | boolean): void {
    this.myForm.patchValue({ subCategoryName: '' });
    this.selectedSubCategory.set(null);
    const isEq = this.expenseDataService.getSubCategory(event as string, true, !this.incomeMode());
    const notEq = this.expenseDataService.getSubCategory(event as string, false, !this.incomeMode());

    zip(isEq, notEq)
      .pipe(
        tap(([eq, neq]) => this.originalSubCategoryList.set([...eq, ...neq])),
        map(([eq, neq]) => {
          const group = [
            { label: 'הוצאות שוטפות', items: neq.map((x: any) => ({ name: x.subCategoryName, value: x.subCategoryName })) },
            eq.length ? { label: 'רכוש קבוע', items: eq.map((x: any) => ({ name: x.subCategoryName, value: x.subCategoryName })) } : null,
          ].filter(Boolean);
          this.groupedSubCategory.set(group);
        })
      )
      .subscribe();
  }

  openAddCategory(): void {
    this.openAddCategoryClicked.emit({ state: true, subCategoryMode: false, data: this.rowData() });
  }

  openAddSubCategory(event: { state: true; subCategoryMode: true }): void {
    this.openAddSubCategoryClicked.emit({
      state: event.state,
      subCategoryMode: event.subCategoryMode,
      data: this.rowData(),
      category: this.myForm.get('categoryName')?.value,
    });
  }

  onCheckboxClicked(event: any): void {
    this.myForm.patchValue({ isSingleUpdate: event.checked });
    this.toggleDetailControls(!!event.checked);
  }

  subCategorySelected(event: string | boolean): void {
    this.selectedSubCategory.set(this.originalSubCategoryList().find((item) => item.subCategoryName === event) || null);
    const sub = this.selectedSubCategory();
    if (sub) {
      this.myForm.patchValue({
        isRecognized: sub.isRecognized,
        isEquipment: sub.isEquipment,
        taxPercent: sub.taxPercent ?? null,
        vatPercent: sub.vatPercent ?? null,
        reductionPercent: sub.reductionPercent ?? null,
      });
      this.toggleDetailControls(!!this.myForm.get('isSingleUpdate')?.value);
    }
  }

  private toggleDetailControls(enable: boolean): void {
    const keys = ['isRecognized', 'isEquipment', 'taxPercent', 'vatPercent', 'reductionPercent', 'isExpense'];
    keys.forEach((k) => {
      const c = this.myForm.get(k);
      if (!c) return;
      if (enable) c.enable({ emitEvent: false });
      else c.disable({ emitEvent: false });
    });
  }
}


// @Component({
//   selector: 'app-classify-tran',
//   templateUrl: './classify-tran.component.html',
//   styleUrls: ['./classify-tran.component.scss'],
//   imports: [LeftPanelComponent, InputSelectComponent, ButtonComponent, ToastModule, CheckboxModule, CommonModule, ReactiveFormsModule],
//   standalone: true,
//   changeDetection: ChangeDetectionStrategy.OnPush,
//   // providers: [MessageService],
// })
// export class ClassifyTranComponent implements OnInit {

//   messageService = inject(MessageService);
//   transactionService = inject(TransactionsService);
//   expenseDataService = inject(ExpenseDataService);

//   formBuilder = inject(FormBuilder);
//   isVisible = input<boolean>(false);
//   incomeMode = input<boolean>(false);
//   visibleChange = output<{visible: boolean, data: boolean}>();
//   classifyTranButtonClicked = output<any>();
//   openAddCategoryClicked = output<{ state: boolean; subCategoryMode: boolean }>();
//   openAddSubCategoryClicked = output<{ state: boolean; subCategoryMode: boolean, category: string }>();
//   rowData = input<IRowDataTable>();
//   isLoading: WritableSignal<boolean> = signal(false);
//   categoryList = signal<ISelectItem[]>([]);
//   groupedSubCategory = signal([{ label: "", items: [] }]);
//   originalSubCategoryList = signal<IGetSubCategory[]>([]);
//   selectedSubCategory = signal<IGetSubCategory | null>(null);
//   // selectedSubCategoryEntries: any
//   // userData: IUserData;

//   buttonSize = ButtonSize;
//   inputsSize = inputsSize;
//   myForm: FormGroup;

//   readonly displayHebrew = displayColumnsExpense;

//   orderedKeys: string[] = [
//     'categoryName',
//     'subCategoryName',
//     'isRecognized',
//     'isEquipment',
//     'taxPercent',
//     'vatPercent',
//     'reductionPercent'

//   ];

//   selectedSubCategoryEntries = computed(() => {
//     const subCat = this.selectedSubCategory();
//     if (!subCat) return [];

//     const isExpense = subCat.isRecognized;

//     return this.orderedKeys
//       .filter((key) => key in subCat)
//       .filter((key) => {
//         // if not an expense, only show name keys
//         if (isExpense === false) {
//           return key === 'categoryName' || key === 'subCategoryName';
//         }
//         return true; // if it's an expense, show all keys
//       })
//       .map((key) => ({
//         key,
//         value: subCat[key as keyof IGetSubCategory],
//       }));
//   });


//   constructor() {
//     this.myForm = this.formBuilder.group({
//       categoryName: new FormControl(
//         '', [Validators.required]
//       ),
//       subCategoryName: new FormControl(
//         '', [Validators.required]
//       ),
//       isSingleUpdate: new FormControl(
//         false, []
//       ),
//       isRecognized: new FormControl(false, []),
//       isEquipment: new FormControl(false, []),
//       taxPercent: new FormControl<number | null>(null, [Validators.min(0), Validators.max(100)]),
//       vatPercent: new FormControl<number | null>(null, [Validators.min(0), Validators.max(100)]),
//       reductionPercent: new FormControl<number | null>(null, [Validators.min(0), Validators.max(100)]),
//       isExpense: new FormControl(false, []),
//     });
//     this.toggleDetailControls(false);
//   }

//   ngOnInit() {
//     this.getCategories();
//     this.categoryList = this.transactionService.categories;
//   }

//   onVisibleChange(visible: boolean) {
//     this.visibleChange.emit({visible: visible, data: false});
//   }

//   classifyTransaction(event: any): void {
//     this.isLoading.set(true);
//     const raw = this.myForm.getRawValue() as any;
//     const isSingle = !!raw.isSingleUpdate;
//     const category = raw.categoryName;
//     const subCategory = raw.subCategoryName;
//     let formData: any;
//     if (!isSingle) {
//       formData = {
//         id: this.rowData().id as number,
//         isSingleUpdate: false,
//         name: this.rowData().name as string,
//         billName: this.rowData().billName as string,
//         category,
//         subCategory,
//       };
//     } else {
//       formData = {
//         id: this.rowData().id as number,
//         isSingleUpdate: true,
//         name: this.rowData().name as string,
//         billName: this.rowData().billName as string,
//         category,
//         subCategory,
//         isRecognized: !!raw.isRecognized,
//         vatPercent: +(raw.vatPercent ?? 0),
//         taxPercent: +(raw.taxPercent ?? 0),
//         isEquipment: !!raw.isEquipment,
//         reductionPercent: +(raw.reductionPercent ?? 0),
//         isExpense: !!raw.isExpense,
//       };
//     }
//     console.log("🚀 ~ ClassifyTranComponent ~ classifyTransaction ~ formData:", formData)

//     this.transactionService.addClassifiction(formData)
//     .pipe(
//       catchError((err) => {
//         console.log("error in classify transaction", err);
//         // this.isLoading.set(false);
//         this.messageService.add({
//           severity: 'error',
//           summary: 'Error',
//           sticky: true, 
//           detail:"מיפוי התנועה נכשל",
//           life: 3000,
//           key: 'br'
//         })
//         return EMPTY;
//       }),
//       finalize(() => {
//         this.isLoading.set(false);
//       }),
//     )
//     .subscribe((res) => {
//       console.log("res in classify transaction", res);
//      this.visibleChange.emit({visible: false, data: true} );
//       // this.messageService.add({ severity: 'success', summary: 'Success', detail: 'Transaction classified successfully', key: 'br' });
//       this.messageService.add({
//         severity: 'success',
//         summary: 'Success',
//         detail:"מיפוי התנועה בוצע בהצלחה",
//         life: 3000,
//         key: 'br'
//       })
    
//     }
//     )
//   }
  

//   getCategories(): void {
//     this.transactionService.getCategories(null, !this.incomeMode())
//       .subscribe((res) => {
//         console.log("category", res);
//       })
//   }

//   onChangeInputSelect(event: string): void {
//     console.log(event);
//     this.getSubCategory(event);
//   }

//   getSubCategory(event: string): void {
//     console.log("🚀 ~ ClassifyTranComponent ~ getSubCategory ~ event:", event)
//     this.myForm.patchValue({ 'subCategoryName': '' }); // reset subcategory when category changes for the change form to invlaid.
//     this.selectedSubCategory.set(null); // For hidden the details subCategory section.
//     const isEquipmentSubCategory = this.expenseDataService.getSubCategory(event, true, !this.incomeMode());
//     const notEquipmentSubCategory = this.expenseDataService.getSubCategory(event, false, !this.incomeMode());

//     zip(isEquipmentSubCategory, notEquipmentSubCategory)
//       .pipe(
//         tap(([isEquipmentSubCategory, notEquipmentSubCategory]) => {
//           this.originalSubCategoryList.set([...isEquipmentSubCategory, ...notEquipmentSubCategory]);
//           console.log("originalSubCategoryList", this.originalSubCategoryList());
//         }),
//         map(([isEquipmentSubCategory, notEquipmentSubCategory]) => {
//           console.log(isEquipmentSubCategory, notEquipmentSubCategory);

//           const isEquipmentSubCategoryList =
//             isEquipmentSubCategory?.map((item: any) => ({
//               name: item.subCategoryName,
//               value: item.subCategoryName
//             })
//             )

//           const notEquipmentSubCategoryList =
//             notEquipmentSubCategory?.map((item: any) => ({
//               name: item.subCategoryName,
//               value: item.subCategoryName
//             })
//             )
//           const group = [
//             {
//               label: "הוצאות שוטפות",
//               items: notEquipmentSubCategoryList
//             },
//             isEquipmentSubCategoryList.length > 0 ? {
//               label: "רכוש קבוע",
//               items: isEquipmentSubCategoryList
//             } : null,

//           ].filter(Boolean); // To remove null values

//           this.groupedSubCategory.set(group);
//           console.log("groupedSubCategory", this.groupedSubCategory());
          
//           return this.groupedSubCategory;
//         })
//       )
//       .subscribe((res) => {
//         console.log("combine sub category :", res());
//         console.log(this.groupedSubCategory());

//       })
//   }

//   openAddCategory(): void {
//     this.openAddCategoryClicked.emit({ state: true, subCategoryMode: false })
//   }

//   openAddSubCategory(event: { state: true, subCategoryMode: true }): void {
//     this.openAddSubCategoryClicked.emit({ state: event.state, subCategoryMode: event.subCategoryMode, category: this.myForm.get('categoryName')?.value })
//   }

//   onCheckboxClicked(event: any): void {
//     this.myForm.patchValue({'isSingleUpdate': event.checked});
//     this.toggleDetailControls(!!event.checked);
//   }

//   subCategorySelected(event: string): void {
//     this.selectedSubCategory.set(this.originalSubCategoryList().find((item) => item.subCategoryName === event));
//     const sub = this.selectedSubCategory();
//     if (sub) {
//       this.myForm.patchValue({
//         isRecognized: sub.isRecognized as boolean,
//         isEquipment: sub.isEquipment as boolean,
//         taxPercent: (sub as any).taxPercent ?? null,
//         vatPercent: (sub as any).vatPercent ?? null,
//         reductionPercent: (sub as any).reductionPercent ?? null,
//       });
//       const isSingle = this.myForm.get('isSingleUpdate')?.value as boolean;
//       this.toggleDetailControls(!!isSingle);
//     }
//   }

//   private toggleDetailControls(enable: boolean): void {
//     const keys = ['isRecognized','isEquipment','taxPercent','vatPercent','reductionPercent','isExpense'];
//     keys.forEach(k => {
//       const c = this.myForm.get(k);
//       if (!c) return;
//       if (enable) { c.enable({ emitEvent: false }); } else { c.disable({ emitEvent: false }); }
//     });
//   }


// }
