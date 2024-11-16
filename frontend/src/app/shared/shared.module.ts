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
import { PopupMessageComponent } from './popup-message/popup-message.component';
import { selectSupplierComponent } from './select-supplier/popover-select-supplier.component';
import { NgArrayPipesModule } from 'ngx-pipes';
import { addSupplierComponent } from './add-supplier/add-supplier.component';
import { ItemNavigateComponent } from './item-navigate/item-navigate.component';
import { ButtonComponent } from './button/button.component';
import { SearchBarComponent } from './search-bar/search-bar.component';
import { GenericSelectComponent } from './generic-select/generic-select.component';
import { SelectMonthFormatComponent } from './select-month-format/select-month-format.component';
import { GenericInputComponent } from './generic-input/generic-input.component';
import { collapseComponent } from './collapse/collapse.component';
import { AddBillComponent } from './add-bill/add-bill.component';
import { AddTransactionComponent } from './add-transaction/add-transaction.component';
import { CustomInputComponent } from './custom-input/custom-input.component';
import { editRowComponent } from './edit-row/edit-row.component';
import { TabBarComponent } from './tab-bar/tab-bar.component';
import { UpdateDataComponent } from './update-data/update-data.component';
import { DateFormatPipe } from '../pipes/date-format.pipe';
import { LoadFileComponent } from './load-file/load-file.component';
import { CategoryManagementComponent } from './category-management/category-management.component';
import { FilterInputComponent } from './filter-input/filter-input.component';

@NgModule({
  declarations: [DateFormatPipe, CustomToolbarComponent,ModalExpensesComponent,TableComponent,SortDateComponent,SelectMonthComponent,SelectYearComponent,PopupMessageComponent,selectSupplierComponent,addSupplierComponent,ItemNavigateComponent, ButtonComponent, SearchBarComponent, GenericSelectComponent, SelectMonthFormatComponent, GenericInputComponent,collapseComponent, AddBillComponent,AddTransactionComponent, CustomInputComponent,editRowComponent, TabBarComponent, UpdateDataComponent, LoadFileComponent, CategoryManagementComponent, FilterInputComponent],
  imports: [
    CommonModule,
    IonicModule,
    FormsModule,
    ReactiveFormsModule,
    NgArrayPipesModule,
    ],
  exports: [DateFormatPipe, CustomToolbarComponent,ModalExpensesComponent,TableComponent,SortDateComponent,SelectMonthComponent,SelectYearComponent,PopupMessageComponent,selectSupplierComponent,addSupplierComponent,ItemNavigateComponent, ButtonComponent, SearchBarComponent, GenericSelectComponent, SelectMonthFormatComponent, GenericInputComponent,collapseComponent,AddBillComponent, AddTransactionComponent, CustomInputComponent,editRowComponent, TabBarComponent, UpdateDataComponent, LoadFileComponent, CategoryManagementComponent, FilterInputComponent]
})
export class SharedModule { }
