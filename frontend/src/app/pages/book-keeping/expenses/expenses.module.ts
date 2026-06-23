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
import { ButtonComponent } from "src/app/components/button/button.component";
import { PopoverModule } from 'primeng/popover';
import { DialogService } from 'primeng/dynamicdialog';
import { DynamicDialogModule } from 'primeng/dynamicdialog';

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
    ButtonComponent,
    PopoverModule,
    DynamicDialogModule
  ],
  declarations: [ExpensesPage],
  // NOTE: ConfirmationService & MessageService are NOT provided here on purpose.
  // The global <p-confirmdialog> and <p-toast> in app.component bind to the ROOT
  // instances; re-providing them here would create module-scoped instances that
  // nothing is listening to, so confirm()/toast calls would silently do nothing.
  providers: [DialogService]
})
export class ExpensesPageModule {}

