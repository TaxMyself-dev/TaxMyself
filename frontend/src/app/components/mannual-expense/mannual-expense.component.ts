import { ChangeDetectionStrategy, Component, computed, effect, inject, input, OnDestroy, signal } from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { DialogService, DynamicDialogRef } from "primeng/dynamicdialog";
import { DomSanitizer, SafeResourceUrl } from "@angular/platform-browser";
import { FilesService } from "src/app/services/files.service";
import { GenericService } from "src/app/services/generic.service";
import { AuthService } from "src/app/services/auth.service";
import { inputsSize, BusinessType } from "src/app/shared/enums";
import { Business } from "src/app/shared/interface";
import { IGetSupplier, ISelectItem, ISubCategory, ISupplier } from "src/app/shared/interface";
import { InputDateComponent } from "../input-date/input-date.component";
import { appFileUploadGptComponent } from "../input-file/input-file.component";
import { InputSelectComponent } from "../input-select/input-select.component";
import { InputTextComponent } from "../input-text/input-text.component";
import { InputAutoCompleteComponent } from "../input-autoComplete/input-autoComplete.component";
import { ButtonComponent } from "../button/button.component";
import { ButtonColor, ButtonSize } from "../button/button.enum";
import { MannualExpenseService } from "./mannual-expense.service";
import { ExpenseDataService } from "src/app/services/expense-data.service";
import { MessageService } from "primeng/api";
import { Observable, EMPTY, catchError, finalize, map, of, switchMap, tap, throwError } from "rxjs";
import { AddSupplierComponent } from "../add-supplier/add-supplier.component";

@Component({
    selector: 'app-mannual-expense',
    templateUrl: './mannual-expense.component.html',
    styleUrls: ['./mannual-expense.component.scss'],
    standalone: true,
    changeDetection: ChangeDetectionStrategy.Default,
    imports: [ReactiveFormsModule, InputSelectComponent, InputTextComponent, InputDateComponent, appFileUploadGptComponent, ButtonComponent, InputAutoCompleteComponent],
    providers: [FormBuilder]
})
export class MannualExpenseComponent implements OnDestroy {



    //   @Input() set editMode(val: boolean) {
    //     val ? this.title = "עריכת הוצאה" : this.title = "הוספת הוצאה";
    //     this.isEditMode = !!val;
    //   };

    //   // data for edit mode:
    //   @Input() set data(val: IRowDataTable) {
    //     if (val) {
    //       console.log("val in modal", val);
    //       if (val.isEquipment === false) {
    //         val.isEquipment = "0";
    //         this.isEquipment = false;
    //       }
    //       else {
    //         val.isEquipment = "1";
    //         this.isEquipment = true;
    //       }
    //       this.id = +val.id;
    //       this.getCategory(val);
    //       if (val.file != "" && val.file != undefined) {
    //         console.log("file is: ", val.file);
    //         this.isFileExist = true;
    //         this.originalFileName = this.fileService.extractFileName(val.file as string);
    //         console.log("originalFileName: ", this.originalFileName);

    //         this.editModeFile = "loading"; // for the icon of choose file does not show
    //         this.fileService.getFirebaseUrlFile(val.file as string)
    //           .then((res) => {
    //             if (res.type === "application/pdf") {
    //               this.safePdfBase64String = this.sanitizer.bypassSecurityTrustResourceUrl(res.file);
    //               this.pdfLoaded = true;
    //             }
    //             this.editModeFile = res.file;
    //           })
    //           .catch((err) => {
    //             console.log("error in get file in edit mode: ", err);
    //           })
    //       }
    //       else {
    //         this.isFileExist = false;
    //       }
    //     }
    //   };
    // //   @Input() buttons: IButtons[];
    //   @Input() set columns(val: IColumnDataTable<ExpenseFormColumns, ExpenseFormHebrewColumns>[]) {
    //     this.fileItem = val?.find((item: IColumnDataTable<ExpenseFormColumns, ExpenseFormHebrewColumns>) => item.type === FormTypes.FILE);
    //     this.columnsList = val;
    //   }
    //   // @Input() customFooterTemplate: TemplateRef<any>;


    //   get columns(): IColumnDataTable<ExpenseFormColumns, ExpenseFormHebrewColumns>[] {
    //     return this.columnsList;
    //   }

    //   get buttonText(): string {
    //     return this.isEditMode ? "עריכת הוצאה" : "שמירת הוצאה";
    //   }

    //   readonly formTypes = FormTypes;
    //   readonly expenseFormColumns = ExpenseFormColumns;
    //   readonly expenseFormHebrewColumns = ExpenseFormHebrewColumns;
    //   readonly ButtonSize = ButtonSize;
    //   readonly ButtonClass = ButtonClass;

