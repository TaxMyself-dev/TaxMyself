import { Component, Input, OnInit, ViewChild, NgModule, Output, EventEmitter, OnChanges, SimpleChanges, ElementRef, TemplateRef, Inject } from '@angular/core';
import { FormBuilder, FormGroup, FormControl, Validators, ReactiveFormsModule } from '@angular/forms';
import { LoadingController, ModalController, PopoverController, NavParams } from '@ionic/angular';
import { IButtons, IColumnDataTable, IGetSubCategory, IGetSupplier, IRowDataTable, ISelectItem, IUserDate } from '../interface';
import { KeyValue, formatDate } from '@angular/common';
import { PopupConfirmComponent } from '../popup-confirm/popup-confirm.component';
import { ExpenseDataService } from 'src/app/services/expense-data.service';
import { FilesService } from 'src/app/services/files.service';
import { cloneDeep, isEqual } from 'lodash';
import { selectSupplierComponent } from '../select-supplier/popover-select-supplier.component';
import { EMPTY, Observable, catchError, finalize, filter, from, map, switchMap, tap, of, BehaviorSubject } from 'rxjs';
import { ExpenseFormColumns, ExpenseFormHebrewColumns, FormTypes } from '../enums';
import { HttpClient, HttpParams } from '@angular/common/http';
import { ButtonClass, ButtonSize } from '../button/button.enum';
import { Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { AuthService } from 'src/app/services/auth.service';
import { GenericService } from 'src/app/services/generic.service';
import { PopupMessageComponent } from '../popup-message/popup-message.component';

@Component({
  selector: 'app-modal',
  templateUrl: './modal.component.html',
  styleUrls: ['./modal.component.scss'],
})
export class ModalExpensesComponent {
  @Input() set editMode(val: boolean) {
    val ? this.title = "עריכת הוצאה" : this.title = "הוספת הוצאה";
    this.isEditMode = !!val;
  };

  // data for edit mode:
  @Input() set data(val: IRowDataTable) {
    if (val) {
      console.log("val in modal", val);
      if (val.file != "" && val.file != undefined) {
        this.loadingFile = true;
        this.fileService.getFirebaseUrlFile(val.file as string)
          .then((res) => {
            if (res.type === "application/pdf") {
              this.safePdfBase64String = this.sanitizer.bypassSecurityTrustResourceUrl(res.file);
              this.pdfLoaded = true;
            }
            else {
              this.editModeFile = res.file; // For png file
            }
            this.loadingFile = false;
            console.log("url edit mode file: ", this.editModeFile);
          })
      }
      if (val.isEquipment === false) {
        val.isEquipment = "0";
        this.isEquipment = false;
      }
      else {
        val.isEquipment = "1";
        this.isEquipment = true;
      }
      this.id = +val.id;
      this.getCategory(val);// The list is needed for displing category field

    }
  };
  @Input() buttons: IButtons[];
  @Input() set columns(val: IColumnDataTable<ExpenseFormColumns, ExpenseFormHebrewColumns>[]) {
    this.fileItem = val?.find((item: IColumnDataTable<ExpenseFormColumns, ExpenseFormHebrewColumns>) => item.type === FormTypes.FILE);
    this.columnsList = val;
  }
  // @Input() customFooterTemplate: TemplateRef<any>;


  get columns(): IColumnDataTable<ExpenseFormColumns, ExpenseFormHebrewColumns>[] {
    return this.columnsList;
  }

  get buttonText(): string {
    return this.isEditMode ? "עריכת הוצאה" : "שמירת הוצאה";
  }

  readonly formTypes = FormTypes;
  readonly expenseFormColumns = ExpenseFormColumns;
  readonly expenseFormHebrewColumns = ExpenseFormHebrewColumns;
  readonly ButtonSize = ButtonSize;
  readonly ButtonClass = ButtonClass;


  isEquipment: boolean;
  isEditMode: boolean = false;
  columnsList: IColumnDataTable<ExpenseFormColumns, ExpenseFormHebrewColumns>[];
  fileItem: IColumnDataTable<ExpenseFormColumns, ExpenseFormHebrewColumns>;
  // columnsFilter: IColumnDataTable<ExpenseFormColumns, ExpenseFormHebrewColumns>[];
  title: string = "הוספת הוצאה";
  initialForm: FormGroup;
  addExpenseForm: FormGroup;
  selectedFile: string = ""; // Hold the file string.
  editModeFile: string = ""; // Hold the file string in edit mode.
  safePdfBase64String: SafeResourceUrl;// Hold the PDF file string.
  pdfLoaded: boolean = false; // flag to know the user choosed PDF file.
  loadingFile: boolean = false;
  id: number;
  equipmentList: ISelectItem[] = [{ name: "לא", value: "0" }, { name: "כן", value: "1" }];
  categoryList: ISelectItem[];
  displaySubCategoryList: ISelectItem[];
  originalSubCategoryList: IGetSubCategory[];
  displaySuppliersList: ISelectItem[];
  originalSuppliersList: IGetSupplier[];
  // doneLoadingCategoryList$ = new BehaviorSubject<boolean>(false);
  doneLoadingSubCategoryList$ = new BehaviorSubject<boolean>(false);
  // subCategoriesListDataMap = new Map<string, any[]>();
  // categoriesListDataMap = new Map<boolean, any[]>();
  errorString: string = "";
  isSelectSupplierMode: boolean = false; // flag to update supplier details in add expense form
  // maxDate: string;
  fileToUpload: File;
  userData: IUserDate;
  businessList: ISelectItem[] = [];


  constructor(private fileService: FilesService, private formBuilder: FormBuilder, private expenseDataServise: ExpenseDataService, private modalCtrl: ModalController, private loadingController: LoadingController, private sanitizer: DomSanitizer, private authService: AuthService, private genericService: GenericService, private router: Router, private popoverController: PopoverController) {
    this.safePdfBase64String = this.sanitizer.bypassSecurityTrustResourceUrl('');
  }

  ngOnInit() {

    this.userData = this.authService.getUserDataFromLocalStorage();
    if (this.userData.isTwoBusinessOwner) {
      const businessNumberFieldExists = this.columnsList.find( 
        (column) => column.name === ExpenseFormColumns.BUSINESS_NUMBER
      );
      if (!businessNumberFieldExists) {
        this.columnsList.push({ // add businessNumber field if not exist
          name: ExpenseFormColumns.BUSINESS_NUMBER,
          value: ExpenseFormHebrewColumns.businessNumber,
          type: this.formTypes.DDL
        });
      }
      this.businessList.push({ name: this.userData.businessName, value: this.userData.businessNumber });
      this.businessList.push({ name: this.userData.spouseBusinessName, value: this.userData.spouseBusinessNumber });
    }
    this.orderColumns();
    const today = new Date();
    // this.maxDate = this.formatDate(today);
    this.getCategory();
    this.initForm();
    // this.getSuppliers();
  }

  // formatDate(date: Date): string {
  //   return formatDate(date, 'YYYY-MM-dd', 'en-US');
  // }

  initForm(data?: IRowDataTable): void {
    console.log("data in init form modal edit", data);
    if (data) {
      this.getSubCategory(data?.category as string)// // The list is needed for displing subCategory field
    }

    this.addExpenseForm = this.formBuilder.group({
      [ExpenseFormColumns.CATEGORY]: [data?.category || '', Validators.required],
      [ExpenseFormColumns.SUB_CATEGORY]: [data?.subCategory || '', Validators.required],
      [ExpenseFormColumns.SUPPLIER]: [data?.supplier || data?.name || '', Validators.required],
      [ExpenseFormColumns.SUM]: [data?.sum || '', [Validators.required, Validators.pattern(/^\d+$/)]],
      [ExpenseFormColumns.TAX_PERCENT]: [data?.taxPercent || '', [Validators.pattern(/^(?:\d{1,2}|100)$/)]],
      [ExpenseFormColumns.VAT_PERCENT]: [data?.vatPercent || '', [Validators.pattern(/^(?:\d{1,2}|100)$/)]],
      [ExpenseFormColumns.DATE]: [data?.date || Date, Validators.required,],
      [ExpenseFormColumns.NOTE]: [data?.note || ''],
      [ExpenseFormColumns.EXPENSE_NUMBER]: [data?.expenseNumber || '', [Validators.pattern(/^\d+$/)]],
      [ExpenseFormColumns.SUPPLIER_ID]: [data?.supplierID || '', [Validators.pattern(/^\d+$/)]],
      [ExpenseFormColumns.FILE]: [data?.file || File],// TODO: what to show in edit mode
      [ExpenseFormColumns.IS_EQUIPMENT]: [data?.isEquipment || false, Validators.required], // TODO
      [ExpenseFormColumns.REDUCTION_PERCENT]: [data?.reductionPercent || 0, [Validators.pattern(/^(?:\d{1,2}|100)$/)]],
      [ExpenseFormColumns.BUSINESS_NUMBER]: [data?.businessNumber || ''],
    });

    if (this.userData.isTwoBusinessOwner) {
      this.addExpenseForm?.get('businessNumber').setValidators([Validators.required]);
    }
    this.initialForm = cloneDeep(this.addExpenseForm);
  }


  orderColumns(): IColumnDataTable<ExpenseFormColumns, ExpenseFormHebrewColumns>[] {
    const desiredOrder = [
      ExpenseFormColumns.BUSINESS_NUMBER,
      ExpenseFormColumns.DATE,
      ExpenseFormColumns.SUM,
      ExpenseFormColumns.EXPENSE_NUMBER,
      ExpenseFormColumns.SUPPLIER,
      ExpenseFormColumns.SUPPLIER_ID,
      ExpenseFormColumns.IS_EQUIPMENT,
      ExpenseFormColumns.CATEGORY,
      ExpenseFormColumns.SUB_CATEGORY,
      ExpenseFormColumns.VAT_PERCENT,
      ExpenseFormColumns.TAX_PERCENT,
      ExpenseFormColumns.REDUCTION_PERCENT,
      ExpenseFormColumns.NOTE,
      ExpenseFormColumns.FILE,
    ];
    return this.columnsList = [...this.columnsList].sort((a, b) => {
      return desiredOrder.indexOf(a.name) - desiredOrder.indexOf(b.name);
    });

  }

  // async fileSelected(event: any) {
  //   console.log("fileSelected - start");

  //   this.fileToUpload = event.target.files[0];

  //   // Trigger OCR after file selection
  //   if (this.fileToUpload) {
  //     // Call the OCR service to extract text from the file
  //     const extractedText = await this.fileService.extractTextFromFile(this.fileToUpload);
  //     console.log("extractedText is ", extractedText);

  //     // Automatically fill the form fields with the extracted text
  //     this.autoFillForm(extractedText);
  //   }
  // }


  // autoFillForm(extractedText: string) {
  //   // Split the text by lines or use regex to extract specific information
  //   const lines = extractedText.split('\n');

  //   // Example of mapping text to form fields
  //   this.addExpenseForm.patchValue({
  //     [ExpenseFormColumns.SUPPLIER]: this.extractValueFromText(lines, 'Supplier:'),
  //     [ExpenseFormColumns.SUM]: this.extractValueFromText(lines, 'Sum:'),
  //     [ExpenseFormColumns.DATE]: this.extractValueFromText(lines, 'Date:'),
  //     // Map more fields as needed
  //   });
  // }

  // extractValueFromText(lines: string[], key: string): string {
  //   // A helper function to find a specific key and return the corresponding value
  //   const line = lines.find(line => line.includes(key));
  //   return line ? line.split(key)[1].trim() : '';
  // }


  async fileSelected(event: any) {
    this.pdfLoaded = false; // If user change from pdf file to png file
    let file = event.target.files[0];
    this.fileToUpload = file;
    if (!file) {
      return;
    }

    const allowedExtensions = ['.pdf', '.png', '.jpg', '.jpeg'];
    const extension = file.name.split('.').pop().toLowerCase();

    if (!allowedExtensions.includes(`.${extension}`)) {
      alert('Please upload only PDF, PNG, or JPEG files.');
      return;
    }

    if (extension === "pdf") {
      const target = event.target as HTMLInputElement;
      const files = target.files as FileList;
      const file = files.item(0);

      if (!file) {
        return;
      }
      this.fileService.convertFileToBase64(file)
      .subscribe((res) => {
        this.safePdfBase64String = this.sanitizer.bypassSecurityTrustResourceUrl(res);
      })
      // const rawPdfBase64String = await this.fileService.convertFileToBase64(file);
      this.pdfLoaded = true;
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      // if (this.isEditMode) {
      this.editModeFile = reader.result as string;
      this.selectedFile = reader.result as string;//for update expense can mabey change the func update 
      // }
      // else {
      // this.selectedFile = reader.result as string;
      // }
      console.log(this.selectedFile);

    }
  }

  getPdfData(): SafeResourceUrl {
    return this.safePdfBase64String;
  }

  disableSave(): boolean {
    return !this.addExpenseForm.valid ||
      (this.isEditMode ?
        (isEqual(this.initialForm.value, this.addExpenseForm.value) && this.selectedFile !== "")
        : false);
  }

  disabledAddSupplier(): boolean {
    // if (this.addExpenseForm.controls != undefined){
    const formData = this.addExpenseForm.controls;
    const category = (formData.category.invalid);
    const subCategory = (formData.subCategory.invalid);
    const supplier = (formData.supplier.invalid);
    const taxPercent = (formData.taxPercent.invalid);
    const vatPercent = (formData.taxPercent.invalid);
    const isEquipment = (formData.taxPercent.invalid);
    const reductionPercent = (formData.reductionPercent.invalid);
    return (category || subCategory || supplier || taxPercent || vatPercent || isEquipment || reductionPercent);
  }

  cancel() {
    this.modalCtrl.dismiss(null, 'cancel');
  }

  confirm() {
    console.log("this.isEditMode: ", this.isEditMode);

    this.isEditMode ? this.update() : this.add();
  }

  add(): void {
    let filePath = '';
    this.genericService.getLoader()
      .pipe(
        finalize(() => this.genericService.dismissLoader()),
        switchMap(() => this.getFileData()),
        catchError((err) => {
          alert('Something Went Wrong in first catchError: ' + err.message)
          return EMPTY;
        }),
        map((res) => {
          if (res) {
            console.log("full path of firebase file: ", res);
            filePath = res.metadata.fullPath;
          }
          const token = localStorage.getItem('token');
          return this.setFormData(filePath, token);
        }),
        switchMap((res) => this.expenseDataServise.addExpenseData(res)),
        finalize(() => {
          this.genericService.dismissLoader();
          this.modalCtrl.dismiss();
        }),
        catchError((err) => {
          console.log(err);
          if (err.status == 401) {
            this.errorString = "משתמש לא חוקי , אנא התחבר למערכת";
          }
          if (err.status == 0) {
            this.errorString = "אין אינטרנט, אנא ודא חיבור לרשת או נסה שנית מאוחר יותר";
          }
          this.openPopoverMessage(this.errorString)
          if (filePath !== '') {
            this.fileService.deleteFile(filePath);
          }
          return EMPTY;
        })
      )
      .subscribe((res) => {
        this.router.navigate(['my-storage']);
        this.genericService.showToast("ההוספה נוצרה בהצלחה", "success")
        console.log('Saved expense data in DB. The response is: ', res);
        if (res) {
          this.expenseDataServise.updateTable$.next(true);
        }
      });
  }

  getFileData(): Observable<any> {//Checks if a file is selected and if so returns his firebase path. if not returns null
    return this.fileToUpload ? this.fileService.uploadFileViaFront(this.fileToUpload) : of(null);
  }

  update(): void {
    let filePath = '';
    const previousFile = this.addExpenseForm?.get('file').value;
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
          filePath = this.addExpenseForm.get('file').value;
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
        if (this.selectedFile) {
          this.fileService.deleteFile(previousFile);
        }
      }
      if (res) { // TODO: why returning this object from BE?
        this.expenseDataServise.updateTable$.next(true);
      }
    });
  }

  openPopoverMessage(message: string): void {
    from(this.popoverController.create({
      component: PopupMessageComponent,
      componentProps: {
        message,
      },
      // cssClass: 
    }))
      .pipe(
        catchError((err) => {
          console.log("open Popover message failed in create ", err);
          return EMPTY;
        }),
        switchMap((popover) => {
          const popoverElement = popover as HTMLIonPopoverElement;
          return from(popoverElement.present()).pipe(
            switchMap(() => from(popoverElement.onDidDismiss()))
          )
        }),
        catchError((err) => {
          console.log("open Popover message failed in present ", err);
          return EMPTY;
        })
      )
      .subscribe()
  }

  onDdlSelectionChange(event, colData: IColumnDataTable<ExpenseFormColumns, ExpenseFormHebrewColumns>) {

    switch (colData.name) {
      case ExpenseFormColumns.IS_EQUIPMENT:
        this.setValueEquipment(event);
        break;
      case ExpenseFormColumns.CATEGORY:
        this.getSubCategory(event.detail.value)
        break;
      case ExpenseFormColumns.SUB_CATEGORY:
        const subCategoryDetails = this.originalSubCategoryList.find(item => item.subCategoryName === event.detail.value);
        this.selectedSubcategory(subCategoryDetails);
        break;
      case ExpenseFormColumns.SUPPLIER:
        const supplierDetails = this.originalSuppliersList.find((supplier => supplier.supplier === event.detail.value));
        console.log(supplierDetails);
        this.selectedSupplier(supplierDetails)
        break;
    }
  }

  setFormData(filePath: string, token: string) {
    const formData = this.addExpenseForm.value;
    console.log("form in set form", formData);
    if (!this.userData.isTwoBusinessOwner) {
      formData.businessNumber = this.userData.businessNumber;
    }
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

  openSelectSupplier(event?: Event) {
    //event.preventDefault();
    //console.log(event);

    from(this.modalCtrl.create({
      component: selectSupplierComponent,
      // componentProps: {
      //   data: this.originalSuppliersList,
      // },
      cssClass: 'expense-modal'
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
      if (res.role === 'success') {// if the popover closed due to onblur dont change values 
        if (res !== null && res !== undefined) {
          if (res) {
            if (res.data.isEquipment == false) {
              res.data.isEquipment = "0";
              this.isEquipment = false;
            }
            else {
              res.data.isEquipment = "1";
              this.isEquipment = true;
            }
            this.isSelectSupplierMode = true;
            this.getCategory(res.data); // // The list is needed for displing category field
          }
        }
      }
    })
  }

  getLoader(): Observable<any> {
    return from(this.loadingController.create({
      message: 'Please wait...',
      spinner: 'crescent'
    }))
      .pipe(
        catchError((err) => {
          console.log("err in create loader in save supplier", err);
          return EMPTY;
        }),
        switchMap((loader) => {
          if (loader) {
            return from(loader.present())
          }
          console.log("loader in save supplier is null");
          return EMPTY;
        }),
        catchError((err) => {
          console.log("err in open loader in save supplier", err);
          return EMPTY;
        })
      )
  }

  addSupplier(): void {

    const formData = this.addExpenseForm.value;
    console.log("formdata add supplier: ", formData);

    formData.isEquipment = formData.isEquipment === '1' ? true : false;
    const { date, file, sum, note, expenseNumber, ...newFormData } = formData;
    this.genericService.getLoader()
      .pipe(
        finalize(() => this.genericService.dismissLoader()),
        switchMap(() => this.expenseDataServise.addSupplier(newFormData)),
        catchError((err) => {
          if (err.status == 0) {
            // this.loadingController.dismiss();
            this.errorString = "אין אינטרנט, אנא ודא חיבור לרשת או נסה שנית מאוחר יותר";
            // this.isOpen = true;
          }
          if (err.status == 401) {
            // this.loadingController.dismiss();
            this.errorString = "משתמש לא חוקי , אנא התחבר למערכת";
            // this.isOpen = true;
          }
          if (err.status == 409) {
            // this.loadingController.dismiss();
            this.errorString = "כבר קיים ספק בשם זה, אנא בחר שם שונה. אם ברצונך לערוך ספק זה אנא  לחץ על כפתור עריכה דרך הרשימה .";
            // this.isOpen = true;
          }
          this.openPopoverMessage(this.errorString)
          console.log("err in add supplier: ", err);
          return EMPTY;
        }),
      ).subscribe((res) => {
        this.genericService.showToast("ספק נשמר בהצלחה", "success");
        console.log("res in add supplier:", res);
        this.getSuppliers();
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
        return this.getListCategory();
      case ExpenseFormColumns.SUB_CATEGORY:
        return this.getListSubCategory();
      case ExpenseFormColumns.SUPPLIER:
        return this.displaySuppliersList;
      case ExpenseFormColumns.BUSINESS_NUMBER:
        return this.businessList;
      default:
        return [];
    }
  }

  getListSubCategory(): ISelectItem[] {
    if (this.addExpenseForm.get(ExpenseFormColumns.CATEGORY).value) {
      return this.displaySubCategoryList;
    }
    else {
      return [{ name: "נא לבחור קטגוריה", value: "" }];
    }
  }

  getListCategory(): ISelectItem[] {
    if (this.isEquipment != undefined) {
      return this.categoryList;
    }
    else {
      return [{ name: "נא לבחור רכוש קבוע או לא", value: "" }];
    }
  }

  getSubCategory(event: any): void {
    console.log("event in sub category: ", event);

    let category: string;
    if (typeof (event) !== 'string') {
      category = event.value;
    }
    else {
      category = event;
    }
    console.log("category in get sub", category);
    //const subList = this.subCategoriesListDataMap.get(category);
    // console.log("subList: ",subList);
    console.log("isEquipment: ", this.isEquipment);

    //return subList ? of(subList) :
    from(this.expenseDataServise.getSubCategory(category, this.isEquipment))
      .pipe(
        finalize(() => this.doneLoadingSubCategoryList$.next(true)),
        map((res) => {
          console.log("res sub category: ", res);
          this.originalSubCategoryList = res;
          return res.map((item: IGetSubCategory) => ({
            ...item,
            name: item.subCategoryName,
            value: item.subCategoryName,

          })
          )
        }),
        tap((res) => {
          this.displaySubCategoryList = res;
          //this.subCategoriesListDataMap.set(category, res);
        })
      )
      .subscribe()
  }

  getCategory(data?: IRowDataTable | IGetSupplier): void {
    console.log("in get category: ", data);
    this.expenseDataServise.getcategry()
      .pipe(
        catchError((err) => {
          console.log("error in get category: ", err);
          return EMPTY;
        }),
        map((res) => {
          console.log(res);
          return res.map((item) => ({
            name: item.categoryName,
            value: item.categoryName
          }))
        }),
        tap((res) => {
          this.categoryList = res;
        }),
        // switchMap((data) => this.getSubCategory(data. as string)),
        tap((res) => {

          if (data && this.isSelectSupplierMode) {
            this.selectedSupplier(data as IGetSupplier)
          }
          else if (data && this.isEditMode) {
            this.initForm(data as IRowDataTable);
          }
        })
      ).subscribe();
  }

  async openPopupConfirm(message: string) {
    const modal = await this.modalCtrl.create({
      component: PopupConfirmComponent,
      //showBackdrop: false,
      componentProps: {
        message: message,
        // Add more props as needed
      }
    })
    await modal.present();
  }

  setValueEquipment(event: any): void {
    const value = event.value;

    if (value != this.isEquipment) {
      this.addExpenseForm.patchValue({ 'category': "" })
    }
    if (value == "0") {
      console.log("in value 0");

      this.isEquipment = false;
      this.getCategory();
    }
    else {
      console.log("in value 1");
      this.isEquipment = true;
      this.getCategory();
    }
  }

  selectedSubcategory(event: any): void {
    console.log("event after sub: ", event);

    const subCategoryDetails = this.originalSubCategoryList.find(item => item.subCategoryName === event.value);
    console.log("data in select sub:", subCategoryDetails);
    if (subCategoryDetails) {
      this.addExpenseForm.patchValue({ reductionPercent: subCategoryDetails.reductionPercent });
      this.addExpenseForm.patchValue({ vatPercent: subCategoryDetails.vatPercent });
      this.addExpenseForm.patchValue({ taxPercent: subCategoryDetails.taxPercent });
    }
  }

  getSuppliers(): void {
    this.expenseDataServise.getAllSuppliers()
      .pipe(
        catchError((err) => {
          console.log("err in get suppliers:", err);
          return EMPTY;
        }),
        map((res) => {
          this.originalSuppliersList = res;
          return res.map((item) => ({
            name: item.supplier,
            value: item.supplier
          }))
        })
      )
      .subscribe((res) => {
        this.displaySuppliersList = res
      })
  }

  selectedSupplier(data: IGetSupplier): void {
    this.getSubCategory(data?.category as string)// The list is needed for displing subCategory field

    this.addExpenseForm.patchValue({ category: data.category });
    this.addExpenseForm.patchValue({ supplier: data.supplier });
    this.addExpenseForm.patchValue({ isEquipment: data.isEquipment });
    this.addExpenseForm.patchValue({ subCategory: data.subCategory });
    this.addExpenseForm.patchValue({ supplierID: data.supplierID });
    this.addExpenseForm.patchValue({ taxPercent: data.taxPercent });
    this.addExpenseForm.patchValue({ vatPercent: data.vatPercent });
  }

  displayFile(): any {
    return this.isEditMode ? this.editModeFile : this.selectedFile as string;
  }

  deleteFileFromScreen(event: any): void {
    const fileInput = event.target.closest('label').querySelector('ion-input[type="file"]');
    if (fileInput) {
      fileInput.value = '';
    }
    this.selectedFile = '';
    console.log("this.selectedFile: ", this.selectedFile);

    this.editModeFile = '';
    this.safePdfBase64String = this.sanitizer.bypassSecurityTrustResourceUrl('');
    this.pdfLoaded = false;
    // if (this.isEditMode) {
    //   this.addExpenseForm.patchValue({ file: '' });
    // }
    event.preventDefault();
  }

}



