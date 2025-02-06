import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { EMPTY, Observable, catchError, finalize, forkJoin, from, map, of, switchMap, tap } from 'rxjs';
import { FieldsCreateFileName, FieldsCreateFileValue, FormTypes } from 'src/app/shared/enums';
import { Router } from '@angular/router';
import { ICreateFileField, ISettingDoc,  } from 'src/app/shared/interface';
import { DocCreateService } from './doc-create.service';





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
  userDetailsFields: ICreateFileField<FieldsCreateFileName, FieldsCreateFileValue>[] = [];
  paymentDetailsFields: ICreateFileField<FieldsCreateFileName, FieldsCreateFileValue>[] = [];
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


  constructor(private router: Router, public docCreateService: DocCreateService, private formBuilder: FormBuilder) {
    this.docCreateForm = this.formBuilder.group({
     [ FieldsCreateFileValue.USER_NAME]: new FormControl(
        '', Validators.required,
      ),
      [FieldsCreateFileValue.PAYMENT_ID]: new FormControl(
        '', Validators.required,
      ),
      [FieldsCreateFileValue.SUM]: new FormControl(
        '', Validators.required,
      ),
      [FieldsCreateFileValue.DATE]: new FormControl(
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

  onSelectedFile(event: any): void {
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
          {name: FieldsCreateFileName.userName, value: FieldsCreateFileValue.USER_NAME, type: FormTypes.TEXT },
        ];
        this.paymentDetailsFields = [
          {name: FieldsCreateFileName.sum, value: FieldsCreateFileValue.SUM, type: FormTypes.TEXT },
        ];
        break;

      case 2:
        this.userDetailsFields = [
          {name: FieldsCreateFileName.date, value: FieldsCreateFileValue.DATE, type: FormTypes.DATE },
        ];
        this.paymentDetailsFields = [
          {name: FieldsCreateFileName.paymentId, value: FieldsCreateFileValue.PAYMENT_ID, type: FormTypes.TEXT },
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


}