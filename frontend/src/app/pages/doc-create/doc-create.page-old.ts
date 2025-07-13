// import { Component, OnInit, signal } from '@angular/core';
// import { FormArray, FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
// import { EMPTY, Observable, catchError, finalize, forkJoin, from, map, of, switchMap, tap } from 'rxjs';
// import { CardCompany, CreditTransactionType, Currency, fieldLineDocName, fieldLineDocValue, FieldsCreateDocName, FieldsCreateDocValue, FormTypes, PaymentMethodName, PaymentMethodValue, UnitOfMeasure, VatOptionsValue } from 'src/app/shared/enums';
// import { Router } from '@angular/router';
// import { ICreateDataDoc, ICreateDocField, ICreateLineDoc, IDataDocFormat, IDocIndexes, ISelectItem, ISettingDoc, ITotals, IUserData, } from 'src/app/shared/interface';
// import { DocCreateService } from './doc-create.service';
// import { ModalController } from '@ionic/angular';
// import { SelectClientComponent } from 'src/app/shared/select-client/select-client.component';
// import { GenericService } from 'src/app/services/generic.service';
// import { FilesService } from 'src/app/services/files.service';
// import { AuthService } from 'src/app/services/auth.service';
// import { DocCreateBuilderService } from './doc-create-builder.service';
// import { IDocCreateFieldData, SectionKeysEnum } from './doc-create.interface';
// //import { l } from '@angular/core/navigation_types.d-u4EOrrdZ';
// import { is } from 'date-fns/locale';
// import { log } from 'console';
// import { inputsSize } from 'src/app/shared/enums';
// import { ButtonColor, ButtonSize } from 'src/app/components/button/button.enum';



// @Component({
//     selector: 'app-doc-create',
//     templateUrl: './doc-create.page.html',
//     styleUrls: ['./doc-create.page.scss', '../../shared/shared-styling.scss'],
//     standalone: false
// })
// export class DocCreatePage implements OnInit {

//   paymentsDetailsForm: FormGroup;
//   myForm: FormGroup;
//   initialDetailsForm: FormGroup;
//   userDetailsFields: ICreateDocField<FieldsCreateDocName, FieldsCreateDocValue>[] = [];
//   paymentDetailsFields: ICreateDocField<FieldsCreateDocName | fieldLineDocName, FieldsCreateDocValue | fieldLineDocValue>[] = [];
//   generalDetailsFields: ICreateDocField<FieldsCreateDocName, FieldsCreateDocValue>[] = [];
//   showUserDetailsCard: boolean = false;
//   showPatmentDetailsCard: boolean = false;
//   serialNumberFile: ISettingDoc;
//   fileSelected: string;
//   HebrewNameFileSelected: string;
//   isInitial: boolean = false;
//   //docDetails: ISettingDoc;
//   docIndexes: IDocIndexes | null = null;
//   createPDFIsLoading: boolean = false;
//   createPreviewPDFIsLoading: boolean = false;
//   addPDFIsLoading: boolean = false;
//   userDetails: IUserData
//   amountBeforeVat: number = 0;
//   vatAmount: number = 0;
//   totalAmount: number = 0;
//   overallTotals: ITotals;
//   vatRate = 0.18; // 18% VAT
//   isGeneralExpanded: boolean = false;
//   isUserExpanded: boolean = false;
//   isPaymentExpanded: boolean = false;
//   morePaymentDetails: boolean = false;
//   generalArray: IDocCreateFieldData[] = [];
//   userArray: IDocCreateFieldData[] = [];
//   paymentsArray: IDocCreateFieldData[] = [];
//   paymentSectionName: SectionKeysEnum;

//   inputsSize = inputsSize;
//   buttonSize = ButtonSize;
//   buttonColor = ButtonColor;

//   // showMoreFields = false;
//   showGeneralMoreFields = false;
//   showUserMoreFields = false;
//   value1 = 50;