    //   isEquipment: boolean;
    //   errorFile: boolean = false;
    //   columnsList: IColumnDataTable<ExpenseFormColumns, ExpenseFormHebrewColumns>[];
    //   fileItem: IColumnDataTable<ExpenseFormColumns, ExpenseFormHebrewColumns>;
    //   // columnsFilter: IColumnDataTable<ExpenseFormColumns, ExpenseFormHebrewColumns>[];
    //   title: string = "הוספת הוצאה";
    //   initialForm: FormGroup;
    //   addExpenseForm: FormGroup;
    //   selectedFile: string = "";
    //   id: number;
    //   equipmentList: ISelectItem[] = [{ name: "לא", value: "0" }, { name: "כן", value: "1" }];
    //   categoryList: ISelectItem[];
    //   displaySubCategoryList: ISelectItem[];
    //   originalSubCategoryList: IGetSubCategory[];
    //   displaySuppliersList: ISelectItem[]; //Use this variable only if changing the supplier field to DDL.
    //   originalSuppliersList: IGetSupplier[];
    //   // doneLoadingCategoryList$ = new BehaviorSubject<boolean>(false);
    //   doneLoadingSubCategoryList$ = new BehaviorSubject<boolean>(false);
    //   // subCategoriesListDataMap = new Map<string, any[]>();
    //   // categoriesListDataMap = new Map<boolean, any[]>();
    //   errorString: string = "";
    //   isOpen: boolean = false;
    //   isSelectSupplierMode: boolean = false;
    //   safePdfBase64String: SafeResourceUrl;
    //   pdfLoaded: boolean = false;
    //   fileToUpload: File;
    //   userData: IUserData;
    //   businessList: ISelectItem[] = [];
    //   isLoadingAddSupplier: boolean = false;
    //   isLoadingAddExpense: boolean = false;

    //   // Variables for edit mode //
    //   isEditMode: boolean = false;
    //   editModeFile: string = "";
    //   isFileChanged: boolean = false;
    //   isFileExist: boolean;
    //   originalFileName: string = "";
    //   currentFileName: string = "";

    //   BusinessStatus = BusinessStatus;

    //   constructor(private fileService: FilesService, private formBuilder: FormBuilder, private expenseDataServise: ExpenseDataService, private modalCtrl: ModalController, private loadingController: LoadingController, private sanitizer: DomSanitizer, private authService: AuthService, private genericService: GenericService, private router: Router, private popoverController: PopoverController) {
    //     this.safePdfBase64String = this.sanitizer.bypassSecurityTrustResourceUrl('');
    //   }

    //   ngOnInit() {

    //     this.userData = this.authService.getUserDataFromLocalStorage();
    //     if (this.userData.businessStatus === 'MULTI_BUSINESS') {
    //       const businessNumberFieldExists = this.columnsList.find(
    //         (column) => column.name === ExpenseFormColumns.BUSINESS_NUMBER
    //       );
    //       if (!businessNumberFieldExists) {
    //         this.columnsList.push({ // add businessNumber field if not exist
    //           name: ExpenseFormColumns.BUSINESS_NUMBER,
    //           value: ExpenseFormHebrewColumns.businessNumber,
    //           type: this.formTypes.DDL
    //         });
    //       }
    //       this.businessList.push({ name: this.userData.businessName, value: this.userData.businessNumber });
    //       this.businessList.push({ name: this.userData.spouseBusinessName, value: this.userData.spouseBusinessNumber });
    //     }
    //     this.orderColumns();
    //     const today = new Date();
    //     this.getCategory();
    //     this.initForm();
    //     this.getSuppliers(); // Use this function only if changing the supplier field to DDL.
    //   }

    //   initForm(data?: IRowDataTable): void {
    //     if (data) {
    //       this.getSubCategory(data?.category as string)// // The list is needed for displing subCategory field
    //     }

