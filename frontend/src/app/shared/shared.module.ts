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
import { PopupConfirmComponent } from './popup-confirm/popup-confirm.component';
import { selectSupplierComponent } from './select-supplier/popover-select-supplier.component';
import { NgArrayPipesModule } from 'ngx-pipes';
import { addSupplierComponent } from './add-supplier/add-supplier.component';
import { ItemNavigateComponent } from './item-navigate/item-navigate.component';
import { ButtonComponentIonic } from './button/button.component';
import { SearchBarComponent } from './search-bar/search-bar.component';
import { GenericSelectComponent } from './generic-select/generic-select.component';
import { SelectMonthFormatComponent } from './select-report-period/select-report-period.component';
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
import { PopupSelectComponent } from './popup-select/popup-select.component';
import { MultiInputComponent } from './multi-input/multi-input.component';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { TransManagementComponent } from './trans-management/trans-management.component';
import { ToastComponent } from './toast/toast.component';
import { PopupMessageComponent } from './popup-message/popup-message.component';
import { SelectClientComponent } from './select-client/select-client.component';
import { ButtonComponent } from '../components/button/button.component';
import { InputSelectComponent } from '../components/input-select/input-select.component';
// import { ButtonComponentIonic } from '../shared/button/button.component';
import {InputTextComponent} from '../components/input-text/input-text.component';

@NgModule({
  declarations: [CustomToolbarComponent,ModalExpensesComponent,TableComponent,SortDateComponent,SelectMonthComponent,SelectYearComponent,PopupConfirmComponent,selectSupplierComponent,addSupplierComponent,ItemNavigateComponent, SearchBarComponent, GenericSelectComponent, SelectMonthFormatComponent, GenericInputComponent,collapseComponent, AddBillComponent,AddTransactionComponent, CustomInputComponent,editRowComponent, TabBarComponent, UpdateDataComponent, LoadFileComponent, CategoryManagementComponent, FilterInputComponent, PopupSelectComponent, MultiInputComponent, TransManagementComponent,ToastComponent, PopupMessageComponent, SelectClientComponent, ButtonComponentIonic],
  imports: [
    CommonModule,
    IonicModule,
    FormsModule,
    ReactiveFormsModule,
    NgArrayPipesModule,
    ScrollingModule,
    ButtonComponent,
    InputSelectComponent,
    InputTextComponent,
    DateFormatPipe
    // ButtonComponentIonic
],
  exports: [DateFormatPipe, CustomToolbarComponent,ModalExpensesComponent,TableComponent,SortDateComponent,SelectMonthComponent,SelectYearComponent,PopupConfirmComponent,selectSupplierComponent,addSupplierComponent,ItemNavigateComponent, SearchBarComponent, GenericSelectComponent, SelectMonthFormatComponent, GenericInputComponent,collapseComponent,AddBillComponent, AddTransactionComponent, CustomInputComponent,editRowComponent, TabBarComponent, UpdateDataComponent, LoadFileComponent, CategoryManagementComponent, FilterInputComponent, PopupSelectComponent, MultiInputComponent, TransManagementComponent, ToastComponent, PopupMessageComponent, SelectClientComponent, ButtonComponentIonic]
})
export class SharedModule {}
