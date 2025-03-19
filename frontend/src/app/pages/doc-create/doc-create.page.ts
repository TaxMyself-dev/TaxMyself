import { Component, OnInit } from '@angular/core';
import { FormArray, FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { EMPTY, Observable, catchError, finalize, forkJoin, from, map, of, switchMap, tap } from 'rxjs';
import { FieldsCreateDocName, FieldsCreateDocValue, FormTypes, PaymentMethodName, PaymentMethodValue } from 'src/app/shared/enums';
import { Router } from '@angular/router';
import { ICreateDataDoc, ICreateDocField, ISelectItem, ISettingDoc, IUserData, } from 'src/app/shared/interface';
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
    standalone: false
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

  // export enum DocumentType {
  //   RECEIPT = 'RECEIPT', // קבלה
  //   TAX_INVOICE = 'TAX_INVOICE', // חשבונית מס
  //   TAX_INVOICE_RECEIPT = 'TAX_INVOICE_RECEIPT', // חשבונית מס קבלה
  //   TRANSACTION_INVOICE = 'TRANSACTION_INVOICE', // חשבונית עסקה
  //   CREDIT_INVOICE = 'CREDIT_INVOICE', // חשבונית זיכוי
  // }

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

  readonly formTypes = FormTypes;


  constructor(private authService: AuthService, private fileService: FilesService, private genericService: GenericService, private modalController: ModalController, private router: Router, public docCreateService: DocCreateService, private formBuilder: FormBuilder) {
    // const paymentsForm = this.formBuilder.group({
    //   payments: this.formBuilder.array([this.createPaymentGroup()]),
    //     });

    this.docCreateForm = this.formBuilder.group({
      [FieldsCreateDocValue.RECIPIENT_NAME]: new FormControl(
        '', Validators.required,
      ),
      [FieldsCreateDocValue.RECIPIENT_ID]: new FormControl(
        '', [Validators.pattern(/^\d{9}$/)]
      ),
      [FieldsCreateDocValue.RECIPIENT_EMAIL]: new FormControl(
        '', [Validators.required, Validators.pattern(/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/)]
      ),
      [FieldsCreateDocValue.RECIPIENT_PHONE]: new FormControl(
        '', [Validators.required, Validators.pattern(/^(050|051|052|053|054|055|058|059)\d{7}$/)]
      ),
      [FieldsCreateDocValue.RECIPIENT_ADDRESS]: new FormControl(
        '', Validators.required,
      ),
      //payments: this.formBuilder.array([this.createPaymentGroup()]),

      [FieldsCreateDocValue.SUM]: new FormControl(
        '', [Validators.required, Validators.pattern(/^\d+$/)]
      ),
      [FieldsCreateDocValue.DATE]: new FormControl(
        '', Validators.required,
      ),
      [FieldsCreateDocValue.NOTE]: new FormControl(
        '', Validators.required,
      ),
      [FieldsCreateDocValue.REASON_PAYMENT]: new FormControl(
        '', Validators.required,
      ),
      [FieldsCreateDocValue.PAYMENT_METHOD]: new FormControl(
        '', Validators.required,
      ),
      [FieldsCreateDocValue.DOCUMENT_DATE]: new FormControl(
        '', Validators.required,
      ),
    });

    this.paymentsForm = new FormGroup({
      payments: new FormArray([this.createPaymentGroup()])  // Initialize with 1 group
    });

    console.log("🚀 ~ DocCreatePage ~ constructor ~ this.paymentsForm:", this.paymentsForm)

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
      [FieldsCreateDocValue.DATE]: new FormControl(
        '', Validators.required,
      ),
      [FieldsCreateDocValue.NOTE]: new FormControl(
        '', Validators.required,
      ),
      [FieldsCreateDocValue.PAYMENT_METHOD]: new FormControl(
        '', Validators.required,
      ),
    });
  }

  addPayment(): void {
    //this.paymentsForm.push(this.createPaymentGroup());
    const items = this.paymentsForm?.get('payments') as FormArray;
    console.log("🚀 ~ DocCreatePage ~ addPayment ~ items ~ before add:", items)
    items.push(this.createPaymentGroup());
    console.log("🚀 ~ DocCreatePage ~ addPayment ~ items ~ after add:", items)
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
          { name: FieldsCreateDocName.reasonPayment, value: FieldsCreateDocValue.REASON_PAYMENT, type: FormTypes.TEXT },
        ];
        this.userDetailsFields = [
          { name: FieldsCreateDocName.recipientName, value: FieldsCreateDocValue.RECIPIENT_NAME, type: FormTypes.TEXT },
          { name: FieldsCreateDocName.recipientId, value: FieldsCreateDocValue.RECIPIENT_ID, type: FormTypes.TEXT },
          { name: FieldsCreateDocName.recipientAddress, value: FieldsCreateDocValue.RECIPIENT_ADDRESS, type: FormTypes.TEXT },
          { name: FieldsCreateDocName.recipientPhone, value: FieldsCreateDocValue.RECIPIENT_PHONE, type: FormTypes.TEXT },
          { name: FieldsCreateDocName.recipientEmail, value: FieldsCreateDocValue.RECIPIENT_EMAIL, type: FormTypes.TEXT },
        ];
        this.paymentDetailsFields = [
          { name: FieldsCreateDocName.sum, value: FieldsCreateDocValue.SUM, type: FormTypes.TEXT },
          { name: FieldsCreateDocName.paymentMethod, value: FieldsCreateDocValue.PAYMENT_METHOD, type: FormTypes.DDL },
          { name: FieldsCreateDocName.note, value: FieldsCreateDocValue.NOTE, type: FormTypes.TEXT },
          { name: FieldsCreateDocName.date, value: FieldsCreateDocValue.DATE, type: FormTypes.DATE },
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
      [FieldsCreateDocValue.RECIPIENT_ADDRESS]: client.address,
    });
  }

  saveClient() {
    const { [FieldsCreateDocValue.RECIPIENT_NAME]: name, [FieldsCreateDocValue.RECIPIENT_EMAIL]: email, [FieldsCreateDocValue.RECIPIENT_PHONE]: phone, [FieldsCreateDocValue.RECIPIENT_ADDRESS]: address } = this.docCreateForm.value;
    const clientData = {
      name,
      email,
      phone,
      address
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
    formData.paymentMethod = this.getPaymentMethodHebrew(formData.paymentMethod);
    console.log("🚀 ~ DocCreatePage ~ getReceiptData ~  formData.paymentMethod:", formData.paymentMethod)
    const dataTable: (string | number)[][] = [
      [formData.sum, formData.date, formData.note, formData.paymentMethod]
    ];
    console.log("dataTable: ", dataTable);

    return {
      fid: this.getFid(),
      prefill_data: {
        currentIndex: this.docDetails?.currentIndex,
        table: dataTable,
        documentType: this.fileSelected,
        issuerName: this.userDetails?.businessName,
        issuerId: this.userDetails?.businessNumber,
        issuerAddress: this.userDetails?.city,
        issuerPhone: this.userDetails?.phone,
        issuerEmail: this.userDetails?.email,
        recipientName: formData?.recipientName,
        recipientId: formData?.recipientId || null,
        recipientAddress: formData?.recipientAddress || null,
        recipientPhone: formData?.recipientPhone || null,
        recipientEmail: formData?.recipientEmail || null,
        amountBeforeTax: formData?.amountBeforeTax ?? formData.sum,
        vatRate: this.fileSelected === 'RECEIPT' ? 0 : 18, // VAT rate is 0 for receipts and 18 for invoices
        vatAmount: formData.vatAmount ?? 0,
        totalAmount: formData.amountBeforeTax ? formData.amountBeforeTax + formData.vatAmount : formData.sum,
        paymentDescription: formData?.reasonPayment,
        paymentMethod: formData.paymentMethod,
        documentDate: formData.documentDate, // Check with elazar
        referenceNumber: formData?.referenceNumber || null,
        notes: formData?.note || null,
        isCancelled: false, // TODO: Change to dinamic value
        cancellationReason: formData?.cancellationReason || null,

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


}