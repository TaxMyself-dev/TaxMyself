import { Component, Input, OnInit, ViewChild, NgModule, Output, EventEmitter } from '@angular/core';
import { FormBuilder, FormGroup, FormControl, Validators, ReactiveFormsModule } from '@angular/forms';
import { ModalController } from '@ionic/angular';
import { IColumnDataTable, IRowDataTable } from '../interface';
import { ModalSortProviderComponent } from '../modal-sort-provider/modal-sort-provider.component';
import { KeyValue } from '@angular/common';
import { PopupMessageComponent } from '../popup-message/popup-message.component';
import { ExpenseDataService } from 'src/app/services/expense-data.service';
import { FilesService } from 'src/app/services/files.service';
import { cloneDeep, isEqual } from 'lodash';
import { PopoverController } from '@ionic/angular';
import { selectSupplierComponent } from '../select-supplier/popover-select-supplier.component';
import { EMPTY, Observable, catchError, finalize, filter, from, map, switchMap, tap, of } from 'rxjs';




@Component({
  selector: 'app-modal',
  templateUrl: './modal.component.html',
  styleUrls: ['./modal.component.scss'],
})
export class ModalExpensesComponent implements OnInit {
  @Input() columns: IColumnDataTable = {};
  @Input() editMode: boolean = false;
  @Input() set data(val: IRowDataTable) {
    this.initForm(val);
    this.id = +val.id;
  };

  initialForm: FormGroup;
  myForm: FormGroup;
  message = '';
  name: string = "";
  tempcolumns: IColumnDataTable = {};
  tempArrProv = [{ name: "עולם הדפוס", vat: "25", tax: "25" }, { name: "מיני מרקט צדוק", vat: "33", tax: "33" }, { name: "מקורות" }, { name: "חברת חשמל", vat: "66", tax: "66" }]; //need to get from server
  matches = [];
  selectedProvider = { name: "", vat: "", tax: "" };
  provInput = "";
  selectedFile: string = "";
  id: number;
  isCustomUserVat = 0;
  isCustomUserTax = 0;

  constructor(private popoverController: PopoverController, private fileService: FilesService, private formBuilder: FormBuilder, private expenseDataServise: ExpenseDataService, private modalCtrl: ModalController) {
  }

  initForm(data: IRowDataTable): void {
    console.log(data.supplier);
    this.myForm = this.formBuilder.group({
      category: [data.category || ''],
      subCategory: [data.subCategory || ''],
      supplier: [data.supplier || ''],
      sum: [data.sum || '', Validators.required],
      taxPercent: [data.taxPercent || '', Validators.required],
      vatPercent: [data.vatPercent || '', Validators.required],
      date: [data.date || '', Validators.required],
      note: [data.note || ''],
      expenseNumber: [data.expenseNumber || ''],
      supplierID: [data.supplierID || ''],
      file: [data.file || File, Validators.required],// TODO: what to show in edit mode
      isEquipment: [data.isEquipment || false] // TODO
    });

    this.initialForm = cloneDeep(this.myForm);
  }