//   //accountsList = signal<ISelectItem[]>([]);
//   form: FormGroup;

//   accountsList: ISelectItem[] = [
//     { name: 'חודשי', value: 'MONTHLY' },
//     { name: 'דו-חודשי', value: 'BIMONTHLY' },
//     { name: 'שנתי', value: 'ANNUAL' },
//     { name: 'טווח תאריכים', value: 'DATE_RANGE' }
//   ];

//   readonly DocCreateTypeList = [
//     { value: 'RECEIPT', name: 'קבלה' },
//     { value: 'TAX_INVOICE', name: 'חשבונית מס' },
//     { value: 'TAX_INVOICE_RECEIPT', name: 'חשבונית מס קבלה' },
//     { value: 'TRANSACTION_INVOICE', name: 'חשבונית עסקה' },
//     { value: 'CREDIT_INVOICE', name: 'חשבונית זיכוי' },
//     // { value: 6, name: 'הצעת מחיר' },
//     // { value: 7, name: 'הזמנת עבודה' },
//     // { value: 8, name: 'תעודת משלוח' },
//     // { value: 9, name: 'תעודת החזרה' },
//   ];

//   readonly paymentMethodList = [
//     { value: PaymentMethodValue.BANK_TRANSFER, name: PaymentMethodName.BANK_TRANSFER },
//     { value: PaymentMethodValue.CASH, name: PaymentMethodName.CASH },
//     { value: PaymentMethodValue.BIT, name: PaymentMethodName.BIT },
//     { value: PaymentMethodValue.PAYBOX, name: PaymentMethodName.PAYBOX },
//     { value: PaymentMethodValue.CREDIT_CARD, name: PaymentMethodName.CREDIT_CARD },
//     { value: PaymentMethodValue.CHECK, name: PaymentMethodName.CHECK },
//   ];

//   readonly vatOptionList = [
//     { value: VatOptionsValue.INCLUDE, name: 'כולל מע"מ' },
//     { value: VatOptionsValue.EXCLUDE, name: 'לא כולל מע"מ' },
//     { value: VatOptionsValue.WITHOUT, name: 'ללא מע"מ' },
//   ];

//   readonly UnitOfMeasureList = [
//     { value: UnitOfMeasure.UNIT, name: 'יחידות' },
//     { value: UnitOfMeasure.WORK_HOUR, name: 'שעות עבודה' },
//     { value: UnitOfMeasure.LITER, name: 'ליטר' },
//     { value: UnitOfMeasure.KILOGRAM, name: 'קילוגרם' },
//   ];

//   readonly CardCompanyList = [
//     { value: CardCompany.ISRACARD, name: 'ישראכארט' },
//     { value: CardCompany.CAL, name: 'כאל' },
//     { value: CardCompany.DINERS, name: 'דיינרס' },
//     { value: CardCompany.VISA, name: 'ויזה' },
//     { value: CardCompany.LEUMI_CARD, name: 'לאומי קארד' },
//     { value: CardCompany.MASTERCARD, name: 'מאסטרקארד' },
//     { value: CardCompany.OTHER, name: 'אחר' },
//   ];

//   readonly CreditTransactionTypeList = [
//     { value: CreditTransactionType.REGULAR, name: 'רגיל' },
//     { value: CreditTransactionType.INSTALLMENTS, name: 'תשלומים' },
//     { value: CreditTransactionType.CREDIT, name: 'קרדיט' },
//     { value: CreditTransactionType.DEFERRED_CHARGE, name: 'חיוב נדחה' },
//     { value: CreditTransactionType.OTHER, name: 'אחר' },
//   ]

//   readonly currencyList = [
//     { value: Currency.ILS, name: 'שקל' },
//     { value: Currency.USD, name: 'דולר' },
//     { value: Currency.EUR, name: 'יורו' },
//   ];

//   readonly formTypes = FormTypes;


