import { Component, Input, OnInit, ViewChild, NgModule, Output, EventEmitter } from '@angular/core';
import { FormBuilder, FormGroup, FormControl, Validators, ReactiveFormsModule } from '@angular/forms';
import { IonModal, ModalController } from '@ionic/angular';
import { IonDatetime } from '@ionic/angular';
import { OverlayEventDetail } from '@ionic/core/components';
import { IColumnDataTable } from '../interface';
import axios from 'axios';
import { ModalSortProviderComponent } from '../modal-sort-provider/modal-sort-provider.component';
import { KeyValue } from '@angular/common';
import { PopupMessageComponent } from '../popup-message/popup-message.component';
import { ExpenseDataService } from 'src/app/services/expense-data.service';
import { FilesService } from 'src/app/services/files.service';
import { HttpClient, HttpParams } from '@angular/common/http';
import { EMPTY, Observable, throwError } from 'rxjs';
import { catchError, delay, finalize, map, startWith, switchMap, tap } from 'rxjs/operators';





@Component({
  selector: 'app-modal',
  templateUrl: './modal.component.html',
  styleUrls: ['./modal.component.scss'],
})
export class ModalExpensesComponent implements OnInit {

  myForm: FormGroup;

  @Input() columns: IColumnDataTable = {};
  //@Input() trigger!: string;
  @Output() onAddRowDataTable: EventEmitter<number> = new EventEmitter();

  message = '';
  public name: string = "";
  public tempcolumns: IColumnDataTable = {};
  public tempArrProv = [{ name: "עולם הדפוס", vat: "25", tax: "25" }, { name: "מיני מרקט צדוק", vat: "33", tax: "33" }, { name: "מקורות" }, { name: "חברת חשמל", vat: "66", tax: "66" }]; //need to get from server
  matches = [];
  selectedProvider = { name: "", vat: "", tax: "" };
  provInput = "";
  selctedFile: File | null = null;
  // uniqueId: string;
  // arrayFolder = ["111", "2222", "3333"];//id folder for user. change to our id of user
  selectedFile: string = "";

  constructor(private fileService: FilesService, private formBuilder: FormBuilder, private expenseDataServise: ExpenseDataService, private modalCtrl: ModalController, private http: HttpClient) {

    this.myForm = this.formBuilder.group({
      category: ['',],
      subCategory: ['',],
      supplier: ['',],
      sum: ['', Validators.required],
      taxPercent: ['', Validators.required],
      vatPercent: ['', Validators.required],
      date: ['', Validators.required],
      note: ['',],
      expenseNumber: ['',],
      supplierID: ['',],
      file: ['', Validators.required],
      equipment: [false,]
    });
  }

  fileSelected(event: any) {
    console.log("in file selected");
    let file = event.target.files[0];
    console.log(file);
    if (file) {
      console.log("in file ");
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        this.selectedFile = reader.result as string;
      }
    }
  }



  // לא הבנתי איך להשתמש בפונקיצה הזאת.
  onFormValueChanged(value: any) {
    console.log(value);
  }

  cancel() {
    this.modalCtrl.dismiss(null, 'cancel');
  }

 
  confirm() {
    let filePath = '';
    this.fileService.uploadFileViaFront(this.selectedFile).pipe(
      finalize(() => this.modalCtrl.dismiss(this.name, 'confirm')),
      catchError((err) => {
        alert('Something Went Wrong in first catchError: ' + err.error.message.join(', '))
        return EMPTY;
      }),
      map((res) => {
        console.log('Uploaded a data_url string! this is the response: ', res);
        filePath = res.metadata.fullPath;
        const token = localStorage.getItem('token');
        return this.setFormData(filePath, token);
      }),
      switchMap((res) => this.addExpenseData(res)),
      catchError((err) => {
        alert('Something Went Wrong in second catchError ' + err.error.message)
        this.fileService.deleteFile(filePath);
        return EMPTY; // of('error')
      })
    ).subscribe((res) => {
      console.log('Saved expense data in DB. The response is: ', res);
      if (res) { // TODO: why returning this object from BE?
        this.expenseDataServise.updateTable$.next(true); 
      }
    });
  }


  setFormData(filePath: string, token: string) {
    const formData = this.myForm.value;
    console.log("my-form: ", this.myForm);
    // TODO: chsnge from string to number in Form Builder to void casting here
    formData.sum = parseInt(formData.sum, 10);
    formData.taxPercent = parseInt(formData.taxPercent, 10);
    formData.vatPercent = parseInt(formData.vatPercent, 10);
    formData.date = formData.date ? new Date(formData.date).toISOString() : null;
    formData.file = filePath;
    formData.token = this.formBuilder.control(token).value; // TODO: check when token is invalid
    console.log(formData);
    return formData;
  }

  // TODO: change <any> , add type to data param
  addExpenseData(data: any): Observable<any> {
    return this.http.post('http://localhost:3000/expenses/add', data);
  }

  onWillDismiss(event: Event) {
    const ev = event as CustomEvent<OverlayEventDetail<string>>;
    if (ev.detail.role === 'confirm') {
      this.message = `Hello, ${ev.detail.data}!`;
    }
  }

  // closeCalendar() {
  //   this.datetimePicker.dismiss();
  // }


  checkIfProviderExist(event: any) {
    // Logic to check for matches between inputValue and tempArrProv
    console.log(this.provInput);

    const inputValue = event.target.value;
    this.matches = this.tempArrProv.filter(item => item.name.toLowerCase().includes(this.provInput.toLowerCase()));
    console.log('Matches:', this.matches);
    //this.openSearchProvider();
  }

  selectProvider(prov: any) {
    this.selectedProvider = prov;
    console.log(this.selectedProvider);
    this.matches = [];  // Hide the dropdown
    this.myForm.get('supplier').setValue(prov.name);
    this.myForm.get('taxPercent').setValue(prov.tax);
    this.myForm.get('vatPercent').setValue(prov.vat);
  }

  valueAscOrder(a: KeyValue<string, string>, b: KeyValue<string, string>): number {// stay the list of fields in the original order
    return 0;
  }

  //func to open the modal of search provider
  async openSearchProvider() {
    const modal = await this.modalCtrl.create({
      component: ModalSortProviderComponent,
      cssClass: 'modal-wrapper',
      componentProps: {
        matches: this.matches,
        // Add more props as needed
      }
    });
    modal.onDidDismiss().then((result) => {
      if (result.data.role === 'success') {
        this.selectedProvider = result.data.data; // This is the value returned from the modal
        this.myForm.get('supplier').setValue(this.selectedProvider.name);
        this.myForm.get('taxPercent').setValue(this.selectedProvider.tax);
        this.myForm.get('vatPercent').setValue(this.selectedProvider.vat);
      }
    });
    await modal.present();
  }

  async openPopupMessage(message: string) {
    const modal = await this.modalCtrl.create({
      component: PopupMessageComponent,
      //showBackdrop: false,
      componentProps: {
        message: message,
        // Add more props as needed
      }
    })
    //.then(modal => modal.present());
    await modal.present();
  }

  ngOnInit() {
    console.log("columns of form: ", this.columns);

  }
}



