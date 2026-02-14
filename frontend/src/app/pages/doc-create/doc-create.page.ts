import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ModalController } from '@ionic/angular';
import { ConfirmationService, MenuItem, MessageService } from 'primeng/api';
import { DialogService, DynamicDialogRef } from 'primeng/dynamicdialog';
import { catchError, EMPTY, finalize, firstValueFrom, from, of, switchMap, tap } from 'rxjs';
import { AddClientComponent } from 'src/app/components/add-client/add-client.component';
import { ButtonColor, ButtonSize } from 'src/app/components/button/button.enum';
import { DocSuccessDialogComponent } from 'src/app/components/create-doc-success-dialog/create-doc-success-dialog.component';
import { AuthService } from 'src/app/services/auth.service';
import { DocumentsService } from 'src/app/services/documents.service';
import { FilesService } from 'src/app/services/files.service';
import { GenericService } from 'src/app/services/generic.service';
import { ShaamService } from 'src/app/services/shaam.service';
import { BusinessStatus, BusinessType, fieldLineDocName, fieldLineDocValue, FieldsCreateDocName, FieldsCreateDocValue, FormTypes, inputsSize, paymentMethodOptions, vatOptions, VatType } from 'src/app/shared/enums';
import { Business, ICreateDocField, IDocIndexes, ISettingDoc, IShaamApprovalRequest, IShaamApprovalResponse, ITotals, IUserData } from 'src/app/shared/interface';
import { SelectClientComponent } from 'src/app/shared/select-client/select-client.component';
import { bankOptionsList, DocCreateFields, DocTypeDefaultStart, DocTypeDisplayName, DocumentSummary, DocumentTotals, DocumentTotalsLabels, DocumentType, PartialLineItem } from './doc-cerate.enum';
import { DocCreateBuilderService } from './doc-create-builder.service';
import { IClient, IDocCreateFieldData, SectionKeysEnum } from './doc-create.interface';
import { DocCreateService } from './doc-create.service';

// Constant for allocation number threshold
const ALLOCATION_NUMBER_THRESHOLD = 10000;

interface DocPayload {
  docData: any[];
  linesData: any[];
  paymentData: any[];
}

interface PaymentFieldConfig {
  key: string;   // FormControlName
  label: string; // Header label
  type: FormTypes;
  options?: any[];
}

interface OppositeDocPayload {
  docType: DocumentType;
  sourceDoc: any;
  businessNumber: string;
  businessName: string;
  isNegativeReceipt?: boolean; // Flag to indicate if this is a negative receipt
  shouldCloseParentDoc?: boolean; // Flag to indicate if parent document should be closed after creation
}


@Component({
  selector: 'app-doc-create',
  templateUrl: './doc-create.page.html',
  styleUrls: ['./doc-create.page.scss', '../../shared/shared-styling.scss'],
  standalone: false
})
export class DocCreatePage implements OnInit, OnDestroy {

  private gs = inject(GenericService);
  private documentsService = inject(DocumentsService);
  confirmationService = inject(ConfirmationService);
  private shaamService = inject(ShaamService);
  private messageService = inject(MessageService);


  // Business-related properties
  // businesses = this.gs.businesses;
  businessOptions = this.gs.businessSelectItems;
  BusinessStatus = BusinessStatus;
  businessStatus: BusinessStatus = BusinessStatus.SINGLE_BUSINESS;

  paymentsDetailsForm: FormGroup;
  myForm: FormGroup;
  userDetailsFields: ICreateDocField<FieldsCreateDocName, FieldsCreateDocValue>[] = [];
  paymentDetailsFields: ICreateDocField<FieldsCreateDocName | fieldLineDocName, FieldsCreateDocValue | fieldLineDocValue>[] = [];
  generalDetailsFields: ICreateDocField<FieldsCreateDocName, FieldsCreateDocValue>[] = [];
  serialNumberFile: ISettingDoc;
  DocumentType = DocumentType;
  DocCreateFields = DocCreateFields;
  isFileSelected = signal(false); // For HTML template
  generalFormIsValidSignal = signal(false);
  isMobile = computed(() => this.genericService.isMobile());
  userFormIsValidSignal = signal(false);
  // fileSelected: DocumentType; // For get type of file
  fileSelected = signal<DocumentType>(DocumentType.RECEIPT); // For get type of file
  HebrewNameFileSelected: string;
  isInitial: boolean = false;
  docIndexes: IDocIndexes = { docIndex: 0, generalIndex: 0, isInitial: false };
  createPDFIsLoading = signal(false);
  createPreviewPDFIsLoading = signal(false);
  clients = signal<IClient[]>([]);
  filteredClients = signal<IClient[]>([]);
  selectedClientData: IClient = null; // Store selected client data for expanded fields
  addPDFIsLoading: boolean = false;
  userData: IUserData
  amountBeforeVat: number = 0;
  overallTotals: ITotals;
  vatRate = 0.18; // 18% VAT
  isGeneralExpanded: boolean = false;
  isUserExpanded = signal<boolean>(false);
  isPaymentExpanded: boolean = false;
  morePaymentDetails: boolean = false;
  generalArray: IDocCreateFieldData[] = [];
  userArray: IDocCreateFieldData[] = [];
  paymentsArray: IDocCreateFieldData[] = [];
  paymentSectionName: SectionKeysEnum;

  showBusinessSelector = false;
  selectedBusinessNumber!: string;
  selectedBusinessName!: string;
  selectedBusinessAddress!: string;
  // selectedBusinessType!: string;
  selectedBusinessType = signal<BusinessType>(BusinessType.EXEMPT);
  selectedBusinessPhone!: string;
  selectedBusinessEmail!: string;

  // Parent document info (for opposite doc flow)
  parentDocType: DocumentType | null = null;
  parentDocNumber: string | null = null;
  docSubtitle: string | null = null;
  allocationNum: string | null = null;
  shouldCloseParentDoc: boolean = false; // Flag to indicate if parent document should be closed after creation
  parentBusinessNumber: string | null = null; // Business number of parent document

  // Allocation number related properties
  allocationNumber = signal<string | null>(null);
  showAllocationNumberInput = signal<boolean>(false);
  showShaamDialog = signal<boolean>(false);
  manualAllocationNumber: string = '';
  // selectedBankBeneficiary: string;
  // selectedBankName: string;
  // selectedBankBranch: string;
  // selectedBankAccount: string;
  // selectedBankIban: string;

  inputsSize = inputsSize;
  buttonSize = ButtonSize;
  buttonColor = ButtonColor;
  readonly formTypes = FormTypes;
  readonly FieldsCreateDocValue = FieldsCreateDocValue;
  paymentMethodOptions = paymentMethodOptions;

  showGeneralMoreFields = false;
  showUserMoreFields = false;
  value1 = 50;
  selectedUnit: string = '%';
  value: number = 0;
  totalNonVATAmount: number = 0;
  amountSubjectToVAT: number = 0;
  totalVatAmount: number = 0;
  totalAmount = signal(0);
  totalDiscount: number = 0;
  totalPayments = signal(0);
  isDocWithPayments = signal<boolean>(false);
  lineItemsDraft = signal<PartialLineItem[]>([]);
  initiallinesDocFormValues: FormGroup;
  showInitialIndexDialog = true;
  editingLineIndex = signal<number | null>(null); // Track which line is being edited

  activePaymentMethod: MenuItem = this.paymentMethodOptions[0]; // default selected

  paymentInputForm: FormGroup;  // Holds the active entry row
  paymentsDraft = signal([]);     // Stores all added payments
  initialIndexForm: FormGroup;
  private dialogRef: DynamicDialogRef | undefined;

  readonly vatOptions = vatOptions;

  documentTotals = signal<DocumentTotals>({
    sumBefDisBefVat: 0,
    disSum: 0,
    sumAftDisBefVat: 0,
    vatSum: 0,
    sumAftDisWithVat: 0,
    // sumWithoutVat: 0,
  });

  documentSummary = signal<DocumentSummary>({
    totalVatApplicable: 0,
    totalWithoutVat: 0,
    totalDiscount: 0,
    // totalAftDisBefVat: 0,
    totalVat: 0,
    // totalIncludingVat: 0,
  });
  log = console.log
  // Computed signals for filtered arrays based on document type
  isReceiptDocument = computed(() => this.fileSelected() === DocumentType.RECEIPT);
  isExemptBusiness = computed(() => this.selectedBusinessType() === BusinessType.EXEMPT);

  filteredLineDetailsColumns = computed(() =>
    this.docCreateBuilderService.getLineDetailsColumns(this.isReceiptDocument() || this.isExemptBusiness())
  );

  filteredLineItemsDisplayColumns = computed(() =>
    this.docCreateBuilderService.getLineItemsDisplayColumns(this.isReceiptDocument() || this.isExemptBusiness())
  );

  filteredSummaryItems = computed(() =>
    this.docCreateBuilderService.getSummaryItems(this.isReceiptDocument() || this.isExemptBusiness())
  );

  visibleDocumentTotals = computed(() => {
    const totals = this.documentTotals();
    return DocumentTotalsLabels
      .map((item) => ({
        field: item.field,
        label: item.label,
        value: totals[item.field] ?? 0,
      }))
      .filter((item) => item.value !== 0);
  });


  chargesPaymentsDifference = computed(() => {
    return this.totalAmount() - this.totalPayments();
  })

  // Check if allocation number is required
  requiresAllocationNumber = computed(() => {
    const docType = this.fileSelected();
    const isTaxInvoice = docType === DocumentType.TAX_INVOICE || docType === DocumentType.TAX_INVOICE_RECEIPT;

    if (!isTaxInvoice) {
      return false;
    }

    // Sum before VAT after discount
    const sumBeforeVat = this.documentTotals().sumAftDisBefVat;
    return sumBeforeVat > ALLOCATION_NUMBER_THRESHOLD;
  });

  createDocIsValid = computed(() => {
    return (
      this.generalFormIsValidSignal() &&
      this.userFormIsValidSignal() &&
      this.lineItemsDraft().length > 0 &&
      (!this.isDocWithPayments() || this.paymentsDraft().length > 0) &&
      (!this.isDocWithPayments() || this.chargesPaymentsDifference() === 0)
    );
  });


