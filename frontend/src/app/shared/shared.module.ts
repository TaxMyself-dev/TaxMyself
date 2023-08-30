import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { CustomToolbarComponent } from './custom-toolbar/custom-toolbar.component';
import { ModalExpensesComponent } from './modal-add-expenses/modal.component';
import { TableComponent } from './table/table.component';
import { SortDateComponent } from './sort-date/sort-date.component';
import { ModalSortProviderComponent } from './modal-sort-provider/modal-sort-provider.component';

@NgModule({
  declarations: [CustomToolbarComponent,ModalExpensesComponent,TableComponent,SortDateComponent,ModalSortProviderComponent],
  imports: [
    CommonModule,
    IonicModule,
    ReactiveFormsModule
    ],
  exports: [CustomToolbarComponent,ModalExpensesComponent,TableComponent,SortDateComponent,ModalSortProviderComponent]
})
export class SharedModule { }
