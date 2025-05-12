import { Component, Input, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { ExpenseDataService } from 'src/app/services/expense-data.service';
import { IClassifyTrans, IColumnDataTable, IDisplayCategorytDetails, IGetSubCategory, ISelectItem } from '../interface';
import { ExpenseFormColumns, ExpenseFormHebrewColumns, FormTypes, displayColumnsExpense } from '../enums';
import { EMPTY, catchError, finalize, map, switchMap, tap, zip } from 'rxjs';
import { TransactionsService } from 'src/app/pages/transactions/transactions.page.service';
import { ModalController } from '@ionic/angular';
import { GenericService } from 'src/app/services/generic.service';

@Component({
    selector: 'app-add-transaction',
    templateUrl: './add-transaction.component.html',
    styleUrls: ['./add-transaction.component.scss', '../../shared/shared-styling.scss'],
    standalone: false
})
export class AddTransactionComponent implements OnInit {

  @Input() date: any;
  @Input() data: any;
  @Input() set incomeMode(val: boolean) {
    if (val) {
      this.notBussinesCategoryTitle = "ההכנסה אינה הכנסה מעסק";
      this.isBussinesCategoryTitle = "ההכנסה הינה הכנסה מעסק";
      this.newCategoryIsRecognizeForm.get('category')?.setValue("הכנסה מעסק")
    }
    else {
      this.notBussinesCategoryTitle = "ההוצאה אינה הוצאה מוכרת";
      this.isBussinesCategoryTitle = "ההוצאה הינה הוצאה מוכרת";
      this.newCategoryIsRecognizeForm.get('isEquipment')?.setValidators([Validators.required]);
      this.newCategoryIsRecognizeForm.get('taxPercent')?.setValidators([Validators.required]);
      this.newCategoryIsRecognizeForm.get('vatPercent')?.setValidators([Validators.required]);
      this.newCategoryIsRecognizeForm.get('reductionPercent')?.setValidators([Validators.required]);
      // this.newCategoryIsRecognizeForm.addControl('isEquipment', new FormControl('', [Validators.required]));
      // this.newCategoryIsRecognizeForm.addControl('taxPercent', new FormControl('', [Validators.required]));
      // this.newCategoryIsRecognizeForm.addControl('vatPercent', new FormControl('', [Validators.required]));
      // this.newCategoryIsRecognizeForm.addControl('reductionPercent', new FormControl('', [Validators.required]));
    }
    this.isIncomeMode = val;
  }

  get incomeMode(): boolean {
    return this.isIncomeMode;
  }

  isIncomeMode: boolean = false;
  isBussinesCategoryTitle: string;
  notBussinesCategoryTitle: string;
  existCategory: boolean = true;
  existCategoryEquipmentForm: FormGroup;
  existCategoryNotEquipmentForm: FormGroup;
  newCategoryIsRecognizeForm: FormGroup;
  newCategoryNotRecognizedForm: FormGroup;
  categoryList: ISelectItem[];
  listNotIsEqiupmentSubCategory: any[]
  listIsEqiupmentSubCategory: ISelectItem[];
  listSubCategory: ISelectItem[];
  originalSubCategoryList: IGetSubCategory[] = [];
  subCategorySelected: boolean = false;
  categoryDetails: IGetSubCategory = { id: 0, categoryName: "", isRecognized: "", subCategoryName: "", isEquipment: "", reductionPercent: "", taxPercent: "", vatPercent: "", isExpense: false };
  equipmentType = 0;
  isRecognize: boolean = false;
  equipmentList: ISelectItem[] = [{ name: "לא", value: 0 }, { name: "כן", value: 1 }];
  isEquipment: boolean;
  isSingleUpdate: boolean;
  isOpenToast: boolean = false;
  combinedListSubCategory: ISelectItem[] = [];
  isOnlySubCategory: boolean = true;

  readonly formTypes = FormTypes;
  readonly displayHebrew = displayColumnsExpense;

  constructor(private modalCtrl: ModalController, private expenseDataServise: ExpenseDataService, private formBuilder: FormBuilder, private transactionsService: TransactionsService, private modalController: ModalController, private genericvService: GenericService) {
    this.existCategoryEquipmentForm = this.formBuilder.group({
      isSingleUpdate: new FormControl(
        false, [Validators.required,]
      ),
      category: new FormControl(''
        , [Validators.required,]
      ),
      subCategory: new FormControl(
        '', [Validators.required,]
      ),
    })

    this.newCategoryIsRecognizeForm = this.formBuilder.group({
      isSingleUpdate: new FormControl(
        '', [Validators.required,]
      ),
      isRecognized: new FormControl(
        true
      ),
      category: new FormControl(
        '', [Validators.required,]
      ),
      subCategory: new FormControl(
        '', [Validators.required,]
      ),
      isEquipment: new FormControl(
        '', [Validators.required,]
      ),
      taxPercent: new FormControl(
        '', [Validators.required,]
      ),
      vatPercent: new FormControl(
        '', [Validators.required,]
      ),
      reductionPercent: new FormControl(
        '', [Validators.required,]
      )
    })

    this.newCategoryNotRecognizedForm = this.formBuilder.group({
      isSingleUpdate: new FormControl(
        '', [Validators.required,]
      ),
      isRecognized: new FormControl(
        false
      ),
      category: new FormControl(
        '', [Validators.required,]
      ),
      subCategory: new FormControl(
        '', [Validators.required,]
      ),
    })

  }

  ngOnInit() {
    this.getCategory();
    console.log(this.data);
    console.log(this.incomeMode);

  }

  segmentClicked(event): void {
    const choose = event.target.value;
    choose === "new" ? this.existCategory = false : this.existCategory = true;
  }

  getCategory(): void {
    this.expenseDataServise.getcategry(null, !this.incomeMode)
      .pipe(
        map((res) => {
          return res.map((item: any) => ({
            name: item.categoryName,
            value: item.categoryName
          })
          )
        }))
      .subscribe((res) => {
        this.categoryList = res;
        console.log("isEquipment: ", this.categoryList);
      })
  }

  getSubCategory(event): void {
    this.subCategorySelected = false;
    this.combinedListSubCategory = [];
    console.log(event.value);

    const isEquipmentSubCategory = this.expenseDataServise.getSubCategory(event.value, true, !this.incomeMode);
    const notEquipmentSubCategory = this.expenseDataServise.getSubCategory(event.value, false, !this.incomeMode);

    zip(isEquipmentSubCategory, notEquipmentSubCategory)
      .pipe(
        map(([isEquipmentSubCategory, notEquipmentSubCategory]) => {
          console.log(isEquipmentSubCategory, notEquipmentSubCategory);
          // The if condition are to avoid undifiend  errors 
          if (isEquipmentSubCategory && notEquipmentSubCategory) {
            this.originalSubCategoryList.push(...isEquipmentSubCategory, ...notEquipmentSubCategory);
          }
          else if (isEquipmentSubCategory) {
            this.originalSubCategoryList.push(...isEquipmentSubCategory);
          }
          else if (notEquipmentSubCategory) {
            this.originalSubCategoryList.push(...notEquipmentSubCategory);
          }
          // else {
          //   this.originalSubCategoryList.push([{value: "לא קיימים תתי קטגוריות", name: ""}]);
          // }
          const isEquipmentSubCategoryList = isEquipmentSubCategory?.map((item: any) => ({
            name: item.subCategoryName,
            value: item.subCategoryName
          })
          );
          const notEquipmentSubCategoryList = notEquipmentSubCategory?.map((item: any) => ({
            name: item.subCategoryName,
            value: item.subCategoryName
          })
          )


          const separator: ISelectItem[] = [{ name: '--  קטגוריות רכוש קבוע --', value: null, disable: true }];
          if (isEquipmentSubCategoryList && notEquipmentSubCategoryList) {
            this.combinedListSubCategory.push(...notEquipmentSubCategoryList, ...separator, ...isEquipmentSubCategoryList);
          }
          else {
            isEquipmentSubCategoryList ? this.combinedListSubCategory.push(...isEquipmentSubCategoryList) : this.combinedListSubCategory.push(...notEquipmentSubCategoryList);
          }
          console.log(this.combinedListSubCategory);

          // return this.combinedListSubCategory.map((item: I) => {

          // })
          return this.combinedListSubCategory;
        })
      )
      .subscribe((res) => {
        console.log("combine sub category :", res);

      })
  }

  categoryDetailsOrderByFunc(a, b): number {

    const columnsOrder = [
      'categoryName',
      'subCategoryName',
      'isRecognized',
      'isEquipment',
      'taxPercent',
      'vatPercent',
      'reductionPercent'

    ];

    const indexA = columnsOrder.indexOf(a.key);
    const indexB = columnsOrder.indexOf(b.key);

    if (indexA === -1 && indexB !== -1) {
      return 1; // objA is not in the order list, move it to the end
    } else if (indexA !== -1 && indexB === -1) {
      return -1; // objB is not in the order list, move it to the end
    } else if (indexA === -1 && indexB === -1) {
      return 0; // both keys are not in the order list, leave them as is
    }

    if (indexA < indexB) {
      return -1;
    } else if (indexA > indexB) {
      return 1;
    } else {
      return 0;
    }
  }

  selectedSubCategory(event): void {
    console.log(event);
    console.log("originalSubCategoryList: ", this.originalSubCategoryList);

    if (this.existCategory) {
      this.subCategorySelected = true;
      const categoryDetailsFromServer: IGetSubCategory = this.originalSubCategoryList?.find((item) => item.subCategoryName === event.value);
      console.log("categoryDetailsFromServer :", categoryDetailsFromServer);

      this.categoryDetails.id = categoryDetailsFromServer?.id;
      this.categoryDetails.categoryName = categoryDetailsFromServer?.categoryName;
      this.categoryDetails.reductionPercent = categoryDetailsFromServer?.reductionPercent;
      this.categoryDetails.subCategoryName = categoryDetailsFromServer?.subCategoryName;
      this.categoryDetails.taxPercent = categoryDetailsFromServer?.taxPercent;
      this.categoryDetails.vatPercent = categoryDetailsFromServer?.vatPercent;
      categoryDetailsFromServer?.isRecognized ? this.categoryDetails.isRecognized = "כן" : this.categoryDetails.isRecognized = "לא";
      categoryDetailsFromServer?.isEquipment ? this.categoryDetails.isEquipment = "כן" : this.categoryDetails.isEquipment = "לא";
      console.log("category details: ", this.categoryDetails);

    }
    else {
      this.categoryDetails = this.originalSubCategoryList.find((item) => item.subCategoryName === event.value);
      this.newCategoryIsRecognizeForm.patchValue({ reductionPercent: this.categoryDetails.reductionPercent });
      this.newCategoryIsRecognizeForm.patchValue({ vatPercent: this.categoryDetails.vatPercent });
      this.newCategoryIsRecognizeForm.patchValue({ taxPercent: this.categoryDetails.taxPercent });
    }
  }

  equipmentTypeChanged(event): void {
    let form: FormGroup;
    this.equipmentType = event.detail.value;
    this.equipmentType ? this.isEquipment = false : this.isEquipment = true;
    console.log(this.equipmentType);
    if (this.equipmentType) {
      form = this.existCategoryNotEquipmentForm
    }
    else {
      form = this.existCategoryEquipmentForm
    }
    if (this.subCategorySelected) {
      this.selectedSubCategory({ value: form.get('subCategory').value });
    }
  }

  onCheckboxClassify(event): void {
    console.log(event.detail.checked);
    this.isSingleUpdate = event.detail.checked;
  }

  onCheckboxRecognize(event, isRecognize): void {
    console.log(event.detail.checked);
    this.isRecognize = event.detail.checked ? isRecognize : !isRecognize;
    console.log("is recog: ", this.isRecognize);

  }

  addClasssificationExistCategory(): void {
    this.genericvService.getLoader().subscribe();
    let formData: IClassifyTrans;
    formData = this.existCategoryEquipmentForm.value;
    formData.id = this.data.id;
    formData.billName = this.data.billName;
    formData.name = this.data.name;
    formData.category = this.categoryDetails.categoryName as string;
    formData.subCategory = this.categoryDetails.subCategoryName;
    formData.isRecognized = this.categoryDetails.isRecognized == "כן" ? true : false;
    formData.vatPercent = +this.categoryDetails.vatPercent;
    formData.taxPercent = +this.categoryDetails.taxPercent;
    formData.isEquipment = this.categoryDetails.isEquipment == "כן" ? true : false;;
    formData.reductionPercent = +this.categoryDetails.reductionPercent;
    formData.isNewCategory = false;
    formData.isExpense = !this.incomeMode;

    console.log(formData);
    this.transactionsService.addClassifiction(formData, this.date)
      .pipe(
        finalize(() => this.genericvService.dismissLoader()),
        catchError((err) => {
          this.modalController.dismiss(null, 'error');
          return EMPTY;
        })
      )
      .subscribe((res) => {
        this.modalController.dismiss(null, 'send');
        this.genericvService.dismissLoader()
        this.isOpenToast = true;
        console.log(res);
      })
  }

  addClasssificationNewCategory(): void {

    let formData: IClassifyTrans;
    if (this.incomeMode) {
      if (this.isRecognize) {
        formData = this.newCategoryIsRecognizeForm.getRawValue();
      }
      else {
        formData = this.newCategoryNotRecognizedForm.value;
      }
      formData.isExpense = false;
      formData.isSingleUpdate === 1 ? formData.isSingleUpdate = true : formData.isSingleUpdate = false;
      formData.vatPercent = 0;
      formData.taxPercent = 0;
      formData.reductionPercent = 0;
      formData.isEquipment = false;
      console.log("form data income mode: ", formData);
    }
    else {
      formData = this.newCategoryIsRecognizeForm.value;
      console.log("form before set: ", formData);

      if (this.isRecognize) {
        formData.isExpense = true;
        formData.isEquipment === 1 ? formData.isEquipment = true : formData.isEquipment = false;
        formData.isSingleUpdate === 1 ? formData.isSingleUpdate = true : formData.isSingleUpdate = false;
        formData.taxPercent = +formData.taxPercent;
        formData.vatPercent = +formData.vatPercent;
        formData.reductionPercent = formData.reductionPercent ? +formData.reductionPercent : 0;
      }
      else {
        formData = this.newCategoryNotRecognizedForm.value;
        formData.isExpense = true;
        formData.isSingleUpdate === 1 ? formData.isSingleUpdate = true : formData.isSingleUpdate = false;
        formData.vatPercent = 0;
        formData.taxPercent = 0;
        formData.reductionPercent = 0;
        formData.isEquipment = false;
        //formData.isRecognized = false;


      }
    }
    // same values for all forms
    formData.isNewCategory = true;
    formData.id = this.data.id;
    formData.billName = this.data.billName;
    formData.name = this.data.name;
    console.log(formData);

    this.genericvService.getLoader()
      .pipe(
        switchMap(() => this.transactionsService.addClassifiction(formData, this.date)),
        catchError((err) => {
          console.log("err in addClassifiction: ", err);
          return EMPTY;
        }),
        finalize(() => this.genericvService.dismissLoader())
      )
      .subscribe((res) => {
        this.genericvService.dismissLoader();
        this.modalController.dismiss(null, 'send');
        this.isOpenToast = true;
        console.log(res);
      })
  }

  setValueEquipment(event): void {
    this.listSubCategory = [];
    if (event.value) {
      this.isEquipment = true;;
    }
    else {
      this.isEquipment = false;;
    }
  }

  cancel(): void {
    this.modalCtrl.dismiss(null, 'cancel');
  }

}