  constructor(private authService: AuthService, private fileService: FilesService, private genericService: GenericService, private modalController: ModalController, private router: Router, public docCreateService: DocCreateService, private formBuilder: FormBuilder, private docCreateBuilderService: DocCreateBuilderService, private dialogService: DialogService) {


    this.initialIndexForm = this.formBuilder.group({
      initialIndex: new FormControl(
        '', [Validators.required, Validators.pattern(/^\d+$/)]
      ),
    });

    this.createPaymentInputForm(this.activePaymentMethod.id as string);

  }


  async ngOnInit() {

    this.userData = this.authService.getUserDataFromLocalStorage();

    this.createForms();

    const allBusinesses = this.gs.businesses();  // Business[]
    console.log("full businesses: ", allBusinesses);

    const prefilled = this.prefillFromOppositeDoc(allBusinesses);

    if (!prefilled) {
      const selected = allBusinesses[0];
      this.generalDetailsForm.patchValue({
        businessNumber: selected.businessNumber
      });
      console.log("ngoninit selected is ", selected);
      this.setSelectedBusiness(selected);
      if (allBusinesses.length === 1) {
        this.showBusinessSelector = false;
      } else {
        this.showBusinessSelector = true;
      }
    }

    this.generalDetailsForm.statusChanges.subscribe(() => {
      this.generalFormIsValidSignal.set(this.generalDetailsForm.valid);
    });

    this.userDetailsForm.statusChanges.subscribe(() => {
      this.userFormIsValidSignal.set(this.userDetailsForm.valid);
    });
    // Load clients for autocomplete
    this.loadClients();
  }


  ngOnDestroy() {
    if (this.dialogRef) {
      this.dialogRef.close();
    }
  }

  loadClients(): void {
    this.docCreateService.getClients(this.selectedBusinessNumber)
      .pipe(
        catchError((err) => {
          console.error('Error loading clients:', err);
          return of([]);
        })
      )
      .subscribe((clients) => {
        console.log("🚀 ~ DocCreatePage ~ loadClients ~ clients:", clients)
        this.clients.set(clients);
      });
  }


  filterClients(event: any): void {
    const query = event.query?.toLowerCase() || '';

    if (!query) {
      this.filteredClients.set([...this.clients()]);
    } else {
      const filtered = this.clients().filter(client => client.name?.toLowerCase().includes(query));
      this.filteredClients.set(filtered);
    }
  }


  onClientSelect(event: any): void {
    // User selected an existing client
    this.fillClientDetails(event);
  }


  onAddNewClient(name: string): void {
    // Set the name in the form
    this.userDetailsForm.patchValue({
      [FieldsCreateDocValue.RECIPIENT_NAME]: name
    });

    this.dialogRef = this.dialogService.open(AddClientComponent, {
      header: 'יצירת לקוח חדש',
      width: '90%',
      rtl: true,
      closable: true,
      dismissableMask: true,
      modal: true,
      data: {
        businessNumber: this.selectedBusinessNumber,
        clients: this.clients()
      }
    });

    this.dialogRef.onClose.subscribe((res) => {
      if (res) {
        this.fillClientDetails(res);
      }
      this.loadClients();
    })
    // Optionally: Open a dialog or modal to add full client details
    // For now, just allow the user to continue filling the form
    console.log('Adding new client:', name);
  }


  get generalDetailsForm(): FormGroup {
    return this.myForm.get('GeneralDetails') as FormGroup;
  }


  get userDetailsForm(): FormGroup {
    return this.myForm.get('UserDetails') as FormGroup;
  }


  get lineDetailsForm(): FormGroup {
    return this.myForm.get('LineDetails') as FormGroup;
  }


  get lineDetailsColumns(): any[] {
    return this.filteredLineDetailsColumns();
  }


  onBusinessSelection(selectedBusinessNumber: string): void {

    const selected = this.genericService.businesses().find(
      b => b.businessNumber === selectedBusinessNumber
    );

    if (!selected) {
      console.error(`❌ Business number ${selectedBusinessNumber} not found`);
      return;
    }

    console.log("selected is ", selected);


    this.setSelectedBusiness(selected);
  }


  setSelectedBusiness(business: Business): void {
    this.selectedBusinessNumber = business.businessNumber;
    this.selectedBusinessName = business.businessName;
    this.selectedBusinessAddress = business.businessAddress;
    this.selectedBusinessType.set(business.businessType);
    this.selectedBusinessPhone = business.businessPhone;
    this.selectedBusinessEmail = business.businessEmail;
    // this.selectedBankBeneficiary = business.bankBeneficiary;
    // this.selectedBankName = business.bankName;
    // this.selectedBankBranch = business.bankBranch;
    // this.selectedBankAccount = business.bankAccount;
    // this.selectedBankIban = business.bankIban;
  }


  onSelectedDoc(event: any): void {

    this.isDocWithPayments.set(event === DocumentType.RECEIPT || event === DocumentType.TAX_INVOICE_RECEIPT);
    this.fileSelected.set(event);
    this.HebrewNameFileSelected = this.getHebrewNameDoc(this.fileSelected());
    this.handleDocIndexes(this.fileSelected());

    // For receipts, automatically set VAT to 'WITHOUT' and remove VAT control from form
    const defaultValues: any = {
      [FieldsCreateDocValue.UNIT_AMOUNT]: 1,
      // [FieldsCreateDocValue.DISCOUNT]: 0 
    };

    if (this.selectedBusinessType() === BusinessType.EXEMPT || this.fileSelected() === DocumentType.RECEIPT) {
      if (this.lineDetailsForm?.get(FieldsCreateDocValue.VAT_OPTIONS)) {
        this.lineDetailsForm.removeControl(FieldsCreateDocValue.VAT_OPTIONS);
      }
      defaultValues[FieldsCreateDocValue.VAT_OPTIONS] = 'WITHOUT';
    } else {
      // For other document types, ensure VAT_OPTIONS control exists
      if (!this.lineDetailsForm?.get(FieldsCreateDocValue.VAT_OPTIONS)) {
        this.lineDetailsForm?.addControl(
          FieldsCreateDocValue.VAT_OPTIONS,
          new FormControl('', [Validators.required])
        );
      }
      defaultValues[FieldsCreateDocValue.VAT_OPTIONS] = '';
    }

    this.lineDetailsForm?.reset(defaultValues);
    this.paymentInputForm?.reset();
    this.paymentInputForm?.get('paymentDate')?.setValue(this.generalDetailsForm?.get('docDate')?.value);
    this.paymentsDraft.set([]);
    this.lineItemsDraft.set([]);
  }


  onSelectionChange(field: string, event: any): void {
    switch (field) {
      case 'docType':
        if (!event) {
          return
        }
        this.onSelectedDoc(event);
        break;
      case 'businessNumber':
        this.generalDetailsForm.get('docType')?.setValue(""); //To enable switching between businesses and selecting the same document
        this.isFileSelected.set(false);
        this.userDetailsForm.reset();
        this.onBusinessSelection(event);
        // this.clients.set([]);
        this.loadClients();
        break;
      default:
        break;
    }
  }


  confirmCreateDoc(): void {
    // Check if allocation number is required
    const requiresAlloc = this.requiresAllocationNumber();
    const hasAllocNumber = this.allocationNumber();

    console.log("🔍 confirmCreateDoc - requiresAlloc:", requiresAlloc);
    console.log("🔍 confirmCreateDoc - hasAllocNumber:", hasAllocNumber);
    console.log("🔍 confirmCreateDoc - docType:", this.fileSelected());
    console.log("🔍 confirmCreateDoc - sumBeforeVat:", this.documentTotals().sumAftDisBefVat);

    if (requiresAlloc && !hasAllocNumber) {
      console.log("✅ Showing allocation number dialog");
      this.showAllocationNumberDialog();
      return;
    }

    this.confirmationService.confirm({
      message: 'האם אתה בטוח שברצונך להפיק את המסמך?\nהמסמך שיופק הוא מסמך רשמי המחייב על-פי חוק, ולא ניתן לעריכה לאחר ההפקה.',
      header: 'אישור הפקת מסמך',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'הפק',
      rejectLabel: 'ביטול',
      acceptVisible: true,
      rejectVisible: true,
      accept: () => {
        this.createDoc();
      },
      reject: () => {
        this.createPDFIsLoading.set(false);
      }
    });
  }


  createDoc(): void {
    this.createPDFIsLoading.set(true);

    const payload = this.buildDocPayload();

    this.docCreateService.createDoc(payload).pipe(
      // Backend now handles: DB transaction + PDF generation + Firebase upload + save paths
      tap((response) => {
        console.log('✅ Document created successfully:', response);

        // If this is a closing document, update the parent document status to CLOSE
        if (this.shouldCloseParentDoc && this.parentDocType && this.parentDocNumber && this.parentBusinessNumber) {
          console.log('Updating parent document status to CLOSE:', {
            businessNumber: this.parentBusinessNumber,
            docNumber: this.parentDocNumber,
            docType: this.parentDocType
          });

          this.documentsService.updateDocStatus(
            this.parentBusinessNumber,
            this.parentDocNumber,
            this.parentDocType,
            'CLOSE'
          ).pipe(
            catchError(err => {
              console.error('Failed to update parent document status:', err);
              // Don't block the success flow if status update fails
              return EMPTY;
            })
          ).subscribe(() => {
            console.log('✅ Parent document status updated to CLOSE');
          });
        }

        // Show success dialog
        this.dialogRef = this.dialogService.open(DocSuccessDialogComponent, {
          header: '',
          width: '400px',
          rtl: true,
          data: {
            docNumber: response.docNumber,
            file: response.file,
            copyFile: response.copyFile,
            docType: this.getHebrewNameDoc(response.docType)
          }
        });

        this.resetDocFormsAndDrafts();
      }),

      // Handle errors
      catchError((err) => {
        console.error('❌ Error creating document:', err);
        // Backend automatically rolls back the transaction if anything fails
        return EMPTY; // swallow to allow finalize to run
      }),

      // Turn off loader no matter what
      finalize(() => {
        this.createPDFIsLoading.set(false);
      })
    ).subscribe();
  }

