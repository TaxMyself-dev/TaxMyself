import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { EMPTY, Observable, catchError, finalize, forkJoin, from, map, of, switchMap, tap } from 'rxjs';
import { FieldsCreateDocName, FieldsCreateDocValue, FormTypes } from 'src/app/shared/enums';
import { Router } from '@angular/router';
import { ICreateDocField, ISettingDoc, } from 'src/app/shared/interface';
import { DocCreateService } from './doc-create.service';
import { ModalController } from '@ionic/angular';
import { SelectClientComponent } from 'src/app/shared/select-client/select-client.component';





interface FieldTitles {
  [key: string]: string;
}

@Component({
  selector: 'app-doc-create',
  templateUrl: './doc-create.page.html',
  styleUrls: ['./doc-create.page.scss', '../../shared/shared-styling.scss'],
})
export class DocCreatePage implements OnInit {

  docCreateForm: FormGroup;
  initialDetailsForm: FormGroup;
  userDetailsFields: ICreateDocField<FieldsCreateDocName, FieldsCreateDocValue>[] = [];
  paymentDetailsFields: ICreateDocField<FieldsCreateDocName, FieldsCreateDocValue>[] = [];
  showUserDetailsCard: boolean = false;
  showPatmentDetailsCard: boolean = false;
  serialNumberFile: ISettingDoc;
  fileSelected: number;
  HebrewNameFileSelected: string;
  isInitial: boolean = false;

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

  readonly formTypes = FormTypes;


  constructor(private modalController: ModalController, private router: Router, public docCreateService: DocCreateService, private formBuilder: FormBuilder) {
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
      [FieldsCreateDocValue.PAYMENT_ID]: new FormControl(
        '', Validators.required,
      ),
      [FieldsCreateDocValue.SUM]: new FormControl(
        '', Validators.required,
      ),
      [FieldsCreateDocValue.DATE]: new FormControl(
        '', Validators.required,
      ),
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
      case 1:
        this.userDetailsFields = [
          { name: FieldsCreateDocName.clientName, value: FieldsCreateDocValue.CLIENT_NAME, type: FormTypes.TEXT },
          { name: FieldsCreateDocName.clientAddress, value: FieldsCreateDocValue.CLIENT_ADDRESS, type: FormTypes.TEXT },
          { name: FieldsCreateDocName.clientPhone, value: FieldsCreateDocValue.CLIENT_PHONE, type: FormTypes.TEXT },
          { name: FieldsCreateDocName.clientEmail, value: FieldsCreateDocValue.CLIENT_EMAIL, type: FormTypes.TEXT },
        ];
        this.paymentDetailsFields = [
          { name: FieldsCreateDocName.sum, value: FieldsCreateDocValue.SUM, type: FormTypes.TEXT },
        ];
        break;

      case 2:
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
      if (res.role === 'success') {// if the popover closed due to onblur dont change values 
        if (res !== null && res !== undefined) {
          if (res) {

          }
        }
      }
    })
  }

  saveClient() {
    console.log("🚀 ~ DocCreatePage ~ saveClient ~ this.docCreateForm.value", this.docCreateForm.value);
    const {[FieldsCreateDocValue.CLIENT_NAME]: name, [FieldsCreateDocValue.CLIENT_EMAIL]: email, [FieldsCreateDocValue.CLIENT_PHONE]: phone, [FieldsCreateDocValue.CLIENT_ADDRESS]: address} = this.docCreateForm.value;
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
          return EMPTY;
        })
      )
      .subscribe((res) => {
        console.log("res in save client: ", res);
      })
  }

}