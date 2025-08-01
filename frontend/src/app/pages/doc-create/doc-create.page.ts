import { Component, OnInit, signal } from '@angular/core';
import { FormArray, FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { EMPTY, Observable, Subject, catchError, finalize, firstValueFrom, forkJoin, from, map, of, switchMap, tap } from 'rxjs';
import { CardCompany, CreditTransactionType, Currency, fieldLineDocName, fieldLineDocValue, FieldsCreateDocName, FieldsCreateDocValue, FormTypes, PaymentMethodName, PaymentMethodValue, UnitOfMeasure, VatOptions } from 'src/app/shared/enums';
import { Router } from '@angular/router';
import { ICreateDataDoc, ICreateDocField, ICreateLineDoc, IDataDocFormat, IDocIndexes, ISelectItem, ISettingDoc, ITotals, IUserData, } from 'src/app/shared/interface';
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
import { RegisterFormControls } from '../register/regiater.enum';
import { bankOptionsList, DocCreateFields, DocTypeDefaultStart, DocTypeDisplayName, DocumentTotalsField, DocumentTotalsLabels, LineItem, PartialLineItem } from './doc-cerate.enum';
import { MenuItem } from 'primeng/api';

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
  fileSelected: string;
  HebrewNameFileSelected: string;
  isInitial: boolean = false;
  //docDetails: ISettingDoc;
  docIndexes: IDocIndexes | null = null;
  createPDFIsLoading: boolean = false;
  createPreviewPDFIsLoading: boolean = false;
  addPDFIsLoading: boolean = false;
  userDetails: IUserData
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

  inputsSize = inputsSize;
  buttonSize = ButtonSize;
  buttonColor = ButtonColor;

  showGeneralMoreFields = false;
  showUserMoreFields = false;
  value1 = 50;
  selectedUnit: string = '%';
  value: number = 0;

  lineItems: LineItem[] = [];
  lineItemsDraft: PartialLineItem[] = [];

  showInitialIndexDialog = false;
  private initialIndexSubject?: Subject<IDocIndexes>;

  form: FormGroup;
  generalDocForm: FormGroup;
  customerDocForm: FormGroup;
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
    { label: 'העברה בנקאית', id: 'BANK' as any },  // `id` is just an extra field (PrimeNG allows it)
    { label: 'אשראי', id: 'CREDIT' as any },
    { label: 'צ׳ק', id: 'CHECK' as any },
    { label: 'אפליקציה', id: 'APP' as any },
  ];

    activePaymentMethod: MenuItem = this.paymentMethodTabs[0]; // default selected

  paymentInputForm: FormGroup;  // Holds the active entry row
  paymentsDraft: any[] = [];     // Stores all added payments

  // activePaymentMethod = this.paymentMethodTabs[0]; // Default active payment method
  // activePaymentMethod: PaymentTab = this.paymentMethodTabs[0];