//   constructor(private authService: AuthService, private fileService: FilesService, private genericService: GenericService, private modalController: ModalController, private router: Router, public docCreateService: DocCreateService, private formBuilder: FormBuilder, private docCreateBuilderService: DocCreateBuilderService) {

//     this.initialDetailsForm = this.formBuilder.group({
//       initialIndex: new FormControl(
//         '', [Validators.required, Validators.pattern(/^\d+$/)]
//       ),
//     });
//   }


//   ngOnInit() {
//     this.userDetails = this.authService.getUserDataFromLocalStorage();
//     this.createForms();
//   }

//   get paymentsFormArray(): FormArray {
//     return this.myForm.get(this.paymentSectionName) as FormArray;
//   }

//   get generalDetailsForm(): FormGroup {
//     return this.myForm.get('GeneralDetails') as FormGroup;
//   }

//   get userDetailsForm(): FormGroup {
//     return this.myForm.get('UserDetails') as FormGroup;
//   }

//   // addPayment(): void {
//   //   this.docCreateBuilderService.addFormGroupToFormArray(this.paymentsFormArray, this.paymentSectionName);
//   //   console.log(this.myForm);
//   //   this.paymentsArray[this.paymentsArray.length] = this.docCreateBuilderService.getBaseFieldsBySection(this.paymentSectionName);
//   //   console.log("🚀 ~ DocCreatePage ~ addPayment ~ this.paymentsArray:", this.paymentsArray)
//   // }

//   // removePayment(index: number): void {
//   //   this.docCreateBuilderService.removeFormGroupFromFormArray(this.paymentsFormArray, index);
//   //   this.paymentsArray.splice(index, 1);
//   // }

//   getPaymentFormByIndex(index: number): FormGroup {
//     return this.paymentsFormArray.at(index) as FormGroup;
//   }

//   onSelectedDoc(event: any): void {
//     this.fileSelected = event;
//     console.log("event is ", event);
//     console.log("event.value is ", event.value);
    
//     console.log("onSelectedDoc: fileSelected is ", this.fileSelected);
//     this.HebrewNameFileSelected = this.ggetHebrewNameDoc(event.value);
//     switch (event.value) {
//       case 'RECEIPT':
//         this.paymentSectionName = 'ReceiptPaymentDetails';
//         break;
//       case 'TAX_INVOICE':
//         this.paymentSectionName = 'TaxInvoicePaymentDetails';
//         break;
//       }
//     this.getDocDetails()
//     //this.createForms();

//   }

//   // createForms(): void {
//   //   this.myForm = this.docCreateBuilderService.buildDocCreateForm(['GeneralDetails', 'UserDetails', this.paymentSectionName]);
//   //   this.paymentsArray[0] = this.docCreateBuilderService.getBaseFieldsBySection(this.paymentSectionName);
//   //   this.generalArray = this.docCreateBuilderService.getBaseFieldsBySection('GeneralDetails');
//   //   this.userArray = this.docCreateBuilderService.getBaseFieldsBySection('UserDetails');
//   // }

//   createForms(): void {
//     this.myForm = this.docCreateBuilderService.buildDocCreateForm(['GeneralDetails', 'UserDetails']);
//     this.generalArray = this.docCreateBuilderService.getBaseFieldsBySection('GeneralDetails');
//     this.userArray = this.docCreateBuilderService.getBaseFieldsBySection('UserDetails');
//     this.paymentsArray = this.docCreateBuilderService.getBaseFieldsBySection(this.paymentSectionName);
//     // this.paymentsArray[0] = this.docCreateBuilderService.getBaseFieldsBySection(this.paymentSectionName);
//   }

//   onClickInitialIndex(): void {
//     const formData = this.initialDetailsForm.value;
//     this.docCreateService.setInitialDocDetails(formData, this.fileSelected)
//       .pipe(
//         catchError((err) => {
//           console.log("err in set initial index: ", err);
//           return EMPTY;
//         })
//       )
//       .subscribe((res) => {
//         console.log("res in set initial index: ", res);
//         this.getDocDetails();
//         this.isInitial = false;
//       })

