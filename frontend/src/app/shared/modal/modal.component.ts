import { Component, Input, OnInit, ViewChild, NgModule, Output, EventEmitter } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { IonModal,ModalController } from '@ionic/angular';
//import { ViewController } from 'ionic-angular';
import { IonDatetime } from '@ionic/angular';
import { OverlayEventDetail } from '@ionic/core/components';
import { TableService } from 'src/app/services/table.service';
import { IColumnDataTable } from '../interface';
import axios from 'axios';

@Component({
  selector: 'app-modal',
  templateUrl: './modal.component.html',
  styleUrls: ['./modal.component.scss'],
})
export class ModalComponent implements OnInit {
  
  myForm: FormGroup;
  
  @Input() columns: IColumnDataTable = {};
  @Input() trigger!: string;
  @Output() onAddRowDataTable:EventEmitter<number> = new EventEmitter();
 
  message = '';
  public name: string = "";
  public tempcolumns: IColumnDataTable = {};
  
  constructor(private formBuilder: FormBuilder, private rowsService: TableService,private modalCtrl: ModalController) {

    this.myForm = this.formBuilder.group({
      category: ['', Validators.required],
      provider: ['', [Validators.required, Validators.email]],
      sum: ['', Validators.required], 
      percentTax: ['', Validators.required],
      percentVat: ['', Validators.required],
      date: ['', Validators.required],
      note: ['', Validators.required],
      file: ['', Validators.required],
      equipment: [false,Validators.required]
     
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

    console.log("token from local storage",token);
    
    axios.post('http://localhost:3000/expenses/add',{formData,token})
    .then((response)=>{
      console.log(response);
    })
    .catch((err)=>{
      console.log(err);
    })
    this.rowsService.addRow(formData).subscribe(
      (response) => {
        if (response) {
          this.rowsService.updateTable$.next(true);//I need to check what updateTable is do
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

  ngOnInit() {
   
  console.log(this.columns);
   }
}