paymentFieldConfigs: Record<string, PaymentFieldConfig[]> = {
  BANK: [
    { key: 'paymentDate', label: 'תאריך', type: 'date' },
    { key: 'bankName', label: 'בנק', type: 'dropdown', options: this.bankOptionsList },
    { key: 'branchNumber', label: 'סניף', type: 'text' },
    { key: 'accountNumber', label: 'חשבון', type: 'text' },
    { key: 'paymentAmount', label: 'סכום', type: 'text' }
  ],
  CREDIT: [
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
  ]
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
        null, Validators.required,
      ),
      [DocCreateFields.DOC_VAT_RATE]: new FormControl(
        18, Validators.required,
      ),
    })

    this.customerDocForm = this.formBuilder.group({
      [DocCreateFields.CUSTOMER_NAME]: new FormControl(
        null, Validators.required,
      ),
      [DocCreateFields.CUSTOMER_ID]: new FormControl(
        null, Validators.required,
      ),
      [DocCreateFields.CUSTOMER_PHONE]: new FormControl(
        null, Validators.required,
      ),
      [DocCreateFields.CUSTOMER_EMAIL]: new FormControl(
        null, Validators.required,
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
        null, Validators.required,
      ),
      // [DocCreateFields.LINE_DISCOUNT_TYPE]: new FormControl(
      //   null, Validators.required,
      // ),
       [DocCreateFields.LINE_DISCOUNT]: new FormControl(
        null, Validators.required,
      ),
    })

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
    this.userDetails = this.authService.getUserDataFromLocalStorage();
    this.createForms();
  }


  async onSelectedDoc(event: any): Promise<void> {

    this.fileSelected = event;
    console.log('onSelectedDoc: fileSelected is', this.fileSelected);

    this.HebrewNameFileSelected = this.getHebrewNameDoc(this.fileSelected);

    await this.handleDocIndexes(this.fileSelected);
    console.log("docIndexes is", this.docIndexes);

  }


  //////////////////////////////////////////// New functions ////////////////////////////////////////////

  addLineDetails(): void {

    const formValue = this.linesDocForm.value; // <-- get all field values directly
    console.log("Adding line with form value:", formValue);

    const lineIndex = this.lineItemsDraft.length;

    const newLine: PartialLineItem = {
      lineNumber: lineIndex + 1,
      description: formValue.lineDescription,
      unitQuantity: formValue.lineQuantity,
      sum: formValue.lineSum,
      discount: formValue.lineDiscount,
      vatOpts: formValue.lineVatType,
      vatRate: this.generalDocForm.value[DocCreateFields.DOC_VAT_RATE],
    };

    this.lineItemsDraft.push(newLine);
    this.calculateVatFieldsForLine(lineIndex);

  }


  private calculateVatFieldsForLine(lineIndex: number): void {

    const line = this.lineItemsDraft[lineIndex];
    const quantity = line.unitQuantity ?? 1;
    const sum = line.sum ?? 0;
    const discount = line.discount ?? 0;
    const vatOption = line.vatOpts ?? 'INCLUDE';
    const vatRate = line.vatRate ?? 18;

    const lineGross = sum * quantity;

    let sumBefVat = 0;
    let sumAftVat = 0;
    let sumWithoutVat = 0;
    let disBefVat = 0;
    let vat = 0;
    let sumAftDisWithVat = 0;

    switch (vatOption) {
      case 'INCLUDE': {
        sumBefVat = lineGross / (1 + vatRate / 100);
        sumWithoutVat = 0;
        disBefVat = discount / (1 + vatRate / 100);
        const netAfterDiscountInc = lineGross - discount;
        vat = netAfterDiscountInc - (netAfterDiscountInc / (1 + vatRate / 100));
        sumAftDisWithVat = netAfterDiscountInc;
        break;
      }

      case 'EXCLUDE': {
        sumBefVat = lineGross;
        sumWithoutVat = 0;
        disBefVat = discount;
        const netAfterDiscountExc = lineGross - discount;
        vat = netAfterDiscountExc * (vatRate / 100);
        sumAftDisWithVat = netAfterDiscountExc + vat;
        break;
      }

      case 'WITHOUT': {
        sumBefVat = lineGross;
        sumAftVat = lineGross;
        sumWithoutVat = lineGross - discount;
        disBefVat = discount;
        vat = 0;
        sumAftDisWithVat = lineGross - discount;
        break;
      }

      default:
        throw new Error(`Unhandled VAT option: ${vatOption}`);
    }

    Object.assign(line, {
      sumBefVat,
      sumAftVat,
      sumWithoutVat,
      disBefVat,
      vat,
      sumAftDisWithVat,
    });

    console.log("line is ", this.lineItemsDraft[lineIndex]);
    
  }


  //Getter for document totals (auto-calculated on the fly).
  get documentTotals() {

    const totals = {
      [DocumentTotalsField.TOTAL_BEFORE_VAT]: 0,
      [DocumentTotalsField.TOTAL_AFTER_VAT]: 0,
      [DocumentTotalsField.TOTAL_WITHOUT_VAT]: 0,
      [DocumentTotalsField.TOTAL_VAT]: 0,
    };

    this.lineItemsDraft.forEach((line) => {

      const sumBefVat = line.sumBefVat ?? 0;
      const sumAftVat = line.sumAftDisWithVat ?? 0;
      const sumWithoutVat = line.sumWithoutVat ?? 0;
      const vat = line.vat ?? 0;

      totals[DocumentTotalsField.TOTAL_BEFORE_VAT] += sumBefVat;
      totals[DocumentTotalsField.TOTAL_AFTER_VAT] += sumAftVat;
      totals[DocumentTotalsField.TOTAL_WITHOUT_VAT] += sumWithoutVat;
      totals[DocumentTotalsField.TOTAL_VAT] += vat;

    });

    return totals;

  }


  get visibleDocumentTotals() {

    const totals = this.documentTotals;

    // Map the totals into the ordered array using the labels array
    return DocumentTotalsLabels
      .map((item) => ({
        field: item.field,
        label: item.label,
        value: totals[item.field] ?? 0,
      }))
      .filter((item) => item.value !== 0); // Optional: hide zeros
  }


    createPaymentInputForm(method: string): void {
    switch (method) {
      case 'BANK':
        this.paymentInputForm = this.formBuilder.group({
          paymentDate: [null, Validators.required],
          bankName: [null, Validators.required],
          branchNumber: [null, Validators.required],
          accountNumber: [null, Validators.required],
          paymentAmount: [null, [Validators.required, Validators.min(0.01)]],
          method: [method]
        });
        break;

      case 'CREDIT':
        this.paymentInputForm = this.formBuilder.group({
          paymentDate: [null, Validators.required],
          cardType: [null, Validators.required],
          last4Digits: [null, [Validators.required, Validators.pattern(/^\d{4}$/)]],
          approvalCode: [null, Validators.required],
          paymentAmount: [null, [Validators.required, Validators.min(0.01)]],
          method: [method]
        });
        break;

      case 'CHECK':
        this.paymentInputForm = this.formBuilder.group({
          paymentDate: [null, Validators.required],
          bankName: [null, Validators.required],
          branchNumber: [null, Validators.required],
          checkNumber: [null, [Validators.required, Validators.pattern(/^\d+$/)]],
          paymentAmount: [null, [Validators.required, Validators.min(0.01)]],
          method: [method]
        });
        break;

      case 'APP':
        this.paymentInputForm = this.formBuilder.group({
          paymentDate: [null, Validators.required],
          appName: [null, Validators.required],
          reference: [null, Validators.required],
          paymentAmount: [null, [Validators.required, Validators.min(0.01)]],
          method: [method]
        });
        break;
    }
  }


  onPaymentMethodChange(method: MenuItem): void {
    this.activePaymentMethod = method;
    this.createPaymentInputForm(method.id as string);
  }


  addPayment(): void {
    this.paymentsDraft.push(this.paymentInputForm.value);
    this.createPaymentInputForm(this.activePaymentMethod.id as string); // reset for next entry
  }


  deleteLine(index: number): void {
    this.lineItems.splice(index, 1);
  }


  getVatLabel(type: VatOptions): string {
    switch (type) {
      case VatOptions.INCLUDE: return 'כולל מע״מ';
      case VatOptions.EXCLUDE: return 'לא כולל מע״מ';
      case VatOptions.WITHOUT: return 'ללא מע״מ';
      default: return '';
    }
  }


  get paymentsFormArray(): FormArray {
    return this.myForm.get(this.paymentSectionName) as FormArray;
  }

  get generalDetailsForm(): FormGroup {
    return this.myForm.get('GeneralDetails') as FormGroup;
  }

  get userDetailsForm(): FormGroup {
    return this.myForm.get('UserDetails') as FormGroup;
  }

  // addPayment(): void {
  //   this.docCreateBuilderService.addFormGroupToFormArray(this.paymentsFormArray, this.paymentSectionName);
  //   console.log(this.myForm);
  //   this.paymentsArray[this.paymentsArray.length] = this.docCreateBuilderService.getBaseFieldsBySection(this.paymentSectionName);
  //   console.log("🚀 ~ DocCreatePage ~ addPayment ~ this.paymentsArray:", this.paymentsArray)
  // }

  // removePayment(index: number): void {
  //   this.docCreateBuilderService.removeFormGroupFromFormArray(this.paymentsFormArray, index);
  //   this.paymentsArray.splice(index, 1);
  // }

  selectUnit(unit: string) {
    this.selectedUnit = unit;
  }

  getPaymentFormByIndex(index: number): FormGroup {
    return this.paymentsFormArray.at(index) as FormGroup;
  }



  // createForms(): void {
  //   this.myForm = this.docCreateBuilderService.buildDocCreateForm(['GeneralDetails', 'UserDetails', this.paymentSectionName]);
  //   this.paymentsArray[0] = this.docCreateBuilderService.getBaseFieldsBySection(this.paymentSectionName);
  //   this.generalArray = this.docCreateBuilderService.getBaseFieldsBySection('GeneralDetails');
  //   this.userArray = this.docCreateBuilderService.getBaseFieldsBySection('UserDetails');
  // }

  createForms(): void {
    this.myForm = this.docCreateBuilderService.buildDocCreateForm(['GeneralDetails', 'UserDetails']);
    this.generalArray = this.docCreateBuilderService.getBaseFieldsBySection('GeneralDetails');
    this.userArray = this.docCreateBuilderService.getBaseFieldsBySection('UserDetails');
    this.paymentsArray = this.docCreateBuilderService.getBaseFieldsBySection(this.paymentSectionName);
    // this.paymentsArray[0] = this.docCreateBuilderService.getBaseFieldsBySection(this.paymentSectionName);
  }


  onClickInitialIndex(): void {

    const initialIndex = this.initialIndexForm.value;

    this.docCreateService.setInitialDocDetails(this.fileSelected, initialIndex)
      .subscribe({
        next: (res: IDocIndexes) => {
          this.docIndexes = res; // Backend returns both docIndex & generalIndex
          this.isInitial = false;
          this.showInitialIndexDialog = false;

          console.log('Initial index saved:', this.docIndexes);

          // Resolve the waiting Subject so onSelectedDoc can continue
          this.initialIndexSubject?.next(this.docIndexes);
          this.initialIndexSubject?.complete();
          this.initialIndexSubject = undefined;
        },
        error: (err) => {
          console.error('Failed to set initial index:', err);
          this.initialIndexSubject?.error(err);
          this.initialIndexSubject = undefined;
        }
    });
  }



  // showAllFields(): void {
  //   this.showMoreFields = !this.showMoreFields;
  // }


  // getHebrewNameDoc(typeDoc: string): void {
  //   const temp = this.DocCreateTypeList.find((doc) => doc.value === typeDoc);
  //   if (temp) this.HebrewNameFileSelected = temp.name;
  // }

  // getHebrewNameDoc(typeDoc: string): string {
  //   return this.DocCreateTypeList.find((doc) => doc.value === typeDoc)?.name;
  // }


  getHebrewNameDoc(typeDoc: string): string {
    return (DocTypeDisplayName as Record<string, string>)[typeDoc] ?? (() => { throw new Error(`Invalid document type: ${typeDoc}`); })();
  }


  private async handleDocIndexes(docType: string): Promise<IDocIndexes> {
    try {
      const res = await firstValueFrom(this.docCreateService.getDocIndexes(docType));
      this.docIndexes = res;

      if (res.isInitial) {
        // Pre-fill default index and show dialog
        const defaultIndex = DocTypeDefaultStart[docType];
        this.initialIndexForm.get('initialIndex')?.setValue(defaultIndex);
        this.showInitialIndexDialog = true;

        // Wait until the user confirms the popup
        this.initialIndexSubject = new Subject<IDocIndexes>();
        return await firstValueFrom(this.initialIndexSubject);
      }

      return res; // Not first doc, just return the indexes
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


  getDocData(): IDataDocFormat {

    const generalFormData = this.generalDetailsForm.value;
    const userFormData = this.userDetailsForm.value;
    const payments = this.paymentsFormArray.value;

    let totalBefDisBefVat = 0;
    let totalDisBefVat = 0;
    let totalAftDisBefVat = 0;
    let totalVat = 0;
    let totalAfterVat = 0;
    let lineNumber = 0; 
  
    const createLinesDoc: ICreateLineDoc[] = payments.map((payment: any) => {

      let sumBefDisBefVatPerLine = 0;
      let disBefVatPerLine = 0;
      let sumAftDisBefVatPerLine = 0; 
      let sumAftDisWithVatPerLine = 0; 
      //let sumAftDisWithVat = 0;
      let vatPerLine = 0;
      const sum = Number(payment?.sum) * Number(payment?.unitAmount ?? 1);
      const discount = Number(payment?.discount ?? 0);
  
      if (payment?.vatOptions === 'INCLUDE') {
        sumBefDisBefVatPerLine = sum / (1 + Number(payment?.vatRate ?? 18) / 100);
        disBefVatPerLine = discount / (1 + Number(payment?.vatRate ?? 18) / 100);
        vatPerLine = (sumBefDisBefVatPerLine - disBefVatPerLine) * (Number(payment?.vatRate ?? 18) / 100);
      } else if (payment?.vatOptions === 'EXCLUDE') {
        sumBefDisBefVatPerLine = sum;
        disBefVatPerLine = discount;
        vatPerLine = (sum - discount) * (Number(payment?.vatRate ?? 18) / 100);
      } else if (payment?.vatOptions === 'WITHOUT') {
        sumBefDisBefVatPerLine = sum;
        disBefVatPerLine = discount;
        vatPerLine = 0;
      } else {
        sumBefDisBefVatPerLine = 0;
      }
      
      sumAftDisBefVatPerLine = sumBefDisBefVatPerLine - disBefVatPerLine;
      sumAftDisWithVatPerLine = sumAftDisBefVatPerLine + vatPerLine;

      totalBefDisBefVat += sumBefDisBefVatPerLine;
      totalDisBefVat += disBefVatPerLine;
      totalAftDisBefVat += sumAftDisBefVatPerLine;
      totalVat += vatPerLine;
      totalAfterVat += sumAftDisWithVatPerLine;

      lineNumber++;
  
      return {
        issuerbusinessNumber: this.userDetails?.businessNumber,
        generalDocIndex: this.docIndexes?.generalIndex.toString(),
        description: payment?.description || null,
        unitAmount: payment?.unitAmount ?? 1,
        sumBefVat: sumAftDisBefVatPerLine,
        sumAftDisWithVat: sumAftDisWithVatPerLine,
        vatOpts: payment?.vatOptions,
        vatRate: payment?.vatRate ?? 18,
        paymentMethod: payment?.paymentMethod,
        disBefVat: payment?.discount ?? 0,
        lineNumber: lineNumber.toString(),
        unitType: payment?.unitType ?? 1,
        payDate: generalFormData.documentDate,
        bankNumber: payment?.bankNumber || null,
        branchNumber: payment?.branchNumber || null,
        accountNumber: payment?.accountNumber || null,
        checkNumber: payment?.checkNumber || null,
        paymentCheckDate: payment?.paymentCheckDate || null,
        cardCompany: payment.cardCompany || null,
        card4Number: payment?.card4Number || null,
        creditCardName: payment?.creditCardName || null,
        creditTransType: payment?.creditTransType || null,
        creditPayNumber: payment?.creditPayNumber || null,
        manufacturerName: payment?.manufacturerName || null,
        productSerialNumber: payment?.productSerialNumber || null,
        internalNumber: payment?.internalNumber || null,
        journalEntryMainId: payment?.journalEntryMainId || null,
      };
    });
  
    const data = {
      fileData: {
        issuerName: this.userDetails?.businessName,
        issuerAddress: this.userDetails?.city,
        issuerPhone: this.userDetails?.phone,
        issuerEmail: this.userDetails?.email,
        hebrewNameDoc: this.getHebrewNameDoc(this.fileSelected)
      },
      docData: {
        issuerbusinessNumber: this.userDetails?.businessNumber,
        recipientName: userFormData?.recipientName,
        recipientId: userFormData?.recipientId || null,
        recipientStreet: userFormData?.recipientStreet || null,
        recipientHomeNumber: userFormData?.recipientHomeNumber || null,
        recipientCity: userFormData?.recipientCity || null,
        recipientPostalCode: userFormData?.recipientPostalCode || null,
        recipientState: userFormData?.recipientState || null,
        recipientStateCode: userFormData?.recipientStateCode || null,
        recipientPhone: userFormData?.recipientPhone || null,
        recipientEmail: userFormData?.recipientEmail || null,
        docType: this.fileSelected,
        generalDocIndex: this.docIndexes?.generalIndex.toString(),
        docDescription: generalFormData?.docDescription,
        docNumber: this.docIndexes?.docIndex.toString(),
        docVatRate: 18,
        transType: 3,
        amountForeign: this.totalAmount,
        currency: generalFormData?.currency || 'ILS',
        sumBefDisBefVat: totalBefDisBefVat,
        disSum: 0,
        sumAftDisBefVAT: totalAftDisBefVat,
        vatSum: totalVat,
        sumAftDisWithVAT: totalAfterVat,
        withholdingTaxAmount: 0,
        docDate: generalFormData.documentDate,
        issueDate: generalFormData.documentDate,
        issueHour: generalFormData.documentHour,
        customerKey: null,
        matchField: null,
        isCancelled: false,
        branchCode: null,
        operationPerformer: null,
        parentDocType: null,
        parentDocNumber: null,
        parentBranchCode: null,
      },
      linesData: createLinesDoc,
    };
  
    return data;
  }
  

  // Function for previewing the doc
  previewtDoc(): void {
    this.createPreviewPDFIsLoading = true;
    const data = this.getDocData();

    this.docCreateService.generatePDF(data)
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
        this.fileService.previewFile1(res);
      });
  }

  // Function for creating the doc and downloading it
  createDoc(): void {
    this.createPDFIsLoading = true;
    const data = this.getDocData();
    console.log("Debug - data is ", data);
    
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
      });
  }


  getFid(): string {
    switch (this.fileSelected) {
      case 'RECEIPT':
        return "RVxpym2O68";
      case 'TAX_INVOICE':
        return "";
      case 'TAX_INVOICE_RECEIPT':
        return "";
      case 'TRANSACTION_INVOICE':
        return "";
      case 'CREDIT_INVOICE':
        return "";
    }
    return null;
  }

  onBlur(field: string, i: number): void {
    const vatOptionControl = this.paymentsFormArray.controls[i]?.get(fieldLineDocValue.VAT_OPTIONS);
    if (!vatOptionControl.value) return; // If don't choosen vat option
    if (field !== "sum") return; // If it is not "sum" field
    this.onVatOptionChange(vatOptionControl, i)
    console.log("on blur");

  }


  onVatOptionChange(event: any, formIndex: number): void {
    console.log("🚀 ~ DocCreatePage ~ onVatOptionChange ~ value:", event.value)
    const sumControl = this.paymentsFormArray.controls[formIndex]?.get(fieldLineDocValue.SUM);
    if (!sumControl) return;

    const sum = parseFloat(sumControl.value);
    if (isNaN(sum)) return;

    this.amountBeforeVat = 0;
    this.vatAmount = 0;
    this.totalAmount = 0;

    switch (event.value) {
      case 'BEFORE':
        this.amountBeforeVat = sum;
        this.vatAmount = this.calculateVatAmountBeforVat(sum);
        this.totalAmount = sum + this.vatAmount;
        break;
      case 'AFTER':
        this.totalAmount = sum;
        this.vatAmount = this.calculateVatAmountAfterVat(sum);
        this.amountBeforeVat = this.calculateSumAfterVat(sum);
        break;
      case 'WITH_OUT':
        this.amountBeforeVat = sum;
        this.vatAmount = 0;
        this.totalAmount = sum;
        break;
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

}