    //     this.addExpenseForm = this.formBuilder.group({
    //       [ExpenseFormColumns.CATEGORY]: [data?.category || '', Validators.required],
    //       [ExpenseFormColumns.SUB_CATEGORY]: [data?.subCategory || '', Validators.required],
    //       [ExpenseFormColumns.SUPPLIER]: [data?.supplier || data?.name || '', Validators.required],
    //       [ExpenseFormColumns.SUM]: [data?.sum || '', [Validators.required, Validators.pattern(/^\d+$/)]],
    //       [ExpenseFormColumns.TAX_PERCENT]: [data?.taxPercent || '', [Validators.pattern(/^(?:\d{1,2}|100)$/)]],
    //       [ExpenseFormColumns.VAT_PERCENT]: [data?.vatPercent || '', [Validators.pattern(/^(?:\d{1,2}|100)$/)]],
    //       [ExpenseFormColumns.DATE]: [data?.date || Date, Validators.required,],
    //       [ExpenseFormColumns.NOTE]: [data?.note || ''],
    //       [ExpenseFormColumns.EXPENSE_NUMBER]: [data?.expenseNumber || '', [Validators.pattern(/^\d+$/)]],
    //       [ExpenseFormColumns.SUPPLIER_ID]: [data?.supplierID || '', [Validators.pattern(/^\d+$/)]],
    //       [ExpenseFormColumns.FILE]: [data?.file || File],// TODO: what to show in edit mode
    //       [ExpenseFormColumns.IS_EQUIPMENT]: [data?.isEquipment || false, Validators.required], // TODO
    //       [ExpenseFormColumns.REDUCTION_PERCENT]: [data?.reductionPercent || 0, [Validators.pattern(/^(?:\d{1,2}|100)$/)]],
    //       [ExpenseFormColumns.BUSINESS_NUMBER]: [data?.businessNumber || ''],
    //     });

    //     if (this.userData.businessStatus === 'MULTI_BUSINESS') {
    //       this.addExpenseForm?.get('businessNumber').setValidators([Validators.required]);
    //     }
    //     this.initialForm = cloneDeep(this.addExpenseForm);
    //   }

    // orderColumns(): IColumnDataTable<ExpenseFormColumns, ExpenseFormHebrewColumns>[] {
    //     const desiredOrder = [
    //         ExpenseFormColumns.BUSINESS_NUMBER,
    //         ExpenseFormColumns.DATE,
    //         ExpenseFormColumns.SUM,
    //         ExpenseFormColumns.EXPENSE_NUMBER,
    //         ExpenseFormColumns.SUPPLIER,
    //         ExpenseFormColumns.SUPPLIER_ID,
    //         ExpenseFormColumns.IS_EQUIPMENT,
    //         ExpenseFormColumns.CATEGORY,
    //         ExpenseFormColumns.SUB_CATEGORY,
    //         ExpenseFormColumns.VAT_PERCENT,
    //         ExpenseFormColumns.TAX_PERCENT,
    //         ExpenseFormColumns.REDUCTION_PERCENT,
    //         ExpenseFormColumns.NOTE,
    //         ExpenseFormColumns.FILE,
    //     ];
    //     return this.columnsList = [...this.columnsList].sort((a, b) => {
    //         return desiredOrder.indexOf(a.name) - desiredOrder.indexOf(b.name);
    //     });

    // }

    // getPdfData(): SafeResourceUrl {
    //     return this.safePdfBase64String;
    // }

    // disableSave(): boolean {
    //     return (this.isEditMode ?
    //         (isEqual(this.initialForm.value, this.addExpenseForm.value) && !this.isFileChanged) : !this.addExpenseForm.valid);
    // }

    // disabledAddSupplier(): boolean {
    //     const formData = this.addExpenseForm.controls;
    //     const category = (formData.category.invalid);
    //     const subCategory = (formData.subCategory.invalid);
    //     const supplier = (formData.supplier.invalid);
    //     const taxPercent = (formData.taxPercent.invalid);
    //     const vatPercent = (formData.taxPercent.invalid);
    //     const isEquipment = (formData.taxPercent.invalid);
    //     const reductionPercent = (formData.reductionPercent.invalid);
    //     return (category || subCategory || supplier || taxPercent || vatPercent || isEquipment || reductionPercent);
    // }

    // cancel() {
    //     this.modalCtrl.dismiss(null, 'cancel');
    // }

    // confirm() {
    //     console.log("🚀 ~ ModalExpensesComponent ~ confirm ~ this.isLoadingAddExpense:", this.isLoadingAddExpense)
    //     this.isEditMode ? this.update() : this.add();
    // }