//   }


//   // showAllFields(): void {
//   //   this.showMoreFields = !this.showMoreFields;
//   // }


//   getHebrewNameDoc(typeDoc: string): void {
//     const temp = this.DocCreateTypeList.find((doc) => doc.value === typeDoc);
//     if (temp) this.HebrewNameFileSelected = temp.name;
//   }

//   ggetHebrewNameDoc(typeDoc: string): string {
//     return this.DocCreateTypeList.find((doc) => doc.value === typeDoc)?.name;
//   }


//   getDocDetails(): void {
//     this.docCreateService.getDetailsDoc(this.fileSelected)
//       .pipe(
//         catchError((err) => {
//           console.log("err in get doc details: ", err);
//           if (err.status === 404) {
//             this.isInitial = true;
//           } else {
//             // TODO: handle error screen
//           }
//           return EMPTY;
//         }),
//         tap((data) => {
//           // If docIndex is 0, treat it as "initial"
//           this.isInitial = data.docIndex === 0;
//           console.log("this.isInitial: ", this.isInitial);
//         })
//       )
//       .subscribe((res) => {
//         console.log("res in get doc details: ", res);
//         this.docIndexes = res; // Store the indexes
//       });
//   }
  

//   openSelectClients() {

//     from(this.modalController.create({
//       component: SelectClientComponent,
//       // componentProps: {},
//       cssClass: 'expense-modal'
//     })).pipe(
//       catchError((err) => {
//         console.log("Open select clients failed in create ", err);
//         return EMPTY;
//       }),
//       switchMap((modal) => {
//         if (modal) {
//           return from(modal.present())
//             .pipe(
//               catchError((err) => {
//                 console.log("Open select clients failed in present ", err);
//                 return EMPTY;
//               }),
//               switchMap(() => from(modal.onDidDismiss())),
//             );
//         }
//         else {
//           console.log('Popover modal is null');
//           return EMPTY;
//         }
//       })
//     ).subscribe((res) => {
//       console.log("res in close select client", res);
//       if (res) {
//         if (res.role === 'success') {// Only if the modal was closed with click on the select button
//           console.log("res in close select client in success", res);
//           this.fillClientDetails(res.data);
//         }

//       }
//     })
//   }

//   fillClientDetails(client: any) {
//     console.log("🚀 ~ DocCreatePage ~ fillClientDetails ~ client", client)
//     this.userDetailsForm.patchValue({
//       [FieldsCreateDocValue.RECIPIENT_NAME]: client.name,
//       [FieldsCreateDocValue.RECIPIENT_EMAIL]: client.email,
//       [FieldsCreateDocValue.RECIPIENT_PHONE]: client.phone,
//     });
//   }

//   saveClient() {
//     const { [FieldsCreateDocValue.RECIPIENT_NAME]: name, [FieldsCreateDocValue.RECIPIENT_EMAIL]: email, [FieldsCreateDocValue.RECIPIENT_PHONE]: phone } = this.userDetailsForm.value;
//     const clientData = {
//       name,
//       email,
//       phone,
//     };
//     this.docCreateService.saveClientDetails(clientData)
//       .pipe(
//         catchError((err) => {
//           console.log("err in save client: ", err);
//           if (err.status === 409) {
//             this.genericService.openPopupMessage("כבר קיים לקוח בשם זה, אנא בחר שם שונה. אם ברצונך לערוך לקוח זה אנא  לחץ על כפתור עריכה דרך הרשימה .");
//           }
//           else {
//             this.genericService.showToast("אירעה שגיאה לא ניתן לשמור לקוח אנא נסה מאוחר יותר", "error");
//           }
//           return EMPTY;
//         })
//       )
//       .subscribe((res) => {
//         console.log("res in save client: ", res);
//       })
//   }


