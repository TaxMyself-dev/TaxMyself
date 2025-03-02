import { Component, OnInit } from '@angular/core';
import { FormArray, FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { EMPTY, Observable, catchError, finalize, forkJoin, from, map, of, switchMap, tap } from 'rxjs';
import { FieldsCreateDocName, FieldsCreateDocValue, FormTypes, PaymentMethodName, PaymentMethodValue } from 'src/app/shared/enums';
import { Router } from '@angular/router';
import { ICreateDataDoc, ICreateDocField, ISelectItem, ISettingDoc, ITotals, IUserData, } from 'src/app/shared/interface';
import { DocCreateService } from './doc-create.service';
import { ModalController } from '@ionic/angular';
import { SelectClientComponent } from 'src/app/shared/select-client/select-client.component';
import { GenericService } from 'src/app/services/generic.service';
import { FilesService } from 'src/app/services/files.service';
import { AuthService } from 'src/app/services/auth.service';







@Component({
  selector: 'app-doc-create',
  templateUrl: './doc-create.page.html',
  styleUrls: ['./doc-create.page.scss', '../../shared/shared-styling.scss'],
})
export class DocCreatePage implements OnInit {

  docCreateForm: FormGroup;
  paymentsForm: FormGroup;
  initialDetailsForm: FormGroup;
  userDetailsFields: ICreateDocField<FieldsCreateDocName, FieldsCreateDocValue>[] = [];
  paymentDetailsFields: ICreateDocField<FieldsCreateDocName, FieldsCreateDocValue>[] = [];
  generalDetailsFields: ICreateDocField<FieldsCreateDocName, FieldsCreateDocValue>[] = [];
  showUserDetailsCard: boolean = false;
  showPatmentDetailsCard: boolean = false;
  serialNumberFile: ISettingDoc;
  fileSelected: string;
  HebrewNameFileSelected: string;
  isInitial: boolean = false;
  docDetails: ISettingDoc;
  createPDFIsLoading: boolean = false;
  createPreviewPDFIsLoading: boolean = false;
  addPDFIsLoading: boolean = false;
  userDetails: IUserData
  amountBeforeVat: number = 0;
  vatAmount: number = 0;
  totalAmount: number = 0;
  overallTotals: ITotals;
  vatRate = 0.18; // 18% VAT


  readonly DocCreateTypeList = [
    { value: 'RECEIPT', name: 'קבלה' },
    { value: 'TAX_INVOICE', name: 'חשבונית מס' },
    { value: 'TAX_INVOICE_RECEIPT', name: 'חשבונית מס קבלה' },
    { value: 'TRANSACTION_INVOICE', name: 'חשבונית עסקה' },
    { value: 'CREDIT_INVOICE', name: 'חשבונית זיכוי' },
    // { value: 6, name: 'הצעת מחיר' },
    // { value: 7, name: 'הזמנת עבודה' },
    // { value: 8, name: 'תעודת משלוח' },
    // { value: 9, name: 'תעודת החזרה' },
  ];

  readonly paymentMethodList = [
    { value: PaymentMethodValue.TRANSFER, name: PaymentMethodName.TRANSFER },
    { value: PaymentMethodValue.CASH, name: PaymentMethodName.CASH },
    { value: PaymentMethodValue.BIT, name: PaymentMethodName.BIT },
    { value: PaymentMethodValue.PAYBOX, name: PaymentMethodName.PAYBOX },
    { value: PaymentMethodValue.CREDIT_CARD, name: PaymentMethodName.CREDIT_CARD },
    { value: PaymentMethodValue.CHECK, name: PaymentMethodName.CHECK },
  ];

  readonly vatOptionList = [
    { value: 'WITH_OUT', name: 'ללא מע"מ' },
    { value: 'BEFORE', name: 'לא כולל מע"מ' },
    { value: 'AFTER', name: ' כולל מע"מ' },
  ];
  readonly formTypes = FormTypes;


  constructor(private authService: AuthService, private fileService: FilesService, private genericService: GenericService, private modalController: ModalController, private router: Router, public docCreateService: DocCreateService, private formBuilder: FormBuilder) {

    this.docCreateForm = this.formBuilder.group({
      [FieldsCreateDocValue.RECIPIENT_NAME]: new FormControl(
        '', Validators.required,
      ),
      [FieldsCreateDocValue.RECIPIENT_ID]: new FormControl(
        '', [Validators.pattern(/^\d{9}$/)]
      ),
      [FieldsCreateDocValue.RECIPIENT_EMAIL]: new FormControl(
        '', [Validators.pattern(/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/)]
      ),
      [FieldsCreateDocValue.RECIPIENT_PHONE]: new FormControl(
        '', [Validators.pattern(/^(050|051|052|053|054|055|058|059)\d{7}$/)]
      ),
      [FieldsCreateDocValue.RECIPIENT_STREET]: new FormControl(
        '', []
      ),
      [FieldsCreateDocValue.RECIPIENT_HOME_NUMBER]: new FormControl(
        '', []
      ),
      [FieldsCreateDocValue.RECIPIENT_CITY]: new FormControl(
        '', []
      ),
      [FieldsCreateDocValue.RECIPIENT_POSTAL_CODE]: new FormControl(
        '', []
      ),
      [FieldsCreateDocValue.RECIPIENT_STATE]: new FormControl(
        '', []
      ),
      [FieldsCreateDocValue.RECIPIENT_STATE_CODE]: new FormControl(
        '', []
      ),
      //payments: this.formBuilder.array([this.createPaymentGroup()]),

      [FieldsCreateDocValue.SUM]: new FormControl(
        '', [Validators.required, Validators.pattern(/^\d+$/)]
      ),
      [FieldsCreateDocValue.DATE]: new FormControl(
        '', Validators.required,
      ),
      [FieldsCreateDocValue.DOC_DESCRIPTION]: new FormControl(
        '', Validators.required,
      ),
      [FieldsCreateDocValue.DOCUMENT_DATE]: new FormControl(
        '', Validators.required,
      ),
      [FieldsCreateDocValue.CURRENCY]: new FormControl(
        '', Validators.required,
      ),
    });

    this.paymentsForm = new FormGroup({
      payments: new FormArray([this.createPaymentGroup()])  // Initialize with 1 group
    });
    // valueChanges subscribe
    this.paymentsFormArray.valueChanges.subscribe((forms: any[]) => {
      //console.log("in values changes");
      
      // Initialize overall totals
      let totals = {
        sumBefDisBefVat: 0,
        sumAftDisBefVAT: 0,
        vatSum: 0,
        sumAftDisWithVAT: 0,
      };

      forms.forEach((item, index) => {
        const sum = Number(item.sum) || 0;
        const discount = Number(item.discount) || 0;
        const vatOption = item.vatOptions;
        // console.log("🚀 ~ DocCreatePage ~ forms.forEach ~ vatOption:", vatOption)
        let sumBefDisBefVat = 0;
        let sumAfterDisBefVat = 0;
        let vatAmount = 0;
        let sumAftDisWithVAT = 0;
        let sumBeforeVat = 0;
        // let sumWithVat = 0;
        // let sumAfterDis = 0;

        if (vatOption === 'BEFORE') {
          // Discount applied before VAT calculation
          sumBefDisBefVat = sum;
          sumAfterDisBefVat = sum - discount; // For discount in number
          //sumAfterDisBefVat = sum - (sum  * discount / 100); // For discount in percentage
          vatAmount = sum * this.vatRate;
          sumAftDisWithVAT = sumAfterDisBefVat + vatAmount;
          // sumWithVat = sum + vatAmount;
          sumAfterDisBefVat = sum;
        } 
        else if (vatOption === 'AFTER') {
          // Discount applied after VAT calculation
          vatAmount = sum / (1 + this.vatRate);
          sumBefDisBefVat = sum / (1 + this.vatRate) + discount;
          sumAfterDisBefVat = sumBefDisBefVat - discount; // For discount in number
          //sumAfterDisBefVat = sumBefDisBefVat - (sumBefDisBefVat  * discount / 100); // For discount in percentage
          sumAftDisWithVAT = sum;
          //sumBeforeVat = sum - vatAmount;
          // sumWithVat = sum;
        } 
        else if (vatOption === 'WITH_OUT') {
          // No VAT is applied
          vatAmount = 0;
          sumBeforeVat = sum;
          // sumWithVat = sum;
          // sumDis = sum - discount; // For discount in number
          // sumAfterDis = sum - (sum  * discount / 100); // For discount in percentage
          sumAfterDisBefVat = sum - discount;
          sumAftDisWithVAT = sumAfterDisBefVat;
        }

        // Optionally, update the FormGroup with calculated values:
        const formGroup = this.getPaymentsForm['controls'][index];
        formGroup.patchValue({
          sumAfterDisBefVat: sumAfterDisBefVat,
          vatSum: vatAmount,
          sumAftDisWithVAT: sumAftDisWithVAT
        }, { emitEvent: false });
          // console.log("🚀 ~ DocCreatePage ~ forms.forEach ~ sumAftDisWithVAT:", sumAftDisWithVAT)
          // console.log("🚀 ~ DocCreatePage ~ forms.forEach ~ vatAmount:", vatAmount)
          // console.log("🚀 ~ DocCreatePage ~ forms.forEach ~ sumAfterDisBefVat:", sumAfterDisBefVat)

        // Accumulate totals
        totals.sumBefDisBefVat += sum;
        totals.sumAftDisBefVAT += sumAfterDisBefVat;
        totals.vatSum += vatAmount;
        totals.sumAftDisWithVAT += sumAftDisWithVAT;
      });

      // Here you can assign totals to a property if you need to display overall values
      this.overallTotals = totals;
    });

    this.initialDetailsForm = this.formBuilder.group({
      initialIndex: new FormControl(
        '', [Validators.required, Validators.pattern(/^\d+$/)]
      ),
      //  currentIndex: new FormControl(
      //   '', [Validators.pattern(/^\d+$/)]
      // ),
      //  docType: new FormControl(
      //    this.fileSelected, Validators.required,
      //  ),
    });
  }


  ngOnInit() {
    this.userDetails = this.authService.getUserDataFromLocalStorage();
  }

  createPaymentGroup(): FormGroup {
    return new FormGroup({
      [FieldsCreateDocValue.SUM]: new FormControl(
        '', Validators.required,
      ),
      [FieldsCreateDocValue.DESCRIPTION]: new FormControl(
        '', Validators.required,
      ),
      [FieldsCreateDocValue.PAYMENT_METHOD]: new FormControl(
        '', Validators.required,
      ),
      [FieldsCreateDocValue.UNIT_AMOUNT]: new FormControl(
        '', Validators.required,
      ),
      [FieldsCreateDocValue.VAT_OPTION]: new FormControl(
        '', Validators.required,
      ),
      [FieldsCreateDocValue.DISCOUNT]: new FormControl(
        '', Validators.required,
      ),
      [FieldsCreateDocValue.SUM_BEF_DIS_BEF_VAT]: new FormControl(
        '', Validators.required,
      ),
      [FieldsCreateDocValue.SUM_AFTER_DIS_BEF_VAT]: new FormControl(
        '', Validators.required,
      ),
      [FieldsCreateDocValue.VAT_SUM]: new FormControl(
        '', Validators.required,
      ),
      [FieldsCreateDocValue.SUM_AFTER_DIS_WITH_VAT]: new FormControl(
        '', Validators.required,
      ),
    });
  }

  addPayment(): void {
    //this.paymentsForm.push(this.createPaymentGroup());
    const items = this.paymentsForm?.get('payments') as FormArray;
    items.push(this.createPaymentGroup());
  }

  removePayment(index: number): void {
    //this.paymentsForm.removeAt(index);
    const items = this.paymentsForm.get('payments') as FormArray;
    items.removeAt(index);
  }

  getPaymentFormByIndex(index: number): FormGroup {
    return this.paymentsFormArray.at(index) as FormGroup;
  }

  get getPaymentsForm(): FormGroup {
    return this.paymentsForm.get('payments') as FormGroup;
  }

  get paymentsFormArray(): FormArray {
    return this.paymentsForm.get('payments') as FormArray;
  }

  onSelectedDoc(event: any): void {
    this.fileSelected = event.value;
    console.log("🚀 ~ DocCreatePage ~ onSelectedFile ~ fileSelected:", this.fileSelected);
    this.getHebrewNameDoc(event.value);
    switch (event.value) {
      case 1:
        this.showUserDetailsCard = true;
        this.showPatmentDetailsCard = true;
        break;
      case 2:
        this.showUserDetailsCard = false;
        this.showPatmentDetailsCard = true;
        break;
    }
    this.getFields();
    this.getDocDetails()
  }

  onClickInitialIndex(): void {
    const formData = this.initialDetailsForm.value;
    this.docCreateService.setInitialDocDetails(formData, this.fileSelected)
      .pipe(
        catchError((err) => {
          console.log("err in set initial index: ", err);
          return EMPTY;
        })
      )
      .subscribe((res) => {
        console.log("res in set initial index: ", res);
        this.isInitial = false;
      })

  }

  getHebrewNameDoc(typeDoc: string): void {
    const temp = this.DocCreateTypeList.find((doc) => doc.value === typeDoc);
    if (temp) this.HebrewNameFileSelected = temp.name;
  }

  getFields(): void {
    switch (this.fileSelected) {
      case 'RECEIPT': // receipt

        this.generalDetailsFields = [
          { name: FieldsCreateDocName.documentDate, value: FieldsCreateDocValue.DOCUMENT_DATE, type: FormTypes.DATE },
          { name: FieldsCreateDocName.reasonPayment, value: FieldsCreateDocValue.DOC_DESCRIPTION, type: FormTypes.TEXT },
        ];
        this.userDetailsFields = [
          { name: FieldsCreateDocName.recipientName, value: FieldsCreateDocValue.RECIPIENT_NAME, type: FormTypes.TEXT },
          { name: FieldsCreateDocName.recipientId, value: FieldsCreateDocValue.RECIPIENT_ID, type: FormTypes.TEXT },
          // { name: FieldsCreateDocName.recipientAddress, value: FieldsCreateDocValue.RECIPIENT_ADDRESS, type: FormTypes.TEXT },
          { name: FieldsCreateDocName.recipientPhone, value: FieldsCreateDocValue.RECIPIENT_PHONE, type: FormTypes.TEXT },
          { name: FieldsCreateDocName.recipientEmail, value: FieldsCreateDocValue.RECIPIENT_EMAIL, type: FormTypes.TEXT },
        ];
        this.paymentDetailsFields = [
          { name: FieldsCreateDocName.sum, value: FieldsCreateDocValue.SUM, type: FormTypes.TEXT },
          { name: FieldsCreateDocName.paymentMethod, value: FieldsCreateDocValue.PAYMENT_METHOD, type: FormTypes.DDL },
          { name: FieldsCreateDocName.description, value: FieldsCreateDocValue.DESCRIPTION, type: FormTypes.TEXT },
          { name: FieldsCreateDocName.unitAmount, value: FieldsCreateDocValue.UNIT_AMOUNT, type: FormTypes.TEXT },
          { name: FieldsCreateDocName.vatOptions, value: FieldsCreateDocValue.VAT_OPTION, type: FormTypes.DDL },
          { name: FieldsCreateDocName.discount, value: FieldsCreateDocValue.DISCOUNT, type: FormTypes.TEXT },
        ];
        break;

      case 'TAX_INVOICE': // invoice tax
        this.userDetailsFields = [
          { name: FieldsCreateDocName.date, value: FieldsCreateDocValue.DATE, type: FormTypes.DATE },
        ];
        this.paymentDetailsFields = [
          { name: FieldsCreateDocName.paymentMethod, value: FieldsCreateDocValue.PAYMENT_METHOD, type: FormTypes.TEXT },
        ];
        break;
      default:
        break;
    }
  }

  getDocDetails(): void {
    this.docCreateService.getDetailsDoc(this.fileSelected)
      .pipe(
        catchError((err) => {
          console.log("err in get doc details: ", err);
          if (err.status === 404) {
            this.isInitial = true;
          }
          else {
            //TODO: handle error screen
          }
          return EMPTY;
        }),
        tap((data) => {
          if (!data.initialIndex) this.isInitial = true;
          else this.isInitial = false;
          console.log("this.isInitial: ", this.isInitial);

        })
      )
      .subscribe((res) => {
        console.log("res in get doc details: ", res);
        this.docDetails = res;
      })
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
    this.docCreateForm.patchValue({
      [FieldsCreateDocValue.RECIPIENT_NAME]: client.name,
      [FieldsCreateDocValue.RECIPIENT_EMAIL]: client.email,
      [FieldsCreateDocValue.RECIPIENT_PHONE]: client.phone,
    });
  }

  saveClient() {
    const { [FieldsCreateDocValue.RECIPIENT_NAME]: name, [FieldsCreateDocValue.RECIPIENT_EMAIL]: email, [FieldsCreateDocValue.RECIPIENT_PHONE]: phone } = this.docCreateForm.value;
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

  onDdlSelectionChange(event: any): ISelectItem[] {
    //console.log("🚀 ~ DocCreatePage ~ onDdlSelectionChange ~ event", event);
    switch (event) {
      case "paymentMethod":
        //console.log("🚀 ~ DocCreatePage ~ onDdlSelectionChange ~ paymentId");
        return this.paymentMethodList;
      case "vatOptions":
        return this.vatOptionList;
      default:
        break;
    }
    return null;
  }

  // createReceiptDoc(flag: string): void {
  //   if (flag === 'Preview') {
  //     this.createPreviewPDFIsLoading = true;
  //   } 
  //   else if (flag === 'Create') {
  //     this.createPDFIsLoading = true;
  //   }
  //   const formData = this.docCreateForm.value;
  //   let dataTable: (string | number)[][] = [];
  //   // this.paymentsFormArray.c  .forEach((expense) => {
  //   //   dataTable.push([String(expense.total), expense.category]);
  //   // })
  //   //console.log("dataTable: ", dataTable);
  //   dataTable.push([formData.sum, formData.date, formData.paymentId, formData.note]);
  //   console.log("dataTable: ", dataTable);

  //   const data: ICreateDataDoc = {
  //     fid: "RVxpym2O68",
  //     prefill_data: {
  //       userName: formData.clientName,
  //       currentIndex: this.docDetails.currentIndex,
  //       reasonPayment: formData.reasonPayment,
  //       table: dataTable,
  //     },
  //     digitallySign: true
  //   }

  //   this.docCreateService.createPDF(data)
  //   .pipe(
  //     finalize(() => {
  //       this.createPDFIsLoading = false; 
  //       this.createPreviewPDFIsLoading = false; 
  //     }),
  //     catchError((err) => {
  //       console.log("err in create pdf: ", err);
  //       return EMPTY;
  //     })  
  //   )
  //   .subscribe((res) => {
  //     console.log("res in create pdf: ", res);
  //     if (this.createPDFIsLoading) {
  //       this.fileService.downloadFile("my pdf", res);
  //       this.docCreateService.updateCurrentIndex(this.fileSelected)
  //     }else if (this.createPreviewPDFIsLoading) {
  //       this.fileService.previewFile1(res)
  //     }
  //   })
  // }

  getPaymentMethodHebrew(paymentMethod: string): string {
    console.log("🚀 ~ DocCreatePage ~ getPaymentMethodHebrew ~ paymentMethod:", paymentMethod)
    const temp = this.paymentMethodList.find((payment) => payment.value === paymentMethod);
    console.log("🚀 ~ DocCreatePage ~ getPaymentMethodHebrew ~ temp:", temp)
    if (temp) return temp.name;
    return null;
  }

  getDocData(): ICreateDataDoc {
    const formData = this.docCreateForm.value;
    console.log("🚀 ~ DocCreatePage ~ getReceiptData ~  formData:", formData)
    const payments = this.paymentsFormArray.value;
    console.log("🚀 ~ DocCreatePage ~ getDocData ~ payments:", payments)
    let dataTable: (string | number)[][] = [];
    payments.forEach((payment: any) => {
      payment.paymentMethod = this.getPaymentMethodHebrew(payment.paymentMethod);
      dataTable.push([payment[FieldsCreateDocValue.SUM], payment[FieldsCreateDocValue.DESCRIPTION], payment[FieldsCreateDocValue.PAYMENT_METHOD], payment[FieldsCreateDocValue.UNIT_AMOUNT], payment[FieldsCreateDocValue.VAT_OPTION], payment[FieldsCreateDocValue.DISCOUNT], payment.sumAfterDisBefVat, payment.vatSum, payment.sumAftDisWithVAT, this.userDetails?.businessName, ], );
      //generalDocIndex // create in server

    });
    formData.paymentMethod = this.getPaymentMethodHebrew(formData.paymentMethod);
    console.log("dataTable: ", dataTable);

    return {
      fid: this.getFid(),
      prefill_data: {
        table: dataTable,
        issuerName: this.userDetails?.businessName,
        issuerAddress: this.userDetails?.city,
        issuerPhone: this.userDetails?.phone,
        issuerEmail: this.userDetails?.email,
        issuerbusinessNumber: this.userDetails?.businessNumber,
        recipientName: formData?.recipientName,
        recipientId: formData?.recipientId || null,
        recipientStreet: formData?.recipientStreet || null,
        recipientHomeNumber: formData?.recipientHomeNumber || null,
        recipientCity: formData?.recipientCity || null,
        recipientPostalCode: formData?.recipientPostalCode || null,
        recipientState: formData?.recipientState || null,
        recipientStateCode: formData?.recipientStateCode || null,
        recipientPhone: formData?.recipientPhone || null,
        recipientEmail: formData?.recipientEmail || null,
        docType: this.fileSelected,
        //generalDocIndex // create in server
        docDescription: formData?.reasonPayment,
        docNumber: this.docDetails?.currentIndex,
        docVatRate: this.fileSelected === 'RECEIPT' ? 0 : 18, // VAT rate is 0 for receipts and 18 for invoices
        transType: 3,
        amountForeign: this.totalAmount, // Check with elazar
        currency: formData?.currency || 'ILS',
        sumBefDisBefVat: 0, // need to update
        disSum: 0, // need to update - per line or doc??
        sumAftDisBefVAT: 450, // need to update 
        vatSum: this.vatAmount ?? 0,
        sumAftDisWithVAT: 450, // need to update
        withholdingTaxAmount: 0, // need to update 
        docDate: formData.documentDate, // Check with elazar
        // issueDate: create in server
        // valueDate: null, // Check with elazar create in server??
        // issueHour: create in server
        customerKey: null, // Check with elazar
        matchField: null, // Check with elazar
        isCancelled: false, // TODO: Change to dinamic value
        branchCode: null, // Check with elazar
        operationPerformer: null, // Check with elazar
        parentDocType: null, // Check with elazar
        parentDocNumber: null, // Check with elazar
        parentBranchCode: null, // Check with elazar
        // amountBeforeTax: formData?.amountBeforeTax ?? formData.sum,
        // totalAmount: this.totalAmount, // If currency is not ILS need to calculate the total amount
        // paymentMethod: formData.paymentMethod, // Per line
        // referenceNumber: formData?.referenceNumber || null,// check with elazar
        // notes: formData?.note || null, // Per line
        // cancellationReason: formData?.cancellationReason || false, // check with elazar
      },
      digitallySign: true
    };
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

  // addDoc(): void {
  //   this.addPDFIsLoading = true;
  //   const data = this.getDocData();
  //   console.log("🚀 ~ DocCreatePage ~ addDoc ~ data:", data)

  //   this.docCreateService.addDoc(data)
  //     .pipe(
  //       catchError((err) => {
  //         console.error("Error in addDoc:", err);
  //         return EMPTY;
  //       }),
  //       finalize(() => {
  //         this.addPDFIsLoading = false;
  //       }),
  //     )
  //     .subscribe((res) => {
  //       console.log("addDoc result:", res);
  //     });
  // }

  // getDocData(): any {
  //   const formData = this.docCreateForm.value;
  //   const data = {
  //     documentType: this.fileSelected,
  //     issuerName: this.userDetails?.businessName,
  //     issuerId: this.userDetails?.businessNumber,
  //     issuerAddress: this.userDetails?.city,
  //     issuerPhone: this.userDetails?.phone,
  //     issuerEmail: this.userDetails?.email,
  //     recipientName: formData?.recipientName,
  //     recipientId: formData?.recipientId || null,
  //     recipientAddress: formData?.recipientAddress || null,
  //     recipientPhone: formData?.recipientPhone || null,
  //     recipientEmail: formData?.recipientEmail || null,
  //     amountBeforeTax: formData?.amountBeforeTax ?? formData.sum,
  //     vatRate: this.fileSelected === 1 ? 0 : 18, // VAT rate is 0 for receipts and 18 for invoices
  //     vatAmount: formData.vatAmount ?? 0,
  //     totalAmount: formData.amountBeforeTax ? formData.amountBeforeTax  + formData.vatAmount : formData.sum,
  //     paymentDescription: formData?.reasonPayment,
  //     paymentMethod: formData.paymentMethod,
  //     documentDate: formData.documentDate, // Check with elazar
  //     referenceNumber: formData?.referenceNumber || null,
  //     notes: formData?.note || null,
  //     isCancelled: false, // TODO: Change to dinamic value
  //     cancellationReason: formData?.cancellationReason || null,
  //   };
  //   return data;
  // }

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
    // console.log("🚀 ~ DocCreatePage ~ onBlur ~ event:", event);
    const vatOptionControl = this.paymentsFormArray.controls[i]?.get(FieldsCreateDocValue.VAT_OPTION);
    // console.log("🚀 ~ DocCreatePage ~ onBlur ~ paymentMethodControl:", vatOptionControl)
    if (!vatOptionControl.value) return; // If don't choosen vat option

    if (field !== "sum") return; // If it is not "sum" field
    this.onVatOptionChange(vatOptionControl, i)
    console.log("on blur");

  }

  onVatOptionChange(event: any, formIndex: number): void {
    // console.log("🚀 ~ DocCreatePage ~ onVatOptionChange ~ value:", event.value)
    const sumControl = this.paymentsFormArray.controls[formIndex]?.get(FieldsCreateDocValue.SUM);
    // console.log("🚀 ~ DocCreatePage ~ onVatOptionChange ~ this.paymentsFormArray[formIndex].get(FieldsCreateDocValue.SUM):", this.paymentsFormArray.controls[formIndex]?.get(FieldsCreateDocValue.SUM))
    // console.log("🚀 ~ DocCreatePage ~ onVatOptionChange ~ this.paymentsFormArray[formIndex]:", this.paymentsFormArray)
    // console.log("🚀 ~ DocCreatePage ~ onVatOptionChange ~ sumControl:", sumControl)
    if (!sumControl) return;

    const sum = parseFloat(sumControl.value);
    // console.log("🚀 ~ DocCreatePage ~ onVatOptionChange ~ sum:", sum)
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
    // console.log("🚀 ~ DocCreatePage ~ onVatOptionChange ~ vatAmount:", this.vatAmount)
    // console.log("🚀 ~ DocCreatePage ~ onVatOptionChange ~ totalAmount:", this.totalAmount)
    // console.log("after calc");
    // console.log("🚀 ~ DocCreatePage ~ onVatOptionChange ~ amountBeforeVat:", this.amountBeforeVat)

    // this.paymentsFormArray.controls[formIndex].patchValue({
    //   amountBeforeVat,
    //   vatAmount,
    //   totalAmount
    // });
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

}