  fileSelected(event: any) {
    let file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        this.selectedFile = reader.result as string;
      }
    }
  }

  disableSave(): boolean {
    return !this.myForm.valid && (this.editMode ? isEqual(this.initialForm.value, this.myForm.value) : true)
  }

  cancel() {
    this.modalCtrl.dismiss(null, 'cancel');
  }

  confirm() {
    this.editMode ? this.update() : this.add();
  }

  add(): void {
    let filePath = '';
    this.getFileData().pipe(
      finalize(() => this.modalCtrl.dismiss(this.name, 'confirm')),
      catchError((err) => {
        alert('Something Went Wrong in first catchError: ' + err.error.message.join(', '))
        return EMPTY;
      }),
      map((res) => {
        if (res) {
          filePath = res.metadata.fullPath;
        }
        const token = localStorage.getItem('token');
        return this.setFormData(filePath, token);
      }),
      switchMap((res) => this.fileService.addExpenseData(res)),
      catchError((err) => {
        alert('Something Went Wrong in second catchError ' + err.error.message)
        if (filePath !== ''){
          this.fileService.deleteFile(filePath);
        }
        return EMPTY;
      })
    ).subscribe((res) => {
      console.log('Saved expense data in DB. The response is: ', res);
      if (res) { // TODO: why returning this object from BE?
        this.expenseDataServise.updateTable$.next(true);
      }
    });
  }

  getFileData(): Observable<any> {//Checks if a file is selected and if so returns his firebase path and if not returns null
    return this.selectedFile ? this.fileService.uploadFileViaFront(this.selectedFile) : of(null);
  }

  update(): void {
    let filePath = '';
    const previousFile = this.myForm.get('file').value;
    this.getFileData().pipe(
      finalize(() => this.modalCtrl.dismiss(this.name, 'confirm')),
      catchError((err) => {
        alert('File upload failed, please try again ' + err.error.message.join(', '));
        return EMPTY;
      }),
      map((res) => {
        if (res) { //if a file is selected 
          filePath = res.metadata.fullPath;
        }
        else {
          filePath = this.myForm.get('file').value;
        }
        const token = localStorage.getItem('token');
        return this.setFormData(filePath, token);
      }),
      switchMap((res) => this.fileService.updateExpenseData(res, this.id)),
      catchError((err) => {
        alert('Something Went Wrong in second catchError ' + err.error.message)
        this.fileService.deleteFile(filePath);
        return EMPTY; 
      })
    ).subscribe((res) => {
      if (previousFile !== "") {
        this.fileService.deleteFile(previousFile);
      }
      if (res) { // TODO: why returning this object from BE?
        this.expenseDataServise.updateTable$.next(true);
      }
    });
  }



  setFormData(filePath: string, token: string) {
    const formData = this.myForm.value;
    formData.taxPercent = +formData.taxPercent;
    formData.vatPercent = +formData.vatPercent;
    formData.file = filePath;
    formData.token = this.formBuilder.control(token).value; // TODO: check when token is invalid
    console.log(formData);
    return formData;
  }  

  // closeCalendar() {
  //   this.datetimePicker.dismiss();
  // }


  openSelectSupplier() {
    from(this.popoverController.create({
      component: selectSupplierComponent,
      //event: ev,
      // translucent: false,
      componentProps: {
      }
    })).pipe(
      catchError((err) => {
        console.error("openSelectSupplier failed in create ", err);
        return EMPTY;
      }),
      switchMap((popover) => {
        if (popover) {
          return from(popover.present()).pipe(
            switchMap(() => from(popover.onDidDismiss())),
            catchError((err) => {
              console.error("openSelectSupplier failed in present ", err);
              return EMPTY;
            })
          );
        }
        else {
          console.error('Popover modal is null');
          return EMPTY;
        }
      })
    ).subscribe((res) => {
      if (res.role !== 'backdrop') {// if the popover closed due to onblur dont change values 
        if (res !== null && res !== undefined) {
          if (typeof (res.data) == "string") {
            this.myForm.patchValue({ supplier: res.data });
          }
          else {
            this.myForm.patchValue({ supplier: res?.data?.name });
            this.myForm.patchValue({ supplierID: res?.data?.supplierID });
            this.myForm.patchValue({ category: res?.data?.category });
            this.myForm.patchValue({ subCategory: res?.data?.subCategory });
            this.myForm.patchValue({ taxPercent: res?.data?.taxPercent });
            this.myForm.patchValue({ vatPercent: res?.data?.vatPercent });
          }
        }
      }
    })
  }

  valueAscOrder(a: KeyValue<string, string>, b: KeyValue<string, string>): number {// stay the list of fields in the original order
    return 0;
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

  customUserVat(ev: any): void {
    if (ev.detail.value == "other") {
      this.isCustomUserVat = 1;
    }
  }

  customUserTax(ev: any): void {
    if (ev.detail.value == "other") {
      this.isCustomUserTax = 1;
    }
  }
}



