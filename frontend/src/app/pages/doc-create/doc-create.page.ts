import { Component, computed, OnInit, Signal, signal } from '@angular/core';
import { FormArray, FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { EMPTY, Observable, Subject, catchError, finalize, firstValueFrom, forkJoin, from, map, of, startWith, switchMap, tap } from 'rxjs';
import { BusinessMode, CardCompany, fieldLineDocName, fieldLineDocValue, FieldsCreateDocName, FieldsCreateDocValue, FormTypes, PaymentMethodName, paymentMethodOptions, UnitOfMeasure, vatOptions, VatType } from 'src/app/shared/enums';
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
import { toSignal } from '@angular/core/rxjs-interop';

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
export class DocCreatePage implements OnInit {

  paymentsDetailsForm: FormGroup;
  myForm: FormGroup;
  userDetailsFields: ICreateDocField<FieldsCreateDocName, FieldsCreateDocValue>[] = [];
  paymentDetailsFields: ICreateDocField<FieldsCreateDocName | fieldLineDocName, FieldsCreateDocValue | fieldLineDocValue>[] = [];
  generalDetailsFields: ICreateDocField<FieldsCreateDocName, FieldsCreateDocValue>[] = [];
  // showUserDetailsCard: boolean = false;
  // showPatmentDetailsCard: boolean = false;
  serialNumberFile: ISettingDoc;
  DocumentType = DocumentType;
  DocCreateFields = DocCreateFields;
  isFileSelected = signal(false);
  generalFormIsValidSignal = signal(false);
  userFormIsValidSignal = signal(false);
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
  readonly formTypes = FormTypes;
  readonly FieldsCreateDocValue = FieldsCreateDocValue;
  paymentMethodOptions = paymentMethodOptions;
  // UISummaryTotals = this.docCreateBuilderService.UISummaryTotals

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
  // lineItems: LineItem[] = [];
  isDocWithPayments = signal<boolean>(false);
  lineItemsDraft = signal<PartialLineItem[]>([]);
  initiallinesDocFormValues: FormGroup;
  showInitialIndexDialog = true;
  // private initialIndexSubject?: Subject<number>;

  activePaymentMethod: MenuItem = this.paymentMethodOptions[0]; // default selected

  paymentInputForm: FormGroup;  // Holds the active entry row
  paymentsDraft = signal([]);     // Stores all added payments
  initialIndexForm: FormGroup;

  readonly vatOptions = vatOptions;

  documentTotals = signal<DocumentTotals>({
    sumBefDisBefVat: 0,
    disSum: 0,
    sumAftDisBefVat: 0,
    vatSum: 0,
    sumAftDisWithVat: 0,
  });

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

  isPaymentsEqualToCharges = computed(() => {
    return this.totalPayments() === this.totalAmount();
  });

  createDocIsValid = computed(() => {
  return (
    this.generalFormIsValidSignal() &&
    this.userFormIsValidSignal() &&
    this.lineItemsDraft().length > 0 &&
    (!this.isDocWithPayments() || this.paymentsDraft().length > 0) &&
    this.isPaymentsEqualToCharges()
  );
});





  constructor(private authService: AuthService, private fileService: FilesService, private genericService: GenericService, private modalController: ModalController, private router: Router, public docCreateService: DocCreateService, private formBuilder: FormBuilder, private docCreateBuilderService: DocCreateBuilderService) {


    this.initialIndexForm = this.formBuilder.group({
      initialIndex: new FormControl(
        '', [Validators.required, Validators.pattern(/^\d+$/)]
      ),
    });

    this.createPaymentInputForm(this.activePaymentMethod.id as string);

  }


  ngOnInit() {
    this.createForms();
    this.generalDetailsForm.statusChanges.subscribe(() => {
      this.generalFormIsValidSignal.set(this.generalDetailsForm.valid);
    });
    this.userDetailsForm.statusChanges.subscribe(() => {
      this.userFormIsValidSignal.set(this.userDetailsForm.valid);
    });
    this.userData = this.authService.getUserDataFromLocalStorage();
    const businessData = this.genericService.getBusinessData(this.userData);

    this.businessMode = businessData.mode;
    this.businessUiList = businessData.uiList; // for the selector
    this.businessFullList = businessData.fullList; // for internal details
    this.showBusinessSelector = businessData.showSelector;

    if (this.businessMode === BusinessMode.ONE_BUSINESS) {
      console.log("🚀 ~ DocCreatePage ~ ngOnInit ~ this.businessFullList:", this.businessFullList);

      const b = this.businessFullList[0];
      this.setSelectedBusiness(b);
      this.generalDetailsForm?.get('businessNumber')?.setValue(b.value);
    }
  }


  onBusinessSelection(event: string): void {
    this.selectedBusinessNumber = event;

    const selected = this.businessFullList.find(b => b.value === this.selectedBusinessNumber);

    if (selected) {
      // throw new Error(`Business number ${this.selectedBusinessNumber} not found.`);
      this.setSelectedBusiness(selected);
    }

  }


  setSelectedBusiness(business: BusinessInfo): void {
    this.selectedBusinessNumber = business.value;
    this.selectedBusinessName = business.name;
    this.selectedBusinessAddress = business.address;
    this.selectedBusinessType = business.type;
    this.selectedBusinessPhone = business.phone;
    this.selectedBusinessEmail = business.email;
  }


  onSelectedDoc(event: any): void {
    this.isDocWithPayments.set(event === DocumentType.RECEIPT || event === DocumentType.TAX_INVOICE_RECEIPT);
    this.fileSelected = event;
    this.HebrewNameFileSelected = this.getHebrewNameDoc(this.fileSelected);
    this.handleDocIndexes(this.fileSelected);

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


  // Function for creating the doc and downloading it
  createDoc(): void {

    // this.createPDFIsLoading = true;
    // const data = this.buildDocPayload();

    // this.docCreateService.createDoc(data)
    //   .pipe(
    //     finalize(() => {
    //       this.createPDFIsLoading = false;
    //     }),
    //     catchError((err) => {
    //       console.error("Error in createPDF (Create):", err);
    //       return EMPTY;
    //     })
    //   )
    //   .subscribe((res) => {
    //     console.log("Update current index result:", res);
    //     this.fileService.downloadFile("my pdf", res);

    //     // ✅ Reset all forms
    //     this.generalDocForm.reset({ [DocCreateFields.DOC_VAT_RATE]: 18 });
    //     this.recipientDocForm.reset();
    //     this.linesDocForm.reset(this.initiallinesDocFormValues);
    //     this.initialIndexForm.reset();
    //     this.paymentForm.reset();
    //     (this.paymentForm.get('bankPayments') as FormArray).clear();
    //     (this.paymentForm.get('creditPayments') as FormArray).clear();
    //     (this.paymentForm.get('checkPayments') as FormArray).clear();
    //     (this.paymentForm.get('appPayments') as FormArray).clear();

    //     // ✅ Clear local draft arrays
    //     this.lineItemsDraft = [];
    //     this.paymentsDraft = [];

    //     this.fileSelected = null;
    //     this.HebrewNameFileSelected = null;

    //   });

  }


  previewDoc(): void {
    console.log(this.myForm);

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

    const docNumber = this.docIndexes.docIndex;
    const generalDocIndex = this.docIndexes.generalIndex;
    const hebrewNameDoc = this.getHebrewNameDoc(this.fileSelected);

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
        sumBefDisBefVat: this.documentTotals().sumBefDisBefVat,
        disSum: this.documentTotals().disSum,
        sumAftDisBefVAT: this.documentTotals().sumAftDisBefVat,
        vatSum: this.documentTotals().vatSum,
        sumAftDisWithVAT: this.documentTotals().sumAftDisWithVat,
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

    const newLine: PartialLineItem = {
      issuerBusinessNumber: this.selectedBusinessNumber,
      generalDocIndex: String(this.docIndexes.generalIndex),
      lineNumber: lineIndex + 1,
      description: formData.description,
      unitQuantity: formData.unitAmount,
      sum: formData.sum,
      discount: formData.discount ? Number(formData.discount.toString().replace(/^0+(?!\.)/, '')) : null,
      vatOpts: formData.vatOptions,
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
      [FieldsCreateDocValue.DISCOUNT]: 0
    });
    this.calcTotals();
    const docDate = this.generalDetailsForm.get(FieldsCreateDocValue.DOCUMENT_DATE)?.value ?? null;
    this.createPaymentInputForm(this.activePaymentMethod.id as string, docDate);

  }


  calculateVatFieldsForLine(lineIndex: number): void {
    console.log("🚀 ~ DocCreatePage ~ calculateVatFieldsForLine ~ lineIndex", lineIndex);

    const line = this.lineItemsDraft()[lineIndex]; //Get the line by reference
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
    console.log("🚀 ~ DocCreatePage ~ calculateVatFieldsForLine ~ line after calaulate", line);

  }


  updateDocumentTotalsFromLines(): void {

    const totals: DocumentTotals = {
      sumBefDisBefVat: 0,
      disSum: 0,
      sumAftDisBefVat: 0,
      vatSum: 0,
      sumAftDisWithVat: 0,
    };

    for (const line of this.lineItemsDraft()) {
      totals.sumBefDisBefVat += Number(line.sumBefVatPerUnit ?? 0);
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
    console.log("🚀 ~ DocCreatePage ~ createPaymentInputForm ~ paymentMethod", paymentMethod);

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


  onPaymentMethodChange(paymentMethod: MenuItem): void {
    this.activePaymentMethod = paymentMethod;
    const docDate = this.generalDetailsForm.get(FieldsCreateDocValue.DOCUMENT_DATE)?.value ?? null;
    this.createPaymentInputForm(this.activePaymentMethod.id as string, docDate);
  }

  getPaymentFields(section: string) {
    return this.docCreateBuilderService.getBaseFieldsBySection(section as SectionKeysEnum);
  }


  addPayment(): void {
    console.log("🚀 ~ DocCreatePage ~ addPayment ~ this.paymentInputForm", this.paymentInputForm);
    console.log("patmentDraft", this.paymentsDraft);

    const paymentFormValue = this.paymentInputForm.value;
    // const paymentdata = 
    const paymentLineIndex = this.paymentsDraft.length;

    const selectedBank = bankOptionsList.find(bank => bank.value === (paymentFormValue.bankNumber ?? paymentFormValue.bankName));
    const hebrewBankName = selectedBank ? selectedBank.name : '';
    const bankNumber = selectedBank?.value ?? '';

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

    // this.paymentsDraft.push(paymentEntry);
    this.paymentsDraft.update(items => [...items, paymentEntry]);

    // Reset the form for the next payment entry
    const docDate = this.generalDetailsForm.get(FieldsCreateDocValue.DOCUMENT_DATE)?.value ?? null;
    this.paymentInputForm.reset();
    this.createPaymentInputForm(this.activePaymentMethod.id as string, docDate);
    this.totalPayments.set(this.paymentsDraft().reduce((total, payment) => total + Number(payment.paymentSum), 0));
    console.log("🚀 ~ DocCreatePage ~ addPayment ~ this.totalPayments:", this.totalPayments());
    console.log("🚀 ~ DocCreatePage ~ addPayment ~ this.totalAmount:", this.totalAmount());

  }


  deleteLine(index: number): void {
    this.lineItemsDraft.update(items => items.filter((_, i) => i !== index));
    this.updateDocumentTotalsFromLines();
    this.calcTotals();
  }

  deletePayment(index: number): void {
    this.paymentsDraft.update(items => items.filter((_, i) => i !== index));
    this.totalPayments.set(this.paymentsDraft().reduce((total, payment) => total + Number(payment.paymentSum), 0));
  }


  getVatLabel(type: VatType): string {
    switch (type) {
      case 'INCLUDE': return 'כולל מע״מ';
      case 'EXCLUDE': return 'לא כולל מע״מ';
      case 'WITHOUT': return 'ללא מע״מ';
      default: return '';
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
    return this.docCreateBuilderService.lineDetailsColumns;
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
    this.docCreateService.setInitialDocDetails(this.fileSelected, this.docIndexes.docIndex, this.selectedBusinessNumber)
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


  // getDropdownItems(controlValue: string): ISelectItem[] {
  //   switch (controlValue) {
  //     case FieldsCreateDocValue.CURRENCY:
  //     // return this.currencyList;
  //     // case fieldLineDocValue.PAYMENT_METHOD:
  //     // return this.paymentMethodOptions;
  //     case fieldLineDocValue.VAT_OPTIONS:
  //       return vatOptions;
  //     case fieldLineDocValue.UNIT_TYPE:
  //       return this.UnitOfMeasureList;
  //     case fieldLineDocValue.CARD_COMPANY:
  //       return this.CardCompanyList;
  //     case fieldLineDocValue.CREDIT_TRANS_TYPE:
  //       return this.CreditTransactionTypeList;
  //     default:
  //       return [];
  //   }
  // }


  // isDocWithPayments(): boolean {
  //   return [
  //     DocumentType.RECEIPT,
  //     DocumentType.TAX_INVOICE_RECEIPT,
  //   ].includes(this.fileSelected);
  // }


}