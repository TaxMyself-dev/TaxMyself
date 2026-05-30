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
import { PullDriveDocsDialogComponent } from "src/app/components/pull-drive-docs-dialog/pull-drive-docs-dialog.component";
import { ButtonComponent } from "src/app/components/button/button.component";
import { PopoverModule } from 'primeng/popover';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';
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
    PullDriveDocsDialogComponent,
    ButtonComponent,
    PopoverModule,
    ToastModule,
    ConfirmDialog,
    DynamicDialogModule
  ],
  declarations: [ExpensesPage],
  providers: [ConfirmationService, MessageService, DialogService]
})
export class ExpensesPageModule {}

