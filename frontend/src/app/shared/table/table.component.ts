import { Component, Input, OnInit, Output, EventEmitter } from '@angular/core';
import { IColumnDataTable, IRowDataTable } from '../interface';
import { AlertController, NavController, ModalController } from '@ionic/angular';
import { TableService } from 'src/app/services/table.service';
import { ModalExpensesComponent } from '../modal-add-expenses/modal.component';
import { Router } from '@angular/router';
import { ModalPreviewComponent } from '../modal-preview/modal-preview.component';
import { FilesService } from 'src/app/services/files.service';


@Component({
  selector: 'app-table',
  templateUrl: './table.component.html',
  styleUrls: ['./table.component.scss'],
})
export class TableComponent implements OnInit {

  @Input() tableTitle: string = '';
  @Input() columns: IColumnDataTable = {};
  @Input() mockRows: IRowDataTable[] = [];


  constructor(private filesService: FilesService, private rowDataTable: TableService, private modalController: ModalController, private router: Router) { }

  ngOnInit() {
    //console.log(this.rowDataTable.getRowData());
  }

  customCounterFormatter(inputLength: number, maxLength: number) {
    console.log(`${maxLength - inputLength} characters remaining`);
    
    return `${maxLength - inputLength} characters remaining`;
  }



  
  async openPopupAddExpense() {
    const modal = await this.modalController.create({
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

  async previewFile(fileUrl?: string): Promise<void> {
    this.filesService.downloadFile(fileUrl);
    // Implement logic to open a modal for file preview
    // You can use Ionic Modals or any other UI component for the preview
    const modal = this.modalController.create({
      component: ModalPreviewComponent,
      componentProps: {
        fileUrl:"gs://taxmyself-5d8a0.appspot.com/2222/bP8l1rYmMiSP1JR1NrFWW",
      },
    });

    (await modal).present();
  }

}
