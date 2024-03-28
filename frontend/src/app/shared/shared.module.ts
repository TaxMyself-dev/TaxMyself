import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { CustomToolbarComponent } from './custom-toolbar/custom-toolbar.component';
import { ModalExpensesComponent } from './modal-add-expenses/modal.component';
import { TableComponent } from './table/table.component';
import { SortDateComponent } from './sort-date/sort-date.component';
import { SelectMonthComponent } from './select-month/select-month.component';
import { SelectYearComponent } from './select-year/select-year.component';
import { ModalSortProviderComponent } from './modal-sort-provider/modal-sort-provider.component';
import { ModalPreviewComponent } from './modal-preview/modal-preview.component';
import { PopupMessageComponent } from './popup-message/popup-message.component';
import { selectSupplierComponent } from './select-supplier/popover-select-supplier.component';
import { NgArrayPipesModule } from 'ngx-pipes';
import { addSupplierComponent } from './add-supplier/add-supplier.component';
import { ItemNavigateComponent } from './item-navigate/item-navigate.component';
import { ButtonComponent } from './button/button.component';
import { HandleErrorComponent } from './handle-error/handle-error.component';

@NgModule({
  declarations: [CustomToolbarComponent,ModalExpensesComponent,TableComponent,SortDateComponent,SelectMonthComponent,SelectYearComponent,ModalSortProviderComponent,ModalPreviewComponent,PopupMessageComponent,selectSupplierComponent,addSupplierComponent,ItemNavigateComponent, ButtonComponent,HandleErrorComponent],
  imports: [
    CommonModule,
    IonicModule,
    ReactiveFormsModule,
    NgArrayPipesModule,
    ],
  exports: [CustomToolbarComponent,ModalExpensesComponent,TableComponent,SortDateComponent,SelectMonthComponent,SelectYearComponent,ModalSortProviderComponent,ModalPreviewComponent,PopupMessageComponent,selectSupplierComponent,addSupplierComponent,ItemNavigateComponent, ButtonComponent, HandleErrorComponent]
})
export class SharedModule { }
