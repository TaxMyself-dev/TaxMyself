import { Component, Input, OnInit, ViewChild, NgModule, Output, EventEmitter, OnChanges, SimpleChanges, ElementRef } from '@angular/core';
import { FormBuilder, FormGroup, FormControl, Validators, ReactiveFormsModule } from '@angular/forms';
import { ModalController, NavParams } from '@ionic/angular';
import { IColumnDataTable, IGetSubCategory, IGetSupplier, IRowDataTable } from '../interface';
import { ModalSortProviderComponent } from '../modal-sort-provider/modal-sort-provider.component';
import { KeyValue } from '@angular/common';
import { PopupMessageComponent } from '../popup-message/popup-message.component';
import { ExpenseDataService } from 'src/app/services/expense-data.service';
import { FilesService } from 'src/app/services/files.service';
import { cloneDeep, isEqual } from 'lodash';
import { PopoverController } from '@ionic/angular';
import { selectSupplierComponent } from '../select-supplier/popover-select-supplier.component';
import { EMPTY, Observable, catchError, finalize, filter, from, map, switchMap, tap, of, BehaviorSubject } from 'rxjs';
import { ExpenseFormColumns, FormTypes } from '../enums';
import { HttpClient, HttpParams } from '@angular/common/http';
import { ButtonSize } from '../button/button.enum';

@Component({
  selector: 'app-modal',
  templateUrl: './modal.component.html',
  styleUrls: ['./modal.component.scss'],
})
export class ModalExpensesComponent {
  @Input() set editMode(val: boolean) {
    this.title = val ? "עריכת הוצאה" : "הוספת הוצאה";
    this.isEditMode = !!val;
  };
  // data for edit mode:
  @Input() set data(val: IRowDataTable) {
    if (val) {
      console.log("val in modal",val);
      if (val.isEquipment == false) {
        val.isEquipment = "0";
        this.isEquipment = false;
      }
      else{
        val.isEquipment = "1";
        this.isEquipment = true;
      }
      this.id = +val.id;
      this.getCategory(val);
      if (val.file != "" && val.file != undefined){
        this.editModeFile = "loading"; // for the icon of choose file does not show
        this.fileService.downloadFile(val.file as string)
        .then((res) => {
          this.editModeFile = res;
        })
        console.log("url edit mode file: ",this.editModeFile);    
      }
    }
  };

  @Input() set columns(val: IColumnDataTable[]) {
    this.fileItem = val?.find((item: IColumnDataTable) => item.type === FormTypes.FILE);
    this.columnsList = val;
  }

  get columns(): IColumnDataTable[] {
    return this.columnsList;
  }

  get buttonText(): string {
    return this.isEditMode? "עריכת הוצאה" : "שמירת הוצאה";
  }

  readonly formTypes = FormTypes;
  readonly expenseFormColumns = ExpenseFormColumns;
  readonly ButtonSize = ButtonSize;

  isEnlarged: boolean = false;
  isEquipment: boolean;
  isEditMode: boolean = false;
  columnsList: IColumnDataTable[];
  fileItem: IColumnDataTable;
  columnsFilter: IColumnDataTable[];
  title: string = "הוספת הוצאה";
  initialForm: FormGroup;
  myForm: FormGroup;
  selectedFile: string = "";
  editModeFile: string = "";
  id: number;
  equipmentList: Record<string, string>[] = [{ key: "לא", value: "0" }, { key: "כן", value: "1" }];
  categoryList: {};
  subCategoryList: IGetSubCategory[];
  suppliersList: IGetSupplier[];
  doneLoadingCategoryList$ = new BehaviorSubject<boolean>(false);
  doneLoadingSubCategoryList$ = new BehaviorSubject<boolean>(false);
  subCategoriesListDataMap = new Map<string, any[]>();
  categoriesListDataMap = new Map<boolean, any[]>();

  constructor(private popoverController: PopoverController, private fileService: FilesService, private formBuilder: FormBuilder, private expenseDataServise: ExpenseDataService, private modalCtrl: ModalController, private navParams: NavParams) {
  
  }

  ngOnInit() {
    console.log("xdfgdgfgf", this.columns);
    this.getSuppliers();
    this.initForm();
  }