  private resetDocFormsAndDrafts(): void {
    this.generalDetailsForm.reset({
      [DocCreateFields.DOC_VAT_RATE]: 18,
      [FieldsCreateDocValue.DOC_DATE]: new Date()
    });

    this.userDetailsForm.reset();

    this.lineDetailsForm.reset({
      [FieldsCreateDocValue.UNIT_AMOUNT]: 1,
      // [FieldsCreateDocValue.DISCOUNT]: 0
    });

    this.initialIndexForm.reset();

    // Use the cached date so we don't read from a reset control
    this.paymentInputForm.reset({
      [fieldLineDocValue.PAYMENT_DATE]: this.generalDetailsForm?.get('docDate')?.value
    });

    this.lineItemsDraft.set([]);
    this.paymentsDraft.set([]);

    this.isFileSelected.set(false);
    // this.HebrewNameFileSelected = null;

    // Reset parent document info
    this.parentDocType = null;
    this.parentDocNumber = null;
    this.docSubtitle = null;
    this.allocationNum = null;
    this.shouldCloseParentDoc = false;
    this.parentBusinessNumber = null;

    // Reset allocation number
    this.allocationNumber.set(null);
    this.manualAllocationNumber = '';
  }


  previewDoc(): void {
    // Check if allocation number is required
    if (this.requiresAllocationNumber() && !this.allocationNumber()) {
      this.showAllocationNumberDialog();
      return;
    }

    console.log(this.myForm);

    this.createPreviewPDFIsLoading.set(true);
    const data = this.buildDocPayload();

    this.docCreateService.previewDoc(data)
      .pipe(
        finalize(() => {
          this.createPreviewPDFIsLoading.set(false);
        }),
        catchError((err) => {
          console.error("Error in createPDF (Preview):", err);
          // Log the error message if it's a string
          if (err.message) {
            console.error("Error details:", err.message);
            alert("שגיאה ביצירת תצוגה מקדימה:\n" + err.message);
          } else {
            console.error("Full error object:", err);
            alert("שגיאה ביצירת תצוגה מקדימה. בדוק את הקונסול לפרטים.");
          }
          return EMPTY;
        })
      )
      .subscribe((res) => {
        console.log("PDF creation result (Preview):", res);
        this.fileService.previewFile3(res);
        //this.fileService.previewFile1(res);
      });
  }


  buildDocPayload(): DocPayload {
    if (!this.createDocIsValid()) {
      throw new Error('Cannot collect document data: forms are invalid or incomplete.');
    }

    let docPayload: DocPayload;

    const businessType = this.selectedBusinessType();
    const docType = this.generalDetailsForm.get(FieldsCreateDocValue.DOC_TYPE)?.value;
    const docNumber = this.docIndexes.docIndex;
    const generalDocIndex = this.docIndexes.generalIndex;
    const issuerBusinessNumber = this.selectedBusinessNumber;
    const docDescription = this.generalDetailsForm.get(FieldsCreateDocValue.DOC_DESCRIPTION)?.value;
    const docDate = this.generalDetailsForm.get(FieldsCreateDocValue.DOC_DATE)?.value ?? null;
    // Use allocationNumber from signal if available, otherwise fall back to allocationNum
    const allocationNum = this.allocationNumber() ?? this.allocationNum ?? null;
    const docSubtitle = this.docSubtitle ?? null;
    const parentDocType = this.parentDocType ?? null;
    const parentDocNumber = this.parentDocNumber ?? null;
    const docVatRate = this.generalDetailsForm.get(FieldsCreateDocValue.DOC_VAT_RATE)?.value;
    const currency = this.generalDetailsForm.get(FieldsCreateDocValue.CURRENCY)?.value;
    const recipientName = this.userDetailsForm.get(FieldsCreateDocValue.RECIPIENT_NAME)?.value;
    const recipientId = this.userDetailsForm.get(FieldsCreateDocValue.RECIPIENT_ID)?.value;
    const recipientPhone = this.userDetailsForm.get(FieldsCreateDocValue.RECIPIENT_PHONE)?.value;
    const recipientEmail = this.userDetailsForm.get(FieldsCreateDocValue.RECIPIENT_EMAIL)?.value;
    const recipientAddress = this.userDetailsForm.get(FieldsCreateDocValue.RECIPIENT_ADDRESS)?.value;

    // Build docData object, only including parent fields if they exist
    const docData: any = {
      businessType,
      docType,
      docNumber,
      generalDocIndex,
      issuerBusinessNumber,
      docDescription,
      docDate,
      allocationNum,
      docSubtitle,
      parentDocType,
      parentDocNumber,
      docVatRate,
      currency,
      recipientName,
      recipientId,
      recipientPhone,
      recipientEmail,
      recipientAddress,
      totalVatApplicable: Number(this.documentSummary().totalVatApplicable.toFixed(2)),
      totalWithoutVat: Number(this.documentSummary().totalWithoutVat.toFixed(2)),
      totalDiscount: Number(this.documentSummary().totalDiscount.toFixed(2)),
      totalVat: Number(this.documentSummary().totalVat.toFixed(2)),
    };

    docPayload = {
      docData,
      linesData: this.lineItemsDraft(),
      paymentData: this.paymentsDraft(),
    };

    console.log("🚀 ~ DocCreatePage ~ buildDocPayload ~ docPayload", docPayload);

    return docPayload;

  }


  addLineDetails(): void {
    const formData = this.lineDetailsForm.value;
    const editingIndex = this.editingLineIndex();

    if (editingIndex !== null) {
      // Update existing line
      console.log("Updating line at index:", editingIndex);
      this.updateLine(editingIndex, formData);
      // For updates, we need to recalculate totals
      this.updateDocumentTotalsFromLines();
      this.calcTotals();
    } else {
      // Add new line
      console.log("Adding new line with form value:", formData);
      this.addNewLine(formData);
    }

    this.lineDetailsForm.reset({
      [FieldsCreateDocValue.UNIT_AMOUNT]: 1,
    });
    this.editingLineIndex.set(null); // Reset editing state
    const docDate = this.generalDetailsForm.get(FieldsCreateDocValue.DOC_DATE)?.value ?? null;
    this.createPaymentInputForm(this.activePaymentMethod.id as string, docDate);
    this.setSumInPaymentForm();
  }

  /**
   * Ensures a value is a valid number, returning defaultValue if not
   */
  private ensureNumber(value: any, defaultValue: number = 0): number {
    if (value == null || value === '') return defaultValue;
    const num = Number(value);
    return isNaN(num) ? defaultValue : num;
  }

  private addNewLine(formData: any): void {
    const lineIndex = this.lineItemsDraft().length;
    const transType = "3";

    // For receipts or EXEMPT businesses, vatOptions won't exist in the form, so set it to 'WITHOUT'
    const isExempt = this.selectedBusinessType() === BusinessType.EXEMPT;
    const isReceipt = this.fileSelected() === DocumentType.RECEIPT;
    const isTaxInvoiceReceipt = this.fileSelected() === DocumentType.TAX_INVOICE_RECEIPT;

    // Handle vatOptions - it might be a number (index) or string (value)
    let vatOpts: VatType = 'WITHOUT';
    // For TAX_INVOICE_RECEIPT, we also need to handle VAT options (not just RECEIPT)
    if (!isExempt && !isReceipt) {
      const vatOptionsValue = formData.vatOptions;
      console.log("🚀 ~ addNewLine ~ vatOptionsValue:", vatOptionsValue, "type:", typeof vatOptionsValue);

      if (vatOptionsValue !== undefined && vatOptionsValue !== null) {
        if (typeof vatOptionsValue === 'number') {
          // If it's a number, it's probably an index - convert to value
          const vatOptionsArray = this.vatOptions;
          if (vatOptionsArray && vatOptionsArray[vatOptionsValue]) {
            vatOpts = vatOptionsArray[vatOptionsValue].value;
          } else {
            vatOpts = 'WITHOUT';
          }
        } else if (typeof vatOptionsValue === 'string') {
          vatOpts = vatOptionsValue as VatType;
        } else {
          vatOpts = 'WITHOUT';
        }
      }
    } else if (isTaxInvoiceReceipt && !isExempt) {
      // For TAX_INVOICE_RECEIPT, handle VAT options like regular tax invoices
      const vatOptionsValue = formData.vatOptions;

      if (vatOptionsValue !== undefined && vatOptionsValue !== null) {
        if (typeof vatOptionsValue === 'number') {
          const vatOptionsArray = this.vatOptions;
          if (vatOptionsArray && vatOptionsArray[vatOptionsValue]) {
            vatOpts = vatOptionsArray[vatOptionsValue].value;
          } else {
            vatOpts = 'WITHOUT';
          }
        } else if (typeof vatOptionsValue === 'string') {
          vatOpts = vatOptionsValue as VatType;
        } else {
          vatOpts = 'WITHOUT';
        }
      }
    }

    console.log("🚀 ~ addNewLine ~ final vatOpts:", vatOpts);

    const newLine: PartialLineItem = {
      // issuerBusinessNumber: this.selectedBusinessNumber,
      // generalDocIndex: String(this.docIndexes.generalIndex),
      lineNumber: lineIndex + 1,
      description: formData.description,
      unitQuantity: formData.unitAmount,
      sum: formData.sum,
      discount: this.ensureNumber(formData.discount, 0),
      vatOpts: vatOpts,
      vatRate: this.generalDetailsForm.get(FieldsCreateDocValue.DOC_VAT_RATE)?.value,
      docType: this.generalDetailsForm.get(FieldsCreateDocValue.DOC_TYPE)?.value,
      transType: transType,
    };

    this.lineItemsDraft.update(items => [...items, newLine]);
    console.log("🚀 ~ DocCreatePage ~ addNewLine ~ this.lineItemsDraft", this.lineItemsDraft());

    this.calculateVatFieldsForLine(lineIndex);
  }

