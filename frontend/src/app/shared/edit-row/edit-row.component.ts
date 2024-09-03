import { Component, Input, OnInit } from '@angular/core';
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

  //@Input() data: IRowDataTable;
  @Input() parentForm: FormGroup;
  @Input() fields: IColumnDataTable<TFormColumns, TFormHebrewColumns>[];
  @Input() disabledFields: TFormColumns[];
  //@Input() parent: any;

  readonly formTypes = FormTypes;

  constructor(private modalCtrl: ModalController) { }

  ngOnInit() {
    //console.log("in edit: ", this.data);    
  }
  
  updateRow(): void {
    this.modalCtrl.dismiss(this.parentForm)
  }

  onSelectionChanged(event, fieldData): void {
    if (fieldData.onChange) {
      fieldData.onChange(event);
    }
  }

}
