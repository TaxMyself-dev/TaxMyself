import { HttpClient } from '@angular/common/http';
import { Component, Input, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { PopoverController } from '@ionic/angular';
import { EMPTY, Observable, catchError } from 'rxjs';
import { FilesService } from 'src/app/services/files.service';
import { ICreateSupplier } from '../interface';
import { cloneDeep, isEqual } from 'lodash';
import { ExpenseDataService } from 'src/app/services/expense-data.service';

@Component({
  selector: 'app-add-supplier',
  templateUrl: './add-supplier.component.html',
  styleUrls: ['./add-supplier.component.scss'],
})
export class addSupplierComponent  implements OnInit {

  @Input() set supplier(val: ICreateSupplier) {
    console.log("in add sup", val);
    this.id = val.id;
    this.initForm(val);
  };
  @Input() editMode: boolean;

  initialForm: FormGroup;
  myForm: FormGroup;
  arrFields = [{key:"name", value: "שם ספק" }, {key: "supplierID", value:"ח.פ. ספק"}, {key: "category", value:"קטגוריה"}, {key: "subCategory", value: "תת-קטגוריה"}, {key: "taxPercent", value: "אחוז מוכר למס"}, {key: "vatPercent", value:"אחוז מוכר למעמ"}]
  id: number;
  listPercent = [{key:"נא לבחור", value:""},{key:"0", value:0},{key:"25", value:25},{key:"33", value:33},{key:"66", value:66},{key:"100", value:100},{key:"אחר", value:"other"}]
  isCustomUserVat = false;
  isCustomUserTax = false;
  constructor(private expenseDataService: ExpenseDataService, private formBuilder: FormBuilder, private popoverController: PopoverController) { }

  ngOnInit() {
  }

  initForm(data: ICreateSupplier): void {
    this.myForm = this.formBuilder.group({
      category: [data.category || '', Validators.required],
      subCategory: [data.subCategory || '', Validators.required],
      name: [data.name || '', Validators.required],
      taxPercent: [data.taxPercent || '', Validators.required],
      vatPercent: [data.vatPercent || '', Validators.required],
      supplierID: [data.supplierID || '',],
    })
    this.initialForm = cloneDeep(this.myForm);
  }

  confirm(data:any): Observable<any>{
   return this.editMode? this.expenseDataService.editSupplier(data, this.id) : this.expenseDataService.addSupplier(data);
  };

  disableSave(): boolean {
    return !this.myForm.valid || (this.editMode ? isEqual(this.initialForm.value, this.myForm.value) : false)
  }

  cancel(): void {
    this.popoverController.dismiss();
  }



  saveSupplier(): void{
    console.log("save");
    console.log("edit?",this.editMode);
    const formData = this.setFormData();
    this.confirm(formData).pipe(
      catchError((err) => {
        console.log("somthing faild", err);
        return EMPTY;
      })).subscribe((res) =>{
        console.log("res of save sup: ", res);
        this.popoverController.dismiss(this.myForm);
      });
  }

  setFormData(){
    const formData = this.myForm.value;
    const token = localStorage.getItem('token');
    formData.token = this.formBuilder.control(token).value;
    formData.taxPercent = +formData.taxPercent;
    formData.vatPercent = +formData.vatPercent;
    console.log("fornData send: ", formData);
    return formData;
  }

  onEnterKeyPressed(): void{
    this.saveSupplier();
  }

}
