import { Component, Input, OnInit, Output, EventEmitter } from '@angular/core';
import { IColumnDataTable, IRowDataTable } from '../interface';
import { AlertController, NavController, ModalController } from '@ionic/angular';
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
  @Input() rows: IRowDataTable[] = [];


  constructor(private filesService: FilesService, private modalController: ModalController) { }

  ngOnInit() {
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
      }
    })
    await modal.present();
  }

  async previewFile(nameFile?: string): Promise<void> {
    const fileUrl =  await this.filesService.downloadFile(nameFile);
    const modal = this.modalController.create({
      component: ModalPreviewComponent,
      componentProps: {
        fileUrl:fileUrl,
      },
    });
    (await modal).present();
  }

}
