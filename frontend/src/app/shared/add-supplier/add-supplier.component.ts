import { HttpClient } from '@angular/common/http';
import { Component, Input, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ModalController } from '@ionic/angular';
import { BehaviorSubject, EMPTY, Observable, catchError, finalize, map, of, switchMap, tap } from 'rxjs';
import { FilesService } from 'src/app/services/files.service';
import { ICreateSupplier, IGetSubCategory, IRowDataTable, ISelectItem } from '../interface';
import { cloneDeep, isEqual } from 'lodash';
import { ExpenseDataService } from 'src/app/services/expense-data.service';
import { GenericService } from 'src/app/services/generic.service';

@Component({
    selector: 'app-add-supplier',
    templateUrl: './add-supplier.component.html',
    styleUrls: ['./add-supplier.component.scss'],
    standalone: false
})
export class addSupplierComponent implements OnInit {

  @Input() set supplier(val: ICreateSupplier) {
    console.log("in add sup", val);
    val.reductionPercent = val.reductionPercent.toString();
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
  arrFields = [{ key: "supplier", value: "שם ספק", type: "text" }, { key: "supplierID", value: "ח.פ. ספק", type: "text" }, { key: "category", value: "קטגוריה", type: "ddl" }, { key: "subCategory", value: "תת-קטגוריה", type: "ddl" }, { key: "taxPercent", value: "אחוז מוכר למס", type: "text" }, { key: "vatPercent", value: "אחוז מוכר למעמ", type: "text" }, { key: "isEquipment", value: "מוכר כציוד", type: "ddl" }, { key: "reductionPercent", value: "פחת", type: "text" }]
  id: number;
  isEquipment: boolean;
  equipmentList: ISelectItem[] = [{ name: "לא", value: "0" }, { name: "כן", value: "1" }];
  categoryList: {};
  subCategoryList: IGetSubCategory[];
  subCategoriesListDataMap = new Map<string, any[]>();
  categoriesListDataMap = new Map<boolean, any[]>();
  doneLoadingCategoryList$ = new BehaviorSubject<boolean>(false);
  doneLoadingSubCategoryList$ = new BehaviorSubject<boolean>(false);

  constructor(private genericService: GenericService, private expenseDataService: ExpenseDataService, private formBuilder: FormBuilder, private modalController: ModalController) { }

  ngOnInit() {
    this.getCategory();
  }

  initForm(data: ICreateSupplier): void {
    console.log("data of edit supplier: ", data);
    this.getSubCategoryFromServer(data.category).subscribe((res) => {
      console.log(res);
      this.subCategoryList = res;
    });
    this.myForm = this.formBuilder.group({
      category: [data?.category || '', Validators.required],
      subCategory: [data?.subCategory || '', Validators.required],
      supplier: [data?.supplier || '', Validators.required],
      taxPercent: [data?.taxPercent || '', Validators.required],
      vatPercent: [data?.vatPercent || '', Validators.required],
      supplierID: [data?.supplierID || '',],
      isEquipment: [data?.isEquipment || false,],
      reductionPercent: [data.reductionPercent || '',],
    })
    this.initialForm = cloneDeep(this.myForm);
  }

  confirm(data: any): Observable<any> {
    return  this.expenseDataService.editSupplier(data, this.id);
    // return this.editMode ? this.expenseDataService.editSupplier(data, this.id) : this.expenseDataService.addSupplier(data);
  };

  disableSave(): boolean {
    return !this.myForm.valid || (this.editMode ? isEqual(this.initialForm.value, this.myForm.value) : false)
  }

  cancel(event: string, data?: any): void {
    this.modalController.dismiss();
  }

  saveSupplier(): void {
    this.genericService.getLoader().subscribe();
    console.log("save");
    console.log("edit?", this.editMode);
    const formData = this.setFormData();
    console.log("form data supplier", formData);

    this.confirm(formData).pipe(
      finalize(() => this.genericService.dismissLoader()),
      catchError((err) => {
        console.log("somthing faild", err);
        return EMPTY;
      })).subscribe((res) => {
        console.log("res of save sup: ", res);
        this.cancel("save", this.myForm); 
      });
  }

  setFormData() {
    const formData = this.myForm.value;
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

  tryPriny(): void {
    console.log("selection");
    
  }

  onDdlSelectionChange(event: any, data: any) {

    switch (data.key) {
      case 'isEquipment':
        this.setValueEquipment(event);
        break;
      case 'category':
        console.log('onDdlSelectionChange');
        this.myForm.patchValue({subCategory: ""});
        this.getSubCategoryFromServer(event.value).
          pipe(
            tap((res) => { this.subCategoryList = res })
          ).subscribe();
        break;
      case 'subCategory':
        const subCategoryDetails = this.subCategoryList?.find(item => item?.subCategoryName === event?.detail?.value);
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

  getCategory(): void {
    this.expenseDataService.getcategry()
      .pipe(
        map((res) => {
          return res.map((item) => ({
            name: item.categoryName,
            value: item.categoryName
          })
          )
        }), tap((res) => {
          this.categoryList = res;
          console.log("category list:", res);
        })
      )
      .subscribe();
  }

  getListCategory(): {} {
    if (this.isEquipment != undefined) {
      return this.categoryList;
    }
    else {
      return [{ name: "נא לבחור רכוש קבוע או לא", value: "" }];
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
              //...item,
              name: item.subCategoryName,
              value: item.subCategoryName,

            })
            )
          }),
          tap((res) => {
            console.log("sub categoey list", res);
            this.subCategoryList = res;
            this.subCategoriesListDataMap.set(category, res);
            console.log("list sub category:", this.subCategoryList);
          })
        )
  }

  getListSubCategory(): {} {
    if (this.myForm.get('category').value) {
      return this.subCategoryList;
    }
    else {
      return [{ name: "נא לבחור קטגוריה", value: "" }];
    }
  }

  setValueEquipment(event: any): void {
    const value = event.detail.value;
    console.log("in set value", value);
    console.log("category form value", this.myForm.get('category').value);

    if (value != this.isEquipment) {
      this.myForm.patchValue({ 'category': "" })
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
    this.myForm.patchValue({ reductionPercent: data.reductionPercent });
    this.myForm.patchValue({ vatPercent: data.vatPercent });
    this.myForm.patchValue({ taxPercent: data.taxPercent });

  }

  onEnterKeyPressed(): void {
    this.saveSupplier();
  }

}