    // add(): void {
    //     this.isLoadingAddExpense = true;
    //     console.log("🚀 ~ ModalExpensesComponent ~ add ~ this.isLoadingAddExpense:", this.isLoadingAddExpense)
    //     let filePath = '';
    //     this.getFileData()
    //         .pipe(
    //             finalize(() => {
    //                 this.isLoadingAddExpense = false;
    //             }),
    //             catchError((err) => {
    //                 alert('Something Went Wrong in first catchError: ' + err.message)
    //                 return EMPTY;
    //             }),
    //             map((res) => {
    //                 if (res) {
    //                     console.log("full path of firebase file: ", res);
    //                     filePath = res.metadata.fullPath;
    //                 }
    //                 const token = localStorage.getItem('token');
    //                 return this.setFormData(filePath, token);
    //             }),
    //             switchMap((res) => this.expenseDataServise.addExpenseData(res)),
    //             catchError((err) => {
    //                 console.log(err);
    //                 if (err.status == 401) {
    //                     this.genericService.showToast("משתמש לא חוקי , אנא התחבר למערכת", "error");
    //                 }
    //                 else if (err.status == 0) {
    //                     this.genericService.showToast("אין אינטרנט, אנא ודא חיבור לרשת. ההוצאה לא נשמרה אנא נסה מאוחר יותר", "error");
    //                 }
    //                 else {
    //                     this.genericService.showToast("אירעה שגיאה , ההוצאה לא נשמרה אנא נסה מאוחר יותר", "error");
    //                 }
    //                 //this.openPopoverMessage(this.errorString)
    //                 if (filePath !== '') {
    //                     this.fileService.deleteFileFromFirebase(filePath);
    //                 }
    //                 return EMPTY;
    //             })
    //         )
    //         .subscribe((res) => {
    //             this.modalCtrl.dismiss();
    //             this.router.navigate(['my-storage']);
    //             this.genericService.showToast("ההוספה נוצרה בהצלחה", "success")
    //             console.log('Saved expense data in DB. The response is: ', res);
    //             if (res) {
    //                 this.expenseDataServise.updateTable$.next(true);
    //             }
    //         });
    // }

    // getFileData(): Observable<any> {//Checks if a file is selected and if so returns his firebase path. if not returns null
    //     return this.fileToUpload ? this.fileService.uploadFileViaFront(this.fileToUpload, '314719279') : of(null);
    // }

    // update(): void {
    //     this.isLoadingAddExpense = true;

    //     let filePath = '';
    //     const previousFile = this.addExpenseForm?.get('file').value;
    //     this.getFileData()
    //         .pipe(
    //             finalize(() => {
    //                 this.isLoadingAddExpense = false;
    //             }),
    //             catchError((err) => {
    //                 alert('File upload failed, please try again ' + err.error.message.join(', '));
    //                 return EMPTY;
    //             }),
    //             map((res) => {
    //                 if (res) { // If a file is selected 
    //                     filePath = res.metadata.fullPath;
    //                 }
    //                 else {
    //                     filePath = this.addExpenseForm.get('file').value;
    //                 }
    //                 const token = localStorage.getItem('token');
    //                 return this.setFormData(filePath, token);
    //             }),
    //             switchMap((res) => this.expenseDataServise.updateExpenseData(res, this.id)),
    //             catchError((err) => {
    //                 alert('Something Went Wrong in second catchError ' + err.error.message)
    //                 if (this.selectedFile) {
    //                     this.fileService.deleteFileFromFirebase(filePath);
    //                 }
    //                 return EMPTY;
    //             })
    //         ).subscribe((res) => {
    //             if (previousFile !== "") {
    //                 if (this.selectedFile) {
    //                     this.fileService.deleteFileFromFirebase(previousFile);
    //                 }
    //             }
    //             if (res) { // TODO: why returning this object from BE?
    //                 this.expenseDataServise.updateTable$.next(true);
    //             }
    //             this.modalCtrl.dismiss();
    //         });
    // }

    // update(): void {
    //     let filePath = '';
    //     const previousFile = this.addExpenseForm?.get('file').value;
    //     this.genericService.getLoader()
    //         .pipe(
    //             finalize(() => {
    //                 console.log('finalize');

    //                 this.modalCtrl.dismiss();
    //                 this.genericService.dismissLoader();
    //             }),
    //             switchMap(() => this.getFileData()),
    //             catchError((err) => {
    //                 alert('File upload failed, please try again ' + err.error.message.join(', '));
    //                 //this.modalCtrl.dismiss();
    //                 return EMPTY;
    //             }),
    //             map((res) => {
    //                 if (res) { //if a file is selected 
    //                     filePath = res.metadata.fullPath;
    //                 }
    //                 else {
    //                     filePath = this.addExpenseForm.get('file').value;
    //                 }
    //                 const token = localStorage.getItem('token');
    //                 return this.setFormData(filePath, token);
    //             }),
    //             switchMap((res) => this.expenseDataServise.updateExpenseData(res, this.id)),
    //             catchError((err) => {
    //                 alert('Something Went Wrong in second catchError ' + err.error.message)
    //                 if (this.selectedFile) {
    //                     this.fileService.deleteFile(filePath);
    //                 }
    //                 //this.genericService.dismissLoader();
    //                 return EMPTY;
    //             })
    //         ).subscribe((res) => {
    //             if (previousFile !== "") {
    //                 if (this.selectedFile) {
    //                     this.fileService.deleteFile(previousFile);
    //                 }
    //             }
    //             if (res) { // TODO: why returning this object from BE?
    //                 this.expenseDataServise.updateTable$.next(true);
    //             }

