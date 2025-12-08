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
import { IDocCreateFieldData, SectionKeysEnum } from './doc-create.interface';
import { inputsSize } from 'src/app/shared/enums';
import { ButtonColor, ButtonSize } from 'src/app/components/button/button.enum';
import { bankOptionsList, DocCreateFields, DocTypeDefaultStart, DocTypeDisplayName, DocumentTotals, DocumentTotalsLabels, LineItem, PartialLineItem } from './doc-cerate.enum';
import { ConfirmationService, MenuItem } from 'primeng/api';
import { DocumentType } from './doc-cerate.enum';
import { toSignal } from '@angular/core/rxjs-interop';
import { DialogService, DynamicDialogRef } from 'primeng/dynamicdialog';
import { DocSuccessDialogComponent } from 'src/app/components/create-doc-success-dialog/create-doc-success-dialog.component';
import { log } from 'console';

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
  addPDFIsLoading: boolean = false;
  userData: IUserData
  amountBeforeVat: number = 0;
  overallTotals: ITotals;
  vatRate = 0.18; // 18% VAT
  isGeneralExpanded: boolean = false;
  isUserExpanded: boolean = false;
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

    if (allBusinesses.length === 1) {
      const selected = allBusinesses[0];

      this.generalDetailsForm.patchValue({
        businessNumber: selected.businessNumber
      });

      console.log("ngoninit selected is ", selected);

      this.setSelectedBusiness(selected);

      this.showBusinessSelector = false;
    } else {
      this.showBusinessSelector = true;
    }

    this.generalDetailsForm.statusChanges.subscribe(() => {
      this.generalFormIsValidSignal.set(this.generalDetailsForm.valid);
    });

    this.userDetailsForm.statusChanges.subscribe(() => {
      this.userFormIsValidSignal.set(this.userDetailsForm.valid);
    });

  }


  ngOnDestroy() {
    if (this.dialogRef) {
      this.dialogRef.close();
    }
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

    docPayload = {
      docData: {
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
      },
      linesData: this.lineItemsDraft(),
      paymentData: this.paymentsDraft(),
    };

    console.log("🚀 ~ DocCreatePage ~ buildDocPayload ~ docPayload", docPayload);

    return docPayload;

  }


  addLineDetails(): void {
    const formData = this.lineDetailsForm.value;
    console.log("Adding line with form value:", formData);

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
    console.log("🚀 ~ DocCreatePage ~ addLineDetails ~ this.lineItemsDraft", this.lineItemsDraft());

    this.calculateVatFieldsForLine(lineIndex);
    this.updateDocumentTotalsFromLines();
    this.lineDetailsForm.reset({
      [FieldsCreateDocValue.UNIT_AMOUNT]: 1,
      // [FieldsCreateDocValue.DISCOUNT]: 0
    });
    this.calcTotals();
    const docDate = this.generalDetailsForm.get(FieldsCreateDocValue.DOCUMENT_DATE)?.value ?? null;
    this.createPaymentInputForm(this.activePaymentMethod.id as string, docDate);
    this.setSumInPaymentForm();
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
      this.totalDiscount += line.disBefVatPerLine * line.unitQuantity;
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


  deleteLine(index: number): void {
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
    console.log("🚀 ~ DocCreatePage ~ fillClientDetails ~ client", client)
    this.userDetailsForm.patchValue({
      [FieldsCreateDocValue.RECIPIENT_NAME]: client.name,
      [FieldsCreateDocValue.RECIPIENT_EMAIL]: client.email,
      [FieldsCreateDocValue.RECIPIENT_PHONE]: client.phone,
    });
  }


  saveClient() {
    const { [FieldsCreateDocValue.RECIPIENT_NAME]: name, [FieldsCreateDocValue.RECIPIENT_EMAIL]: email, [FieldsCreateDocValue.RECIPIENT_PHONE]: phone } = this.userDetailsForm.value;
    const clientData = {
      name,
      email,
      phone,
    };
    this.docCreateService.saveClientDetails(clientData)
      .pipe(
        catchError((err) => {
          console.log("err in save client: ", err);
          if (err.status === 409) {
            this.genericService.openPopupMessage("כבר קיים לקוח בשם זה, אנא בחר שם שונה. אם ברצונך לערוך לקוח זה אנא  לחץ על כפתור עריכה דרך הרשימה .");
          }
          else {
            this.genericService.showToast("אירעה שגיאה לא ניתן לשמור לקוח אנא נסה מאוחר יותר", "error");
          }
          return EMPTY;
        })
      )
      .subscribe((res) => {
        console.log("res in save client: ", res);
      })
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

    this.isUserExpanded = !this.isUserExpanded;
    if (this.isUserExpanded) {
      this.docCreateBuilderService.addFormControlsByExpandedSection(this.userDetailsForm, 'UserDetails');
      this.userArray = this.docCreateBuilderService.getAllFieldsBySection('UserDetails');
      console.log("this.userArray: ", this.userArray);

    }
    else {
      this.docCreateBuilderService.removeFormControlsByExpandedSection(this.userDetailsForm, 'UserDetails');
      this.userArray = this.docCreateBuilderService.getBaseFieldsBySection('UserDetails');
      console.log("this.userArray: ", this.userArray);
      console.log("this.userDetailsForm: ", this.userDetailsForm);

    }
  }


}