  private updateLine(index: number, formData: any): void {
    const transType = "3";
    const isExempt = this.selectedBusinessType() === BusinessType.EXEMPT;
    const isReceipt = this.fileSelected() === DocumentType.RECEIPT;
    const isTaxInvoiceReceipt = this.fileSelected() === DocumentType.TAX_INVOICE_RECEIPT;

    // Handle vatOptions - it might be a number (index) or string (value)
    let vatOpts: VatType = 'WITHOUT';
    if (!isExempt && !isReceipt) {
      const vatOptionsValue = formData.vatOptions;
      if (vatOptionsValue !== undefined && vatOptionsValue !== null) {
        if (typeof vatOptionsValue === 'number') {
          // If it's a number, it's probably an index - convert to value
          const vatOptionsArray = this.vatOptions;
          if (vatOptionsArray && vatOptionsArray[vatOptionsValue]) {
            vatOpts = vatOptionsArray[vatOptionsValue].value;
          } else {
            vatOpts = 'WITHOUT';
          }
        } else if (typeof vatOptionsValue === 'string') {
          vatOpts = vatOptionsValue as VatType;
        } else {
          vatOpts = 'WITHOUT';
        }
      }
    } else if (isTaxInvoiceReceipt && !isExempt) {
      // For TAX_INVOICE_RECEIPT, handle VAT options like regular tax invoices
      const vatOptionsValue = formData.vatOptions;
      if (vatOptionsValue !== undefined && vatOptionsValue !== null) {
        if (typeof vatOptionsValue === 'number') {
          const vatOptionsArray = this.vatOptions;
          if (vatOptionsArray && vatOptionsArray[vatOptionsValue]) {
            vatOpts = vatOptionsArray[vatOptionsValue].value;
          } else {
            vatOpts = 'WITHOUT';
          }
        } else if (typeof vatOptionsValue === 'string') {
          vatOpts = vatOptionsValue as VatType;
        } else {
          vatOpts = 'WITHOUT';
        }
      }
    }

    const updatedLine: PartialLineItem = {
      ...this.lineItemsDraft()[index], // Keep existing properties like calculated VAT fields
      description: formData.description,
      unitQuantity: formData.unitAmount,
      sum: formData.sum,
      discount: this.ensureNumber(formData.discount, 0),
      vatOpts: vatOpts,
      vatRate: this.generalDetailsForm.get(FieldsCreateDocValue.DOC_VAT_RATE)?.value,
    };

    this.lineItemsDraft.update(items =>
      items.map((item, i) => i === index ? updatedLine : item)
    );

    this.calculateVatFieldsForLine(index);
    console.log("🚀 ~ DocCreatePage ~ updateLine ~ updated line", this.lineItemsDraft()[index]);
  }


  calculateVatFieldsForLine(lineIndex: number): void {
    console.log("🚀 ~ DocCreatePage ~ calculateVatFieldsForLine ~ lineIndex", lineIndex);

    const lines = this.lineItemsDraft();
    if (lineIndex >= lines.length) {
      console.error("⚠️ calculateVatFieldsForLine: lineIndex out of bounds", lineIndex, "lines.length:", lines.length);
      return;
    }

    const line = lines[lineIndex]; //Get the line by reference
    console.log("🚀 ~ calculateVatFieldsForLine ~ line before calculation:", line);
    const quantity = Number(line.unitQuantity ?? 1);
    const unitSum = Number(line.sum ?? 0);
    const discount = Number(line.discount ?? 0);

    // Convert vatOpts to string if it's a number (index)
    let vatOption: VatType = 'WITHOUT';
    if (typeof line.vatOpts === 'number') {
      // If it's a number, it's probably an index - convert to value
      const vatOptionsArray = this.vatOptions;
      if (vatOptionsArray && vatOptionsArray[line.vatOpts]) {
        vatOption = vatOptionsArray[line.vatOpts].value;
      } else {
        vatOption = 'WITHOUT';
      }
    } else if (typeof line.vatOpts === 'string') {
      vatOption = line.vatOpts as VatType;
    }

    console.log("🚀 ~ calculateVatFieldsForLine ~ vatOpts:", line.vatOpts, "converted to vatOption:", vatOption);

    const vatRate = Number(line.vatRate ?? 0);

    const lineGross = unitSum * quantity;
    let sumBefVatPerUnit = 0;
    let disBefVatPerLine = 0;
    let sumAftDisBefVatPerLine = 0;
    let vatPerLine = 0;
    let sumAftDisWithVat = 0;

    switch (vatOption) {
      case 'INCLUDE': {
        sumBefVatPerUnit = unitSum / (1 + vatRate / 100);
        disBefVatPerLine = discount / (1 + vatRate / 100);
        sumAftDisBefVatPerLine = (lineGross - discount) / (1 + vatRate / 100);
        vatPerLine = (lineGross - discount) - sumAftDisBefVatPerLine;
        sumAftDisWithVat = lineGross - discount;
        break;
      }

      case 'EXCLUDE': {
        sumBefVatPerUnit = unitSum;
        disBefVatPerLine = discount;
        sumAftDisBefVatPerLine = lineGross - discount;
        vatPerLine = sumAftDisBefVatPerLine * (vatRate / 100);
        sumAftDisWithVat = sumAftDisBefVatPerLine + vatPerLine;
        break;
      }

      case 'WITHOUT': {
        sumBefVatPerUnit = unitSum;
        disBefVatPerLine = discount;
        sumAftDisBefVatPerLine = lineGross - discount;
        vatPerLine = 0;
        sumAftDisWithVat = sumAftDisBefVatPerLine;
        break;
      }

      default:
        throw new Error(`Unhandled VAT option: ${vatOption}`);
    }

    // Update the line with calculated fields
    const updatedLine = {
      ...line,
      vatOpts: vatOption, // Update vatOpts to the converted string value
      sumBefVatPerUnit: Number(sumBefVatPerUnit.toFixed(2)),
      disBefVatPerLine: Number(disBefVatPerLine.toFixed(2)),
      sumAftDisBefVatPerLine: Number(sumAftDisBefVatPerLine.toFixed(2)),
      vatPerLine: Number(vatPerLine.toFixed(2)),
      sumAftDisWithVat: Number(sumAftDisWithVat.toFixed(2)),
    };

    // Update the signal with the new line
    this.lineItemsDraft.update(items =>
      items.map((item, i) => i === lineIndex ? updatedLine : item)
    );
    console.log("🚀 ~ DocCreatePage ~ calculateVatFieldsForLine ~ line after calaulate", updatedLine);

    // Update totals after calculating VAT fields
    this.updateDocumentTotalsFromLines();
    this.calcTotals();
  }


  updateDocumentTotalsFromLines(): void {

    this.documentSummary.set({
      totalVatApplicable: 0,
      totalWithoutVat: 0,
      totalDiscount: 0,
      totalVat: 0,
    });

    const lines = this.lineItemsDraft();

    for (const line of lines) {
      if (line.vatOpts === 'WITHOUT') {
        this.documentSummary().totalWithoutVat += Number((line.sumBefVatPerUnit ?? 0) * (line.unitQuantity ?? 1));
      }
      else {
        this.documentSummary().totalVatApplicable += Number((line.sumBefVatPerUnit ?? 0) * (line.unitQuantity ?? 1));
        this.documentSummary().totalVat += Number(line.vatPerLine ?? 0);
      }
      this.documentSummary().totalDiscount += Number(line.discount ?? 0);
    }

    console.log("🚀 ~ updateDocumentTotalsFromLines ~ this.documentSummary():", this.documentSummary());

    if (this.isExemptBusiness()) {
      this.documentTotals().sumBefDisBefVat = this.documentSummary().totalWithoutVat;
      this.documentTotals().disSum = this.documentSummary().totalDiscount;
      this.documentTotals().sumAftDisBefVat = this.documentSummary().totalWithoutVat - this.documentSummary().totalDiscount;
      this.documentTotals().vatSum = 0;
      this.documentTotals().sumAftDisWithVat = this.documentTotals().sumAftDisBefVat;
    }
    else {
      this.documentTotals().sumBefDisBefVat = this.documentSummary().totalVatApplicable + this.documentSummary().totalWithoutVat;
      this.documentTotals().disSum = this.documentSummary().totalDiscount;
      this.documentTotals().sumAftDisBefVat = this.documentTotals().sumBefDisBefVat - this.documentTotals().disSum;
      this.documentTotals().vatSum = this.documentSummary().totalVat;
      this.documentTotals().sumAftDisWithVat = this.documentTotals().sumAftDisBefVat + this.documentTotals().vatSum;
    }

  }


  calcTotals(): void {

    this.amountSubjectToVAT = 0;
    this.totalNonVATAmount = 0;
    this.totalDiscount = 0;
    this.totalVatAmount = 0;
    this.totalAmount.set(0);
    for (const line of this.lineItemsDraft()) {
      if (!line.sumBefVatPerUnit && line.sumBefVatPerUnit !== 0) {
        console.warn("⚠️ calcTotals: Line missing calculated fields, skipping:", line);
        continue;
      }

      if (line.vatOpts === 'WITHOUT') {
        this.totalNonVATAmount += Number((line.sumBefVatPerUnit ?? 0) * (line.unitQuantity ?? 1));
      }
      else {
        this.amountSubjectToVAT += Number((line.sumBefVatPerUnit ?? 0) * (line.unitQuantity ?? 1));
      }
      this.totalDiscount += Number(line.disBefVatPerLine ?? 0);
      this.totalVatAmount += Number(line.vatPerLine ?? 0);
    }
    // this.totalVatAmount = this.amountSubjectToVAT * (this.vatRate / 100);

    this.totalAmount.set(this.amountSubjectToVAT + this.totalVatAmount + this.totalNonVATAmount - this.totalDiscount);
  }


  createPaymentInputForm(paymentMethod: string, docDate: Date | null = null): void {

    const sum = this.documentTotals().sumAftDisWithVat;

    // Build the section form using the builder and extract the inner section group as the working form
    const built = this.docCreateBuilderService.buildDocCreateForm([paymentMethod as SectionKeysEnum]);
    const sectionForm = built.get(paymentMethod) as FormGroup;
    this.paymentInputForm = sectionForm ?? built; // fallback just in case

    // Expose fields for rendering
    this.paymentsArray = this.docCreateBuilderService.getBaseFieldsBySection(paymentMethod as SectionKeysEnum);

    // Apply default values based on current doc context
    if (this.paymentInputForm.get('paymentDate')) {
      this.paymentInputForm.get('paymentDate')?.setValue(docDate);
    }
    if (this.paymentInputForm.get('sum')) {
      this.paymentInputForm.get('sum')?.setValue(sum);
    }
  }

  setSumInPaymentForm(): void {
    if (this.chargesPaymentsDifference() > 0) {
      this.paymentInputForm?.get('paymentSum')?.setValue(this.chargesPaymentsDifference());
    }
  }


