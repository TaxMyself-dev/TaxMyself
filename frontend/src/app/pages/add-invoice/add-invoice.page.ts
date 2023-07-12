
/*
  this page display the personal account.
  table of receipt, add receipt, charts ets.
  @columns
*/ 

import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ModalController } from '@ionic/angular';
import { TableService } from 'src/app/services/table.service';
import { IColumnDataTable, IRowDataTable } from 'src/app/shared/interface';
import { ModalComponent } from 'src/app/shared/modal/modal.component';

@Component({
  selector: 'app-add-invoice',
  templateUrl: './add-invoice.page.html',
  styleUrls: ['./add-invoice.page.scss'],
})
export class AddInvoicePage implements OnInit {

  columns: IColumnDataTable = {};//Titles of table
  rows: IRowDataTable[] = [];//Data of table
  tableTitle = "הוצאות אחרונות";

  constructor(private formBuilder: FormBuilder, private modalCtrl: ModalController, private rowDataService: TableService,) { 
    
  }

  ngOnInit() {

    this.setColumns();
    this.setRowsData();
    this.rowDataService.updateTable$.subscribe(
      (data) => {
        if (data) {
          this.setRowsData();
        }
      })

      this.openPopup();


  }
// Get the data from server and update columns
  setColumns(): void {
    this.rowDataService.getColumns().subscribe(
      (data) => {
        if (data) {
          this.columns = data;
        }
      });
  }
// Get the data from server and update rows
  setRowsData(): void {
    this.rowDataService.getRowData().subscribe(
      (data) => {
        if (data) {
          this.rows = data;
         
        }
      });
  }
  //Func to open the form to add invoic 
  async openModal() {
    const modal = await this.modalCtrl.create({
      component: ModalComponent,
    });
    modal.present();

    const { data, role } = await modal.onWillDismiss();

  }

  async openPopup() {
    const modal = await this.modalCtrl.create({
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