    //             this.genericService.dismissLoader();
    //             // this.modalCtrl.dismiss();
    //         });
    // }



    // setFormData(filePath: string, token: string) {
    //     const formData = this.addExpenseForm.value;
    //     console.log("form in set form", formData);
    //     if (this.userData?.businessStatus != 'MULTI_BUSINESS') {
    //         formData.businessNumber = this.userData?.businessNumber;
    //     }
    //     formData.taxPercent = +formData.taxPercent;
    //     formData.vatPercent = +formData.vatPercent;
    //     formData.file = filePath;
    //     formData.reductionPercent = +formData.reductionPercent;
    //     formData.sum = +formData.sum;
    //     formData.isEquipment === "0" ? formData.isEquipment = false : formData.isEquipment = true;
    //     formData.token = this.formBuilder.control(token).value; // TODO: check when token is invalid
    //     console.log(formData);
    //     return formData;
    // }


    // displayFile(): any {
    //     return this.isEditMode ? this.editModeFile : this.selectedFile as string;
    // }

    // fileSelected(event: any) {
    //     this.pdfLoaded = false; // If user change from pdf file to png file
    //     this.errorFile = false; // Reset the error message
    //     const file = event.target.files[0];
    //     this.fileToUpload = file;
    //     if (!file) {
    //         this.errorFile = true;
    //         return;
    //     }
    //     // For check if change the file in edit mode
    //     if (this.isEditMode && this.isFileExist) {
    //         this.currentFileName = file.name;
    //         if (this.currentFileName !== this.originalFileName) {
    //             this.isFileChanged = true;
    //         }
    //         else {
    //             this.isFileChanged = false;
    //         }
    //     }
    //     else if (this.isEditMode && !this.isFileExist) {
    //         this.currentFileName = file.name;
    //         this.isFileChanged = true;
    //     }

    //     const allowedExtensions = ['.pdf', '.png', '.jpg', '.jpeg'];
    //     const extension = file.name.split('.').pop().toLowerCase();

    //     if (!allowedExtensions.includes(`.${extension}`)) {
    //         alert('Please upload only PDF, PNG, or JPEG files.');
    //         return;
    //     }

    //     if (extension === "pdf") {
    //         const target = event.target as HTMLInputElement;
    //         const files = target.files as FileList;
    //         const file = files.item(0);

    //         if (!file) {
    //             this.errorFile = true;
    //             return;
    //         }

    //         this.fileService.convertFileToBase64(file)
    //             .pipe(
    //                 catchError((err) => {
    //                     console.log("error in select PDF file: ", err);
    //                     this.errorFile = true;
    //                     return EMPTY;
    //                 })
    //             )
    //             .subscribe((res) => {
    //                 this.safePdfBase64String = this.sanitizer.bypassSecurityTrustResourceUrl(res);
    //             })
    //         // const rawPdfBase64String = await this.convertPdfFileToBase64String(file);
    //         // this.safePdfBase64String = this.sanitizer.bypassSecurityTrustResourceUrl(rawPdfBase64String);
    //         this.pdfLoaded = true;
    //     }

    //     const reader = new FileReader();
    //     reader.readAsDataURL(file);
    //     reader.onload = () => {
    //         if (this.isEditMode) {
    //             this.editModeFile = reader.result as string;
    //             // this.selectedFile = reader.result as string;// If change file on edit mode.
    //         }
    //         else {
    //             this.selectedFile = reader.result as string;
    //         }
    //     }
    // }

    // deleteFile(event: any): void {
    //     this.addExpenseForm.patchValue({ file: "" }) // For delete file from form in edit mode. 
    //     // For check if change the file in edit mode
    //     if (this.isEditMode && this.isFileExist) {
    //         this.isFileChanged = true;
    //     }
    //     else if (this.isEditMode && !this.isFileExist) {
    //         if (this.currentFileName !== "") {
    //             this.isFileChanged = false;
    //         }
    //     }

    //     const fileInput = event.target.closest('label').querySelector('ion-input[type="file"]');
    //     if (fileInput) {
    //         fileInput.value = '';
    //     }
    //     this.selectedFile = '';
    //     this.editModeFile = '';

    //     this.editModeFile = '';
    //     this.safePdfBase64String = this.sanitizer.bypassSecurityTrustResourceUrl('');
    //     this.pdfLoaded = false;
    //     event.preventDefault();
    // }




    mode = input<'add' | 'edit'>("add");

    formBuilder = inject(FormBuilder);
    mannualExpenseService = inject(MannualExpenseService);
    authService = inject(AuthService);
    dialogService = inject(DialogService);
    dialogRef = inject(DynamicDialogRef);
    fileService = inject(FilesService);
    genericService = inject(GenericService);
    messageService = inject(MessageService);
    expenseDataService = inject(ExpenseDataService);
    sanitizer = inject(DomSanitizer);