//   getDocData(): IDataDocFormat {

//     const generalFormData = this.generalDetailsForm.value;
//     const userFormData = this.userDetailsForm.value;
//     const payments = this.paymentsFormArray.value;

//     let totalBefDisBefVat = 0;
//     let totalDisBefVat = 0;
//     let totalAftDisBefVat = 0;
//     let totalVat = 0;
//     let totalAfterVat = 0;
//     let lineNumber = 0; 
  
//     const createLinesDoc: ICreateLineDoc[] = payments.map((payment: any) => {

//       let sumBefDisBefVatPerLine = 0;
//       let disBefVatPerLine = 0;
//       let sumAftDisBefVatPerLine = 0; 
//       let sumAftDisWithVatPerLine = 0; 
//       //let sumAftDisWithVat = 0;
//       let vatPerLine = 0;
//       const sum = Number(payment?.sum) * Number(payment?.unitAmount ?? 1);
//       const discount = Number(payment?.discount ?? 0);
  
//       if (payment?.vatOptions === 'INCLUDE') {
//         sumBefDisBefVatPerLine = sum / (1 + Number(payment?.vatRate ?? 18) / 100);
//         disBefVatPerLine = discount / (1 + Number(payment?.vatRate ?? 18) / 100);
//         vatPerLine = (sumBefDisBefVatPerLine - disBefVatPerLine) * (Number(payment?.vatRate ?? 18) / 100);
//       } else if (payment?.vatOptions === 'EXCLUDE') {
//         sumBefDisBefVatPerLine = sum;
//         disBefVatPerLine = discount;
//         vatPerLine = (sum - discount) * (Number(payment?.vatRate ?? 18) / 100);
//       } else if (payment?.vatOptions === 'WITHOUT') {
//         sumBefDisBefVatPerLine = sum;
//         disBefVatPerLine = discount;
//         vatPerLine = 0;
//       } else {
//         sumBefDisBefVatPerLine = 0;
//       }
      
//       sumAftDisBefVatPerLine = sumBefDisBefVatPerLine - disBefVatPerLine;
//       sumAftDisWithVatPerLine = sumAftDisBefVatPerLine + vatPerLine;

//       totalBefDisBefVat += sumBefDisBefVatPerLine;
//       totalDisBefVat += disBefVatPerLine;
//       totalAftDisBefVat += sumAftDisBefVatPerLine;
//       totalVat += vatPerLine;
//       totalAfterVat += sumAftDisWithVatPerLine;

//       lineNumber++;
  
//       return {
//         issuerbusinessNumber: this.userDetails?.businessNumber,
//         generalDocIndex: this.docIndexes?.generalIndex.toString(),
//         description: payment?.description || null,
//         unitAmount: payment?.unitAmount ?? 1,
//         sumBefVat: sumAftDisBefVatPerLine,
//         sumAftDisWithVat: sumAftDisWithVatPerLine,
//         vatOpts: payment?.vatOptions,
//         vatRate: payment?.vatRate ?? 18,
//         paymentMethod: payment?.paymentMethod,
//         disBefVat: payment?.discount ?? 0,
//         lineNumber: lineNumber.toString(),
//         unitType: payment?.unitType ?? 1,
//         payDate: generalFormData.documentDate,
//         bankNumber: payment?.bankNumber || null,
//         branchNumber: payment?.branchNumber || null,
//         accountNumber: payment?.accountNumber || null,
//         checkNumber: payment?.checkNumber || null,
//         paymentCheckDate: payment?.paymentCheckDate || null,
//         cardCompany: payment.cardCompany || null,
//         card4Number: payment?.card4Number || null,
//         creditCardName: payment?.creditCardName || null,
//         creditTransType: payment?.creditTransType || null,
//         creditPayNumber: payment?.creditPayNumber || null,
//         manufacturerName: payment?.manufacturerName || null,
//         productSerialNumber: payment?.productSerialNumber || null,
//         internalNumber: payment?.internalNumber || null,
//         journalEntryMainId: payment?.journalEntryMainId || null,
//       };
//     });
  