  initForm(data?: IRowDataTable): void {
    this.myForm = this.formBuilder.group({
      [ExpenseFormColumns.CATEGORY]: [data?.category || '', Validators.required],
      [ExpenseFormColumns.SUB_CATEGORY]: [data?.subCategory || '', Validators.required],
      [ExpenseFormColumns.SUPPLIER]: [data?.supplier || '', Validators.required],
      [ExpenseFormColumns.SUM]: [data?.sum || '', Validators.required],
      [ExpenseFormColumns.TAX_PERCENT]: [data?.taxPercent || '', Validators.required],
      [ExpenseFormColumns.VAT_PERCENT]: [data?.vatPercent || '', Validators.required],
      [ExpenseFormColumns.DATE]: [data?.date || '', Validators.required],
      [ExpenseFormColumns.NOTE]: [data?.note || ''],
      [ExpenseFormColumns.EXPENSE_NUMBER]: [data?.expenseNumber || ''],
      [ExpenseFormColumns.SUPPLIER_ID]: [data?.supplierID || ''],
      [ExpenseFormColumns.FILE]: [data?.file || File, Validators.required],// TODO: what to show in edit mode
      [ExpenseFormColumns.IS_EQUIPMENT]: [data?.isEquipment || false, Validators.required], // TODO
      [ExpenseFormColumns.REDUCTION_PERCENT]: [data?.reductionPercent || '', Validators.required],
    });

    this.initialForm = cloneDeep(this.myForm);
  }

