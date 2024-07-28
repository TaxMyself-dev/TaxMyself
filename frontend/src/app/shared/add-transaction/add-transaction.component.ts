import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { ExpenseDataService } from 'src/app/services/expense-data.service';
import { IColumnDataTable, IGetSubCategory } from '../interface';
import { ExpenseFormColumns, ExpenseFormHebrewColumns, FormTypes, displayColumnsExpense } from '../enums';
import { map, tap } from 'rxjs';

@Component({
  selector: 'app-add-transaction',
  templateUrl: './add-transaction.component.html',
  styleUrls: ['./add-transaction.component.scss'],
})
export class AddTransactionComponent implements OnInit {

  existCategory: boolean = true;
  existCategoryEquipmentForm: FormGroup;
  existCategoryNotEquipmentForm: FormGroup;
  listIsEqiupmentCategory: any[];
  listNotIsEqiupmentCategory: any[];
  listNotIsEqiupmentSubCategory: any[]
  listIsEqiupmentSubCategory: any[];
  originalSubCategoryList: IGetSubCategory[];
  originalNotSubCategoryList: IGetSubCategory[];
  subCategorySelected: boolean = false;
  displayDetails: IGetSubCategory;
  equipmentType = 0;

  readonly formTypes = FormTypes;
  readonly displayHebrew = displayColumnsExpense;

  constructor(private expenseDataServise: ExpenseDataService, private formBuilder: FormBuilder) {
    this.existCategoryEquipmentForm = this.formBuilder.group({
      oneTimeTransaction: new FormControl(
        false, [Validators.required,]
      ),
      category: new FormControl(''
        , [Validators.required,]
      ),
      subCategory: new FormControl(
        '', [Validators.required,]
      ),
      isEquipment: new FormControl(
        false, [Validators.required,]
      )
    })

    this.existCategoryNotEquipmentForm = this.formBuilder.group({
      oneTimeTransaction: new FormControl(
        false, [Validators.required,]
      ),
      category: new FormControl(
        '', [Validators.required,]
      ),
      subCategory: new FormControl(
        '', [Validators.required,]
      ),
      isEquipment: new FormControl(
        false, [Validators.required,]
      )
    })

  }

  ngOnInit() {
    // this.expenseDataServise.getcategry;
    this.getIsEquipmentCategory();
    this.getNotIsEquipmentCategory();
  }

  clicked(event): void {
    const choose = event.target.value;
    console.log("click");
    console.log(event);
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

      })
  }

  getNotIsEquipmentCategory(): void {
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
        this.listNotIsEqiupmentCategory = res;
        console.log("not is equipment: ", this.listNotIsEqiupmentCategory);

      })
  }

  getIsEquipmentSubCategory(event): void {
    this.subCategorySelected = false;
    console.log(event.value);
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
        this.listIsEqiupmentSubCategory = res;
        console.log(this.listIsEqiupmentSubCategory);

      })
  }

  getNotIsEquipmentSubCategory(event): void {
    this.subCategorySelected = false;
    console.log(event.value);
    this.expenseDataServise.getSubCategory(event.value, false)
      .pipe(
        tap((data) => {
          this.originalNotSubCategoryList = data;
          console.log(this.originalNotSubCategoryList);
        }),
        map((res) => {
          return res.map((item: IGetSubCategory) => ({
            name: item.subCategory,
            value: item.subCategory
          })
          )
        }))
      .subscribe((res) => {
        this.listNotIsEqiupmentSubCategory = res;
        console.log(this.listNotIsEqiupmentSubCategory);
      })
  }

  selectedIsEquipmentSubCategory(event): void {
    this.subCategorySelected = true;
    if (this.originalSubCategoryList) {
      this.displayDetails = this.originalSubCategoryList.find((item) => item.subCategory === event.value);
      if (!this.displayDetails) {
        this.displayDetails = this.originalNotSubCategoryList.find((item) => item.subCategory === event.value);
      }
    }
    else {
      this.displayDetails = this.originalNotSubCategoryList.find((item) => item.subCategory === event.value);
    }
  }

  equipmentTypeChanged(event): void {
    this.equipmentType = event.detail.value;
  }

}
