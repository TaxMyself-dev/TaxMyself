import { ChangeDetectionStrategy, Component, computed, effect, inject, input, OnDestroy, signal } from "@angular/core";
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from "@angular/forms";
import { DynamicDialogConfig, DialogService, DynamicDialogRef } from "primeng/dynamicdialog";
import { DomSanitizer, SafeResourceUrl } from "@angular/platform-browser";
import { FilesService } from "src/app/services/files.service";
import { GenericService } from "src/app/services/generic.service";
import { AuthService } from "src/app/services/auth.service";
import { inputsSize, BusinessType, VATReportingType } from "src/app/shared/enums";
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
import { DriveDocsService, OcrInvoiceFields } from "src/app/services/drive-docs.service";
import { MessageService } from "primeng/api";
import { Observable, EMPTY, catchError, finalize, map, of, switchMap, tap, throwError } from "rxjs";
import { AddSupplierComponent } from "../add-supplier/add-supplier.component";
import { CheckboxModule } from "primeng/checkbox";
import { ProgressSpinnerModule } from "primeng/progressspinner";
import { DialogModule } from "primeng/dialog";

@Component({
    selector: 'app-mannual-expense',
    templateUrl: './mannual-expense.component.html',
    styleUrls: ['./mannual-expense.component.scss'],
    standalone: true,
    changeDetection: ChangeDetectionStrategy.Default,
    imports: [ReactiveFormsModule, FormsModule, InputSelectComponent, InputTextComponent, InputDateComponent, appFileUploadGptComponent, ButtonComponent, InputAutoCompleteComponent, CheckboxModule, ProgressSpinnerModule, DialogModule],
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




    /** Exact category name the equipment checkbox auto-fills. Must match a
     *  category seeded in the DB; otherwise the locked select renders empty
     *  because PrimeNG's p-select needs the value to exist in [items]. */
    private readonly EQUIPMENT_CATEGORY_NAME = "רכוש קבוע (פחת)";

    mode = input<'add' | 'edit'>("add");

    formBuilder = inject(FormBuilder);
    mannualExpenseService = inject(MannualExpenseService);
    authService = inject(AuthService);
    dialogService = inject(DialogService);
    dialogRef = inject(DynamicDialogRef);
    dialogConfig = inject(DynamicDialogConfig);
    fileService = inject(FilesService);
    driveDocsService = inject(DriveDocsService);

    editMode = false;
    expenseId: number | null = null;
    existingFilePath: string | null = null;
    genericService = inject(GenericService);
    messageService = inject(MessageService);
    expenseDataService = inject(ExpenseDataService);
    sanitizer = inject(DomSanitizer);

    files = signal<File[]>([]);
    isDirty = signal<boolean>(false);
    isLoadingAddExpense = signal<boolean>(false);
    isOcrLoading = signal<boolean>(false);
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
    // VAT reporting cadence of the selected business — drives the VAT-report-
    // period field (single vs dual month) and whether it shows at all.
    selectedVatReportingType = signal<VATReportingType>(VATReportingType.NOT_REQUIRED);

    // Check if the selected business is exempt from VAT
    isExemptBusiness = computed(() => this.selectedBusinessType() === BusinessType.EXEMPT);

    /** VAT-licensed = files monthly or bi-monthly VAT reports. Only then does
     *  an expense carry a VAT-report period, so the field shows only here;
     *  for exempt businesses the period stays null. */
    isVatLicensed = computed(() =>
        this.selectedVatReportingType() === VATReportingType.MONTHLY_REPORT ||
        this.selectedVatReportingType() === VATReportingType.DUAL_MONTH_REPORT);

    /** Period options for the VAT-report-period select: a 6-month-forward
     *  window from the expense date + the business cadence ("M/YYYY" or
     *  "M1-M2/YYYY"), plus an "אחר" entry for a manual period. */
    vatPeriodOptions = signal<ISelectItem[]>([]);

    /** Sentinel value for the "אחר" (other) option — picking it opens the
     *  manual-period dialog instead of selecting a real period. */
    private static readonly CUSTOM_VAT_PERIOD = '__custom_vat_period__';

    /** Manual-period ("אחר") dialog state. */
    customVatPeriodVisible = signal<boolean>(false);
    customVatPeriodValue = signal<string>('');
    /** Last real period selected — used to revert the select when the user
     *  opens (and possibly cancels) the "אחר" dialog. */
    private lastValidVatPeriod: string | null = null;
    
    // Signal to track isEquipment checkbox state
    isEquipmentChecked = signal<boolean>(false);
    
    // Subscription for isEquipment valueChanges
    private isEquipmentSubscription?: any;
    // Subscription for date valueChanges (rebuilds VAT-period options)
    private dateSubscription?: any;

    mannualExpenseForm = this.formBuilder.group({
        businessNumber: [this.mannualExpenseService.showBusinessSelector() ? null : null, Validators.required],
        date: ["", Validators.required],
        sum: ["", [Validators.required, Validators.min(0)]],
        // Currency of the entered sum. Default ILS — the existing flow. When
        // non-ILS, the payload maps `sum` → `originalSum` and lets the backend
        // convert via the BOI rate on `date`. `Expense.sum` is always stored ILS.
        currency: ["ILS"],
        supplier: ["", Validators.required],
        supplierId: ["", Validators.pattern("^[0-9]*$")],
        expenseNumber: ["", Validators.pattern("^[0-9]*$")],
        isEquipment: [false],
        category: [null as string | null, Validators.required],
        subCategory: [null, Validators.required],
        vatPercent: [0, [Validators.required, Validators.min(0), Validators.max(100)]],
        taxPercent: [0, [Validators.required, Validators.min(0), Validators.max(100)]],
        reductionPercent: [0, [Validators.required, Validators.min(0), Validators.max(100)]],
        note: ["",],
        file: [null],
        // P&L vs annual-report-only scope (per expense).
        reportScope: ['pnl' as 'pnl' | 'annual'],
        // Optional per-expense P&L-category override ("" / null = use default).
        pnlCategory: [null as string | null],
        // When checked (edit mode), also apply the P&L category to the WHOLE
        // subcategory (not just this one expense).
        applyPnlToSubcategory: [false],
        // VAT report period stamp ("M/YYYY" or "M1-M2/YYYY"). Editable only
        // for VAT-licensed businesses; null for exempt.
        vatReportingDate: [null as string | null],
    })

    /** Report-scope dropdown options (ISelectItem shape: { name, value }). */
    readonly reportScopeOptions = [
        { name: 'רווח והפסד', value: 'pnl' },
        { name: 'דוח שנתי בלבד', value: 'annual' },
    ];

    /** Dropdown options for the currency picker next to the sum field. */
    currencyOptions: { value: string; name: string }[] = [
        { value: 'ILS', name: 'שקל ₪' },
        { value: 'USD', name: 'דולר $' },
        { value: 'EUR', name: 'יורו €' },
        { value: 'GBP', name: 'פאונד £' },
    ];

    constructor() {
        // Initialize selectedBusinessType from active business (if available)
        const activeBusinessNumber = this.authService.getActiveBusinessNumber();
        
        // Initialize $selectedBusinessNumber if there's an active business or only one business
        if (activeBusinessNumber) {
            const business = this.genericService.businesses().find(b => b.businessNumber === activeBusinessNumber);
            if (business) {
                this.selectedBusinessType.set(business.businessType ?? BusinessType.EXEMPT);
                this.selectedVatReportingType.set(business.vatReportingType ?? VATReportingType.NOT_REQUIRED);
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
                this.selectedVatReportingType.set(singleBusiness.vatReportingType ?? VATReportingType.NOT_REQUIRED);
                // Ensure AuthService is synced for interceptor
                this.authService.setActiveBusinessNumber(singleBusiness.businessNumber);
            }
        }


        // Set vatPercent to 0 and clear validators when business is exempt
        effect(() => {
            const vatPercentControl = this.mannualExpenseForm.get('vatPercent');
            if (this.isExemptBusiness()) {
                this.mannualExpenseForm.patchValue({ vatPercent: 0 }, { emitEvent: false });
                // Clear validators for exempt business
                vatPercentControl?.clearValidators();
                vatPercentControl?.updateValueAndValidity({ emitEvent: false });
            } else {
                // Restore validators for non-exempt business
                vatPercentControl?.setValidators([Validators.required, Validators.min(0), Validators.max(100)]);
                vatPercentControl?.updateValueAndValidity({ emitEvent: false });
            }
        });

        // Initialize isEquipmentChecked signal with form value
        this.isEquipmentChecked.set(this.mannualExpenseForm.get('isEquipment')?.value === true);
        
        // Handle isEquipment checkbox changes
        this.isEquipmentSubscription = this.mannualExpenseForm.get('isEquipment')?.valueChanges.subscribe((isChecked: boolean) => {
            console.log('isEquipment value changed:', isChecked);
            this.isEquipmentChecked.set(isChecked || false);
            
            if (isChecked) {
                // Set category to the equipment category automatically.
                // The subcategory fetch (via $selectedCategory) is deferred to
                // the effect below — it waits until $categoriesOptions has
                // loaded, which implies a business is selected. Otherwise the
                // resource would fetch without a businessNumber header and the
                // backend rejects with 500.
                this.mannualExpenseForm.patchValue({ category: this.EQUIPMENT_CATEGORY_NAME }, { emitEvent: true });
                // Set taxPercent to 0 and clear validators
                this.mannualExpenseForm.patchValue({ taxPercent: 0 }, { emitEvent: false });
                const taxPercentControl = this.mannualExpenseForm.get('taxPercent');
                taxPercentControl?.clearValidators();
                taxPercentControl?.updateValueAndValidity({ emitEvent: false });
                // Make reductionPercent required
                const reductionPercentControl = this.mannualExpenseForm.get('reductionPercent');
                reductionPercentControl?.setValidators([Validators.required, Validators.min(0), Validators.max(100)]);
                reductionPercentControl?.updateValueAndValidity({ emitEvent: false });
            } else {
                // Clear category only if it was the equipment category
                const currentCategory = this.mannualExpenseForm.get('category')?.value;
                if (currentCategory === this.EQUIPMENT_CATEGORY_NAME) {
                    this.mannualExpenseForm.patchValue({ category: null as any }, { emitEvent: true });
                }
                // Restore taxPercent validators
                const taxPercentControl = this.mannualExpenseForm.get('taxPercent');
                taxPercentControl?.setValidators([Validators.required, Validators.min(0), Validators.max(100)]);
                taxPercentControl?.updateValueAndValidity({ emitEvent: false });
                // Clear reductionPercent and remove required validator
                this.mannualExpenseForm.patchValue({ reductionPercent: 0 }, { emitEvent: false });
                const reductionPercentControl = this.mannualExpenseForm.get('reductionPercent');
                reductionPercentControl?.clearValidators();
                reductionPercentControl?.setValidators([Validators.min(0), Validators.max(100)]);
                reductionPercentControl?.updateValueAndValidity({ emitEvent: false });
            }
        });

        // Re-sync the equipment category when the categories list finishes
        // loading. The user can tick "רכוש קבוע" before selecting a business,
        // which means the patchValue above runs while $categoriesOptions() is
        // still empty — PrimeNG's p-select then has no matching item to
        // display and shows the "בחר קטגוריה" placeholder. Once the categories
        // list arrives (after business is picked, or on initial load for
        // single-business users), this effect re-patches so the locked select
        // renders the value.
        effect(() => {
            if (!this.isEquipmentChecked()) return;
            const options = this.mannualExpenseService.$categoriesOptions();
            if (!options || options.length === 0) return;
            const ctrl = this.mannualExpenseForm.get('category');
            if (ctrl && ctrl.value !== this.EQUIPMENT_CATEGORY_NAME) {
                ctrl.setValue(this.EQUIPMENT_CATEGORY_NAME, { emitEvent: false });
            }
            // Ensure subcategories also load (the resource keys off
            // $selectedCategory, which we set here in case the initial
            // valueChanges fired before the business was chosen).
            if (this.mannualExpenseService.$selectedCategory() !== this.EQUIPMENT_CATEGORY_NAME) {
                this.mannualExpenseService.$selectedCategory.set(this.EQUIPMENT_CATEGORY_NAME);
            }
        });

        // Handle businessNumber validators based on showBusinessSelector
        effect(() => {
            const businessNumberControl = this.mannualExpenseForm.get('businessNumber');
            if (this.mannualExpenseService.showBusinessSelector()) {
                // Business number is required if there are multiple businesses
                businessNumberControl?.setValidators([Validators.required]);
            } else {
                // Clear validators if there's only one business
                businessNumberControl?.clearValidators();
            }
            businessNumberControl?.updateValueAndValidity({ emitEvent: false });
        });

        // Sync AuthService with $selectedBusinessNumber for interceptor
        // This ensures the businessNumber header is sent with API requests
        effect(() => {
            const businessNumber = this.mannualExpenseService.$selectedBusinessNumber();
            if (businessNumber) {
                this.authService.setActiveBusinessNumber(businessNumber);
            }
        });

        // Rebuild the VAT-report-period options when the date changes (its
        // year drives the option set). Only relevant for VAT-licensed
        // businesses; cheap no-op otherwise.
        this.dateSubscription = this.mannualExpenseForm.get('date')?.valueChanges.subscribe(() => {
            if (this.isVatLicensed()) this.buildVatPeriodOptions();
        });

        // Edit mode: prefill form from expense row (when opened from expenses table)
        const data = this.dialogConfig.data as { editMode?: boolean; expense?: any } | undefined;
        if (data?.editMode && data?.expense) {
            const row = data.expense;
            this.editMode = true;
            this.expenseId = row.id != null ? Number(row.id) : null;
            this.existingFilePath = (row.file && row.file !== '') ? row.file : null;
            const sumVal = this.parseSumFromDisplay(row.sum);
            const taxVal = this.parsePercentFromDisplay(row.taxPercent);
            const vatVal = this.parsePercentFromDisplay(row.vatPercent);
            const dateDisplay = this.apiDateToDisplay(row.date);
            this.mannualExpenseForm.patchValue({
                businessNumber: row.businessNumber ?? this.mannualExpenseService.$selectedBusinessNumber(),
                date: dateDisplay ?? '',
                sum: sumVal != null ? String(sumVal) : '',
                supplier: row.supplier ?? '',
                supplierId: row.supplierID ?? row.supplierId ?? '',
                expenseNumber: row.expenseNumber ?? '',
                isEquipment: row.isEquipment === true || row.isEquipment === 'כן' || row.isEquipment === '1',
                category: row.category ?? null,
                subCategory: row.subCategory ?? null,
                vatPercent: vatVal ?? 0,
                taxPercent: taxVal ?? 0,
                reductionPercent: this.parsePercentFromDisplay(row.reductionPercent) ?? 0,
                note: row.note ?? '',
                reportScope: (row.reportScopeRaw ?? row.reportScope ?? 'pnl') === 'annual' ? 'annual' : 'pnl',
                pnlCategory: row.pnlCategoryOverrideRaw ?? null,
                applyPnlToSubcategory: false,
                // Bookkeeping table renders an empty period as "—"; treat that
                // (and blanks) as no period.
                vatReportingDate: (row.vatReportingDate && row.vatReportingDate !== '—')
                    ? row.vatReportingDate : null,
            }, { emitEvent: false });
            this.isEquipmentChecked.set(this.mannualExpenseForm.get('isEquipment')?.value === true);
            // Resolve the edited expense's business cadence so the VAT-period
            // field shows with the right (single/dual) options.
            const editBiz = this.genericService.businesses().find(b => b.businessNumber === row.businessNumber);
            if (editBiz) {
                this.selectedBusinessType.set(editBiz.businessType ?? BusinessType.EXEMPT);
                this.selectedVatReportingType.set(editBiz.vatReportingType ?? VATReportingType.NOT_REQUIRED);
            }
            this.lastValidVatPeriod = this.mannualExpenseForm.get('vatReportingDate')?.value ?? null;
            this.buildVatPeriodOptions();
            if (row.category) {
                this.getSubCategory(row.category, true);
            }
        }
    }

    /** Parse display sum like "1,234 ש"ח" to number */
    private parseSumFromDisplay(v: any): number | null {
        if (v == null || v === '') return null;
        if (typeof v === 'number') return v;
        const s = String(v).replace(/\s*ש"ח\s*/g, '').replace(/,/g, '').trim();
        const n = parseFloat(s);
        return isNaN(n) ? null : n;
    }

    /** Parse display percent like "100%" to number */
    private parsePercentFromDisplay(v: any): number | null {
        if (v == null || v === '') return null;
        if (typeof v === 'number') return v;
        const s = String(v).replace(/%/g, '').trim();
        const n = parseInt(s, 10);
        return isNaN(n) ? null : n;
    }

    /** Convert API date (yyyy-mm-dd) to display (dd-mm-yy) */
    private apiDateToDisplay(apiDate: string | null | undefined): string | null {
        if (apiDate == null || apiDate === '') return null;
        const s = String(apiDate).trim();
        const parts = s.split(/[-/]/);
        if (parts.length !== 3) return null;
        const [y, m, d] = parts;
        const yearShort = y!.length === 4 ? y!.slice(-2) : y;
        return `${d!.padStart(2, '0')}-${m!.padStart(2, '0')}-${yearShort}`;
    }

    /**
     * @param category קטגוריה שנבחרה
     * @param preserveSubCategory אם true (למשל בבחירת ספק קיים) לא מאפסים את שדה תת־קטגוריה
     */
    getSubCategory(category: string | boolean | null, preserveSubCategory = false): void {
        if (!category) {
            this.mannualExpenseService.$selectedCategory.set("");
            if (!preserveSubCategory) {
                this.mannualExpenseForm.patchValue({ subCategory: null }, { emitEvent: false });
            }
            return;
        }
        this.mannualExpenseService.$selectedCategory.set(category as string);
        if (!preserveSubCategory) {
            this.mannualExpenseForm.patchValue({ subCategory: null }, { emitEvent: false });
        }
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
            // OCR auto-fill — runs only on add (not edit, to avoid clobbering
            // existing data the user is editing).
            if (!this.editMode) {
                this.runOcrAutoFill(event[0]);
            }
        } else {
            this.previewFileUrl.set(null);
            this.previewFileType.set(null);
        }
    }

    /**
     * Sends the uploaded file to the Claude-OCR endpoint and prefills the form
     * with the extracted invoice fields. Best-effort: any failure surfaces a
     * soft toast so the user can still fill the form manually.
     */
    private runOcrAutoFill(file: File): void {
        const businessNumber =
            this.mannualExpenseService.$selectedBusinessNumber() ??
            this.authService.getActiveBusinessNumber() ?? '';
        if (!businessNumber) {
            // No business selected (multi-business + nothing chosen yet) —
            // skip OCR silently; the user will pick a business and can
            // re-upload to trigger OCR.
            return;
        }
        this.isOcrLoading.set(true);
        this.driveDocsService.ocrSingleFile(file, businessNumber)
            .pipe(
                catchError((err) => {
                    console.error('[MannualExpense] OCR failed:', err);
                    this.showToast({
                        severity: 'warn',
                        summary: 'מילוי אוטומטי נכשל',
                        detail: 'לא הצלחנו לחלץ נתונים מהקובץ — ניתן למלא ידנית',
                        sticky: false,
                    });
                    return EMPTY;
                }),
                finalize(() => this.isOcrLoading.set(false)),
            )
            .subscribe((res) => {
                if (!res?.invoice) {
                    this.showToast({
                        severity: 'info',
                        summary: 'לא זוהו נתונים',
                        detail: 'לא נמצאו נתוני חשבונית בקובץ — ניתן למלא ידנית',
                        sticky: false,
                    });
                    return;
                }
                this.applyOcrResult(res.invoice);
                this.showToast({
                    severity: 'success',
                    summary: 'הצלחה',
                    detail: 'הטופס מולא אוטומטית מהקובץ',
                    sticky: false,
                });
            });
    }

    private applyOcrResult(inv: OcrInvoiceFields): void {
        const dateDisplay = this.apiDateToDisplay(inv.date);
        const patch: Record<string, any> = {};
        if (inv.supplier) patch['supplier'] = inv.supplier;
        if (inv.supplier_id) patch['supplierId'] = inv.supplier_id;
        if (dateDisplay) patch['date'] = dateDisplay;
        if (inv.invoice_number) patch['expenseNumber'] = inv.invoice_number;
        if (inv.amount != null) patch['sum'] = String(inv.amount);
        if (inv.category) patch['category'] = inv.category;
        if (inv.sub_category) patch['subCategory'] = inv.sub_category;
        if (inv.vat_percent != null) patch['vatPercent'] = Number(inv.vat_percent);
        if (inv.tax_percent != null) patch['taxPercent'] = Number(inv.tax_percent);
        if (typeof inv.is_equipment === 'boolean') patch['isEquipment'] = inv.is_equipment;
        // emitEvent: false — skip the isEquipment valueChanges subscription so
        // it doesn't overwrite category/taxPercent we just set from OCR.
        this.mannualExpenseForm.patchValue(patch, { emitEvent: false });
        this.isEquipmentChecked.set(this.mannualExpenseForm.get('isEquipment')?.value === true);
        // Populate the subcategory dropdown options for the chosen category
        // without clearing the subCategory we just patched in.
        if (inv.category) {
            this.getSubCategory(inv.category, true);
        }
        this.isDirty.set(true);
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
        const hasNewFile = this.files().length > 0;
        const filePath$ = this.editMode && !hasNewFile
            ? of(this.existingFilePath)
            : this.uploadFileToFirebase();

        filePath$
            .pipe(
                tap((filePath) => {
                    if (filePath) uploadedPath = filePath;
                }),
                switchMap((filePath) => {
                    const payload = this.buildExpensePayload(filePath);
                    // getRawValue — see buildExpensePayload for the disabled-
                    // control rationale. Otherwise raw.category is undefined
                    // when "רכוש קבוע" is checked.
                    const raw = this.mannualExpenseForm.getRawValue();
                    const save$ = (this.editMode && this.expenseId != null)
                        ? this.expenseDataService.updateExpenseData(payload, this.expenseId)
                        : this.expenseDataService.addExpenseData(payload);

                    // "Apply to whole subcategory" → also upsert the
                    // subcategory-level P&L config (subcategory-wide).
                    if (raw.applyPnlToSubcategory && raw.category && raw.subCategory) {
                        return save$.pipe(
                            switchMap((res) =>
                                this.expenseDataService.setSubCategoryReportConfig({
                                    businessNumber: String(raw.businessNumber ?? this.mannualExpenseService.$selectedBusinessNumber() ?? ''),
                                    categoryName: String(raw.category),
                                    subCategoryName: String(raw.subCategory),
                                    reportScope: (raw.reportScope as 'pnl' | 'annual') ?? 'pnl',
                                    pnlCategory: (payload.pnlCategory ?? null) as string | null,
                                }).pipe(map(() => res)),
                            ),
                        );
                    }
                    return save$;
                }),
                catchError((error) => this.handleAddExpenseError(error, uploadedPath)),
                finalize(() => this.isLoadingAddExpense.set(false))
            )
            .subscribe((res) => {
                this.dialogRef.close(res);
                this.showToast({
                    severity: "success",
                    summary: "הצלחה",
                    detail: this.editMode ? "ההוצאה עודכנה בהצלחה" : "ההוצאה נשמרה בהצלחה",
                    sticky: false
                });
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

    /**
     * Normalize whatever the date control hands us to MySQL's DATE format
     * (`yyyy-mm-dd`). Three shapes the picker can emit:
     *   1. Date object — extract LOCAL components (user-picked-date semantics:
     *      picking May 1 in Israel must not become April 30 after UTC shift).
     *   2. ISO string `yyyy-mm-ddTHH:MM:SS.sssZ` — parse to Date, then same.
     *   3. Display string `dd-mm-yy(yy)` or `dd/mm/yy(yy)` — split + reorder.
     *
     * Returns undefined for anything we can't parse; callers can decide to
     * surface a validation error rather than send garbage to MySQL.
     */
    private toApiDateString(displayDate: string | Date | null | undefined): string | undefined {
        if (displayDate == null || displayDate === '') return undefined;

        // 1+2: Date instance OR ISO datetime string → parse + extract local components.
        const isIsoString = typeof displayDate === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(displayDate);
        if (displayDate instanceof Date || isIsoString) {
            const d = displayDate instanceof Date ? displayDate : new Date(displayDate);
            if (isNaN(d.getTime())) return undefined;
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        }

        const s = String(displayDate).trim();

        // Plain yyyy-mm-dd (already API format) — pass through.
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

        // 3: dd-mm-yy(yy) or dd/mm/yy(yy)
        const parts = s.split(/[-/]/);
        if (parts.length !== 3) return undefined;
        const [d, m, y] = parts;
        const year = y!.length === 2 ? `20${y}` : y;
        return `${year}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
    }

    /** Year (yyyy) from whatever shape the date control holds, or null. */
    private yearFromDate(dateVal: unknown): number | null {
        const api = this.toApiDateString(dateVal as any);
        if (!api) return null;
        const y = Number(api.slice(0, 4));
        return Number.isNaN(y) ? null : y;
    }

    /**
     * Rebuild the VAT-report-period select options as a 6-month-forward window
     * from the expense date, matching the extracted-documents review modal:
     *   - DUAL_MONTH_REPORT: the bi-monthly bucket the date falls in + the next
     *     two (3 buckets), year rolling over December.
     *   - MONTHLY_REPORT: 6 individual months from the date's month, same roll.
     * The currently-selected period is preserved at the top if it's outside the
     * window (e.g. a back-fill), and an "אחר" entry is appended for a manual
     * period. No-op for non-licensed businesses (the field is hidden anyway).
     */
    private buildVatPeriodOptions(): void {
        if (!this.isVatLicensed()) {
            this.vatPeriodOptions.set([]);
            return;
        }
        const isDual = this.selectedVatReportingType() === VATReportingType.DUAL_MONTH_REPORT;
        const api = this.toApiDateString(this.mannualExpenseForm.get('date')?.value);
        const opts: ISelectItem[] = [];

        if (api) {
            let month = Number(api.slice(5, 7)); // 1-12
            let year = Number(api.slice(0, 4));
            if (isDual) {
                // Align to the bi-monthly bucket start (1, 3, 5, 7, 9, 11).
                let start = month % 2 === 1 ? month : month - 1;
                for (let i = 0; i < 3; i++) {
                    const label = `${start}-${start + 1}/${year}`;
                    opts.push({ name: label, value: label });
                    start += 2;
                    if (start > 12) { start = 1; year++; }
                }
            } else {
                for (let i = 0; i < 6; i++) {
                    const label = `${month}/${year}`;
                    opts.push({ name: label, value: label });
                    month++;
                    if (month > 12) { month = 1; year++; }
                }
            }
        } else {
            const year = new Date().getFullYear();
            const label = isDual ? `1-2/${year}` : `1/${year}`;
            opts.push({ name: label, value: label });
        }

        // Keep the currently-selected period visible even if it's outside the
        // forward window (e.g. a back-filled expense reported to an earlier
        // period).
        const current = this.mannualExpenseForm.get('vatReportingDate')?.value;
        if (current
            && current !== MannualExpenseComponent.CUSTOM_VAT_PERIOD
            && !opts.some(o => o.value === current)) {
            opts.unshift({ name: current, value: current });
        }

        // "אחר" — opens the manual-period dialog.
        opts.push({ name: 'אחר', value: MannualExpenseComponent.CUSTOM_VAT_PERIOD });

        this.vatPeriodOptions.set(opts);
    }

    /** Period select changed. Picking "אחר" opens the manual-entry dialog and
     *  reverts the select to the last real period; any other pick is recorded
     *  as the new "last valid" period. */
    onVatPeriodChange(value: string | boolean): void {
        if (value === MannualExpenseComponent.CUSTOM_VAT_PERIOD) {
            this.mannualExpenseForm.get('vatReportingDate')
                ?.setValue(this.lastValidVatPeriod ?? null, { emitEvent: false });
            this.customVatPeriodValue.set(this.lastValidVatPeriod ?? '');
            this.customVatPeriodVisible.set(true);
            return;
        }
        this.lastValidVatPeriod = (value as string) || null;
    }

    /** Confirm the manually-typed period: add it to the options (before "אחר"),
     *  select it, and close. Empty input is treated as cancel. */
    confirmCustomVatPeriod(): void {
        const value = this.customVatPeriodValue().trim();
        if (!value) {
            this.cancelCustomVatPeriod();
            return;
        }
        if (!this.vatPeriodOptions().some(o => o.value === value)) {
            this.vatPeriodOptions.update(opts => {
                const next = [...opts];
                const sentinelIdx = next.findIndex(o => o.value === MannualExpenseComponent.CUSTOM_VAT_PERIOD);
                next.splice(sentinelIdx < 0 ? next.length : sentinelIdx, 0, { name: value, value });
                return next;
            });
        }
        this.lastValidVatPeriod = value;
        this.mannualExpenseForm.get('vatReportingDate')?.setValue(value, { emitEvent: false });
        this.customVatPeriodVisible.set(false);
        this.customVatPeriodValue.set('');
    }

    /** Cancel the manual-period dialog — the select keeps its prior value. */
    cancelCustomVatPeriod(): void {
        this.customVatPeriodVisible.set(false);
        this.customVatPeriodValue.set('');
    }

    private buildExpensePayload(filePath: string | null): any {
        // getRawValue (not .value) so disabled controls are included. The
        // category control is disabled via UI when "רכוש קבוע" is checked, and
        // Angular's FormGroup.value strips disabled fields — which sent
        // category: undefined to the backend and tripped @IsString().
        const raw = this.mannualExpenseForm.getRawValue();
        const dateForApi = this.toApiDateString(raw.date) ?? raw.date;
        const enteredSum = this.toNumberOrNull(raw.sum);
        const currency = (raw.currency ?? 'ILS').toUpperCase();
        const isForeign = currency !== 'ILS' && enteredSum != null;

        // Foreign-currency mode: backend converts via BOI rate. Send the value
        // as `originalSum` + `originalCurrency`; omit `sum` so the server is
        // the single source of truth for the stored ILS amount.
        const payload: any = {
            ...raw,
            date: dateForApi,
            file: filePath,
            taxPercent: this.toNumberOrNull(raw.taxPercent),
            vatPercent: this.toNumberOrNull(raw.vatPercent),
            reductionPercent: this.toNumberOrNull(raw.reductionPercent),
            isEquipment: raw.isEquipment || false,
        };
        if (isForeign) {
            payload.originalSum = enteredSum;
            payload.originalCurrency = currency;
            // Send a placeholder sum so the DTO's @IsNumber doesn't reject —
            // the backend overwrites it with the converted value.
            payload.sum = enteredSum;
        } else {
            payload.sum = enteredSum;
        }
        // Form-only fields — don't leak to the backend.
        delete payload.currency;
        delete payload.applyPnlToSubcategory;
        // Normalise empty override to null (clears it back to the default).
        if (payload.pnlCategory === '' || payload.pnlCategory === '—') payload.pnlCategory = null;
        // VAT report period: only VAT-licensed businesses carry one, and the
        // field is edit-only. For exempt businesses or the add flow, force it
        // to null so we never stamp a period where it doesn't belong.
        if (!this.editMode || !this.isVatLicensed()) {
            payload.vatReportingDate = null;
        } else if (payload.vatReportingDate === '' || payload.vatReportingDate === '—'
            || payload.vatReportingDate === MannualExpenseComponent.CUSTOM_VAT_PERIOD) {
            payload.vatReportingDate = null;
        }
        return payload;
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
                this.selectedVatReportingType.set(business.vatReportingType ?? VATReportingType.NOT_REQUIRED);
                this.buildVatPeriodOptions();
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
        const selectedName = event != null ? String(event) : '';
        const list = this.mannualExpenseService.subCategoriesResource.value();
        const subCategory = list?.find((item: ISubCategory) => item.subCategoryName === selectedName);
        const reduction = subCategory?.reductionPercent != null ? Number(subCategory.reductionPercent) : 0;
        const vat = subCategory?.vatPercent != null ? Number(subCategory.vatPercent) : 0;
        const tax = subCategory?.taxPercent != null ? Number(subCategory.taxPercent) : 0;
        this.mannualExpenseForm.patchValue({
            reductionPercent: reduction,
            vatPercent: vat,
            taxPercent: tax,
        });
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
        
        // Trigger category selection to load subcategories (בלי לאפס תת־קטגוריה שכבר מולאה מהספק)
        if (supplier.category) {
            this.getSubCategory(supplier.category, true);
        }
    }

    onAddNewSupplier(name: string): void {
        // Set the name in the form
        this.mannualExpenseForm.patchValue({
            supplier: name
        });

        this.dialogRef = this.dialogService.open(AddSupplierComponent, {
            header: 'הוספת ספק חדש',
            width: 'min(1100px, 95vw)',
            style: { maxWidth: '95vw' },
            contentStyle: { minHeight: '400px', overflow: 'visible' },
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
        // Unsubscribe from isEquipment valueChanges
        if (this.isEquipmentSubscription) {
            this.isEquipmentSubscription.unsubscribe();
        }
        // Unsubscribe from date valueChanges
        if (this.dateSubscription) {
            this.dateSubscription.unsubscribe();
        }
    }

}
