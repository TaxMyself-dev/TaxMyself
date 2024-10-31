import { HttpClient } from '@angular/common/http';
import { Component, Input, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { PopoverController } from '@ionic/angular';
import { BehaviorSubject, EMPTY, Observable, catchError, finalize, map, of, switchMap, tap } from 'rxjs';
import { FilesService } from 'src/app/services/files.service';
import { ICreateSupplier, IGetSubCategory, IRowDataTable } from '../interface';
import { cloneDeep, isEqual } from 'lodash';
import { ExpenseDataService } from 'src/app/services/expense-data.service';

@Component({
  selector: 'app-add-supplier',
  templateUrl: './add-supplier.component.html',
  styleUrls: ['./add-supplier.component.scss'],
})
export class addSupplierComponent implements OnInit {

  @Input() set supplier(val: ICreateSupplier) {
    console.log("in add sup", val);
    this.reductionPercent = val.reductionPercent.toString();
    this.id = val.id;
    if (val.isEquipment) {
      val.isEquipment = "1";
      this.isEquipment = true;
    }
    else {
      val.isEquipment = "0";
      this.isEquipment = false;
    }
    this.supplierData = val;
    this.initForm(val);
  };
  @Input() editMode: boolean;

  get supplier(): ICreateSupplier {
    return this.supplierData;
  }
 

  initialForm: FormGroup;
  myForm: FormGroup;
  supplierData: ICreateSupplier;
  arrFields = [{ key: "name", value: "שם ספק", type: "text" }, { key: "supplierID", value: "ח.פ. ספק", type: "text" }, { key: "category", value: "קטגוריה", type: "ddl" }, { key: "subCategory", value: "תת-קטגוריה", type: "ddl" }, { key: "taxPercent", value: "אחוז מוכר למס", type: "text" }, { key: "vatPercent", value: "אחוז מוכר למעמ", type: "text" }, { key: "isEquipment", value: "מוכר כציוד", type: "ddl" }, { key: "reductionPercent", value: "פחת", type: "text" }]
  id: number;
  reductionPercent: string;
  isEquipment: boolean;
  equipmentList: Record<string, string>[] = [{ key: "לא", value: "0" }, { key: "כן", value: "1" }];
  categoryList: {};
  subCategoryList: IGetSubCategory[];
  subCategoriesListDataMap = new Map<string, any[]>();
  categoriesListDataMap = new Map<boolean, any[]>();
  doneLoadingCategoryList$ = new BehaviorSubject<boolean>(false);
  doneLoadingSubCategoryList$ = new BehaviorSubject<boolean>(false);

  constructor(private expenseDataService: ExpenseDataService, private formBuilder: FormBuilder, private popoverController: PopoverController) { }

  ngOnInit() {
    //this.getCategoryFromServer(this.supplierData);
    console.log(this.categoryList);
    console.log(this.subCategoryList);
    this.categoryList = this.expenseDataService.getcategry();
    console.log("categories: ", this.categoryList);
    
    
  }

  initForm(data: ICreateSupplier): void {
    //console.log(data);
    
    this.myForm = this.formBuilder.group({
      category: [data?.category || '', Validators.required],
      subCategory: [data?.subCategory || '', Validators.required],
      name: [data?.name || '', Validators.required],
      taxPercent: [data?.taxPercent || '', Validators.required],
      vatPercent: [data?.vatPercent || '', Validators.required],
      supplierID: [data?.supplierID || '',],
      isEquipment: [data?.isEquipment || false,],
      reductionPercent: [this.reductionPercent || '',],
    })
    this.initialForm = cloneDeep(this.myForm);
  }

  confirm(data: any): Observable<any> {
    return this.editMode ? this.expenseDataService.editSupplier(data, this.id) : this.expenseDataService.addSupplier(data);
  };

  disableSave(): boolean {
    return !this.myForm.valid || (this.editMode ? isEqual(this.initialForm.value, this.myForm.value) : false)
  }

  cancel(): void {
    this.popoverController.dismiss();
  }

  saveSupplier(): void {
    console.log("save");
    console.log("edit?", this.editMode);
    const formData = this.setFormData();
    console.log("form data supplier", formData);
    
    this.confirm(formData).pipe(
      catchError((err) => {
        console.log("somthing faild", err);
        return EMPTY;
      })).subscribe((res) => {
        console.log("res of save sup: ", res);
        this.popoverController.dismiss(this.myForm);
      });
  }

  setFormData() {
    const formData = this.myForm.value;
    const token = localStorage.getItem('token');
    formData.token = this.formBuilder.control(token).value;
    formData.taxPercent = +formData.taxPercent;
    formData.vatPercent = +formData.vatPercent;
    formData.reductionPercent = +formData.reductionPercent;
    if (formData.isEquipment == "1") {
      formData.isEquipment = true;
    }
    if (formData.isEquipment == "0") {
      formData.isEquipment = false;
    }
    console.log("fornData send: ", formData);
    return formData;
  }

  onDdlSelectionChange(event: any, data: any) {
    console.log(event);
    console.log(data);
    
    switch (data.key) {
      case 'isEquipment':
        console.log("in equipment");
        this.setValueEquipment(event);
        break;
      case 'category':
        this.getSubCategoryFromServer(event.detail.value).
        pipe(
          tap((res) => {this.subCategoryList = res})
          ).subscribe();
        break;
      case 'subCategory':
        const subCategoryDetails = this.subCategoryList.find(item => item.subCategoryName === event.detail.value);
        this.selectedSubcategory(subCategoryDetails);
        break;
    }
  }

  getListOptionsByKey(value: string): any {
    switch (value) {
      case "isEquipment":
        return this.equipmentList;
      case "category":
        return this.getListCategory();
      case "subCategory":
        return this.getListSubCategory();
    }
  }

  // getCategoryFromServer(data?: any): void {
  //   //console.log("in get from server", data);
    
  //   // const categoryList = this.categoriesListDataMap.get(this.isEquipment);
  //   // console.log("before if:", categoryList);
  //   // if (categoryList) {
  //   //   console.log("in if:", categoryList);
      
  //   //   this.categoryList = categoryList;
  //   //   return;
  //   // } 
  //   console.log(data.category);
    
  //   this.expenseDataService.getcategry(this.isEquipment)
  //       .pipe(
  //         map((res) => {
  //           return res.map((item) => ({
  //             key: item,
  //             value: item
  //           })
  //           )
  //         }), tap((res) => {
  //         this.categoryList = res;
  //         }),
  //         switchMap(() => this.getSubCategoryFromServer(data.category as string)),
  //         tap((res) => {this.subCategoryList = res})
  //         )
  //         .subscribe();

  // }

  getListCategory(): {} {
    if (this.isEquipment != undefined) {
      console.log("in get category", this.categoryList);
      
      return this.categoryList;
    }
    else {
      return [{ key: "נא לבחור מוגדר כציוד או לא", value: "" }];
    }
  }

  getSubCategoryFromServer(category: string): Observable<any> {
    console.log("category in get sub", category);
    const subList = this.subCategoriesListDataMap.get(category);
    return subList ? of(subList) :
    this.expenseDataService.getSubCategory(category, this.isEquipment)
      .pipe(
        finalize(() => this.doneLoadingSubCategoryList$.next(true)),
        map((res) => {
          console.log("before map:", res);
          
          return res.map((item: IGetSubCategory) => ({
            ...item,
            key: item.subCategoryName,
            value: item.subCategoryName,

          })
          )
        }),
        tap((res) => {
          console.log("sub categoey list", res);
          this.subCategoryList = res;
          this.subCategoriesListDataMap.set(category, res);
          console.log("list sub category:",this.subCategoryList);
      })
      )
  }

  getListSubCategory(): {} {
    if (this.myForm.get('category').value) {
      return this.subCategoryList;
    }
    else {
      return [{ key: "נא לבחור קטגוריה", value: "" }];
    }
  }

  setValueEquipment(event: any): void {
    const value = event.detail.value;
    console.log("in set value", value);
    console.log("category form value", this.myForm.get('category').value);
    
    if (value != this.isEquipment){
      this.myForm.patchValue({'category': ""})
    }
    if (value == "0") {
      this.isEquipment = false;
      //this.getCategoryFromServer();
    }
    else {
      this.isEquipment = true;
      //this.getCategoryFromServer();
    }
  }

  selectedSubcategory(data: IGetSubCategory): void {
    console.log("data in select sub:", data);
    this.myForm.patchValue({reductionPercent: data.reductionPercent});
    this.myForm.patchValue({vatPercent: data.vatPercent});
    this.myForm.patchValue({taxPercent: data.taxPercent});
    
  }
  
  onEnterKeyPressed(): void {
    this.saveSupplier();
  }

}