  onPaymentMethodChange(paymentMethod: MenuItem): void {
    this.activePaymentMethod = paymentMethod;
    const docDate = this.generalDetailsForm.get(FieldsCreateDocValue.DOC_DATE)?.value ?? null;
    this.createPaymentInputForm(this.activePaymentMethod.id as string, docDate);
    this.setSumInPaymentForm();
  }

  getPaymentFields(section: string) {
    return this.docCreateBuilderService.getBaseFieldsBySection(section as SectionKeysEnum);
  }


  addPayment(): void {
    console.log("🚀 ~ DocCreatePage ~ addPayment ~ this.paymentInputForm", this.paymentInputForm);

    const paymentFormValue = this.paymentInputForm.value;
    // const paymentdata = 
    const paymentLineIndex = this.paymentsDraft.length;

    const selectedBank = bankOptionsList.find(bank => bank.value === (paymentFormValue.bankNumber ?? paymentFormValue.bankName));
    const hebrewBankName = selectedBank ? selectedBank.name : '';
    const bankNumber = selectedBank?.value ?? '';

    // Build the full payment entry with extra fields
    const paymentEntry = {
      ...paymentFormValue,
      paymentSum: paymentFormValue.paymentSum
        ? Number(paymentFormValue.paymentSum.toString().replace(/^0+(?!\.)/, ''))
        : null,
      // issuerBusinessNumber: this.selectedBusinessNumber,
      // generalDocIndex: String(this.docIndexes.generalIndex),
      paymentLineNumber: paymentLineIndex + 1,
      paymentMethod: this.activePaymentMethod.id, // Track which payment method was selected
      hebrewBankName,  // Save the Hebrew name for later use (display / backend)
      bankNumber
    };

    // this.paymentsDraft.push(paymentEntry);
    this.paymentsDraft.update(items => [...items, paymentEntry]);

    // Reset the form for the next payment entry
    const docDate = this.generalDetailsForm.get(FieldsCreateDocValue.DOC_DATE)?.value ?? null;
    this.paymentInputForm.reset();
    this.createPaymentInputForm(this.activePaymentMethod.id as string, docDate);
    this.totalPayments.set(this.paymentsDraft().reduce((total, payment) => total + Number(payment.paymentSum), 0));
    console.log("🚀 ~ DocCreatePage ~ addPayment ~ this.totalPayments:", this.totalPayments());
    console.log("🚀 ~ DocCreatePage ~ addPayment ~ this.totalAmount:", this.totalAmount());
    this.setSumInPaymentForm();
  }


