import { Component, Input, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { ExpenseDataService } from 'src/app/services/expense-data.service';
import { IClassifyTrans, IColumnDataTable, IGetSubCategory, ISelectItem } from '../interface';
import { ExpenseFormColumns, ExpenseFormHebrewColumns, FormTypes, displayColumnsExpense } from '../enums';
import { EMPTY, catchError, finalize, map, tap, zip } from 'rxjs';
import { TransactionsService } from 'src/app/pages/transactions/transactions.page.service';
import { ModalController } from '@ionic/angular';

@Component({
  selector: 'app-add-transaction',
  templateUrl: './add-transaction.component.html',
  styleUrls: ['./add-transaction.component.scss', '../../shared/shared-styling.scss'],
})
export class AddTransactionComponent implements OnInit {

  @Input() date;
  @Input() data;

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
  categoryDetails: IGetSubCategory;
  equipmentType = 0;
  isRecognize: boolean = false;
  equipmentList: ISelectItem[] = [{ name: "לא", value: 0 }, { name: "כן", value: 1 }];
  isEquipment: boolean;
  isSingleUpdate: boolean;
  isOpenToast: boolean = false;
  combinedListSubCategory: ISelectItem[] = [];

  readonly formTypes = FormTypes;
  readonly displayHebrew = displayColumnsExpense;

  constructor(private modalCtrl: ModalController, private expenseDataServise: ExpenseDataService, private formBuilder: FormBuilder, private transactionsService: TransactionsService, private modalController: ModalController) {
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
      // isEquipment: new FormControl(
      //   false, [Validators.required,]
      // )
    })

    this.newCategoryIsRecognizeForm = this.formBuilder.group({
      isSingleUpdate: new FormControl(
        '', [Validators.required,]
      ),
      isRecognize: new FormControl(
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
      isRecognize: new FormControl(
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
  }

  segmentClicked(event): void {
    const choose = event.target.value;
    choose === "new" ? this.existCategory = false : this.existCategory = true;
  }

  getCategory(): void {
    this.expenseDataServise.getcategry(null)
      .pipe(
        map((res) => {
          return res.map((item: any) => ({
            name: item.category,
            value: item.id
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

    const isEquipmentSubCategory = this.expenseDataServise.getSubCategory(event.value, true);
    const notEquipmentSubCategory = this.expenseDataServise.getSubCategory(event.value, false);

    zip(isEquipmentSubCategory, notEquipmentSubCategory)
      .pipe(
        map(([isEquipmentSubCategory, notEquipmentSubCategory]) => {
          console.log(isEquipmentSubCategory, notEquipmentSubCategory);
          this.originalSubCategoryList.push(...isEquipmentSubCategory, ...notEquipmentSubCategory);
          const isEquipmentSubCategoryList = isEquipmentSubCategory.map((item: any) => ({
            name: item.subCategory,
            value: item.id
          })
          );
          const notEquipmentSubCategoryList = notEquipmentSubCategory.map((item: any) => ({
            name: item.subCategory,
            value: item.id
          })
          )


          const separator: ISelectItem[] = [{ name: '-- מוגדרות כציוד --', value: null, disable: true }];
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

  selectedSubCategory(event): void {
    console.log(event);
    
    if (this.existCategory) {
      this.subCategorySelected = true;
      this.categoryDetails = this.originalSubCategoryList.find((item) => item.id === event.value);
      this.categoryDetails.isRecognized ? this.categoryDetails.isRecognized = "כן" : this.categoryDetails.isRecognized = "לא";
      this.categoryDetails.isEquipment ? this.categoryDetails.isEquipment = "כן" : this.categoryDetails.isEquipment = "לא";
      delete this.categoryDetails.id;
    }
    else {
      this.categoryDetails = this.originalSubCategoryList.find((item) => item.subCategory === event.value);
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
    let formData: IClassifyTrans;
    formData = this.existCategoryEquipmentForm.value;
    formData.id = this.data.id;
    formData.billName = this.data.billName;
    formData.name = this.data.name;
    formData.category = this.categoryDetails.category.name;
    formData.subCategory = this.categoryDetails.subCategory;
    formData.isRecognized = this.categoryDetails.isRecognized == "כן" ? true : false;
    formData.vatPercent = +this.categoryDetails.vatPercent;
    formData.taxPercent = +this.categoryDetails.taxPercent;
    formData.isEquipment = this.categoryDetails.isEquipment == "כן" ? true : false;;
    formData.reductionPercent = +this.categoryDetails.reductionPercent;
    console.log(formData);
    this.transactionsService.addClassifiction(formData, this.date)
      .pipe(
        catchError((err) => {
          return EMPTY;
        })
      )
      .subscribe((res) => {
        this.modalController.dismiss(null, 'cancel');
        this.isOpenToast = true;
        console.log(res);
      })
  }

  addClasssificationNewCategory(): void {
    let formData: IClassifyTrans;
    if (this.isRecognize) {
      formData = this.newCategoryIsRecognizeForm.value;
    }
    else {
      formData = this.newCategoryNotRecognizedForm.value;
    }
    formData.isNewCategory = true;
    formData.id = this.data.id;
    formData.billName = this.data.billName;
    formData.name = this.data.name;
    console.log(formData);
    this.transactionsService.addClassifiction(formData, this.date)
      .pipe(
        catchError((err) => {
          return EMPTY;
        })
      )
      .subscribe((res) => {
        this.modalController.dismiss(null, 'cancel');
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