    files = signal<File[]>([]);
    isDirty = signal<boolean>(false);
    isLoadingAddExpense = signal<boolean>(false);
    previewFileUrl = signal<string | null>(null);
    previewFileType = signal<'pdf' | 'image' | null>(null);
    safePreviewUrl = signal<SafeResourceUrl | null>(null);
    
    // Computed signal for PDF URL with toolbar disabled
    pdfUrlWithParams = computed(() => {
        const url = this.previewFileUrl();
        if (url && this.previewFileType() === 'pdf') {
            const separator = url.includes('#') ? '&' : '#';
            return this.sanitizer.bypassSecurityTrustResourceUrl(`${url}${separator}toolbar=0&navpanes=0&scrollbar=0`);
        }
        return null;
    });
    inputSize = inputsSize;
    buttonSize = ButtonSize;
    buttonColor = ButtonColor;

    isMobile = computed(() => this.genericService.isMobile());

    // Track selected business type (similar to doc-create.page.ts)
    selectedBusinessType = signal<BusinessType>(BusinessType.EXEMPT);

    // Check if the selected business is exempt from VAT
    isExemptBusiness = computed(() => this.selectedBusinessType() === BusinessType.EXEMPT);

    mannualExpenseForm = this.formBuilder.group({
        businessNumber: [this.mannualExpenseService.showBusinessSelector() ? null : null, Validators.required],
        date: ["", Validators.required],
        sum: ["", [Validators.required, Validators.min(0)]],
        supplier: ["", Validators.required],
        supplierId: ["", Validators.pattern("^[0-9]*$")],
        expenseNumber: ["", Validators.pattern("^[0-9]*$")],
        category: [null, Validators.required],
        subCategory: [null, Validators.required],
        vatPercent: [0, [Validators.required, Validators.min(0), Validators.max(100)]],
        taxPercent: [0, [Validators.required, Validators.min(0), Validators.max(100)]],
        reductionPercent: [0, [Validators.required, Validators.min(0), Validators.max(100)]],
        note: ["",],
        file: [null],
    })

    constructor() {
        // Initialize selectedBusinessType from active business (if available)
        const activeBusinessNumber = this.authService.getActiveBusinessNumber();
        
        // Initialize $selectedBusinessNumber if there's an active business or only one business
        if (activeBusinessNumber) {
            const business = this.genericService.businesses().find(b => b.businessNumber === activeBusinessNumber);
            if (business) {
                this.selectedBusinessType.set(business.businessType ?? BusinessType.EXEMPT);
                this.mannualExpenseService.$selectedBusinessNumber.set(activeBusinessNumber);
                // Ensure AuthService is synced for interceptor
                this.authService.setActiveBusinessNumber(activeBusinessNumber);
            }
        } else if (!this.mannualExpenseService.showBusinessSelector()) {
            // If there's only one business, automatically select it
            const businesses = this.genericService.businesses();
            if (businesses.length === 1) {
                const singleBusiness = businesses[0];
                this.mannualExpenseService.$selectedBusinessNumber.set(singleBusiness.businessNumber);
                this.selectedBusinessType.set(singleBusiness.businessType ?? BusinessType.EXEMPT);
                // Ensure AuthService is synced for interceptor
                this.authService.setActiveBusinessNumber(singleBusiness.businessNumber);
            }
        }


        // Set vatPercent to 0 when business is exempt
        effect(() => {
            if (this.isExemptBusiness()) {
                this.mannualExpenseForm.patchValue({ vatPercent: 0 }, { emitEvent: false });
            }
        });

        // Sync AuthService with $selectedBusinessNumber for interceptor
        // This ensures the businessNumber header is sent with API requests
        effect(() => {
            const businessNumber = this.mannualExpenseService.$selectedBusinessNumber();
            if (businessNumber) {
                this.authService.setActiveBusinessNumber(businessNumber);
            }
        });
    }

    getSubCategory(category: string | boolean | null): void {
        if (!category) {
            this.mannualExpenseService.$selectedCategory.set("");
            return;
        }
        this.mannualExpenseService.$selectedCategory.set(category as string);
    }

    selectedFiles(event: File[]): void {
        this.files.set(event);
        
        // Clean up previous preview URL
        if (this.previewFileUrl()) {
            const url = this.previewFileUrl();
            if (url && url.startsWith('blob:')) {
                URL.revokeObjectURL(url);
            }
        }
        this.safePreviewUrl.set(null);
        
        // Auto-preview the first file
        if (event.length > 0) {
            this.loadPreview(event[0]);
        } else {
            this.previewFileUrl.set(null);
            this.previewFileType.set(null);
        }
    }

