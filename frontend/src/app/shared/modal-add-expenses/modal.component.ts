import { Component, Input, OnInit, ViewChild, NgModule, Output, EventEmitter } from '@angular/core';
import { FormBuilder, FormGroup,FormControl, Validators, ReactiveFormsModule } from '@angular/forms';
import { IonModal, ModalController } from '@ionic/angular';
import { IonDatetime } from '@ionic/angular';
import { OverlayEventDetail } from '@ionic/core/components';
import { IColumnDataTable } from '../interface';
import axios from 'axios';
import { ModalSortProviderComponent } from '../modal-sort-provider/modal-sort-provider.component';
import { KeyValue } from '@angular/common';
import { getStorage, ref, uploadString } from "@angular/fire/storage";
import { nanoid } from 'nanoid';
import { PopupMessageComponent } from '../popup-message/popup-message.component';
import { ExpenseDataService } from 'src/app/services/expense-data.service';



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
  uniqueId: string;
  arrayFolder = ["111", "2222", "3333"];//id folder for user. change to our id of user
  selectedFile: string;

  constructor(private formBuilder: FormBuilder, private expenseDataServise: ExpenseDataService, private modalCtrl: ModalController) {

    this.myForm = this.formBuilder.group({
      category: ['', Validators.required],
      supplier: ['', [Validators.required]],
      sum: ['', Validators.required],
      taxPercent: ['', Validators.required],
      vatPercent: ['', Validators.required],
      date: ['', Validators.required],
      note: ['', Validators.required],
      expenseNumber: ['', Validators.required],
      supplierID: ['', Validators.required],
      file: ['', Validators.required],
      equipment: [false, Validators.required]
    });
  }

  fileSelected(event: any) {
    console.log("in file selected");
    let file = event.target.files[0];
    console.log(file);
    console.log(file.name);
    const name = file.name;

    if (file) {
      console.log("in file ");
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        this.selectedFile = reader.result as string;
      }
    }
  }

  async uploadFileViaFront(base64String: string) {
    console.log("in uploadFileViaFront ");
    const i = Math.floor((Math.random() * 100) % 3);
    console.log("i of array: ", i);

    this.uniqueId = nanoid();
    const storage = getStorage(); // bucket root
    const fileRef = ref(storage, this.arrayFolder[i] + "/" + this.uniqueId); // full path relative to bucket's root
    console.log(fileRef);
    console.log("uuid: ", this.uniqueId);
    const filePath = uploadString(fileRef, base64String, 'data_url').then((snapshot) => {
      console.log('Uploaded a data_url string!');
      console.log("fullPath :", snapshot.metadata.fullPath);
      return snapshot.metadata.fullPath;
    });
    return filePath;
  }



  // לא הבנתי איך להשתמש בפונקיצה הזאת.
  onFormValueChanged(value: any) {
    console.log(value);
  }

  cancel() {
    this.modalCtrl.dismiss(null, 'cancel');
  }

  async confirm() {
    this.modalCtrl.dismiss(this.name, 'confirm');
    const token = localStorage.getItem('token');
    console.log("token from local storage in confirm", token);
    const filePath = await this.uploadFileViaFront(this.selectedFile);
    this.myForm.get('file').setValue(filePath);
    this.myForm.addControl('token',this.formBuilder.control(token));
    const formData = this.myForm.value;
    formData.sum = parseInt(formData.sum, 10); 
    formData.taxPercent = parseInt(formData.taxPercent, 10); 
    formData.vatPercent = parseInt(    formData.vatPercent, 10); 
    formData.date = formData.date ? new Date(formData.date).toISOString() : null;
    console.log(formData);
    axios.post('http://localhost:3000/expenses/add', formData)
      .then((response) => {
        console.log(response);
        if (response.data.message == "invalid user") {
          console.log(response.data.message);
          this.openPopupMessage(response.data.message);
        }
        else {
          this.expenseDataServise.getExpenseByUser().subscribe(
            (response) => {
              if (response) {
                this.expenseDataServise.updateTable$.next(true);//I need to check what updateTable does
              }
            }
          )
        }
      })
      .catch((err) => {
        console.log("this is error :", err);
        console.log("err.data.message ;",err.response.data.message);
        this.openPopupMessage(err.response.data.message);
        
      })

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



