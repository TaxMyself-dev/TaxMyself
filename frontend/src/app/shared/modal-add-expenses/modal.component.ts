import { Component, Input, OnInit, ViewChild, NgModule, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { FormBuilder, FormGroup, FormControl, Validators, ReactiveFormsModule } from '@angular/forms';
import { ModalController, NavParams } from '@ionic/angular';
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
import { ExpenseFormColumns, FormTypes } from '../enums';

@Component({
  selector: 'app-modal',
  templateUrl: './modal.component.html',
  styleUrls: ['./modal.component.scss'],
})
export class ModalExpensesComponent {
  @Input() set editMode(val: boolean) {
    val ? this.title = "עריכת הוצאה" : this.title = "הוסף הוצאה"
  };
  // data for edit mode:
  @Input() set data(val: IRowDataTable) {
    if (val) {
      this.initForm(val);
      this.id = +val.id;
    }
  };

  @Input() set columns(val :IColumnDataTable[]) {
    this.fileItem = val?.find((item: IColumnDataTable) => item.type === FormTypes.FILE);
    this.columnsList = val;
  }

  get columns(): IColumnDataTable[] {
    return this.columnsList;
  }

  readonly formTypes = FormTypes;
  readonly expenseFormColumns = ExpenseFormColumns;

  columnsList: IColumnDataTable[];
  fileItem: IColumnDataTable;
  columnsFilter: IColumnDataTable[];
  listPercent: Record<string, string | number>[] = [{ key: "נא לבחור", value: "" }, { key: "0", value: 0 }, { key: "25", value: 25 }, { key: "33", value: 33 }, { key: "66", value: 66 }, { key: "100", value: 100 }, { key: "אחר", value: "other" }]
  title: string;
  initialForm: FormGroup;
  myForm: FormGroup;
  selectedFile: string = "";
  id: number;
  isCustomUserVat = false;
  isCustomUserTax = false;
  equipmentList: Record<string, string>[] = [{ key: "לא", value: "not" }, { key: "רכב", value: "car" }, { key: "מחשב", value: "computer" }, { key: "שולחן", value: "table" }, { key: "כיסא", value: "cheir" }, { key: "מנורה", value: "lamp" }];

  constructor(private popoverController: PopoverController, private fileService: FilesService, private formBuilder: FormBuilder, private expenseDataServise: ExpenseDataService, private modalCtrl: ModalController, private navParams: NavParams) {
  }

  ngOnInit(){
    console.log("kjhchj");
    console.log("xdfgdgfgf",this.columns);
  }

  initForm(data: IRowDataTable): void {
    this.myForm = this.formBuilder.group({
      [ExpenseFormColumns.CATEGORY]: [data.category || ''],
      [ExpenseFormColumns.SUB_CATEGORY]: [data.subCategory || ''],
      [ExpenseFormColumns.SUPPLIER]: [data.supplier || ''],
      [ExpenseFormColumns.SUM]: [data.sum || Number, Validators.required],
      [ExpenseFormColumns.TAX_PERCENT]: [data.taxPercent || '', Validators.required],
      [ExpenseFormColumns.VAT_PERCENT]: [data.vatPercent || '', Validators.required],
      [ExpenseFormColumns.DATE]: [data.date || '', Validators.required],
      [ExpenseFormColumns.NOTE]: [data.note || ''],
      [ExpenseFormColumns.EXPENSE_NUMBER]: [data.expenseNumber || ''],
      [ExpenseFormColumns.SUPPLIER_ID]: [data.supplierID || ''],
      [ExpenseFormColumns.FILE]: [data.file || File, Validators.required],// TODO: what to show in edit mode
      [ExpenseFormColumns.IS_EQUIPMENT]: [data.isEquipment || false], // TODO
      [ExpenseFormColumns.EQUIPMENT_CATEGORY]: [data.equipmentCategory || ''],
      [ExpenseFormColumns.REDUCTION_PERCENT]: [data.reductionPercent || Number],
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
    return !this.myForm.valid || (this.editMode ? isEqual(this.initialForm.value, this.myForm.value) : false)
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
      finalize(() => this.modalCtrl.dismiss()),
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
        if (filePath !== '') {
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
      finalize(() => this.modalCtrl.dismiss()),
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


  onDdlSelectionChange(event, colData: IColumnDataTable) {
    console.log(event);
    
    switch (colData.name) {
      case ExpenseFormColumns.TAX_PERCENT:
        this.customUserTax(event);
        break;
      case ExpenseFormColumns.EQUIPMENT_CATEGORY:
        this.setValueEquipment(event);
        break;
      case ExpenseFormColumns.VAT_PERCENT:
        this.customUserVat(event);
        break;
      default:
        break;
    }
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
        console.log("openSelectSupplier failed in create ", err);
        return EMPTY;
      }),
      switchMap((popover) => {
        if (popover) {
          return from(popover.present()).pipe(
            switchMap(() => from(popover.onDidDismiss())),
            catchError((err) => {
              console.log("openSelectSupplier failed in present ", err);
              return EMPTY;
            })
          );
        }
        else {
          console.log('Popover modal is null');
          return EMPTY;
        }
      })
    ).subscribe((res) => {
      console.log('res in modal comp: ', res);
      console.log("res.role: ", res.role);
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

  getListOptionsByKey(key: ExpenseFormColumns): Record<string, string | number>[] {
    switch (key) {
      case ExpenseFormColumns.VAT_PERCENT:
      case ExpenseFormColumns.TAX_PERCENT:
        return this.listPercent;
      case ExpenseFormColumns.IS_EQUIPMENT:
        return this.equipmentList;
      default:
        return [];
    }
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

  customUserVat(ev: any): void {
    if (ev.detail.value == "other") {
      this.isCustomUserVat = !this.isCustomUserVat;
    }
  }

  customUserTax(ev: any): void {
    if (ev.detail.value == "other") {
      this.isCustomUserTax = !this.isCustomUserTax;
    }
  }

  setValueEquipment(event: any): void {
    const value = event.detail.value;
    console.log("in set value", event.detail.value);

    if (value == "not") {
      this.myForm.patchValue({ isEquipment: false });
      this.myForm.patchValue({ equipmentCategory: value });
    }
    else {
      this.myForm.patchValue({ isEquipment: true });
      switch (value) {
        case 'car':
          this.myForm.patchValue({ equipmentCategory: value });
          this.myForm.patchValue({ reductionPercent: 15 });
          break;
        case 'computer':
          this.myForm.patchValue({ equipmentCategory: value });
          this.myForm.patchValue({ reductionPercent: 25 });
          break;
        case 'cheir':
          this.myForm.patchValue({ equipmentCategory: value });
          this.myForm.patchValue({ reductionPercent: 35 });
          break;
        case 'table':
          this.myForm.patchValue({ equipmentCategory: value });
          this.myForm.patchValue({ reductionPercent: 45 });
          break;
        case 'lamp':
          this.myForm.patchValue({ equipmentCategory: value });
          this.myForm.patchValue({ reductionPercent: 55 });
          break;
      }
    }
  }
}