    loadPreview(file: File): void {
        if (!file) return;

        const fileExtension = file.name.split('.').pop()?.toLowerCase();
        
        if (fileExtension === 'pdf') {
            const reader = new FileReader();
            reader.onloadend = () => {
                const arrayBuffer = reader.result as ArrayBuffer;
                const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
                const blobUrl = URL.createObjectURL(blob);
                this.previewFileUrl.set(blobUrl);
                this.previewFileType.set('pdf');
                const safeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(blobUrl);
                this.safePreviewUrl.set(safeUrl);
            };
            reader.onerror = (error) => {
                console.error("Error reading PDF:", error);
            };
            reader.readAsArrayBuffer(file);
        } else if (['jpg', 'jpeg', 'png'].includes(fileExtension || '')) {
            const reader = new FileReader();
            reader.onloadend = () => {
                const dataUrl = reader.result as string;
                this.previewFileUrl.set(dataUrl);
                this.previewFileType.set('image');
                const safeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(dataUrl);
                this.safePreviewUrl.set(safeUrl);
            };
            reader.onerror = (error) => {
                console.error("Error reading image:", error);
            };
            reader.readAsDataURL(file);
        }
    }


    addExpense(): void {
        if (this.isLoadingAddExpense()) {
            return;
        }

        if (this.mannualExpenseForm.invalid) {
            this.mannualExpenseForm.markAllAsTouched();
            return;
        }

        this.isLoadingAddExpense.set(true);
        let uploadedPath: string | null = null;

        this.uploadFileToFirebase()
            .pipe(
                tap((filePath) => {
                    if (filePath) {
                        uploadedPath = filePath;
                    }
                }),
                switchMap((filePath) => {
                    const payload = this.buildExpensePayload(filePath);
                    return this.expenseDataService.addExpenseData(payload);
                }),
                catchError((error) => this.handleAddExpenseError(error, uploadedPath)),
                finalize(() => this.isLoadingAddExpense.set(false))
            )
            .subscribe(() => {
                this.showToast({ severity: "success", summary: "Success", detail: "ההוצאה נשמרה בהצלחה", sticky: false });
                // this.resetFormAfterSubmit();
                this.dialogRef.close();
            });
    }

    uploadFileToFirebase(): Observable<string | null> {
        const file = this.files().at(0);

        if (!file) {
            return of(null);
        }

        let uploadedPath: string | null = null;

        return this.fileService.uploadFileViaFront(file, this.authService.getActiveBusinessNumber() ?? "").pipe(
            map((res) => {
                const firebasePath = res?.metadata?.fullPath as string | undefined;

                if (!firebasePath) {
                    throw new Error("Firebase response missing file path");
                }

                uploadedPath = firebasePath;
                return firebasePath;
            }),
            catchError((error) => {
                return this.rollbackFirebaseUpload(uploadedPath).pipe(
                    // tap(() => this.genericService.showToast("העלאת הקובץ נכשלה. נסה שוב מאוחר יותר", "error")),
                    switchMap(() => throwError(() => error))
                );
            })
        );
    }

    private rollbackFirebaseUpload(filePath: string | null): Observable<void> {
        if (!filePath) {
            return of(void 0);
        }

        return this.fileService.deleteFileFromFirebase(filePath).pipe(
            map(() => void 0),
            catchError((err) => {
                console.error("Failed to delete file during rollback:", err);
                return of(void 0);
            })
        );
    }

    private buildExpensePayload(filePath: string | null): any {
        const raw = this.mannualExpenseForm.value;

        return {
            ...raw,
            file: filePath,
            sum: this.toNumberOrNull(raw.sum),
            taxPercent: this.toNumberOrNull(raw.taxPercent),
            vatPercent: this.toNumberOrNull(raw.vatPercent),
            reductionPercent: this.toNumberOrNull(raw.reductionPercent),
        };
    }

    private handleAddExpenseError(error: any, uploadedPath: string | null): Observable<never> {
        return (uploadedPath ? this.rollbackFirebaseUpload(uploadedPath) : of(void 0)).pipe(
            tap(() => this.presentAddExpenseError(error)),
            switchMap(() => EMPTY)
        );
    }

    private presentAddExpenseError(error: any): void {
        if (error?.status === 401) {
            this.showToast({ severity: "error", summary: "Error", detail: "משתמש לא חוקי , אנא התחבר למערכת", sticky: true });
            return;
        }

        if (error?.status === 0) {
            this.showToast({ severity: "error", summary: "Error", detail: "אין אינטרנט, אנא ודא חיבור לרשת", sticky: true });
            return;
        }

        this.showToast({ severity: "error", summary: "Error", detail: "אירעה שגיאה , ההוצאה לא נשמרה", sticky: true });
    }