  fileSelected(event: any) {
    let file = event.target.files[0];
    console.log(file);
    
    if (file) {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        this.selectedFile = reader.result as string;
      }
    }
  }

  disableSave(): boolean {
    return !this.myForm.valid || (this.isEditMode ? isEqual(this.initialForm.value, this.myForm.value) : false)
  }

  disabledAddSupplier(): boolean {
    // if (this.myForm.controls != undefined){
      const formData = this.myForm.controls;
      const category = (formData.category.invalid);
      const subCategory = (formData.subCategory.invalid);
      const supplier = (formData.supplier.invalid);
      const taxPercent = (formData.taxPercent.invalid);
      const vatPercent = (formData.taxPercent.invalid);
      const isEquipment = (formData.taxPercent.invalid);
      const reductionPercent = (formData.reductionPercent.invalid);
    return (category || subCategory || supplier || taxPercent || vatPercent || isEquipment || reductionPercent) ;
  }

  cancel() {
    this.modalCtrl.dismiss(null, 'cancel');
  }

  confirm() {
    this.isEditMode ? this.update() : this.add();
  }

  add(): void {
    let filePath = '';
    this.getFileData().pipe(
      finalize(() => this.modalCtrl.dismiss()),
      catchError((err) => {
        alert('Something Went Wrong in first catchError: ' + err.error.message.join(', '))
        return EMPTY;
      }),
      map((res) => {
        if (res) {
          filePath = res.metadata.fullPath;
        }
        const token = localStorage.getItem('token');
        return this.setFormData(filePath, token);
      }),
      switchMap((res) => this.expenseDataServise.addExpenseData(res)),
      catchError((err) => {
        alert('Something Went Wrong in second catchError ' + err.error.message)
        if (filePath !== '') {
          this.fileService.deleteFile(filePath);
        }
        return EMPTY;
      })
    ).subscribe((res) => {
      console.log('Saved expense data in DB. The response is: ', res);
      if (res) { // TODO: why returning this object from BE?
        this.expenseDataServise.updateTable$.next(true);
      }
    });
  }

  getFileData(): Observable<any> {//Checks if a file is selected and if so returns his firebase path and if not returns null
    return this.selectedFile ? this.fileService.uploadFileViaFront(this.selectedFile) : of(null);
  }

  update(): void {
    console.log("selected file: ",this.selectedFile);
    
    let filePath = '';
    const previousFile = this.myForm.get('file').value;
    console.log("previos file: ", previousFile);
    
    this.getFileData().pipe(
      finalize(() => this.modalCtrl.dismiss()),
      catchError((err) => {
        alert('File upload failed, please try again ' + err.error.message.join(', '));
        return EMPTY;
      }),
      map((res) => {
        if (res) { //if a file is selected 
          filePath = res.metadata.fullPath;
        }
        else {
          filePath = this.myForm.get('file').value;
        }
        const token = localStorage.getItem('token');
        return this.setFormData(filePath, token);
      }),
      switchMap((res) => this.expenseDataServise.updateExpenseData(res, this.id)),
      catchError((err) => {
        alert('Something Went Wrong in second catchError ' + err.error.message)
        if (this.selectedFile) {
          this.fileService.deleteFile(filePath);
        }
        return EMPTY;
      })
    ).subscribe((res) => {
      if (previousFile !== "") {
        if (this.selectedFile){
          this.fileService.deleteFile(previousFile);
        }
      }
      if (res) { // TODO: why returning this object from BE?
        this.expenseDataServise.updateTable$.next(true);
      }
    });
  }


  onDdlSelectionChange(event, colData: IColumnDataTable) {
    console.log(event);
    console.log(colData);
    
    switch (colData.name) {
      // case ExpenseFormColumns.TAX_PERCENT:
      //   this.customUserTax(event);
      //   break;
      case ExpenseFormColumns.IS_EQUIPMENT:
        console.log("in equipment");
        this.setValueEquipment(event);
        break;
      // case ExpenseFormColumns.VAT_PERCENT:
      //   this.customUserVat(event);
      //   break;
      case ExpenseFormColumns.CATEGORY:
        this.getSubCategory(event.detail.value).subscribe();
        break;
      case ExpenseFormColumns.SUB_CATEGORY:
        const subCategoryDetails = this.subCategoryList.find(item => item.subCategory === event.detail.value);
        this.selectedSubcategory(subCategoryDetails);
        break;
      case ExpenseFormColumns.SUPPLIER:
        const supplierDetails = this.suppliersList.find((supplier => supplier.name === event.detail.value));
        console.log(supplierDetails);
        this.selectedSupplier(supplierDetails)
        break;
      default:
        break;
    }
  }

  setFormData(filePath: string, token: string) {
    const formData = this.myForm.value;
    formData.taxPercent = +formData.taxPercent;
    formData.vatPercent = +formData.vatPercent;
    formData.file = filePath;
    formData.reductionPercent = +formData.reductionPercent;
    formData.sum = +formData.sum;
    formData.isEquipment === "0" ? formData.isEquipment = false : formData.isEquipment = true;
    formData.token = this.formBuilder.control(token).value; // TODO: check when token is invalid
    console.log(formData);
    return formData;
  }

  openSelectSupplier(event:Event) {
    event.preventDefault();
    console.log(event);
    
    from(this.modalCtrl.create({
      component: selectSupplierComponent,
      //event: ev,
      // translucent: false,
      componentProps: {
      }
    })).pipe(
      catchError((err) => {
        console.log("openSelectSupplier failed in create ", err);
        return EMPTY;
      }),
      switchMap((modal) => {
        if (modal) {
          return from(modal.present()).pipe(
            switchMap(() => from(modal.onDidDismiss())),
            catchError((err) => {
              console.log("openSelectSupplier failed in present ", err);
              return EMPTY;
            })
          );
        }
        else {
          console.log('Popover modal is null');
          return EMPTY;
        }
      })
    ).subscribe((res) => {
      console.log('res in modal comp: ', res);
      console.log("res.role: ", res.role);
      if (res.role !== 'backdrop') {// if the popover closed due to onblur dont change values 
        if (res !== null && res !== undefined) {
          if (typeof (res.data) == "string") {
            this.myForm.patchValue({ supplier: res.data });
          }
          else {
            this.myForm.patchValue({ supplier: res?.data?.name });
            this.myForm.patchValue({ supplierID: res?.data?.supplierID });
            this.myForm.patchValue({ category: res?.data?.category });
            this.myForm.patchValue({ subCategory: res?.data?.subCategory });
            this.myForm.patchValue({ taxPercent: res?.data?.taxPercent });
            this.myForm.patchValue({ vatPercent: res?.data?.vatPercent });
          }
        }
      }
    })
  }

  addSupplier(): void {
    const token = localStorage.getItem('token');
    const name = this.myForm.get('supplier').value;
    const formData = this.myForm.value;
    formData.token = this.formBuilder.control(token).value;
    formData.name = this.formBuilder.control(name).value;
    const { date, file, sum, note, expenseNumber, supplier,  ...newFormData } = formData;
    this.expenseDataServise.addSupplier(newFormData)
    .pipe(
      catchError((err) => {
        console.log("err in add supplier: ", err);
        return EMPTY;
      }),
    ).subscribe((res) => {
      console.log("res in add supplier:", res);
    })
  }

  valueAscOrder(a: KeyValue<string, string>, b: KeyValue<string, string>): number {// stay the list of fields in the original order
    return 0;
  }

  getListOptionsByKey(key: ExpenseFormColumns): any {
    switch (key) {
      case ExpenseFormColumns.IS_EQUIPMENT:
        return this.equipmentList;
      case ExpenseFormColumns.CATEGORY:
        return this.getListCategoty();
      case ExpenseFormColumns.SUB_CATEGORY:
        return this.getListSubCategory();
      case ExpenseFormColumns.SUPPLIER:
        // this.temp();
        return this.suppliersList;
        break
      default:
        return [];
    }
  }

  getListSubCategory(): {} {
    console.log("list category;", this.categoryList);

    // if (this.categoryList != undefined) {
    if (this.myForm.get(ExpenseFormColumns.CATEGORY).value) {
      return this.subCategoryList;
    }
    else {
      return [{ key: "נא לבחור קטגוריה", value: "" }];
    }
  }

  getListCategoty(): {} {
    if (this.isEquipment != undefined) {
      return this.categoryList;
    }
    else {
      return [{ key: "נא לבחור מוגדר כציוד או לא", value: "" }];
    }
  }

  getSubCategory(category: string): Observable<any> {
    console.log("category in get sub", category);
    const subList = this.subCategoriesListDataMap.get(category);
    return subList ? of(subList) :
    this.expenseDataServise.getSubCategory(category, this.isEquipment)
      .pipe(
        finalize(() => this.doneLoadingSubCategoryList$.next(true)),
        map((res) => {
          console.log("before map:", res);
          
          return res.map((item: IGetSubCategory) => ({
            ...item,
            key: item.subCategory,
            value: item.subCategory,

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

  getCategory(data?: IRowDataTable): void {
    const categoryList = this.categoriesListDataMap.get(this.isEquipment);
    if (categoryList) {
      this.categoryList = categoryList;
      return;
    } 

    this.expenseDataServise.getcategry(this.isEquipment)
        .pipe(
          map((res) => {
            return res.map((item) => ({
              key: item,
              value: item
            })
            )
          }), tap((res) => {
          console.log(res);
          this.categoryList = res;
          }),
          switchMap(() => this.getSubCategory(data.category as string)),
          tap(()=> {
            if (data && this.isEditMode) {
              this.initForm(data);
            }
            console.log(this.categoryList);
          })
        ).subscribe();
        

  }

  async openPopupMessage(message: string) {
    const modal = await this.modalCtrl.create({
      component: PopupMessageComponent,
      //showBackdrop: false,
      componentProps: {
        message: message,
        // Add more props as needed
      }
    })
    //.then(modal => modal.present());
    await modal.present();
  }

  setValueEquipment(event: any): void {
    const value = event.detail.value;
    console.log("in set value", value);
    console.log("category form value", this.myForm.get(ExpenseFormColumns.CATEGORY).value);
    
    if (value != this.isEquipment){
      this.myForm.patchValue({'category': ""})
    }
    if (value == "0") {
      this.isEquipment = false;
      this.getCategory();
    }
    else {
      this.isEquipment = true;
      this.getCategory();
    }
  }

  selectedSubcategory(data: IGetSubCategory): void {
    console.log("data in select sub:", data);
    this.myForm.patchValue({reductionPercent: data.reductionPercent});
    this.myForm.patchValue({vatPercent: data.vatPercent});
    this.myForm.patchValue({taxPercent: data.taxPercent});
    
  }

  getSuppliers(): void {
    this.expenseDataServise.getAllSuppliers()
    .pipe(
      catchError((err) => {
        console.log("err in get suppliers:", err);
        return EMPTY;
      }),
      map((res) => {
          return res.map((item) => ({
            ...item,
            key: item. name,
            value: item.name
          }))
      })
      )
    .subscribe((res) => {
      console.log(res);
      this.suppliersList = res
    })
  }

  selectedSupplier(data: IGetSupplier): void {
    this.myForm.patchValue({category: data.category});
    this.myForm.patchValue({subCategory: data.subCategory});
    this.myForm.patchValue({supplierID: data.supplierID});
    this.myForm.patchValue({taxPercent: data.taxPercent});
    this.myForm.patchValue({vatPercent: data.vatPercent});
    // this.myForm.patchValue({reductionPercent: data.reductionPercent});//TODO: add to supplier table
  }

  toggleEnlarged(ev :Event): void {
    ev.stopPropagation();
    ev.preventDefault();
    console.log("asdfghjkl;lkjhgfdsasdfghjkl;lkjhgfd");
    console.log(this.isEnlarged);
    
    this.isEnlarged = !this.isEnlarged;
    console.log(this.isEnlarged);
  }

  displayFile(): any {
    return this.isEditMode ? this.editModeFile : this.selectedFile as string; 
  }
}



