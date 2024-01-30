
/*
  this page display the personal account.
  table of receipt, add receipt, charts ets.
  @columns
*/

import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ModalController } from '@ionic/angular';
import { IColumnDataTable, IRowDataTable } from 'src/app/shared/interface';
import { ModalExpensesComponent } from 'src/app/shared/modal-add-expenses/modal.component';
import { getStorage, ref, getDownloadURL } from "@angular/fire/storage";
import { FilesService } from 'src/app/services/files.service';
import { ExpenseDataService } from 'src/app/services/expense-data.service';
//import { getStorage, ref, getDownloadURL } from "firebase/storage";


@Component({
  selector: 'app-add-invoice',
  templateUrl: './add-expenses.page.html',
  styleUrls: ['./add-expenses.page.scss'],
})
export class AddInvoicePage implements OnInit {

  columns: IColumnDataTable = {};//Titles of expense
  rows: IRowDataTable[] = [];//Data of expense
  tableTitle = "הוצאות אחרונות";
  urlFile: string;

  constructor(private filesService: FilesService, private formBuilder: FormBuilder, private modalCtrl: ModalController, private expenseDataServise: ExpenseDataService,) {

  }

  ngOnInit() {

    this.columns = this.expenseDataServise.getAddExpenseColumns()

    //this.setColumns();
    //this.columns = this.expenseDataServise.getAddExpenseColumns();
    this.setRowsData();
    this.expenseDataServise.updateTable$.subscribe(
      (data) => {
        if (data) {
          this.setRowsData();
        }
      })

    this.openPopup();
  }

  // Get the data from server and update columns
  // setColumns(): void {
  //   this.expenseDataServise.getColumns().subscribe(
  //     (data) => {
  //       if (data) {
  //         this.columns = data;
  //       }
  //     });
  // }
  // Get the data from server and update rows
  setRowsData(): void {
    this.expenseDataServise.getExpenseByUser().subscribe(
      (data) => {
        if (data) {
          this.rows = data;

        }
      });
  }
  //Func to open the form to add-expenses 
  async openPopup() {
    const modal = await this.modalCtrl.create({
      component: ModalExpensesComponent,
      //showBackdrop: false,
      componentProps: {
        columns: this.columns,
        // Add more props as needed
      }
    })
    //.then(modal => modal.present());
    await modal.present();
  }

  
  async downloadFile() {

    this.urlFile = await this.filesService.downloadFile('2222/O7rWwmIEnfzHrp-AErXvJ.png')
    }




}
