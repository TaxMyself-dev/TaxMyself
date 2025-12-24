import { Component, computed, inject, OnDestroy, OnInit, Signal, signal } from '@angular/core';
import { FormArray, FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { EMPTY, Observable, Subject, catchError, finalize, firstValueFrom, forkJoin, from, map, of, startWith, switchMap, tap, throwError } from 'rxjs';
import { BusinessStatus, fieldLineDocName, fieldLineDocValue, FieldsCreateDocName, FieldsCreateDocValue, FormTypes, PaymentMethodName, paymentMethodOptions, UnitOfMeasure, vatOptions, VatType } from 'src/app/shared/enums';
import { Router } from '@angular/router';
import { Business, BusinessInfo, ICreateDataDoc, ICreateDocField, ICreateLineDoc, IDataDocFormat, IDocIndexes, ISelectItem, ISettingDoc, ITotals, IUserData, } from 'src/app/shared/interface';
import { DocCreateService } from './doc-create.service';
import { ModalController } from '@ionic/angular';
import { SelectClientComponent } from 'src/app/shared/select-client/select-client.component';
import { GenericService } from 'src/app/services/generic.service';
import { FilesService } from 'src/app/services/files.service';
import { AuthService } from 'src/app/services/auth.service';
import { DocCreateBuilderService } from './doc-create-builder.service';
import { IClient, IDocCreateFieldData, SectionKeysEnum } from './doc-create.interface';
import { inputsSize } from 'src/app/shared/enums';
import { ButtonColor, ButtonSize } from 'src/app/components/button/button.enum';
import { bankOptionsList, DocCreateFields, DocTypeDefaultStart, DocTypeDisplayName, DocumentTotals, DocumentTotalsLabels, LineItem, PartialLineItem } from './doc-cerate.enum';
import { ConfirmationService, MenuItem } from 'primeng/api';
import { DocumentType } from './doc-cerate.enum';
import { toSignal } from '@angular/core/rxjs-interop';
import { DialogService, DynamicDialogRef } from 'primeng/dynamicdialog';
import { DocSuccessDialogComponent } from 'src/app/components/create-doc-success-dialog/create-doc-success-dialog.component';
import { log } from 'console';
import { AddClientComponent } from 'src/app/components/add-client/add-client.component';

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
}



@Component({
  selector: 'app-doc-create',
  templateUrl: './doc-create.page.html',
  styleUrls: ['./doc-create.page.scss', '../../shared/shared-styling.scss'],
  standalone: false
})
export class DocCreatePage implements OnInit, OnDestroy {

  private gs = inject(GenericService);
  confirmationService = inject(ConfirmationService);


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
  selectedBusinessType!: string;
  selectedBusinessPhone!: string;
  selectedBusinessEmail!: string;

