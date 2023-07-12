import { Component, Input, OnInit, Output, EventEmitter } from '@angular/core';
import { IColumnDataTable, IRowDataTable } from '../interface';
import { AlertController, NavController, ModalController } from '@ionic/angular';
import { TableService } from 'src/app/services/table.service';
import { ModalComponent } from '../modal/modal.component';
import { Router } from '@angular/router';



@Component({
  selector: 'app-table',
  templateUrl: './table.component.html',
  styleUrls: ['./table.component.scss'],
})
export class TableComponent implements OnInit {

  @Input() tableTitle: string = '';
  @Input() columns: IColumnDataTable = {};
  @Input() mockRows: IRowDataTable[] = [];


  constructor(private rowDataTable: TableService, private modalController: ModalController, private router: Router) { }

  ngOnInit() {
    //console.log(this.rowDataTable.getRowData());
  }

  customCounterFormatter(inputLength: number, maxLength: number) {
    return `${maxLength - inputLength} characters remaining`;
  }



  
  async openPopup() {
    const modal = await this.modalController.create({
      component: ModalComponent,
      //showBackdrop: false,
      componentProps: {
        columns: this.columns,
        // Add more props as needed
      }
    })
    //.then(modal => modal.present());
    await modal.present();
  }


}
