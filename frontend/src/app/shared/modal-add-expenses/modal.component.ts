import { Component, Input, OnInit, ViewChild, NgModule, Output, EventEmitter } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { IonModal, ModalController } from '@ionic/angular';
//import { ViewController } from 'ionic-angular';
import { IonDatetime } from '@ionic/angular';
import { OverlayEventDetail } from '@ionic/core/components';
import { TableService } from 'src/app/services/table.service';
import { IColumnDataTable } from '../interface';
import axios from 'axios';
import { ModalSortProviderComponent } from '../modal-sort-provider/modal-sort-provider.component';
import { KeyValue } from '@angular/common';
import { NgxImageCompressService } from 'ngx-image-compress';
import { getStorage, ref, uploadString } from "@angular/fire/storage";


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

  constructor(private formBuilder: FormBuilder, private rowsService: TableService, private modalCtrl: ModalController, private imageCompress: NgxImageCompressService) {

    this.myForm = this.formBuilder.group({
      category: ['', Validators.required],
      provider: ['', [Validators.required, Validators.email]],
      sum: ['', Validators.required],
      percentTax: ['', Validators.required],
      percentVat: ['', Validators.required],
      date: ['', Validators.required],
      note: ['', Validators.required],
      expenseNumber: ['', Validators.required],
      idSupply: ['', Validators.required],
      file: ['', Validators.required],
      equipment: [false, Validators.required]
    });
  }


  fileSelected(event: any) {
    console.log("in file selected");
    let file = event.target.files[0];
    // this.imageCompress.compressFile(file, -1, 50, 50)
    // .then((res)=>{
    //   const compressedImage = res;
    //   //this.selctedFile  =compressedImage;
    //   file = compressedImage
    // })
    console.log(file);
    console.log(file.name);
    const name = file.name;


    if (file) {
      console.log("in file ");
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = reader.result as string;
        // console.log(base64String);
        
        //this.uploadFileToSrever(base64String, file.name);
        this.uploadFileViaFront(base64String, name);
      }
    }
  }

  async uploadFileToSrever(base64String: string, fileName: string) {
    try {
      console.log("in upload file");
      const res = await axios.post('http://localhost:3000/expenses/upload', { file: base64String, fileName })
      if (!res) {
        throw ("my error: upload file faild");
      }
      console.log(res);

    } catch (error) {
      console.log("my error:", error);

    }
  }

  async uploadFileViaFront(base64String,name) {
    console.log("in uploadFileViaFront ");
    const storage = getStorage(); // bucket root
    const fileRef = ref(storage, 'try/' + name); // full path relative to bucket's root
    console.log(fileRef);
    uploadString(fileRef, base64String, 'data_url').then((snapshot) => {
      console.log('Uploaded a data_url string!');
      console.log(snapshot.metadata.fullPath);

});
  }
  
  // לא הבנתי איך להשתמש בפונקיצה הזאת.
  onFormValueChanged(value: any) {
    console.log(value);
  }

  cancel() {
    this.modalCtrl.dismiss(null, 'cancel');
  }

  confirm() {
    this.modalCtrl.dismiss(this.name, 'confirm');
    const formData = this.myForm.value;
    console.log(formData);
    const token = localStorage.getItem('token');
    console.log("token from local storage", token);

    axios.post('http://localhost:3000/expenses/add', { formData, token })
      .then((response) => {
        console.log(response);
      })
      .catch((err) => {
        console.log(err);
      })
    this.rowsService.addRow(formData).subscribe(
      (response) => {
        if (response) {
          this.rowsService.updateTable$.next(true);//I need to check what updateTable does
        }
      }
    )

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
    this.myForm.get('provider').setValue(prov.name);
    this.myForm.get('percentTax').setValue(prov.tax);
    this.myForm.get('percentVat').setValue(prov.vat);
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
        this.myForm.get('provider').setValue(this.selectedProvider.name);
        this.myForm.get('percentTax').setValue(this.selectedProvider.tax);
        this.myForm.get('percentVat').setValue(this.selectedProvider.vat);
      }
    });
    await modal.present();
  }
  ngOnInit() {

    console.log(this.columns);
  }
}



