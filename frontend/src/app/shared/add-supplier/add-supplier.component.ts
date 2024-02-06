import { HttpClient } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { PopoverController } from '@ionic/angular';
import { EMPTY, catchError } from 'rxjs';
import { FilesService } from 'src/app/services/files.service';

@Component({
  selector: 'app-add-supplier',
  templateUrl: './add-supplier.component.html',
  styleUrls: ['./add-supplier.component.scss'],
})
export class addSupplierComponent  implements OnInit {

  myForm: FormGroup;
  arrFields = [{key:"name", value: "שם ספק" }, {key: "supplierID", value:"ח.פ. ספק"}, {key: "category", value:"קטגוריה"}, {key: "subCategory", value: "תת-קטגוריה"}, {key: "taxPercent", value: "אחוז מוכר למס"}, {key: "vatPercent", value:"אחוז מוכר למעמ"}]
  
  constructor(private fileService: FilesService, private formBuilder: FormBuilder, private popoverController: PopoverController) { }

  ngOnInit() {
    this.initForm();
  }

  initForm(): void {
    this.myForm = this.formBuilder.group({
      category: ['', Validators.required],
      subCategory: ['', Validators.required],
      name: ['', Validators.required],
      taxPercent: [Number, Validators.required],
      vatPercent: [Number, Validators.required],
      supplierID: [Number, Validators.required],
    })
  }

  saveSupplier(): void{
    this.popoverController.dismiss(this.myForm);
    const formData = this.setFormData();
    this.fileService.addSupplier(formData).pipe(
      catchError((err) => {
        console.log("somthing faild", err);
        return EMPTY;
      })).subscribe((res) =>{
        console.log("res of save sup: ", res);
      });
  }

  setFormData(){
    const formData = this.myForm.value;
    const token = localStorage.getItem('token');
    formData.token = this.formBuilder.control(token).value;
    console.log("fornData send: ", formData);
    return formData;
  }
}