//     const data = {
//       fileData: {
//         issuerName: this.userDetails?.businessName,
//         issuerAddress: this.userDetails?.city,
//         issuerPhone: this.userDetails?.phone,
//         issuerEmail: this.userDetails?.email,
//         hebrewNameDoc: this.ggetHebrewNameDoc(this.fileSelected)
//       },
//       docData: {
//         issuerbusinessNumber: this.userDetails?.businessNumber,
//         recipientName: userFormData?.recipientName,
//         recipientId: userFormData?.recipientId || null,
//         recipientStreet: userFormData?.recipientStreet || null,
//         recipientHomeNumber: userFormData?.recipientHomeNumber || null,
//         recipientCity: userFormData?.recipientCity || null,
//         recipientPostalCode: userFormData?.recipientPostalCode || null,
//         recipientState: userFormData?.recipientState || null,
//         recipientStateCode: userFormData?.recipientStateCode || null,
//         recipientPhone: userFormData?.recipientPhone || null,
//         recipientEmail: userFormData?.recipientEmail || null,
//         docType: this.fileSelected,
//         generalDocIndex: this.docIndexes?.generalIndex.toString(),
//         docDescription: generalFormData?.docDescription,
//         docNumber: this.docIndexes?.docIndex.toString(),
//         docVatRate: 18,
//         transType: 3,
//         amountForeign: this.totalAmount,
//         currency: generalFormData?.currency || 'ILS',
//         sumBefDisBefVat: totalBefDisBefVat,
//         disSum: 0,
//         sumAftDisBefVAT: totalAftDisBefVat,
//         vatSum: totalVat,
//         sumAftDisWithVAT: totalAfterVat,
//         withholdingTaxAmount: 0,
//         docDate: generalFormData.documentDate,
//         issueDate: generalFormData.documentDate,
//         issueHour: generalFormData.documentHour,
//         customerKey: null,
//         matchField: null,
//         isCancelled: false,
//         branchCode: null,
//         operationPerformer: null,
//         parentDocType: null,
//         parentDocNumber: null,
//         parentBranchCode: null,
//       },
//       linesData: createLinesDoc,
//     };
  
//     return data;
//   }
  

//   // Function for previewing the doc
//   previewtDoc(): void {
//     this.createPreviewPDFIsLoading = true;
//     const data = this.getDocData();

//     this.docCreateService.generatePDF(data)
//       .pipe(
//         finalize(() => {
//           this.createPreviewPDFIsLoading = false;
//         }),
//         catchError((err) => {
//           console.error("Error in createPDF (Preview):", err);
//           return EMPTY;
//         })
//       )
//       .subscribe((res) => {
//         console.log("PDF creation result (Preview):", res);
//         this.fileService.previewFile1(res);
//       });
//   }

//   // Function for creating the doc and downloading it
//   createDoc(): void {
//     this.createPDFIsLoading = true;
//     const data = this.getDocData();
//     console.log("Debug - data is ", data);
    
//     this.docCreateService.createDoc(data)
//       .pipe(
//         finalize(() => {
//           this.createPDFIsLoading = false;
//         }),
//         catchError((err) => {
//           console.error("Error in createPDF (Create):", err);
//           return EMPTY;
//         })
//       )
//       .subscribe((res) => {
//         console.log("Update current index result:", res);
//         this.fileService.downloadFile("my pdf", res);
//       });
//   }


//   getFid(): string {
//     switch (this.fileSelected) {
//       case 'RECEIPT':
//         return "RVxpym2O68";
//       case 'TAX_INVOICE':
//         return "";
//       case 'TAX_INVOICE_RECEIPT':
//         return "";
//       case 'TRANSACTION_INVOICE':
//         return "";
//       case 'CREDIT_INVOICE':
//         return "";
//     }
//     return null;
//   }

