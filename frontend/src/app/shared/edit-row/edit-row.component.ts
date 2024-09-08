import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { IColumnDataTable, IRowDataTable, ISelectItem } from '../interface';
import { FormBuilder, FormControl, FormGroup } from '@angular/forms';
import { FormTypes } from '../enums';
import { ModalController } from '@ionic/angular';

@Component({
  selector: 'app-transaction-edit',
  templateUrl: './edit-row.component.html',
  styleUrls: ['./edit-row.component.scss'],
})
export class editRowComponent<TFormColumns, TFormHebrewColumns> implements OnInit {

  @Input() data: IRowDataTable;
  @Input() parentForm: FormGroup;
  @Input() fields: IColumnDataTable<TFormColumns, TFormHebrewColumns>[];
  @Input() disabledFields: TFormColumns[];
  //@Input() parent: any;
  //@Output() sendData = new EventEmitter<any>();

  readonly formTypes = FormTypes;

  constructor(private modalCtrl: ModalController) { }

  ngOnInit() {
    console.log("in edit fields: ", this.fields);    
  }
  
  updateRow(): void {
    this.modalCtrl.dismiss(this.data,'send')
  }

  onSelectionChanged(event, fieldData): void {
    if (fieldData.onChange) {
      fieldData.onChange(event);
    }
  }

}