  // Parent document info (for opposite doc flow)
  parentDocType: DocumentType | null = null;
  parentDocNumber: string | null = null;
  docSubtitle: string | null = null;
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
    sumWithoutVat: 0,
  });

  // Computed signals for filtered arrays based on document type
  isReceiptDocument = computed(() => this.fileSelected() === DocumentType.RECEIPT);

  filteredLineDetailsColumns = computed(() =>
    this.docCreateBuilderService.getLineDetailsColumns(this.isReceiptDocument())
  );

  filteredLineItemsDisplayColumns = computed(() =>
    this.docCreateBuilderService.getLineItemsDisplayColumns(this.isReceiptDocument())
  );

  filteredSummaryItems = computed(() =>
    this.docCreateBuilderService.getSummaryItems(this.isReceiptDocument())
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
    this.docCreateService.getClients()
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
      const filtered = this.clients().filter(client => 
        client.name?.toLowerCase().includes(query) ||
        client.email?.toLowerCase().includes(query) ||
        client.phone?.toLowerCase().includes(query)
      );
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
          width: '1000px',
          rtl: true,
          closable: true,
          dismissableMask: true,
          modal: true,
          data: {

          }
        });
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
    this.selectedBusinessType = business.businessType;
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

    if (event === DocumentType.RECEIPT) {
      // For receipts, remove VAT_OPTIONS from form and set value to 'WITHOUT' in the line items
      if (this.lineDetailsForm?.get(FieldsCreateDocValue.VAT_OPTIONS)) {
        this.lineDetailsForm.removeControl(FieldsCreateDocValue.VAT_OPTIONS);
      }
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
    this.paymentInputForm?.get('paymentDate')?.setValue(this.generalDetailsForm?.get('documentDate')?.value);
    this.paymentsDraft.set([]);
    this.lineItemsDraft.set([]);
  }


  onSelectionChange(field: string, event: any): void {
    console.log("field: ", field);
    console.log("event: ", event);
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
        this.onBusinessSelection(event);
        break;
      default:
        break;
    }
  }


  confirmCreateDoc(): void {
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
      [FieldsCreateDocValue.DOCUMENT_DATE]: new Date()
    });

    this.userDetailsForm.reset();

    this.lineDetailsForm.reset({
      [FieldsCreateDocValue.UNIT_AMOUNT]: 1,
      // [FieldsCreateDocValue.DISCOUNT]: 0
    });

    this.initialIndexForm.reset();

    // Use the cached date so we don't read from a reset control
    this.paymentInputForm.reset({
      [fieldLineDocValue.PAYMENT_DATE]: this.generalDetailsForm?.get('documentDate')?.value
    });

    this.lineItemsDraft.set([]);
    this.paymentsDraft.set([]);

    this.isFileSelected.set(false);
    // this.HebrewNameFileSelected = null;

    // Reset parent document info
    this.parentDocType = null;
    this.parentDocNumber = null;
    this.docSubtitle = null;
  }


  previewDoc(): void {
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

    const issuerBusinessNumber = this.selectedBusinessNumber;
    const issuerName = this.selectedBusinessName;
    const issuerAddress = this.selectedBusinessAddress;
    const issuerPhone = this.selectedBusinessPhone;
    const issuerEmail = this.selectedBusinessEmail;

    console.log("issuerBusinessNumber is ", issuerBusinessNumber);


    const docNumber = this.docIndexes.docIndex;
    console.log("docNumber: ", docNumber);

    const generalDocIndex = this.docIndexes.generalIndex;
    const hebrewNameDoc = this.getHebrewNameDoc(this.fileSelected());

    // Build docData object, only including parent fields if they exist
    const docData: any = {
      ...this.generalDetailsForm.value,
      ...this.userDetailsForm.value,
      issuerBusinessNumber,
      issuerName,
      issuerAddress,
      issuerPhone,
      issuerEmail,
      docNumber,
      generalDocIndex,
      hebrewNameDoc,
      sumWithoutVat: Number(this.documentTotals().sumWithoutVat.toFixed(2)),
      sumBefDisBefVat: Number(this.documentTotals().sumBefDisBefVat.toFixed(2)),
      disSum: Number(this.documentTotals().disSum.toFixed(2)),
      sumAftDisBefVAT: Number(this.documentTotals().sumAftDisBefVat.toFixed(2)),
      vatSum: Number(this.documentTotals().vatSum.toFixed(2)),
      sumAftDisWithVAT: Number(this.documentTotals().sumAftDisWithVat.toFixed(2)),
    };

    // Only add parent fields if they exist (not null)
    if (this.docSubtitle) {
      docData.docSubtitle = this.docSubtitle;
    }
    if (this.parentDocType) {
      docData.parentDocType = this.parentDocType;
    }
    if (this.parentDocNumber) {
      docData.parentDocNumber = this.parentDocNumber;
    }

    docPayload = {
      docData,
      linesData: this.lineItemsDraft(),
      paymentData: this.paymentsDraft(),
    };

    console.log("🚀 ~ DocCreatePage ~ buildDocPayload ~ docPayload", docPayload);
    console.log("🚀 ~ DocCreatePage ~ buildDocPayload ~ parentDocType:", this.parentDocType);
    console.log("🚀 ~ DocCreatePage ~ buildDocPayload ~ parentDocNumber:", this.parentDocNumber);
    console.log("🚀 ~ DocCreatePage ~ buildDocPayload ~ docSubtitle:", this.docSubtitle);

    return docPayload;

  }


  addLineDetails(): void {
    const formData = this.lineDetailsForm.value;
    const editingIndex = this.editingLineIndex();

    if (editingIndex !== null) {
      // Update existing line
      console.log("Updating line at index:", editingIndex);
      this.updateLine(editingIndex, formData);
    } else {
      // Add new line
      console.log("Adding new line with form value:", formData);
      this.addNewLine(formData);
    }

    this.updateDocumentTotalsFromLines();
    this.lineDetailsForm.reset({
      [FieldsCreateDocValue.UNIT_AMOUNT]: 1,
    });
    this.editingLineIndex.set(null); // Reset editing state
    this.calcTotals();
    const docDate = this.generalDetailsForm.get(FieldsCreateDocValue.DOCUMENT_DATE)?.value ?? null;
    this.createPaymentInputForm(this.activePaymentMethod.id as string, docDate);
    this.setSumInPaymentForm();
  }

  private addNewLine(formData: any): void {
    const lineIndex = this.lineItemsDraft().length;
    const transType = "3";

    // For receipts, vatOptions won't exist in the form, so set it to 'WITHOUT'
    const vatOpts = this.fileSelected() === DocumentType.RECEIPT ? 'WITHOUT' : formData.vatOptions;

    const newLine: PartialLineItem = {
      issuerBusinessNumber: this.selectedBusinessNumber,
      generalDocIndex: String(this.docIndexes.generalIndex),
      lineNumber: lineIndex + 1,
      description: formData.description,
      unitQuantity: formData.unitAmount,
      sum: formData.sum,
      discount: formData.discount ?? 0,
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
    const vatOpts = this.fileSelected() === DocumentType.RECEIPT ? 'WITHOUT' : formData.vatOptions;

    const updatedLine: PartialLineItem = {
      ...this.lineItemsDraft()[index], // Keep existing properties like calculated VAT fields
      description: formData.description,
      unitQuantity: formData.unitAmount,
      sum: formData.sum,
      discount: formData.discount ?? 0,
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

    const line = this.lineItemsDraft()[lineIndex]; //Get the line by reference
    const quantity = Number(line.unitQuantity ?? 1);
    const unitSum = Number(line.sum ?? 0);
    const discount = Number(line.discount ?? 0);
    const vatOption = line.vatOpts;
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

    Object.assign(line, {
      sumBefVatPerUnit: Number(sumBefVatPerUnit.toFixed(2)),
      disBefVatPerLine: Number(disBefVatPerLine.toFixed(2)),
      sumAftDisBefVatPerLine: Number(sumAftDisBefVatPerLine.toFixed(2)),
      vatPerLine: Number(vatPerLine.toFixed(2)),
      sumAftDisWithVat: Number(sumAftDisWithVat.toFixed(2)),
    });
    console.log("🚀 ~ DocCreatePage ~ calculateVatFieldsForLine ~ line after calaulate", line);

  }


  updateDocumentTotalsFromLines(): void {

    const totals: DocumentTotals = {
      sumBefDisBefVat: 0,
      disSum: 0,
      sumAftDisBefVat: 0,
      vatSum: 0,
      sumAftDisWithVat: 0,
      sumWithoutVat: 0,
    };

    for (const line of this.lineItemsDraft()) {
      if (line.vatOpts === 'WITHOUT') {
        totals.sumWithoutVat += Number((line.sumBefVatPerUnit ?? 0) * line.unitQuantity);
      }
      else {
        totals.sumBefDisBefVat += Number((line.sumBefVatPerUnit ?? 0) * line.unitQuantity);
      }
      totals.disSum += Number(line.disBefVatPerLine ?? 0);
      totals.sumAftDisBefVat += Number(line.sumAftDisBefVatPerLine ?? 0);
      totals.vatSum += Number(line.vatPerLine ?? 0);
      totals.sumAftDisWithVat += Number(line.sumAftDisWithVat ?? 0);
    }

    this.documentTotals.set(totals);
  }

  calcTotals(): void {

    this.amountSubjectToVAT = 0;
    this.totalNonVATAmount = 0;
    this.totalDiscount = 0;
    this.totalVatAmount = 0;
    this.totalAmount.set(0);
    for (const line of this.lineItemsDraft()) {
      if (line.vatOpts === 'WITHOUT') {
        this.totalNonVATAmount += line.sumBefVatPerUnit * line.unitQuantity;
      }
      else {
        this.amountSubjectToVAT += line.sumBefVatPerUnit * line.unitQuantity;
      }
      this.totalDiscount += line.disBefVatPerLine;
      this.totalVatAmount += line.vatPerLine;
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
    const docDate = this.generalDetailsForm.get(FieldsCreateDocValue.DOCUMENT_DATE)?.value ?? null;
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
      issuerBusinessNumber: this.selectedBusinessNumber,
      generalDocIndex: String(this.docIndexes.generalIndex),
      paymentLineNumber: paymentLineIndex + 1,
      paymentMethod: this.activePaymentMethod.id, // Track which payment method was selected
      hebrewBankName,  // Save the Hebrew name for later use (display / backend)
      bankNumber
    };

    // this.paymentsDraft.push(paymentEntry);
    this.paymentsDraft.update(items => [...items, paymentEntry]);

    // Reset the form for the next payment entry
    const docDate = this.generalDetailsForm.get(FieldsCreateDocValue.DOCUMENT_DATE)?.value ?? null;
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

    // Set doc type and trigger existing doc-type setup
    this.generalDetailsForm.patchValue({ docType: targetDocType });
    this.onSelectedDoc(targetDocType);

    // Dates
    const docDate = payload.sourceDoc?.docDate ? new Date(payload.sourceDoc.docDate) : new Date();
    this.generalDetailsForm.get(FieldsCreateDocValue.DOCUMENT_DATE)?.setValue(docDate);

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
      // Format: [target doc name] עבור [source doc name] מספר [source doc number]
      this.docSubtitle = `${targetDocHebrewName} עבור ${sourceDocHebrewName} מספר ${sourceDocNumber}`;
      console.log("🔥 prefillFromOppositeDoc - SET parentDocType:", this.parentDocType);
      console.log("🔥 prefillFromOppositeDoc - SET parentDocNumber:", this.parentDocNumber);
      console.log("🔥 prefillFromOppositeDoc - SET docSubtitle:", this.docSubtitle);
    } else {
      // Reset if invalid
      this.parentDocType = null;
      this.parentDocNumber = null;
      this.docSubtitle = null;
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
        const mapped = this.mapSourceLineToForm(ln, idx, targetDocType);
        this.lineDetailsForm.patchValue(mapped);
        this.addPrefilledLine(mapped);
        // Reset the form after each line is added to clear the draft
        this.lineDetailsForm.reset({
          [FieldsCreateDocValue.UNIT_AMOUNT]: 1,
        });
      });
    } else {
      // Fallback to a single aggregate line (gross sum)
      const rawSum = payload.sourceDoc?.sumAftDisWithVAT ?? payload.sourceDoc?.sum ?? 0;
      const numericSum = Number(String(rawSum).replace(/,/g, '')) || 0;

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
    this.updateDocumentTotalsFromLines();
    this.calcTotals();
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
  private mapSourceLineToForm(line: any, idx: number, targetDocType?: DocumentType): any {
    const description = line?.description ?? line?.lineDescription ?? '';
    const qty = Number(line?.unitQuantity ?? line?.unitAmount ?? line?.quantity ?? 1);

    // Determine the target document type to know if we need VAT
    const docType = targetDocType ?? this.fileSelected();
    const isReceipt = docType === DocumentType.RECEIPT;

    // For receipts: we need the total WITH VAT (sumAftDisWithVat) divided by quantity
    // For tax invoices: we need the price before VAT (sumBefVatPerUnit or calculated)
    let unitPrice = 0;

    if (isReceipt) {
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
      // For tax invoices: use price before VAT
      if (line?.sumBefVatPerUnit != null) {
        // Best case: we have the unit price before VAT directly
        unitPrice = Number(line.sumBefVatPerUnit);
      } else if (line?.sumAftDisBefVatPerLine != null && qty > 0) {
        // Second best: total before VAT after discount, divide by quantity
        unitPrice = Number(line.sumAftDisBefVatPerLine) / qty;
      } else {
        // Fallback: try to extract from total sum
        const rawSumCandidates = [
          line?.sumAftDisBefVatPerLine,    // before VAT but after discount (preferred)
          line?.sum,                        // generic sum
          line?.sumAftDisWithVAT,          // exact field name from backend (includes VAT)
          line?.sumAftDisWithVat,          // casing variant (includes VAT)
          line?.total,
        ].filter((v) => v !== undefined && v !== null);

        const rawSum = rawSumCandidates.length > 0 ? rawSumCandidates[0] : 0;
        const numericSum = Number(String(rawSum).replace(/,/g, '')) || 0;
        unitPrice = qty > 0 ? numericSum / qty : numericSum;
      }
    }

    // Determine VAT options based on the target document type
    let vatOptions: any = null;
    if (isReceipt) {
      // Receipts are always WITHOUT VAT
      vatOptions = 'WITHOUT';
    } else {
      // For tax invoices, use the source line's VAT options or determine from vatPerLine
      vatOptions = line?.vatOpts ?? line?.vatOptions ?? null;
      if (!vatOptions) {
        const vatPerLine = Number(line?.vatPerLine ?? 0);
        vatOptions = vatPerLine === 0 ? 'EXCLUDE' : 'INCLUDE';
      }
    }

    const formData: any = {
      [FieldsCreateDocValue.LINE_DESCRIPTION]: description || `שורה ${idx + 1}`,
      [FieldsCreateDocValue.UNIT_AMOUNT]: qty,
      [FieldsCreateDocValue.SUM]: unitPrice,
    };

    if (this.lineDetailsForm.get(FieldsCreateDocValue.VAT_OPTIONS)) {
      formData[FieldsCreateDocValue.VAT_OPTIONS] = vatOptions;
    }

    return formData;
  }

  getVatLabel(type: VatType): string {
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
          //   // Save general index always (used for internal doc ID)
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
    // this.showUserMoreFields = !this.showUserMoreFields;
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
      [FieldsCreateDocValue.RECIPIENT_CITY]: clientData.city,
      [FieldsCreateDocValue.RECIPIENT_STATE]: clientData.state,
      [FieldsCreateDocValue.RECIPIENT_STREET]: clientData.street,
      [FieldsCreateDocValue.RECIPIENT_HOME_NUMBER]: clientData.homeNumber,
      [FieldsCreateDocValue.RECIPIENT_POSTAL_CODE]: clientData.postalCode,
      [FieldsCreateDocValue.RECIPIENT_STATE_CODE]: clientData.stateCode,
    }
    if (this.isUserExpanded()) {
      this.userDetailsForm.patchValue(expandField);
    }
  }


}