//   onBlur(field: string, i: number): void {
//     const vatOptionControl = this.paymentsFormArray.controls[i]?.get(fieldLineDocValue.VAT_OPTIONS);
//     if (!vatOptionControl.value) return; // If don't choosen vat option
//     if (field !== "sum") return; // If it is not "sum" field
//     this.onVatOptionChange(vatOptionControl, i)
//     console.log("on blur");

//   }

//   // onSelectionChanged(field: string, event: any, i: number): void {
//   //   console.log("🚀 ~ DocCreatePage ~ onSelectionChanged ~ event:", event)
//   //   console.log("🚀 ~ DocCreatePage ~ onSelectionChanged ~ control:", field)
//   //   switch (field) {
//   //     case 'vatOptions':
//   //       this.onVatOptionChange(event, i);
//   //       break;
//   //     case 'paymentMethod':
//   //       this.expandPayentMethod(i, field, event.value);
//   //       break;
//   //     default:
//   //       break;
//   //   }
//   // }

//   onVatOptionChange(event: any, formIndex: number): void {
//     console.log("🚀 ~ DocCreatePage ~ onVatOptionChange ~ value:", event.value)
//     const sumControl = this.paymentsFormArray.controls[formIndex]?.get(fieldLineDocValue.SUM);
//     if (!sumControl) return;

//     const sum = parseFloat(sumControl.value);
//     if (isNaN(sum)) return;

//     this.amountBeforeVat = 0;
//     this.vatAmount = 0;
//     this.totalAmount = 0;

//     switch (event.value) {
//       case 'BEFORE':
//         this.amountBeforeVat = sum;
//         this.vatAmount = this.calculateVatAmountBeforVat(sum);
//         this.totalAmount = sum + this.vatAmount;
//         break;
//       case 'AFTER':
//         this.totalAmount = sum;
//         this.vatAmount = this.calculateVatAmountAfterVat(sum);
//         this.amountBeforeVat = this.calculateSumAfterVat(sum);
//         break;
//       case 'WITH_OUT':
//         this.amountBeforeVat = sum;
//         this.vatAmount = 0;
//         this.totalAmount = sum;
//         break;
//     }
//   }

//   calculateSumAfterVat(sum: number): number { // Calculate the original cost 
//     const vatRate = 0.18; // Example VAT rate
//     return sum / (1 + vatRate);
//   }

//   calculateVatAmountAfterVat(sum: number): number {
//     const vatRate = 0.18; // Example VAT rate
//     return sum - this.calculateSumAfterVat(sum);
//   }

//   calculateSumIncludingVat(sum: number): number {
//     return sum;
//   }

//   calculateVatAmountBeforVat(sum: number): number {
//     const vatRate = 0.18;
//     return sum * vatRate;
//   }

//   expandGeneralDetails(): void {
//     this.isGeneralExpanded = !this.isGeneralExpanded;
//     if (this.isGeneralExpanded) {
//       this.docCreateBuilderService.addFormControlsByExpandedSection(this.generalDetailsForm, 'GeneralDetails');
//       this.generalArray = this.docCreateBuilderService.getAllFieldsBySection('GeneralDetails');
//       console.log("this.generalDetailsForm: ", this.generalDetailsForm);

//     }
//     else {
//       this.generalArray = this.docCreateBuilderService.getBaseFieldsBySection('GeneralDetails');
//       this.docCreateBuilderService.removeFormControlsByExpandedSection(this.generalDetailsForm, 'GeneralDetails');
//     }
//       console.log("🚀 ~ DocCreatePage ~ expandGeneralDetails ~ this.generalDetailsForm:", this.generalDetailsForm)
//     console.log("🚀 ~ DocCreatePage ~ expandGeneralDetails ~ this.generalArray:", this.generalArray)

//   }

//   expandUserDetails(): void {
//     console.log(this.userDetailsForm);
    
