import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ExpensesPage } from './expenses.page';
import { ExpensesPageRoutingModule } from './expenses-routing.module';
import { SharedModule } from '../../../shared/shared.module';
import { CardNavigateComponent } from "src/app/components/card-navigate/card-navigate.component";
import { TabMenu } from "primeng/tabmenu";
import { GenericTableComponent } from "src/app/components/generic-table/generic-table.component";
import { PeriodSelectComponent } from "src/app/components/period-select/period-select.component";
import { FilterTabComponent } from "src/app/components/filter-tab/filter-tab.component";
import { PopoverModule } from 'primeng/popover';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ExpensesPageRoutingModule,
    SharedModule,
    CardNavigateComponent,
    TabMenu,
    GenericTableComponent,
    PeriodSelectComponent,
    FilterTabComponent,
    PopoverModule,
    ToastModule,
    ConfirmDialog
  ],
  declarations: [ExpensesPage],
  providers: [ConfirmationService, MessageService]
})
export class ExpensesPageModule {}