    private resetFormAfterSubmit(): void {
        this.mannualExpenseForm.reset();
        this.files.set([]);
    }

    private toNumberOrNull(value: unknown): number | null {
        if (value === null || value === undefined || value === "") {
            return null;
        }

        const numeric = Number(value);
        return Number.isNaN(numeric) ? null : numeric;
    }

    private showToast(payload: { sticky?: boolean; severity: "success" | "error" | "info" | "warn"; summary: string; detail: string; }): void {
        this.messageService.add({
            severity: payload.severity,
            summary: payload.summary,
            detail: payload.detail,
            sticky: payload.sticky,
            life: 3000,
            key: "br"
        });
    }

    selectBusiness(event: string | boolean): void {
        const businessNumber = event as string;
        this.authService.setActiveBusinessNumber(businessNumber);
        this.mannualExpenseService.$selectedBusinessNumber.set(businessNumber); // Trigger supplier reload on account change

        // Update selectedBusinessType (similar to doc-create.page.ts)
        if (businessNumber) {
            const business = this.genericService.businesses().find(b => b.businessNumber === businessNumber);
            if (business) {
                this.selectedBusinessType.set(business.businessType ?? BusinessType.EXEMPT);
            }
        }

        if (event) {
            this.mannualExpenseService.isSelectBusiness.set(true);
        }
        else {
            this.mannualExpenseService.isSelectBusiness.set(false);
        }
    }

    get subCategoryItems(): ISelectItem[] {

        return this.mannualExpenseService.$subCategoriesOptions();
    }

    onSelectSubCategory(event: string | boolean | null): void {
        const subCategory = this.mannualExpenseService.subCategoriesResource.value()?.find((item: ISubCategory) => item.subCategoryName === event);
        this.mannualExpenseForm.patchValue({ reductionPercent: subCategory?.reductionPercent });
        this.mannualExpenseForm.patchValue({ vatPercent: +(subCategory?.vatPercent) });
        this.mannualExpenseForm.patchValue({ taxPercent: +(subCategory?.taxPercent) });
        this.isDirty.set(true);
    }

    onInputText(event: string): void {
        if (event === '') {
            // this.isDirty.set(false);
        }
    }


    filterSuppliers(event: any): void {
        const query = event.query || '';
        this.mannualExpenseService.$supplierSearchQuery.set(query);
    }

    onSupplierSelect(event: any): void {
        // Handle both cases: autocomplete (event.value) and direct supplier object
        const supplier = event.value || event;
        
        // Map supplier data - backend returns 'supplier' field, interface might use 'name'
        const supplierName = supplier.supplier || supplier.name || '';
        const supplierId = supplier.supplierID || supplier.supplierId || '';
        
        // Fill form fields with supplier data
        this.mannualExpenseForm.patchValue({
            supplier: supplierName,
            supplierId: supplierId,
            category: supplier.category || null,
            subCategory: supplier.subCategory || null,
            taxPercent: supplier.taxPercent || 0,
            vatPercent: supplier.vatPercent || 0,
            reductionPercent: supplier.reductionPercent || 0,
        });
        
        // Trigger category selection to load subcategories
        if (supplier.category) {
            this.getSubCategory(supplier.category);
        }
    }

    onAddNewSupplier(name: string): void {
        // Set the name in the form
        this.mannualExpenseForm.patchValue({
            supplier: name
        });

        this.dialogRef = this.dialogService.open(AddSupplierComponent, {
            header: 'יצירת ספק חדש',
            width: '90%',
            rtl: true,
            closable: true,
            dismissableMask: true,
            modal: true,
            data: {
                businessNumber: this.mannualExpenseService.$selectedBusinessNumber(),
                suppliers: this.mannualExpenseService.$suppliers(),
                categories: this.mannualExpenseService.$categoriesOptions(),
            }
        });

        this.dialogRef.onClose.subscribe((res) => {
            if (res) {
                this.onSupplierSelect(res);
            }
            // Trigger reload of suppliers resource
            // The resource will automatically reload when dependencies change
            const currentBusiness = this.mannualExpenseService.$selectedBusinessNumber();
            this.mannualExpenseService.$selectedBusinessNumber.set(null);
            setTimeout(() => {
                this.mannualExpenseService.$selectedBusinessNumber.set(currentBusiness);
            }, 0);
        });
    }

    ngOnDestroy(): void {
        // Clean up blob URL to prevent memory leaks
        if (this.previewFileUrl()) {
            const url = this.previewFileUrl();
            if (url && url.startsWith('blob:')) {
                URL.revokeObjectURL(url);
            }
        }
    }

}