//     this.isUserExpanded = !this.isUserExpanded;
//     if (this.isUserExpanded) {
//       this.docCreateBuilderService.addFormControlsByExpandedSection(this.userDetailsForm, 'UserDetails');
//       this.userArray = this.docCreateBuilderService.getAllFieldsBySection('UserDetails');
//     }
//     else {
//       this.docCreateBuilderService.removeFormControlsByExpandedSection(this.userDetailsForm, 'UserDetails');
//       this.userArray = this.docCreateBuilderService.getBaseFieldsBySection('UserDetails');
//     }
//   }

//   // expandPaymentDetails(formIndex: number): void {
//   //   console.log(this.paymentsArray[formIndex]);
//   //   console.log(this.paymentsFormArray.controls[formIndex]);
    
    
//   //   this.isPaymentExpanded = !this.isPaymentExpanded;
//   //   if (this.isPaymentExpanded) {
//   //     this.docCreateBuilderService.addFormControlsByExpandedSection(this.paymentsFormArray.controls[formIndex] as FormGroup, this.paymentSectionName);
//   //     const expandedFields = this.docCreateBuilderService.getExpandedFieldsBySection(this.paymentSectionName);
//   //     this.paymentsArray[formIndex] = [...this.paymentsArray[formIndex], ...expandedFields];
//   //   }
//   //   else {
//   //     this.docCreateBuilderService.removeFormControlsByExpandedSection(this.paymentsFormArray.controls[formIndex] as FormGroup, this.paymentSectionName);
//   //     const expandedFields = this.docCreateBuilderService.getExpandedFieldsBySection(this.paymentSectionName); // For remove only the expanded fields and not enumValues fields
//   //     this.paymentsArray[formIndex] = this.paymentsArray[formIndex].filter((paymentField: IDocCreateFieldData) => {
//   //       return !expandedFields.some((expandedField: IDocCreateFieldData) => expandedField.value === paymentField.value);
//   //     });
//   //   }
//   // }

//   // expandPayentMethod(formIndex: number, field: string, paymentMethod: string): void {
//   //   this.docCreateBuilderService.addFormControlsByEnumValue(this.paymentsFormArray.controls[formIndex] as FormGroup, this.paymentSectionName, field, paymentMethod, this.isPaymentExpanded);
//   //   console.log("🚀 ~ DocCreatePage ~ expandPaymentDetails ~ this.paymentsFormArray.controls[formIndex]:", this.paymentsFormArray.controls[formIndex]);
//   //   console.log("🚀 ~ DocCreatePage ~ expandPayentMethod ~ this.paymentsArray[formIndex]:", this.paymentsArray[formIndex])
//   //   //this.paymentsArray[formIndex] = []; // Reset array for new values
//   //   this.paymentsArray[formIndex] = this.docCreateBuilderService.getFieldsBySectionAndEnumValue(this.paymentSectionName, field, paymentMethod, this.isPaymentExpanded);
//   //   console.log("🚀 ~ DocCreatePage ~ expandPayentMethod ~ this.paymentsArray[formIndex]:", this.paymentsArray[formIndex])
//   // }

//   getDropdownItems(controlValue: string): ISelectItem[] {
//     switch (controlValue) {
//       case FieldsCreateDocValue.CURRENCY:
//         return this.currencyList;
//       case fieldLineDocValue.PAYMENT_METHOD:
//         return this.paymentMethodList;
//       case fieldLineDocValue.VAT_OPTIONS:
//         return this.vatOptionList;
//       case fieldLineDocValue.UNIT_TYPE:
//         return this.UnitOfMeasureList;
//       case fieldLineDocValue.CARD_COMPANY:
//         return this.CardCompanyList;
//       case fieldLineDocValue.CREDIT_TRANS_TYPE:
//         return this.CreditTransactionTypeList;
//       default:
//         return [];
//     }
//   }

// }