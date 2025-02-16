import { Component, OnInit } from '@angular/core';
import { FormArray, FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { EMPTY, Observable, catchError, finalize, forkJoin, from, map, of, switchMap, tap } from 'rxjs';
import { FieldsCreateDocName, FieldsCreateDocValue, FormTypes } from 'src/app/shared/enums';
import { Router } from '@angular/router';
import { ICreateDataDoc, ICreateDocField, ISelectItem, ISettingDoc, } from 'src/app/shared/interface';
import { DocCreateService } from './doc-create.service';
import { ModalController } from '@ionic/angular';
import { SelectClientComponent } from 'src/app/shared/select-client/select-client.component';
import { GenericService } from 'src/app/services/generic.service';
import { FilesService } from 'src/app/services/files.service';







@Component({
  selector: 'app-doc-create',
  templateUrl: './doc-create.page.html',
  styleUrls: ['./doc-create.page.scss', '../../shared/shared-styling.scss'],
})
export class DocCreatePage implements OnInit {

  docCreateForm: FormGroup;
  //paymentsForm: FormGroup;
  initialDetailsForm: FormGroup;
  userDetailsFields: ICreateDocField<FieldsCreateDocName, FieldsCreateDocValue>[] = [];
  paymentDetailsFields: ICreateDocField<FieldsCreateDocName, FieldsCreateDocValue>[] = [];
  showUserDetailsCard: boolean = false;
  showPatmentDetailsCard: boolean = false;
  serialNumberFile: ISettingDoc;
  fileSelected: number;
  HebrewNameFileSelected: string;
  isInitial: boolean = false;
  docDetails: ISettingDoc;
  createPDFIsLoading: boolean = false;

  readonly DocCreateTypeList = [
    { value: 1, name: 'קבלה' },
    { value: 2, name: 'חשבונית מס' },
    { value: 3, name: 'חשבונית מס קבלה' },
    { value: 4, name: 'חשבונית עסקה' },
    { value: 5, name: 'חשבונית זיכוי' },
    { value: 6, name: 'הצעת מחיר' },
    { value: 7, name: 'הזמנת עבודה' },
    { value: 8, name: 'תעודת משלוח' },
    { value: 9, name: 'תעודת החזרה' },
  ];

  readonly paymentMethodList = [
    { value: 'העברה בנקאית' , name: 'העברה בנקאית' },
    { value: 'מזומן', name: 'מזומן' },
    { value: 'ביט', name: 'ביט' },
    { value: 'פייבוקס', name: 'פייבוקס' },
    { value: "צ'ק", name: "צ'ק" },
  ];

  readonly formTypes = FormTypes;
  
  
  constructor(private fileService: FilesService, private genericService: GenericService, private modalController: ModalController, private router: Router, public docCreateService: DocCreateService, private formBuilder: FormBuilder) {
    // const paymentsForm = this.formBuilder.group({
    //   payments: this.formBuilder.array([this.createPaymentGroup()]),
    //     });

    this.docCreateForm = this.formBuilder.group({
      [FieldsCreateDocValue.CLIENT_NAME]: new FormControl(
        '', Validators.required,
      ),
      [FieldsCreateDocValue.CLIENT_EMAIL]: new FormControl(
        '', Validators.required,
      ),
      [FieldsCreateDocValue.CLIENT_PHONE]: new FormControl(
        '', Validators.required,
      ),
      [FieldsCreateDocValue.CLIENT_ADDRESS]: new FormControl(
        '', Validators.required,
      ),
      //payments: this.formBuilder.array([this.createPaymentGroup()]),
        
      [FieldsCreateDocValue.SUM]: new FormControl(
        '', Validators.required,
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
      [FieldsCreateDocValue.PAYMENT_ID]: new FormControl(
        '', Validators.required,
      ),
    });

    // this.paymentsForm = new FormGroup({
    //   payments: new FormArray([this.createPaymentGroup()])  // Initialize with 1 group
    // });

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
    console.log("🚀 ~ DocCreatePage ~ getpaymentsFormArray ~ paymentsFormArray:", this.paymentsForm)
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
      // [FieldsCreateDocValue.REASON_PAYMENT]: new FormControl(
      //   '', Validators.required,
      // ),
      [FieldsCreateDocValue.PAYMENT_ID]: new FormControl(
        '', Validators.required,
      ),
    });
  }

  addPayment(): void {
    //this.paymentsForm.push(this.createPaymentGroup());
    const items = this.paymentsForm.get('payments') as FormArray;
    items.push(this.createPaymentGroup());
  }

  removePayment(index: number): void {
    //this.paymentsForm.removeAt(index);
    const items = this.paymentsForm.get('payments') as FormArray;
    items.removeAt(index);
  }

  get paymentsForm(): FormGroup {
    return this.docCreateForm.get('payments') as FormGroup;
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

  getHebrewNameDoc(typeDoc: number): void {
    //console.log("🚀 ~ DocCreatePage ~ getHebrewNameDoc ~ typeDoc:", typeDoc)
    const temp = this.DocCreateTypeList.find((doc) => doc.value === typeDoc);
    //console.log('temp: ', temp);
    if (temp) this.HebrewNameFileSelected = temp.name;
  }

  getFields(): void {
    switch (this.fileSelected) {
      case 1: // receipt
        this.userDetailsFields = [
          { name: FieldsCreateDocName.clientName, value: FieldsCreateDocValue.CLIENT_NAME, type: FormTypes.TEXT },
          // { name: FieldsCreateDocName.clientAddress, value: FieldsCreateDocValue.CLIENT_ADDRESS, type: FormTypes.TEXT },
          { name: FieldsCreateDocName.clientPhone, value: FieldsCreateDocValue.CLIENT_PHONE, type: FormTypes.TEXT },
          { name: FieldsCreateDocName.clientEmail, value: FieldsCreateDocValue.CLIENT_EMAIL, type: FormTypes.TEXT },
        ];
        this.paymentDetailsFields = [
          { name: FieldsCreateDocName.sum, value: FieldsCreateDocValue.SUM, type: FormTypes.TEXT },
          { name: FieldsCreateDocName.paymentId, value: FieldsCreateDocValue.PAYMENT_ID, type: FormTypes.DDL },
          { name: FieldsCreateDocName.reasonPayment, value: FieldsCreateDocValue.REASON_PAYMENT, type: FormTypes.TEXT },
          { name: FieldsCreateDocName.note, value: FieldsCreateDocValue.NOTE, type: FormTypes.TEXT },
          { name: FieldsCreateDocName.date, value: FieldsCreateDocValue.DATE, type: FormTypes.DATE },
        ];
        break;

      case 2: // invoice tax
        this.userDetailsFields = [
          { name: FieldsCreateDocName.date, value: FieldsCreateDocValue.DATE, type: FormTypes.DATE },
        ];
        this.paymentDetailsFields = [
          { name: FieldsCreateDocName.paymentId, value: FieldsCreateDocValue.PAYMENT_ID, type: FormTypes.TEXT },
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
      [FieldsCreateDocValue.CLIENT_NAME]: client.name,
      [FieldsCreateDocValue.CLIENT_EMAIL]: client.email,
      [FieldsCreateDocValue.CLIENT_PHONE]: client.phone,
      [FieldsCreateDocValue.CLIENT_ADDRESS]: client.address,
    });
  }

  saveClient() {
    const { [FieldsCreateDocValue.CLIENT_NAME]: name, [FieldsCreateDocValue.CLIENT_EMAIL]: email, [FieldsCreateDocValue.CLIENT_PHONE]: phone, [FieldsCreateDocValue.CLIENT_ADDRESS]: address } = this.docCreateForm.value;
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
      case "paymentId":
        //console.log("🚀 ~ DocCreatePage ~ onDdlSelectionChange ~ paymentId");
        return this.paymentMethodList;
      default:
        break;
    }
    return null;
  }

  createReceiptDoc() {
    this.createPDFIsLoading = true;
    const formData = this.docCreateForm.value;
    let dataTable: (string | number)[][] = [];
    // this.paymentsFormArray.c  .forEach((expense) => {
    //   dataTable.push([String(expense.total), expense.category]);
    // })
    //console.log("dataTable: ", dataTable);
    dataTable.push([formData.sum, formData.date, formData.paymentId, formData.note]);
    console.log("dataTable: ", dataTable);
    
    const data: ICreateDataDoc = {
      fid: "RVxpym2O68",
      prefill_data: {
        userName: formData.clientName,
        currentIndex: this.docDetails.currentIndex,
        reasonPayment: formData.reasonPayment,
        table: dataTable,
      },
      digitallySign: true
    }

    this.docCreateService.createPDF(data)
    .pipe(
      finalize(() => this.createPDFIsLoading = false),
      catchError((err) => {
        console.log("err in create pdf: ", err);
        return EMPTY;
      })  
    )
    .subscribe((res) => {
      console.log("res in create pdf: ", res);
      this.fileService.downloadFile("my pdf", res)
    })
  }
}