  editLine(index: number): void {
    const line = this.lineItemsDraft()[index];
    console.log("Editing line at index:", index, line);

    // Populate the form with the line data
    this.lineDetailsForm.patchValue({
      [FieldsCreateDocValue.LINE_DESCRIPTION]: line.description,
      [FieldsCreateDocValue.UNIT_AMOUNT]: line.unitQuantity,
      [FieldsCreateDocValue.SUM]: line.sum,
      [FieldsCreateDocValue.DISCOUNT]: line.discount || 0,
      ...(this.fileSelected() !== DocumentType.RECEIPT && {
        [FieldsCreateDocValue.VAT_OPTIONS]: line.vatOpts
      })
    });

    // Set the editing index
    this.editingLineIndex.set(index);

    // Optional: scroll to the form for better UX
    setTimeout(() => {
      const formElement = document.querySelector('.line-details-form');
      if (formElement) {
        formElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  }

  cancelEdit(): void {
    this.editingLineIndex.set(null);
    this.lineDetailsForm.reset({
      [FieldsCreateDocValue.UNIT_AMOUNT]: 1,
    });
  }

  deleteLine(index: number): void {
    // If we're deleting the line being edited, reset editing state
    if (this.editingLineIndex() === index) {
      this.cancelEdit();
    } else if (this.editingLineIndex() !== null && this.editingLineIndex()! > index) {
      // Adjust the editing index if we're deleting a line before it
      this.editingLineIndex.set(this.editingLineIndex()! - 1);
    }

    this.lineItemsDraft.update(items => items.filter((_, i) => i !== index));
    this.updateDocumentTotalsFromLines();
    this.calcTotals();
    this.setSumInPaymentForm();
  }

  deletePayment(index: number): void {
    this.paymentsDraft.update(items => items.filter((_, i) => i !== index));
    this.totalPayments.set(this.paymentsDraft().reduce((total, payment) => total + Number(payment.paymentSum), 0));
    this.setSumInPaymentForm();
  }


  /**
   * Prefill the form when navigating from an opposite-doc action (e.g., from incomes list)
   */
  private prefillFromOppositeDoc(allBusinesses: Business[]): boolean {

    const nav = this.router.getCurrentNavigation();
    const payload = (nav?.extras.state as any)?.oppositeDocPayload ?? (history.state as any)?.oppositeDocPayload as OppositeDocPayload | undefined;

    if (!payload) {
      return false;
    }

    const targetDocType = payload.docType ?? DocumentType.CREDIT_INVOICE;

    // Set business context
    const selectedBusiness = allBusinesses.find(b => b.businessNumber === payload.businessNumber)
      ?? allBusinesses[0];

    if (selectedBusiness) {
      this.setSelectedBusiness(selectedBusiness);
      this.generalDetailsForm.patchValue({ businessNumber: selectedBusiness.businessNumber });
      this.showBusinessSelector = false;
    }

    // Reset docIndexes to ensure we don't use stale values from parent document
    // The handleDocIndexes call inside onSelectedDoc will fetch fresh indexes from backend
    this.docIndexes = { docIndex: 0, generalIndex: 0, isInitial: false };

    // Set doc type and trigger existing doc-type setup
    this.generalDetailsForm.patchValue({ docType: targetDocType });
    this.onSelectedDoc(targetDocType);

    // Dates
    const docDate = payload.sourceDoc?.docDate ? new Date(payload.sourceDoc.docDate) : new Date();
    this.generalDetailsForm.get(FieldsCreateDocValue.DOC_DATE)?.setValue(docDate);

    // Set parent document info and subtitle
    // sourceDoc.docType should be the enum, but fallback to docTypeName (Hebrew) if needed
    console.log("🔥 prefillFromOppositeDoc - payload.sourceDoc:", payload.sourceDoc);
    console.log("🔥 prefillFromOppositeDoc - payload.sourceDoc.docType:", payload.sourceDoc?.docType);
    console.log("🔥 prefillFromOppositeDoc - payload.sourceDoc.docTypeName:", payload.sourceDoc?.docTypeName);
    console.log("🔥 prefillFromOppositeDoc - payload.sourceDoc.docNumber:", payload.sourceDoc?.docNumber);

    let sourceDocType: DocumentType | null = null;

    // First, try to use the docType from sourceDoc (should be enum)
    if (payload.sourceDoc?.docType) {
      const docTypeValue = payload.sourceDoc.docType;
      console.log("🔥 prefillFromOppositeDoc - checking docType:", docTypeValue);
      console.log("🔥 prefillFromOppositeDoc - DocumentType values:", Object.values(DocumentType));

      if (Object.values(DocumentType).includes(docTypeValue as DocumentType)) {
        sourceDocType = docTypeValue as DocumentType;
        console.log("🔥 prefillFromOppositeDoc - found valid enum:", sourceDocType);
      } else {
        console.log("🔥 prefillFromOppositeDoc - docType is not a valid enum, trying Hebrew name");
      }
    }

    if (!sourceDocType && payload.sourceDoc?.docTypeName) {
      // If not found, try to find enum from Hebrew name
      console.log("🔥 prefillFromOppositeDoc - searching for enum from Hebrew name:", payload.sourceDoc.docTypeName);
      const found = Object.entries(DocTypeDisplayName).find(
        ([_, name]) => name === payload.sourceDoc.docTypeName
      );
      if (found) {
        sourceDocType = found[0] as DocumentType;
        console.log("🔥 prefillFromOppositeDoc - found enum from Hebrew name:", sourceDocType);
      } else {
        console.log("🔥 prefillFromOppositeDoc - could not find enum from Hebrew name");
      }
    }

    // Extract docNumber - try multiple possible field names
    const sourceDocNumber = payload.sourceDoc?.docNumber ??
      payload.sourceDoc?.doc_number ??
      (payload.sourceDoc as any)?.docNumber ??
      '';
    console.log("🔥 prefillFromOppositeDoc - sourceDocNumber:", sourceDocNumber);
    console.log("🔥 prefillFromOppositeDoc - payload.sourceDoc keys:", Object.keys(payload.sourceDoc || {}));

    const sourceDocHebrewName = sourceDocType ?
      this.getHebrewNameDoc(sourceDocType) :
      (payload.sourceDoc?.docTypeName || '');
    const targetDocHebrewName = this.getHebrewNameDoc(targetDocType);

    console.log("🔥 prefillFromOppositeDoc - sourceDocHebrewName:", sourceDocHebrewName);
    console.log("🔥 prefillFromOppositeDoc - targetDocHebrewName:", targetDocHebrewName);

    // Check if this is a negative receipt (created from "הפק קבלה במינוס" button)
    const isNegativeReceipt = payload.isNegativeReceipt === true;

    // Store shouldCloseParentDoc flag and parent business number
    this.shouldCloseParentDoc = payload.shouldCloseParentDoc ?? false;
    this.parentBusinessNumber = payload.businessNumber ?? null;

    // Store parent document fields in class variables (will be saved in buildDocPayload)
    // Set subtitle if we have source doc info (even if enum is not found, use Hebrew name)
    if (sourceDocNumber && sourceDocHebrewName) {
      // Only set parentDocType and parentDocNumber if we have a valid enum value
      if (sourceDocType) {
        this.parentDocType = sourceDocType;
        this.parentDocNumber = String(sourceDocNumber);
      } else {
        // If no enum found, set to null (but still create subtitle)
        this.parentDocType = null;
        this.parentDocNumber = null;
      }

      // Set subtitle: "קבלה עבור חשבון עסקה מספר 12345"
      // Special case: "קבלת זיכוי עבור קבלה מספר ..." for negative receipt (קבלה במינוס)
      if (isNegativeReceipt && sourceDocType === DocumentType.RECEIPT) {
        this.docSubtitle = `קבלת זיכוי עבור קבלה מספר ${sourceDocNumber}`;
      } else {
        // Format: [target doc name] עבור [source doc name] מספר [source doc number]
        this.docSubtitle = `${targetDocHebrewName} עבור ${sourceDocHebrewName} מספר ${sourceDocNumber}`;
      }
      console.log("🔥 prefillFromOppositeDoc - SET parentDocType:", this.parentDocType);
      console.log("🔥 prefillFromOppositeDoc - SET parentDocNumber:", this.parentDocNumber);
      console.log("🔥 prefillFromOppositeDoc - SET docSubtitle:", this.docSubtitle);
    } else {
      // Reset if invalid
      this.parentDocType = null;
      this.parentDocNumber = null;
      this.docSubtitle = null;
      this.shouldCloseParentDoc = false;
      this.parentBusinessNumber = null;
      console.log("🔥 prefillFromOppositeDoc - RESET (invalid values)");
      console.log("🔥 prefillFromOppositeDoc - sourceDocNumber:", sourceDocNumber, "sourceDocHebrewName:", sourceDocHebrewName);
    }

    // Client info (best-effort)
    this.userDetailsForm.patchValue({
      [FieldsCreateDocValue.RECIPIENT_NAME]: payload.sourceDoc?.recipientName ?? payload.sourceDoc?.clientName ?? '',
      [FieldsCreateDocValue.RECIPIENT_ID]: payload.sourceDoc?.recipientId ?? '',
      [FieldsCreateDocValue.RECIPIENT_EMAIL]: payload.sourceDoc?.recipientEmail ?? '',
      [FieldsCreateDocValue.RECIPIENT_PHONE]: payload.sourceDoc?.recipientPhone ?? '',
    });

    // Prefill lines: use all available source lines if provided; otherwise use a single aggregate line
    const sourceLines = this.extractSourceLines(payload.sourceDoc);

    if (Array.isArray(sourceLines) && sourceLines.length > 0) {
      // Clear any existing draft and add all lines
      this.lineItemsDraft.set([]);
      sourceLines.forEach((ln: any, idx: number) => {
        const mapped = this.mapSourceLineToForm(ln, idx, targetDocType, isNegativeReceipt);
        this.addPrefilledLine(mapped);
        // Reset the form after each line is added to clear the draft
        this.lineDetailsForm.reset({
          [FieldsCreateDocValue.UNIT_AMOUNT]: 1,
        });
      });
    } else {
      // Fallback to a single aggregate line (gross sum)
      const rawSum = payload.sourceDoc?.sumAftDisWithVAT ?? payload.sourceDoc?.sum ?? 0;
      let numericSum = Number(String(rawSum).replace(/,/g, '')) || 0;

      // If this is a negative receipt, make the sum negative
      if (isNegativeReceipt) {
        numericSum = -Math.abs(numericSum);
      }

      const linePatch: any = {
        [FieldsCreateDocValue.LINE_DESCRIPTION]: `זיכוי עבור מסמך ${payload.sourceDoc?.docNumber ?? ''}`.trim(),
        [FieldsCreateDocValue.UNIT_AMOUNT]: 1,
        [FieldsCreateDocValue.SUM]: numericSum,
      };

      if (this.lineDetailsForm.get(FieldsCreateDocValue.VAT_OPTIONS)) {
        // The source sum is gross (includes VAT), so mark it as INCLUDE
        linePatch[FieldsCreateDocValue.VAT_OPTIONS] = 'INCLUDE';
      }

      this.lineDetailsForm.patchValue(linePatch);
      this.addPrefilledLine(linePatch);
    }

    // Ensure validation signals reflect current values
    this.generalDetailsForm.updateValueAndValidity();
    this.userDetailsForm.updateValueAndValidity();
    this.generalFormIsValidSignal.set(this.generalDetailsForm.valid);
    this.userFormIsValidSignal.set(this.userDetailsForm.valid);

    // Mark as selected doc type (so UI allows creation)
    this.isFileSelected.set(!this.isInitial);

    return true;
  }

  /**
   * Adds a prefilled line to the draft and recalculates totals.
   */
  private addPrefilledLine(formData: any): void {
    this.addNewLine(formData);
    // updateDocumentTotalsFromLines and calcTotals are already called in addNewLine
    this.setSumInPaymentForm();
  }

  /**
   * Extract source lines from various possible payload shapes.
   */
  private extractSourceLines(sourceDoc: any): any[] | null {
    if (!sourceDoc) return null;
    const directKeys = [
      'linesData',
      'lines',
      'lineItems',
      'docLines',
      'items',
      'details',
      'line_items',
      'lineItemsData',
    ];
    for (const key of directKeys) {
      const arr = (sourceDoc as any)?.[key];
      if (Array.isArray(arr) && arr.length > 0) return arr;
    }

    // Fallback: find first array of objects with description/sum-ish fields
    const candidate = Object.values(sourceDoc).find(
      (v: any) =>
        Array.isArray(v) &&
        v.some(
          (x: any) =>
            x && typeof x === 'object' &&
            ('description' in x ||
              'lineDescription' in x ||
              'sum' in x ||
              'sumAftDisWithVAT' in x ||
              'sumAftDisWithVat' in x)
        )
    );
    return Array.isArray(candidate) && candidate.length > 0 ? candidate as any[] : null;
  }

  /**
   * Map a source document line (from opposite-doc payload) to line form values.
   */
  private mapSourceLineToForm(line: any, idx: number, targetDocType?: DocumentType, isNegativeReceipt: boolean = false): any {
    const description = line?.description ?? line?.lineDescription ?? '';
    const qty = Number(line?.unitQuantity ?? line?.unitAmount ?? line?.quantity ?? 1);

    // Determine the target document type to know if we need VAT
    const docType = targetDocType ?? this.fileSelected();
    const isReceipt = docType === DocumentType.RECEIPT;
    const isTaxInvoiceReceipt = docType === DocumentType.TAX_INVOICE_RECEIPT;
    // Only RECEIPT should use total with VAT - TAX_INVOICE_RECEIPT should use price before VAT
    const shouldUseTotalWithVat = isReceipt;

    // For receipts: we need the total WITH VAT (sumAftDisWithVat) divided by quantity
    // For tax invoices and tax invoice receipts: we need the price before VAT (sumBefVatPerUnit or calculated)
    let unitPrice = 0;
    let selectedVatOption: VatType = 'EXCLUDE';
    let defaultVatOption: VatType = 'EXCLUDE';

    if (shouldUseTotalWithVat) {
      // Receipts are always WITHOUT VAT in the form, but we need to use the total WITH VAT from source
      // because the receipt should show the same total amount as the original invoice
      // So we take sumAftDisWithVat (total with VAT) and divide by quantity
      const totalWithVat = line?.sumAftDisWithVat ?? line?.sumAftDisWithVAT ??
        (line?.sumAftDisBefVatPerLine && line?.vatPerLine ?
          Number(line.sumAftDisBefVatPerLine) + Number(line.vatPerLine) : null) ??
        line?.sum ?? 0;
      const numericTotal = Number(String(totalWithVat).replace(/,/g, '')) || 0;
      unitPrice = qty > 0 ? numericTotal / qty : numericTotal;
    } else {
      // For tax invoices and tax invoice receipts: always extract the price BEFORE VAT from source
      // We'll calculate the final price based on the selected VAT option later

      // First, determine the source line's VAT option to know how to extract the price
      const sourceVatOpts = line?.vatOpts ?? line?.vatOptions;
      console.log("🚀 ~ mapSourceLineToForm ~ sourceVatOpts:", sourceVatOpts, "type:", typeof sourceVatOpts, "line:", line);
      let priceBeforeVat = 0;
      const vatRate = Number(line?.vatRate ?? this.generalDetailsForm.get(FieldsCreateDocValue.DOC_VAT_RATE)?.value ?? 18);

      // Determine the default VAT option from source line
      // Default to EXCLUDE (price before VAT) - this is the most common case
      defaultVatOption = 'EXCLUDE';

      // Convert sourceVatOpts to string if it's a number (index)
      // Backend enum: INCLUDE=1, EXCLUDE=2, WITHOUT=3
      // Frontend array: [0]=INCLUDE, [1]=EXCLUDE, [2]=WITHOUT
      let sourceVatOptsString: VatType | null = null;
      if (typeof sourceVatOpts === 'number') {
        // Backend uses 1-based enum (1=INCLUDE, 2=EXCLUDE, 3=WITHOUT)
        // Frontend uses 0-based array ([0]=INCLUDE, [1]=EXCLUDE, [2]=WITHOUT)
        // So we need to convert: backend 1 -> frontend 0, backend 2 -> frontend 1, backend 3 -> frontend 2
        const frontendIndex = sourceVatOpts - 1;
        const vatOptionsArray = this.vatOptions;
        if (vatOptionsArray && vatOptionsArray[frontendIndex]) {
          sourceVatOptsString = vatOptionsArray[frontendIndex].value;
          console.log("🚀 ~ mapSourceLineToForm ~ Converted backend enum", sourceVatOpts, "to frontend index", frontendIndex, "value:", sourceVatOptsString);
        } else {
          console.warn("🚀 ~ mapSourceLineToForm ~ Invalid vatOpts number:", sourceVatOpts, "frontendIndex:", frontendIndex);
        }
      } else if (typeof sourceVatOpts === 'string') {
        sourceVatOptsString = sourceVatOpts as VatType;
      }

      // First priority: use sourceVatOpts if available
      if (sourceVatOptsString && (sourceVatOptsString === 'INCLUDE' || sourceVatOptsString === 'EXCLUDE' || sourceVatOptsString === 'WITHOUT')) {
        defaultVatOption = sourceVatOptsString;
        console.log("🚀 ~ mapSourceLineToForm ~ Using sourceVatOptsString:", sourceVatOptsString);
      } else {
        // Fallback: check if vatPerLine is 0 - that indicates WITHOUT VAT
        const vatPerLine = Number(line?.vatPerLine ?? 0);
        const sumAftDisWithVat = Number(line?.sumAftDisWithVat ?? line?.sumAftDisWithVAT ?? 0);
        const sumAftDisBefVatPerLine = Number(line?.sumAftDisBefVatPerLine ?? 0);

        if (vatPerLine === 0 && sumAftDisWithVat === sumAftDisBefVatPerLine && sumAftDisBefVatPerLine > 0) {
          // If vatPerLine is 0 and sumAftDisWithVat equals sumAftDisBefVatPerLine, it's WITHOUT VAT
          defaultVatOption = 'WITHOUT';
          console.log("🚀 ~ mapSourceLineToForm ~ Detected WITHOUT VAT from vatPerLine === 0 (fallback)");
        }
      }

      // Extract price based on source VAT option (use defaultVatOption which is already converted)
      // First, always extract the base price before VAT from the source line
      if (line?.sumBefVatPerUnit != null) {
        // Best case: we have the unit price before VAT directly
        priceBeforeVat = Number(line.sumBefVatPerUnit);
      } else if (line?.sumAftDisBefVatPerLine != null && qty > 0) {
        // Second best: total before VAT after discount, divide by quantity
        priceBeforeVat = Number(line.sumAftDisBefVatPerLine) / qty;
      } else {
        // Fallback: try to calculate from total with VAT
        const sumAftDisWithVat = Number(line?.sumAftDisWithVat ?? line?.sumAftDisWithVAT ?? 0);
        const vatPerLine = Number(line?.vatPerLine ?? 0);

        if (sumAftDisWithVat > 0 && vatPerLine > 0) {
          // If we have total with VAT and VAT amount, calculate price before VAT
          priceBeforeVat = (sumAftDisWithVat - vatPerLine) / qty;
        } else if (sumAftDisWithVat > 0 && vatRate > 0 && defaultVatOption === 'INCLUDE') {
          // If we have total with VAT and VAT rate, and it's INCLUDE, calculate price before VAT
          priceBeforeVat = sumAftDisWithVat / (1 + vatRate / 100) / qty;
        } else if (defaultVatOption === 'WITHOUT') {
          // For WITHOUT: sumAftDisWithVat is the price without VAT (no VAT was added)
          priceBeforeVat = qty > 0 ? sumAftDisWithVat / qty : sumAftDisWithVat;
        } else {
          // Last resort: use generic sum
          const rawSum = Number(line?.sum ?? line?.total ?? 0);
          priceBeforeVat = qty > 0 ? rawSum / qty : rawSum;
        }
      }

      // Calculate unitPrice based on the selected VAT option
      // If INCLUDE: user enters total with VAT, so we need to use the total with VAT from source
      // If EXCLUDE: user enters price before VAT, so we use priceBeforeVat
      // If WITHOUT: user enters price without VAT, so we use priceBeforeVat
      if (defaultVatOption === 'INCLUDE') {
        // For INCLUDE, the user enters the total with VAT
        // So we need to use sumAftDisWithVat from source
        const sumAftDisWithVat = Number(line?.sumAftDisWithVat ?? line?.sumAftDisWithVAT ?? 0);
        if (sumAftDisWithVat > 0) {
          unitPrice = qty > 0 ? sumAftDisWithVat / qty : sumAftDisWithVat;
        } else {
          // Fallback: calculate from priceBeforeVat
          unitPrice = priceBeforeVat * (1 + vatRate / 100);
        }
      } else {
        // For EXCLUDE or WITHOUT, use price before VAT
        unitPrice = priceBeforeVat;
      }

      // Store selectedVatOption for later use in formData
      selectedVatOption = defaultVatOption;
    }

    // Determine VAT options for the form (for receipts, set here)
    if (isReceipt) {
      selectedVatOption = 'WITHOUT';
    }

    // If this is a negative receipt, make the unit price negative
    let finalUnitPrice = unitPrice;
    if (isNegativeReceipt) {
      finalUnitPrice = -Math.abs(unitPrice);
    }

    const formData: any = {
      [FieldsCreateDocValue.LINE_DESCRIPTION]: description || `שורה ${idx + 1}`,
      [FieldsCreateDocValue.UNIT_AMOUNT]: qty,
      [FieldsCreateDocValue.SUM]: finalUnitPrice,
    };

    if (this.lineDetailsForm.get(FieldsCreateDocValue.VAT_OPTIONS)) {
      // Use the selectedVatOption variable that was set above
      formData[FieldsCreateDocValue.VAT_OPTIONS] = selectedVatOption;
    }

    return formData;
  }

  getVatLabel(type: VatType | undefined | null): string {
    if (!type) {
      return '';
    }
    switch (type) {
      case 'INCLUDE': return 'כולל מע״מ';
      case 'EXCLUDE': return 'לא כולל מע״מ';
      case 'WITHOUT': return 'ללא מע״מ';
      default: return '';
    }
  }



  // selectUnit(unit: string) {
  //   this.selectedUnit = unit;
  // }


  createForms(): void {
    this.myForm = this.docCreateBuilderService.buildDocCreateForm(['GeneralDetails', 'UserDetails', 'LineDetails']);
    console.log("🚀 ~ DocCreatePage ~ createForms ~ this.myForm:", this.myForm)
    this.generalArray = this.docCreateBuilderService.getBaseFieldsBySection('GeneralDetails');
    this.userArray = this.docCreateBuilderService.getBaseFieldsBySection('UserDetails');
    this.paymentsArray = this.docCreateBuilderService.getBaseFieldsBySection(this.paymentSectionName);
    // this.paymentsArray[0] = this.docCreateBuilderService.getBaseFieldsBySection(this.paymentSectionName);    
  }


  onClickInitialIndex(): void {

    const initialIndex = this.initialIndexForm.get('initialIndex')?.value;

    this.docIndexes.docIndex = initialIndex;
    console.log('Initial index selected:', this.docIndexes);
    this.setInitialIndex();
  }

  setInitialIndex(): void {
    console.log("🚀 ~ DocCreatePage ~ setInitialIndex ~ this.busoneselectedBusinessNumberss:", this.selectedBusinessNumber)
    this.docCreateService.setInitialDocDetails(this.fileSelected(), this.docIndexes.docIndex, this.selectedBusinessNumber)
      .pipe(
        catchError(err => {
          console.log('Error setting initial index:', err);
          alert("אירעה שגיאה בהגדרת מספר התחלתי אנא נסה מאוחר יותר או להפיק מסמך אחר")
          return EMPTY;
        })
      )
      .subscribe(
        (res) => {
          console.log("res in setInitialIndex:", res);
          this.isInitial = false;
          this.showInitialIndexDialog = false;
          this.isFileSelected.set(true);
        }
      )
  }

  getHebrewNameDoc(typeDoc: DocumentType): string {
    return DocTypeDisplayName[typeDoc];
  }



  handleDocIndexes(docType: DocumentType): void {
    console.log("selectedBusinessNumber is ", this.selectedBusinessNumber);

    // Reset indexes first to ensure we don't use stale values
    // This is especially important when creating documents from opposite-doc flow
    this.docIndexes = { docIndex: 0, generalIndex: 0, isInitial: false };

    this.docCreateService.getDocIndexes(docType, this.selectedBusinessNumber)
      .pipe(
        catchError(err => {
          console.error('Error getting doc indexes:', err);
          alert("אירעה שגיאה אנא נסה מאוחר יותר")
          return EMPTY;
        })
      )
      .subscribe(
        (res) => {
          console.log("res in handleDocIndexes:", res);
          // IMPORTANT: Always use the NEW generalIndex from backend, never from sourceDoc
          // The backend increments the generalIndex, so this will be a fresh, incremented value
          this.docIndexes.generalIndex = res.generalIndex;
          this.docIndexes.docIndex = res.docIndex;
          const defaultIndex = DocTypeDefaultStart[docType] ?? 100001;
          this.initialIndexForm.get('initialIndex')?.setValue(defaultIndex);
          this.isInitial = res.isInitial;
          this.isFileSelected.set(!res.isInitial); // If this docType is already initilized, display the page
          this.showInitialIndexDialog = true;
        }
      )
  }

  openSelectClients() {

    from(this.modalController.create({
      component: SelectClientComponent,
      // componentProps: {},
      cssClass: 'expense-modal'
    })).pipe(
      catchError((err) => {
        console.log("Open select clients failed in create ", err);
        return EMPTY;
      }),
      switchMap((modal) => {
        if (modal) {
          return from(modal.present())
            .pipe(
              catchError((err) => {
                console.log("Open select clients failed in present ", err);
                return EMPTY;
              }),
              switchMap(() => from(modal.onDidDismiss())),
            );
        }
        else {
          console.log('Popover modal is null');
          return EMPTY;
        }
      })
    ).subscribe((res) => {
      console.log("res in close select client", res);
      if (res) {
        if (res.role === 'success') {// Only if the modal was closed with click on the select button
          console.log("res in close select client in success", res);
          this.fillClientDetails(res.data);
        }

      }
    })
  }

  fillClientDetails(client: any) {
    console.log("🚀 ~ DocCreatePage ~ fillClientDetails ~ client:", client)

    // Handle both cases: autocomplete (client.value) and modal (direct client object)
    const clientData = client.value || client;

    // Save client data for later use when expanding fields
    this.selectedClientData = clientData;

    // Fill only the base fields that currently exist in the form
    this.userDetailsForm.patchValue({
      [FieldsCreateDocValue.RECIPIENT_NAME]: clientData.name || '',
      [FieldsCreateDocValue.RECIPIENT_EMAIL]: clientData.email || '',
      [FieldsCreateDocValue.RECIPIENT_PHONE]: clientData.phone || '',
      [FieldsCreateDocValue.RECIPIENT_ID]: clientData.id || '',
    });

    // If user details are already expanded, fill the expanded fields too
    if (this.isUserExpanded()) {
      this.fillExpandedClientFields(clientData);
    }
  }


  calculateSumAfterVat(sum: number): number { // Calculate the original cost 
    const vatRate = 0.18; // Example VAT rate
    return sum / (1 + vatRate);
  }


  calculateVatAmountAfterVat(sum: number): number {
    const vatRate = 0.18; // Example VAT rate
    return sum - this.calculateSumAfterVat(sum);
  }


  calculateSumIncludingVat(sum: number): number {
    return sum;
  }


  calculateVatAmountBeforVat(sum: number): number {
    const vatRate = 0.18;
    return sum * vatRate;
  }


  expandGeneralDetails(): void {
    this.isGeneralExpanded = !this.isGeneralExpanded;
    if (this.isGeneralExpanded) {
      this.docCreateBuilderService.addFormControlsByExpandedSection(this.generalDetailsForm, 'GeneralDetails');
      this.generalArray = this.docCreateBuilderService.getAllFieldsBySection('GeneralDetails');
      console.log("this.generalDetailsForm: ", this.generalDetailsForm);

    }
    else {
      this.generalArray = this.docCreateBuilderService.getBaseFieldsBySection('GeneralDetails');
      this.docCreateBuilderService.removeFormControlsByExpandedSection(this.generalDetailsForm, 'GeneralDetails');
    }
    console.log("🚀 ~ DocCreatePage ~ expandGeneralDetails ~ this.generalDetailsForm:", this.generalDetailsForm)
    console.log("🚀 ~ DocCreatePage ~ expandGeneralDetails ~ this.generalArray:", this.generalArray)

  }


  expandUserDetails(): void {
    console.log("🚀 ~ DocCreatePage ~ expandUserDetails ~ this.showUserMoreFields:", this.showUserMoreFields)
    console.log("🚀 ~ DocCreatePage ~ expandUserDetails ~ this.showUserMoreFields:", this.showUserMoreFields)
    console.log(this.userDetailsForm);
    console.log(this.userArray);

    this.isUserExpanded.set(!this.isUserExpanded());
    if (this.isUserExpanded()) {
      this.docCreateBuilderService.addFormControlsByExpandedSection(this.userDetailsForm, 'UserDetails');
      this.userArray = this.docCreateBuilderService.getAllFieldsBySection('UserDetails');
      console.log("this.userArray: ", this.userArray);

      // If there's a selected client, fill the expanded fields
      if (this.selectedClientData) {
        this.fillExpandedClientFields(this.selectedClientData);
      }
    }
    else {
      this.docCreateBuilderService.removeFormControlsByExpandedSection(this.userDetailsForm, 'UserDetails');
      this.userArray = this.docCreateBuilderService.getBaseFieldsBySection('UserDetails');
      console.log("this.userArray: ", this.userArray);
      console.log("this.userDetailsForm: ", this.userDetailsForm);

    }
  }

  private fillExpandedClientFields(clientData: IClient): void {
    const expandField = {
      [FieldsCreateDocValue.RECIPIENT_ADDRESS]: clientData.address,
    }
    if (this.isUserExpanded()) {
      this.userDetailsForm.patchValue(expandField);
    }
  }

  // Show dialog asking user how to get allocation number
  showAllocationNumberDialog(): void {
    const sumBeforeVat = this.documentTotals().sumAftDisBefVat;

    console.log("🔍 showAllocationNumberDialog - sumBeforeVat:", sumBeforeVat);
    console.log("🔍 showAllocationNumberDialog - confirmationService:", this.confirmationService);

    this.confirmationService.confirm({
      message: `על מנת להפיק חשבונית בסכום של ₪${sumBeforeVat.toLocaleString('he-IL')} (לפני מע״מ), נדרש מספר הקצאה משעמ.\n\nכיצד תרצה להמשיך?`,
      header: 'מספר הקצאה נדרש',
      icon: 'pi pi-info-circle',
      acceptLabel: 'הפק באמצעות התוכנה',
      rejectLabel: 'הזן ידנית',
      acceptVisible: true,
      rejectVisible: true,
      accept: () => {
        // Wait for the current dialog to close before opening the next one
        setTimeout(() => {
          this.openShaamDialog();
        }, 100);
      },
      reject: () => {
        this.showAllocationNumberInput.set(true);
      }
    });
  }

  // Open SHAAM dialog and send automatic request
  openShaamDialog(): void {
    // Check if businessNumber is available
    if (!this.selectedBusinessNumber) {
      this.messageService.add({
        severity: 'error',
        summary: 'שגיאה',
        detail: 'מספר עסק לא זוהה. אנא נסה שוב',
        life: 3000,
        key: 'br'
      });
      return;
    }

    // Check for valid SHAAM connection
    firstValueFrom(
      this.shaamService.getValidAccessToken(this.selectedBusinessNumber).pipe(
        catchError((error) => {
          // On error, return null to indicate no connection
          return of(null);
        })
      )
    ).then((tokenData) => {
      if (!tokenData || !tokenData.accessToken) {
        // No valid connection exists, show confirmation dialog
        this.showShaamConnectionRequiredDialog();
        return;
      }
      // Valid connection exists, send automatic request with document data
      this.sendAllocationNumberRequest(tokenData.accessToken);
    });
  }

  // Send allocation number request automatically with document data
  private sendAllocationNumberRequest(accessToken: string): void {
    // Log token details
    console.log('=== SENDING ALLOCATION NUMBER REQUEST ===');
    console.log('Access token length:', accessToken.length);
    console.log('Access token starts with:', accessToken.substring(0, 30));
    console.log('Access token ends with:', '...' + accessToken.substring(accessToken.length - 20));

    // Build request data from document
    const docDate = this.generalDetailsForm.get(FieldsCreateDocValue.DOC_DATE)?.value;
    const docNumber = this.docIndexes.docIndex;
    const recipientId = this.userDetailsForm.get(FieldsCreateDocValue.RECIPIENT_ID)?.value;
    const totals = this.documentTotals();
    const docType = this.generalDetailsForm.get(FieldsCreateDocValue.DOC_TYPE)?.value;

    // Format date to YYYY-MM-DD
    const formattedDate = docDate ? new Date(docDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];

    // Map document type to invoice_type (you may need to adjust this mapping)
    const invoiceType = this.mapDocTypeToInvoiceType(docType);

    // Build approval request
    const approvalData: IShaamApprovalRequest = {
      user_id: parseInt(this.selectedBusinessNumber),
      accounting_software_number: 258001, // Fixed company number
      amount_before_discount: totals.sumBefDisBefVat || totals.sumAftDisBefVat,
      customer_vat_number: parseInt(recipientId) || 204245724,
      discount: totals.disSum || 0,
      invoice_date: formattedDate,
      invoice_id: `INV-${docNumber}-${Date.now()}`,
      invoice_issuance_date: formattedDate,
      invoice_reference_number: docNumber?.toString() || `REF-${Date.now()}`,
      invoice_type: invoiceType,
      payment_amount: totals.sumAftDisBefVat,
      payment_amount_including_vat: totals.sumAftDisWithVat,
      vat_amount: totals.vatSum,
      vat_number: parseInt(this.selectedBusinessNumber) || 777777715,
    };

    console.log('Approval data:', JSON.stringify(approvalData, null, 2));
    console.log('Business number:', this.selectedBusinessNumber);
    console.log('=== END ALLOCATION NUMBER REQUEST DATA ===');

    // Send request with businessNumber so backend can verify token
    this.shaamService.submitInvoiceApproval(accessToken, approvalData, this.selectedBusinessNumber)
      .pipe(
        catchError((error) => {
          const errorMessage = error.error?.message || error.message || 'שגיאה בשליחת הבקשה';
          this.messageService.add({
            severity: 'error',
            summary: 'שגיאה',
            detail: errorMessage,
            life: 5000,
            key: 'br'
          });
          return EMPTY;
        })
      )
      .subscribe((response: IShaamApprovalResponse) => {
        if (response.approved && response.confirmation_number) {
          this.allocationNumber.set(response.confirmation_number);
          this.messageService.add({
            severity: 'success',
            summary: 'הצלחה',
            detail: `מספר הקצאה התקבל: ${response.confirmation_number}`,
            life: 5000,
            key: 'br'
          });
          // After getting allocation number, proceed with document creation
          this.confirmCreateDoc();
        } else {
          this.messageService.add({
            severity: 'warn',
            summary: 'החשבונית לא אושרה',
            detail: response.message || 'החשבונית לא אושרה על ידי שעמ',
            life: 5000,
            key: 'br'
          });
        }
      });
  }

  // Map document type to SHAAM invoice type
  private mapDocTypeToInvoiceType(docType: DocumentType): number {
    // Map your document types to SHAAM invoice types
    // You may need to adjust this mapping based on your business logic
    switch (docType) {
      case DocumentType.TAX_INVOICE:
        return 305; // Example: tax invoice
      case DocumentType.TAX_INVOICE_RECEIPT:
        return 305; // Example: tax invoice receipt
      default:
        return 305; // Default invoice type
    }
  }

  // Show dialog when SHAAM connection is required
  showShaamConnectionRequiredDialog(): void {
    // Wait a bit to ensure any previous dialog is fully closed
    setTimeout(() => {
      this.confirmationService.confirm({
        message: 'על מנת להמשיך בתהליך יש לבצע התחברות לאיזור האישי ברשות המיסים ולתת הרשאה למערכת לבצע עבורך את הפעולה',
        header: 'התחברות נדרשת',
        icon: 'pi pi-info-circle',
        acceptLabel: 'מעבר לאתר רשות המיסים',
        rejectLabel: 'ביטול',
        acceptVisible: true,
        rejectVisible: true,
        accept: () => {
          // Redirect to SHAAM OAuth flow
          this.shaamService.initiateOAuthFlow(this.selectedBusinessNumber);
        },
        reject: () => {
          // User cancelled, do nothing
        }
      });
    }, 150);
  }

  // Handle SHAAM dialog close
  onShaamDialogClose(event: { visible: boolean }): void {
    this.showShaamDialog.set(event.visible);
  }

  // Handle SHAAM approval success
  onShaamApprovalSuccess(event: { response: IShaamApprovalResponse }): void {
    if (event.response.confirmation_number) {
      this.allocationNumber.set(event.response.confirmation_number);
      this.messageService.add({
        severity: 'success',
        summary: 'הצלחה',
        detail: `מספר הקצאה התקבל: ${event.response.confirmation_number}`,
        life: 3000,
        key: 'br'
      });
      // After getting allocation number, proceed with document creation
      this.confirmCreateDoc();
    }
  }

  // Handle manual allocation number input
  onAllocationNumberSubmit(allocationNumber: string): void {
    if (allocationNumber && allocationNumber.trim()) {
      this.allocationNumber.set(allocationNumber.trim());
      this.manualAllocationNumber = '';
      this.showAllocationNumberInput.set(false);
      // After setting allocation number, proceed with document creation
      this.confirmCreateDoc();
    }
  }

  // Cancel manual allocation number input
  cancelAllocationNumberInput(): void {
    this.manualAllocationNumber = '';
    this.showAllocationNumberInput.set(false);
  }


}