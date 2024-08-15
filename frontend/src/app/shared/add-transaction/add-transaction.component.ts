import { Component, Input, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { ExpenseDataService } from 'src/app/services/expense-data.service';
import { IColumnDataTable, IGetSubCategory, ISelectItem } from '../interface';
import { ExpenseFormColumns, ExpenseFormHebrewColumns, FormTypes, displayColumnsExpense } from '../enums';
import { EMPTY, catchError, finalize, map, tap } from 'rxjs';
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
  listIsEqiupmentCategory: ISelectItem[];
  listNotEqiupmentCategory: ISelectItem[];
  listNotIsEqiupmentSubCategory: any[]
  listIsEqiupmentSubCategory: ISelectItem[];
  listSubCategory: ISelectItem[];
  originalSubCategoryList: IGetSubCategory[];
  originalNotSubCategoryList: IGetSubCategory[];
  subCategorySelected: boolean = false;
  categoryDetails: IGetSubCategory;
  equipmentType = 0;
  isRecognize: boolean = false;
  equipmentList: ISelectItem[] = [{ name: "לא", value: 0 }, { name: "כן", value: 1 }];
  isEquipment: boolean;
  isSingleUpdate: boolean;
  isOpenToast: boolean = false;
  combinedListCategory: ISelectItem[] = [];

  readonly formTypes = FormTypes;
  readonly displayHebrew = displayColumnsExpense;

  constructor(private modalCtrl: ModalController, private expenseDataServise: ExpenseDataService, private formBuilder: FormBuilder, private transactionsService: TransactionsService,private modalController: ModalController) {
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

    this.existCategoryNotEquipmentForm = this.formBuilder.group({
      isSingleUpdate: new FormControl(
        false, [Validators.required,]
      ),
      category: new FormControl(
        '', [Validators.required,]
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
        '' 
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
        ''  
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
    this.getIsEquipmentCategory();
    this.getNotEquipmentCategory();
    // this.getAllCategory()
    console.log(this.isRecognize);
    console.log("date from input: ", this.date);
    console.log("data from input: ", this.data);

  }

  segmentClicked(event): void {
    const choose = event.target.value;
    choose === "new" ? this.existCategory = false : this.existCategory = true;
  }

  getIsEquipmentCategory(): void {
    this.expenseDataServise.getcategry(true)
      .pipe(
        map((res) => {
          return res.map((item: string) => ({
            name: item,
            value: item
          })
          )
        }))
      .subscribe((res) => {
        this.listIsEqiupmentCategory = res;
        console.log("isEquipment: ", this.listIsEqiupmentCategory);
        this.getAllCategory()
      })
  }

  getNotEquipmentCategory(): void {
    this.expenseDataServise.getcategry(false)
      .pipe(
        map((res) => {
          return res.map((item: string) => ({
            name: item,
            value: item
          })
          )
        }))
      .subscribe((res) => {
        this.listNotEqiupmentCategory = res;
        console.log("not is equipment: ", this.listNotEqiupmentCategory);
        this.getAllCategory()
      })
  }

  getAllCategory(): void {
    const separator: ISelectItem[] = [{name: '----- מוגדרות כציוד -----', value: null, disable: true}];
    if (this.listIsEqiupmentCategory && this.listNotEqiupmentCategory) {
      this.combinedListCategory.push(...this.listNotEqiupmentCategory,...separator,...this.listIsEqiupmentCategory);
    }
    console.log(this.combinedListCategory);
    
  }
  getSubCategory(event): void {
    this.subCategorySelected = false;
    console.log(event.value);
    if (this.isEquipment) {

      this.expenseDataServise.getSubCategory(event.value, true)
        .pipe(
          tap((data) => {
            this.originalSubCategoryList = data;
            console.log(this.originalSubCategoryList);
          }),
          map((res) => {
            return res.map((item: IGetSubCategory) => ({
              name: item.subCategory,
              value: item.subCategory
            })
            )
          }))
        .subscribe((res) => {
          this.listSubCategory = res;
          // this.listIsEqiupmentSubCategory = res;
          console.log(this.listSubCategory);

        })
    }
    else {
      this.expenseDataServise.getSubCategory(event.value, false)
        .pipe(
          tap((data) => {
            this.originalSubCategoryList = data;
            console.log(this.originalSubCategoryList);
          }),
          map((res) => {
            return res.map((item: IGetSubCategory) => ({
              name: item.subCategory,
              value: item.subCategory
            })
            )
          }))
        .subscribe((res) => {
          this.listSubCategory = res;
          // this.listIsEqiupmentSubCategory = res;
          console.log(this.listSubCategory);

        })
    }
  }

  // getNotEquipmentSubCategory(event): void {
  //   this.subCategorySelected = false;
  //   console.log(event.value);
  //   this.expenseDataServise.getSubCategory(event.value, false)
  //     .pipe(
  //       tap((data) => {
  //         this.originalNotSubCategoryList = data;
  //         console.log(this.originalNotSubCategoryList);
  //       }),
  //       map((res) => {
  //         return res.map((item: IGetSubCategory) => ({
  //           name: item.subCategory,
  //           value: item.subCategory
  //         })
  //         )
  //       }))
  //     .subscribe((res) => {
  //       this.listNotIsEqiupmentSubCategory = res;
  //       console.log(this.listNotIsEqiupmentSubCategory);
  //     })
  // }

  selectedSubCategory(event): void {
    if (this.existCategory) {
      this.subCategorySelected = true;
      this.categoryDetails = this.originalSubCategoryList.find((item) => item.subCategory === event.value);
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
    console.log("is recog: ",this.isRecognize);
    
  }

  addClasssification(): void {
    let formData;
    if (this.equipmentType) {
      formData = this.existCategoryNotEquipmentForm.value;
    }
    else {
      formData = this.existCategoryEquipmentForm.value;
    }
    console.log("in class");
    formData.category = this.categoryDetails.category;
    formData.subCategory = this.categoryDetails.subCategory;
    formData.isRecognized = this.categoryDetails.isRecognized;
    formData.vatPercent = this.categoryDetails.vatPercent;
    formData.taxPercent = this.categoryDetails.taxPercent;
    formData.isEquipment = this.categoryDetails.isEquipment;
    formData.reductionPercent = this.categoryDetails.reductionPercent;
    formData.isSingleMonth = this.date.isSingleMonth;
    formData.month = this.date.month;
    formData.year = this.date.year;
    formData.id = this.data.id;
    formData.billName = this.data.billName;
    formData.name = this.data.name;
    console.log(formData);
    this.transactionsService.addClassifiction(formData)
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

  getCategory(): any {
    if (this.isEquipment) {
      return this.listIsEqiupmentCategory;
    }
    else {
      return this.listNotEqiupmentCategory;
    }
  }

  getListSubCategory(): any {
    return this.listSubCategory;
  }

  cancel(): void {
    this.modalCtrl.dismiss(null,'cancel');
  }

}
