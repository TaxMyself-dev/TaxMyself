import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { CustomToolbarComponent } from './custom-toolbar/custom-toolbar.component';
import { ModalComponent } from './modal/modal.component';
import { TableComponent } from './table/table.component';
import { SortDateComponent } from './sort-date/sort-date.component';

@NgModule({
  declarations: [CustomToolbarComponent,ModalComponent,TableComponent,SortDateComponent],
  imports: [
    CommonModule,
    IonicModule,
    ReactiveFormsModule
    ],
  exports: [CustomToolbarComponent,ModalComponent,TableComponent,SortDateComponent]
})
export class SharedModule { }
