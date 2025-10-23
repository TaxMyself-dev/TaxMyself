import { Component, computed, OnInit, signal } from '@angular/core';
import { FormArray, FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { EMPTY, Observable, Subject, catchError, finalize, firstValueFrom, forkJoin, from, map, of, switchMap, tap } from 'rxjs';
import { BusinessMode, CardCompany, CreditTransactionType, Currency, fieldLineDocName, fieldLineDocValue, FieldsCreateDocName, FieldsCreateDocValue, FormTypes, PaymentMethodName, PaymentMethodValue, UnitOfMeasure, VatOptions } from 'src/app/shared/enums';
import { Router } from '@angular/router';
import { BusinessInfo, ICreateDataDoc, ICreateDocField, ICreateLineDoc, IDataDocFormat, IDocIndexes, ISelectItem, ISettingDoc, ITotals, IUserData, } from 'src/app/shared/interface';
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
import { MenuItem } from 'primeng/api';
import { DocumentType } from './doc-cerate.enum';

interface DocPayload {
  docData: any[];
  linesData: any[];
  paymentData: any[];
}

interface PaymentFieldConfig {
  key: string;   // FormControlName
  label: string; // Header label
  type: 'date' | 'dropdown' | 'text';
  options?: any[];
}



@Component({
    selector: 'app-doc-create',
    templateUrl: './doc-create.page.html',
    styleUrls: ['./doc-create.page.scss', '../../shared/shared-styling.scss'],
    standalone: false
})
export class DocCreatePage implements OnInit {

  paymentsDetailsForm: FormGroup;
  myForm: FormGroup;
  userDetailsFields: ICreateDocField<FieldsCreateDocName, FieldsCreateDocValue>[] = [];
  paymentDetailsFields: ICreateDocField<FieldsCreateDocName | fieldLineDocName, FieldsCreateDocValue | fieldLineDocValue>[] = [];
  generalDetailsFields: ICreateDocField<FieldsCreateDocName, FieldsCreateDocValue>[] = [];
  showUserDetailsCard: boolean = false;
  showPatmentDetailsCard: boolean = false;
  serialNumberFile: ISettingDoc;
    DocumentType = DocumentType;

  fileSelected: DocumentType;
  HebrewNameFileSelected: string;
  isInitial: boolean = false;
  // docIndexes: IDocIndexes | null = null;
  docIndexes: IDocIndexes = { docIndex: 0, generalIndex: 0, isInitial: false };
  createPDFIsLoading: boolean = false;
  createPreviewPDFIsLoading: boolean = false;
  addPDFIsLoading: boolean = false;
  userData: IUserData
  amountBeforeVat: number = 0;
  vatAmount: number = 0;
  totalAmount: number = 0;
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

  // Business-related properties
  BusinessMode = BusinessMode;
  businessMode: BusinessMode = BusinessMode.ONE_BUSINESS;
  showBusinessSelector = false;
  businessUiList: ISelectItem[] = [];
  businessFullList: BusinessInfo[] = [];
  selectedBusinessNumber!: string;
  selectedBusinessName!: string;
  selectedBusinessAddress!: string;
  selectedBusinessType!: string;
  selectedBusinessPhone!: string;
  selectedBusinessEmail!: string;

    
  inputsSize = inputsSize;
  buttonSize = ButtonSize;
  buttonColor = ButtonColor;

  showGeneralMoreFields = false;
  showUserMoreFields = false;
  value1 = 50;
  selectedUnit: string = '%';
  value: number = 0;

  // lineItems: LineItem[] = [];
  lineItemsDraft: PartialLineItem[] = [];
initiallinesDocFormValues: FormGroup;
  showInitialIndexDialog = true;
  // private initialIndexSubject?: Subject<IDocIndexes>;
  private initialIndexSubject?: Subject<number>;

  form: FormGroup;
  generalDocForm: FormGroup;
  recipientDocForm: FormGroup;
  linesDocForm: FormGroup;
  paymentForm: FormGroup;
  initialIndexForm: FormGroup;


  readonly DocCreateTypeList = Object.entries(DocTypeDisplayName).map(([value, name]) => ({value, name}));

  bankOptionsList = bankOptionsList;

  readonly paymentMethodList = [
    { value: PaymentMethodValue.BANK_TRANSFER, name: PaymentMethodName.BANK_TRANSFER },
    { value: PaymentMethodValue.CASH, name: PaymentMethodName.CASH },
    { value: PaymentMethodValue.BIT, name: PaymentMethodName.BIT },
    { value: PaymentMethodValue.PAYBOX, name: PaymentMethodName.PAYBOX },
    { value: PaymentMethodValue.CREDIT_CARD, name: PaymentMethodName.CREDIT_CARD },
    { value: PaymentMethodValue.CHECK, name: PaymentMethodName.CHECK },
  ];

  readonly vatOptionList = [
    { value: VatOptions.INCLUDE, name: 'כולל מע"מ' },
    { value: VatOptions.EXCLUDE, name: 'לפני מע"מ' },
    { value: VatOptions.WITHOUT, name: 'ללא מע"מ' },
  ];

  readonly UnitOfMeasureList = [
    { value: UnitOfMeasure.UNIT, name: 'יחידות' },
    { value: UnitOfMeasure.WORK_HOUR, name: 'שעות עבודה' },
    { value: UnitOfMeasure.LITER, name: 'ליטר' },
    { value: UnitOfMeasure.KILOGRAM, name: 'קילוגרם' },
  ];

  readonly CardCompanyList = [
    { value: CardCompany.ISRACARD, name: 'ישראכארט' },
    { value: CardCompany.CAL, name: 'כאל' },
    { value: CardCompany.DINERS, name: 'דיינרס' },
    { value: CardCompany.VISA, name: 'ויזה' },
    { value: CardCompany.LEUMI_CARD, name: 'לאומי קארד' },
    { value: CardCompany.MASTERCARD, name: 'מאסטרקארד' },
    { value: CardCompany.OTHER, name: 'אחר' },
  ];

  readonly CreditTransactionTypeList = [
    { value: CreditTransactionType.REGULAR, name: 'רגיל' },
    { value: CreditTransactionType.INSTALLMENTS, name: 'תשלומים' },
    { value: CreditTransactionType.CREDIT, name: 'קרדיט' },
    { value: CreditTransactionType.DEFERRED_CHARGE, name: 'חיוב נדחה' },
    { value: CreditTransactionType.OTHER, name: 'אחר' },
  ]

  readonly currencyList = [
    { value: Currency.ILS, name: 'שקל' },
    { value: Currency.USD, name: 'דולר' },
    { value: Currency.EUR, name: 'יורו' },
  ];

  paymentMethodTabs: MenuItem[] = [
    { label: 'העברה בנקאית', id: 'BANK_TRANSFER' as any },  // `id` is just an extra field (PrimeNG allows it)
    { label: 'אשראי', id: 'CREDIT_CARD' as any },
    { label: 'צ׳ק', id: 'CHECK' as any },
    { label: 'אפליקציה', id: 'APP' as any },
    { label: 'מזומן', id: 'CASH' as any },
  ];

    activePaymentMethod: MenuItem = this.paymentMethodTabs[0]; // default selected

  paymentInputForm: FormGroup;  // Holds the active entry row
  paymentsDraft: any[] = [];     // Stores all added payments

paymentFieldConfigs: Record<string, PaymentFieldConfig[]> = {
  BANK_TRANSFER: [
    { key: 'paymentDate', label: 'תאריך', type: 'date' },
    { key: 'bankName', label: 'בנק', type: 'dropdown', options: this.bankOptionsList },
    { key: 'branchNumber', label: 'סניף', type: 'text' },
    { key: 'accountNumber', label: 'חשבון', type: 'text' },
    { key: 'paymentAmount', label: 'סכום', type: 'text' }
  ],
  CREDIT_CARD: [
    { key: 'paymentDate', label: 'תאריך', type: 'date' },
    { key: 'cardType', label: 'סוג כרטיס', type: 'text' },
    { key: 'last4Digits', label: '4 ספרות', type: 'text' },
    { key: 'approvalCode', label: 'קוד אישור', type: 'text' },
    { key: 'paymentAmount', label: 'סכום', type: 'text' }
  ],
  CHECK: [
    { key: 'paymentDate', label: 'תאריך', type: 'date' },
    { key: 'bankName', label: 'בנק', type: 'dropdown', options: this.bankOptionsList },
    { key: 'branchNumber', label: 'סניף', type: 'text' },
    { key: 'checkNumber', label: 'מספר צ׳ק', type: 'text' },
    { key: 'paymentAmount', label: 'סכום', type: 'text' }
  ],
  APP: [
    { key: 'paymentDate', label: 'תאריך', type: 'date' },
    { key: 'appName', label: 'אפליקציה', type: 'text' },
    { key: 'reference', label: 'אסמכתא', type: 'text' },
    { key: 'paymentAmount', label: 'סכום', type: 'text' }
  ],
  CASH: [
    { key: 'paymentDate', label: 'תאריך', type: 'date' },
    { key: 'paymentAmount', label: 'סכום', type: 'text' }
  ],
};


  readonly formTypes = FormTypes;


  constructor(private authService: AuthService, private fileService: FilesService, private genericService: GenericService, private modalController: ModalController, private router: Router, public docCreateService: DocCreateService, private formBuilder: FormBuilder, private docCreateBuilderService: DocCreateBuilderService) {

    this.generalDocForm = this.formBuilder.group({
      [DocCreateFields.DOC_TYPE]: new FormControl(
        null, Validators.required,
      ),
      [DocCreateFields.DOC_DATE]: new FormControl(
        null, Validators.required,
      ),
      [DocCreateFields.DOC_DESCRIPTION]: new FormControl(
        null,
      ),
      [DocCreateFields.DOC_VAT_RATE]: new FormControl(
        18, Validators.required,
      ),
    })

    this.recipientDocForm = this.formBuilder.group({
      [DocCreateFields.RECIPIENT_NAME]: new FormControl(
        null, Validators.required,
      ),
      [DocCreateFields.RECIPIENT_ID]: new FormControl(
        null,
      ),
      [DocCreateFields.RECIPIENT_PHONE]: new FormControl(
        null,
      ),
      [DocCreateFields.RECIPIENT_EMAIL]: new FormControl(
        null,
      ),
    })

    this.linesDocForm = this.formBuilder.group({
      [DocCreateFields.LINE_DESCRIPTION]: new FormControl(
        null, Validators.required,
      ),
      [DocCreateFields.LINE_QUANTITY]: new FormControl(
        1, Validators.required,
      ),
      [DocCreateFields.LINE_VAT_TYPE]: new FormControl(
        null, Validators.required,
      ),
      [DocCreateFields.LINE_SUM]: new FormControl(
        null, [Validators.required, Validators.pattern(/^[0-9]*$/)],
      ),
       [DocCreateFields.LINE_DISCOUNT]: new FormControl(
        0, Validators.required,
      ),
    })
    this.initiallinesDocFormValues = this.linesDocForm.getRawValue();


    this.initialIndexForm = this.formBuilder.group({
      initialIndex: new FormControl(
        '', [Validators.required, Validators.pattern(/^\d+$/)]
      ),
    });

    this.paymentForm = this.formBuilder.group({
      bankPayments: this.formBuilder.array([]),
      creditPayments: this.formBuilder.array([]),
      checkPayments: this.formBuilder.array([]),
      appPayments: this.formBuilder.array([]),
    });

    this.createPaymentInputForm(this.activePaymentMethod.id as string);

  }


  ngOnInit() {

    this.userData = this.authService.getUserDataFromLocalStorage();

    const businessData = this.genericService.getBusinessData(this.userData);

    this.businessMode = businessData.mode;
    this.businessUiList = businessData.uiList; // for the selector
    this.businessFullList = businessData.fullList; // for internal details
    this.showBusinessSelector = businessData.showSelector;

    if (this.businessMode === BusinessMode.ONE_BUSINESS) {
      const b = this.businessFullList[0];
      this.setSelectedBusiness(b);
    }

    this.createForms();

    // Subscribe to docDate changes
    this.generalDocForm.get(DocCreateFields.DOC_DATE)?.valueChanges.subscribe((newDocDate) => {
      if (this.paymentInputForm?.get('paymentDate')) {
        this.paymentInputForm.get('paymentDate')?.setValue(newDocDate);
      }
    });

  }


  onConfirmBusinessSelection(): void {

    if (!this.selectedBusinessNumber) {
      throw new Error('No business number was selected.');
    }

    const selected = this.businessFullList.find(b => b.value === this.selectedBusinessNumber);

    if (!selected) {
      throw new Error(`Business number ${this.selectedBusinessNumber} not found.`);
    }

    this.setSelectedBusiness(selected);
    this.showBusinessSelector = false;

  }


  private setSelectedBusiness(business: BusinessInfo): void {
    this.selectedBusinessNumber = business.value;
    this.selectedBusinessName = business.name;
    this.selectedBusinessAddress = business.address;
    this.selectedBusinessType = business.type;
    this.selectedBusinessPhone = business.phone;
    this.selectedBusinessEmail = business.email;
  }


  async onSelectedDoc(event: any): Promise<void> {

    this.fileSelected = event;
    this.HebrewNameFileSelected = this.getHebrewNameDoc(this.fileSelected);
    await this.handleDocIndexes(this.fileSelected);

  }


  // Function for creating the doc and downloading it
  createDoc(): void {

    this.createPDFIsLoading = true;
    const data = this.buildDocPayload();
    
    this.docCreateService.createDoc(data)
      .pipe(
        finalize(() => {
          this.createPDFIsLoading = false;
        }),
        catchError((err) => {
          console.error("Error in createPDF (Create):", err);
          return EMPTY;
        })
      )
      .subscribe((res) => {
        console.log("Update current index result:", res);
        this.fileService.downloadFile("my pdf", res);

        // ✅ Reset all forms
        this.generalDocForm.reset({ [DocCreateFields.DOC_VAT_RATE]: 18 });
        this.recipientDocForm.reset();
        this.linesDocForm.reset(this.initiallinesDocFormValues);
        this.initialIndexForm.reset();
        this.paymentForm.reset();
        (this.paymentForm.get('bankPayments') as FormArray).clear();
        (this.paymentForm.get('creditPayments') as FormArray).clear();
        (this.paymentForm.get('checkPayments') as FormArray).clear();
        (this.paymentForm.get('appPayments') as FormArray).clear();

        // ✅ Clear local draft arrays
        this.lineItemsDraft = [];
        this.paymentsDraft = [];

        this.fileSelected = null;
        this.HebrewNameFileSelected = null;

        });

  }


  previewtDoc(): void {

    this.createPreviewPDFIsLoading = true;
    const data = this.buildDocPayload();
    
    this.docCreateService.previewDoc(data)
      .pipe(
        finalize(() => {
          this.createPreviewPDFIsLoading = false;
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


  private buildDocPayload(): DocPayload {

    if (!this.CreateDocIsValid) {
      throw new Error('Cannot collect document data: forms are invalid or incomplete.');
    }

    let docPayload: DocPayload;

    const issuerBusinessNumber = this.selectedBusinessNumber;
    const issuerName = this.selectedBusinessName;
    const issuerAddress = this.selectedBusinessAddress;
    const issuerPhone = this.selectedBusinessPhone;
    const issuerEmail = this.selectedBusinessEmail;

    const docNumber = this.docIndexes.docIndex;
    const generalDocIndex = this.docIndexes.generalIndex;
    const hebrewNameDoc = this.getHebrewNameDoc(this.fileSelected);

    docPayload = {
      docData: {
        ...this.generalDocForm.value,
        ...this.recipientDocForm.value,
        issuerBusinessNumber,
        issuerName,
        issuerAddress,
        issuerPhone,
        issuerEmail,
        docNumber,
        generalDocIndex,
        hebrewNameDoc,
        sumBefDisBefVat: this.documentTotals().sumBefDisBefVat,
        disSum: this.documentTotals().disSum,
        sumAftDisBefVAT: this.documentTotals().sumAftDisBefVat,
        vatSum: this.documentTotals().vatSum,
        sumAftDisWithVAT: this.documentTotals().sumAftDisWithVat,
      },
      linesData: this.lineItemsDraft,
      paymentData: this.paymentsDraft,
    };

    console.log("🚀 ~ DocCreatePage ~ buildDocPayload ~ docPayload", docPayload);

    return docPayload;

  }


  addLineDetails(): void {

    const formValue = this.linesDocForm.value;
    console.log("Adding line with form value:", formValue);

    const lineIndex = this.lineItemsDraft.length;
    const transType = "3";

    const newLine: PartialLineItem = {
      issuerBusinessNumber: this.selectedBusinessNumber,
      generalDocIndex: String(this.docIndexes.generalIndex),
      lineNumber: lineIndex + 1,
      description: formValue.lineDescription,
      unitQuantity: formValue.lineQuantity,
      sum: formValue.lineSum,
      discount: formValue.lineDiscount,
      vatOpts: formValue.lineVatType,
      vatRate: this.generalDocForm.value[DocCreateFields.DOC_VAT_RATE],
      docType: this.generalDocForm.value[DocCreateFields.DOC_TYPE],
      transType: transType,
    };

    this.lineItemsDraft.push(newLine);
    this.calculateVatFieldsForLine(lineIndex);
    this.updateDocumentTotalsFromLines();
    this.linesDocForm.reset(this.initiallinesDocFormValues);
    const docDate = this.generalDocForm.get(DocCreateFields.DOC_DATE)?.value ?? null;
    this.createPaymentInputForm(this.activePaymentMethod.id as string, docDate);

  }


  private calculateVatFieldsForLine(lineIndex: number): void {

    const line = this.lineItemsDraft[lineIndex];
    const quantity = line.unitQuantity ?? 1;
    const unitSum = line.sum ?? 0;
    const discount = line.discount ?? 0;
    const vatOption = line.vatOpts;
    const vatRate = line.vatRate ?? 0;

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
      sumBefVatPerUnit,
      disBefVatPerLine,
      sumAftDisBefVatPerLine,
      vatPerLine,
      sumAftDisWithVat,
    });
  }


readonly documentTotals = signal<DocumentTotals>({
  sumBefDisBefVat: 0,
  disSum: 0,
  sumAftDisBefVat: 0,
  vatSum: 0,
  sumAftDisWithVat: 0,
});


readonly visibleDocumentTotals = computed(() => {
  const totals = this.documentTotals();
  return DocumentTotalsLabels
    .map((item) => ({
      field: item.field,
      label: item.label,
      value: totals[item.field] ?? 0,
    }))
    .filter((item) => item.value !== 0);
});


updateDocumentTotalsFromLines(): void {

  const totals: DocumentTotals = {
    sumBefDisBefVat: 0,
    disSum: 0,
    sumAftDisBefVat: 0,
    vatSum: 0,
    sumAftDisWithVat: 0,
  };

  for (const line of this.lineItemsDraft) {
    totals.sumBefDisBefVat += Number(line.sumBefVatPerUnit ?? 0);
    totals.disSum += Number(line.disBefVatPerLine ?? 0);
    totals.sumAftDisBefVat += Number(line.sumAftDisBefVatPerLine ?? 0);
    totals.vatSum += Number(line.vatPerLine ?? 0);
    totals.sumAftDisWithVat += Number(line.sumAftDisWithVat ?? 0);
  }

  this.documentTotals.set(totals);
}


  createPaymentInputForm(paymentMethod: string, docDate: Date | null = null): void {

    const sum = this.documentTotals().sumAftDisWithVat;
      
    switch (paymentMethod) {
      case 'BANK_TRANSFER':
        this.paymentInputForm = this.formBuilder.group({
          paymentDate: [docDate, Validators.required],
          bankName: [null, Validators.required],
          branchNumber: [null],
          accountNumber: [null],
          paymentAmount: [sum, [Validators.required, Validators.min(0.01)]],
          paymentMethod: [paymentMethod]
        });
        break;

      case 'CREDIT_CARD':
        this.paymentInputForm = this.formBuilder.group({
          paymentDate: [docDate, Validators.required],
          cardType: [null, Validators.required],
          last4Digits: [null, [Validators.required, Validators.pattern(/^\d{4}$/)]],
          approvalCode: [null, Validators.required],
          paymentAmount: [null, [Validators.required, Validators.min(0.01)]],
          paymentMethod: [paymentMethod]
        });
        break;

      case 'CHECK':
        this.paymentInputForm = this.formBuilder.group({
          paymentDate: [docDate, Validators.required],
          bankName: [null, Validators.required],
          branchNumber: [null, Validators.required],
          checkNumber: [null, [Validators.required, Validators.pattern(/^\d+$/)]],
          paymentAmount: [null, [Validators.required, Validators.min(0.01)]],
          paymentMethod: [paymentMethod]
        });
        break;

      case 'APP':
        this.paymentInputForm = this.formBuilder.group({
          paymentDate: [docDate, Validators.required],
          appName: [null, Validators.required],
          reference: [null, Validators.required],
          paymentAmount: [null, [Validators.required, Validators.min(0.01)]],
          paymentMethod: [paymentMethod]
        });
        break;

      case 'CASH':
        this.paymentInputForm = this.formBuilder.group({
          paymentDate: [docDate, Validators.required],
          paymentAmount: [null, [Validators.required, Validators.min(0.01)]],
          paymentMethod: [paymentMethod]
        });
        break;
    }
  }


  onPaymentMethodChange(paymentMethod: MenuItem): void {
    this.activePaymentMethod = paymentMethod;
    const docDate = this.generalDocForm.get(DocCreateFields.DOC_DATE)?.value ?? null;
    this.createPaymentInputForm(this.activePaymentMethod.id as string, docDate);
  }


  addPayment(): void {

    const paymentFormValue = this.paymentInputForm.value;
    const paymentLineIndex = this.paymentsDraft.length;

    const selectedBank = bankOptionsList.find(bank => bank.value === paymentFormValue.bankName);
    const hebrewBankName = selectedBank ? selectedBank.name : '';
    const bankNumber     = selectedBank?.number ?? '';

    // Build the full payment entry with extra fields
    const paymentEntry = {
      ...paymentFormValue,
      issuerBusinessNumber: this.selectedBusinessNumber,
      generalDocIndex: String(this.docIndexes.generalIndex),
      paymentLineNumber: paymentLineIndex + 1,
      paymentMethod: this.activePaymentMethod.id, // Track which payment method was selected
      hebrewBankName,  // Save the Hebrew name for later use (display / backend)
      bankNumber
    };

    this.paymentsDraft.push(paymentEntry);

    // Reset the form for the next payment entry
    const docDate = this.generalDocForm.get(DocCreateFields.DOC_DATE)?.value ?? null;
    this.paymentForm.reset();
    this.createPaymentInputForm(this.activePaymentMethod.id as string, docDate);

  }


  deleteLine(index: number): void {
    this.lineItemsDraft.splice(index, 1);
    this.updateDocumentTotalsFromLines();
  }


  getVatLabel(type: VatOptions): string {
    switch (type) {
      case VatOptions.INCLUDE: return 'כולל מע״מ';
      case VatOptions.EXCLUDE: return 'לא כולל מע״מ';
      case VatOptions.WITHOUT: return 'ללא מע״מ';
      default: return '';
    }
  }


  get generalDetailsForm(): FormGroup {
    return this.myForm.get('GeneralDetails') as FormGroup;
  }


  get userDetailsForm(): FormGroup {
    return this.myForm.get('UserDetails') as FormGroup;
  }


  selectUnit(unit: string) {
    this.selectedUnit = unit;
  }


  createForms(): void {
    this.myForm = this.docCreateBuilderService.buildDocCreateForm(['GeneralDetails', 'UserDetails']);
    this.generalArray = this.docCreateBuilderService.getBaseFieldsBySection('GeneralDetails');
    this.userArray = this.docCreateBuilderService.getBaseFieldsBySection('UserDetails');
    this.paymentsArray = this.docCreateBuilderService.getBaseFieldsBySection(this.paymentSectionName);
    // this.paymentsArray[0] = this.docCreateBuilderService.getBaseFieldsBySection(this.paymentSectionName);
  }


  onClickInitialIndex(): void {

    const initialIndex = this.initialIndexForm.get('initialIndex')?.value;

    this.docIndexes.docIndex = initialIndex;
    this.isInitial = false;
    this.showInitialIndexDialog = false;

    console.log('Initial index selected:', this.docIndexes);

    // Resolve the waiting Subject so onSelectedDoc can continue
    this.initialIndexSubject?.next(this.docIndexes.docIndex);
    this.initialIndexSubject?.complete();
    this.initialIndexSubject = undefined;
  }



  getHebrewNameDoc(typeDoc: DocumentType): string {
    return DocTypeDisplayName[typeDoc];
  }


  private async handleDocIndexes(docType: DocumentType): Promise<void> {
    try {
      const res = await firstValueFrom(this.docCreateService.getDocIndexes(docType));
      this.isInitial = res.isInitial;

      console.log("res in handleDocIndexes:", res);
      

      // Save general index always (used for internal doc ID)
      this.docIndexes.generalIndex = res.generalIndex;

      if (res.isInitial) {
        const defaultIndex = DocTypeDefaultStart[docType] ?? 100001;
        this.initialIndexForm.get('initialIndex')?.setValue(defaultIndex);

        // Show popup and wait for user input
        this.showInitialIndexDialog = true;
        this.initialIndexSubject = new Subject<number>();

        const selectedDocIndex = await firstValueFrom(this.initialIndexSubject);

        // Save selected doc index
        this.docIndexes.docIndex = selectedDocIndex;

      } else {
        // Use backend-provided value
        this.docIndexes.docIndex = res.docIndex;
      }

    } catch (err) {
      console.error('Error fetching doc indexes:', err);
      throw err;
    }
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


  get CreateDocIsValid(): boolean {

    return (
      this.generalDocForm.valid &&
      this.recipientDocForm.valid &&
      this.lineItemsDraft.length > 0 &&
      (!this.isDocWithPayments() || this.paymentsDraft.length > 0)
    );
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
    console.log(this.userDetailsForm);
    
    this.isUserExpanded = !this.isUserExpanded;
    if (this.isUserExpanded) {
      this.docCreateBuilderService.addFormControlsByExpandedSection(this.userDetailsForm, 'UserDetails');
      this.userArray = this.docCreateBuilderService.getAllFieldsBySection('UserDetails');
    }
    else {
      this.docCreateBuilderService.removeFormControlsByExpandedSection(this.userDetailsForm, 'UserDetails');
      this.userArray = this.docCreateBuilderService.getBaseFieldsBySection('UserDetails');
    }
  }


  getDropdownItems(controlValue: string): ISelectItem[] {
    switch (controlValue) {
      case FieldsCreateDocValue.CURRENCY:
        return this.currencyList;
      case fieldLineDocValue.PAYMENT_METHOD:
        return this.paymentMethodList;
      case fieldLineDocValue.VAT_OPTIONS:
        return this.vatOptionList;
      case fieldLineDocValue.UNIT_TYPE:
        return this.UnitOfMeasureList;
      case fieldLineDocValue.CARD_COMPANY:
        return this.CardCompanyList;
      case fieldLineDocValue.CREDIT_TRANS_TYPE:
        return this.CreditTransactionTypeList;
      default:
        return [];
    }
  }


  isDocWithPayments(): boolean {
    return [
      DocumentType.RECEIPT,
      DocumentType.TAX_INVOICE_RECEIPT,
    ].includes(this.fileSelected);
  }


}