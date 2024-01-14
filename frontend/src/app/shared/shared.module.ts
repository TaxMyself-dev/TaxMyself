import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { CustomToolbarComponent } from './custom-toolbar/custom-toolbar.component';
import { ModalExpensesComponent } from './modal-add-expenses/modal.component';
import { TableComponent } from './table/table.component';
import { SortDateComponent } from './sort-date/sort-date.component';
import { ModalSortProviderComponent } from './modal-sort-provider/modal-sort-provider.component';
import { ModalPreviewComponent } from './modal-preview/modal-preview.component';
import { PopupMessageComponent } from './popup-message/popup-message.component';

@NgModule({
  declarations: [CustomToolbarComponent,ModalExpensesComponent,TableComponent,SortDateComponent,ModalSortProviderComponent,ModalPreviewComponent,PopupMessageComponent,],
  imports: [
    CommonModule,
    IonicModule,
    ReactiveFormsModule,
    ],
  exports: [CustomToolbarComponent,ModalExpensesComponent,TableComponent,SortDateComponent,ModalSortProviderComponent,ModalPreviewComponent,PopupMessageComponent]
})
export class SharedModule { }
