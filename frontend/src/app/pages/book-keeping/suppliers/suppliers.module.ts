import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { SuppliersPage } from './suppliers.page';
import { SuppliersPageRoutingModule } from './suppliers-routing.module';
import { SharedModule } from '../../../shared/shared.module';
import { GenericTableComponent } from "src/app/components/generic-table/generic-table.component";
import { FilterTabComponent } from "src/app/components/filter-tab/filter-tab.component";
import { ToastModule } from 'primeng/toast';
import { ConfirmDialog } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    SuppliersPageRoutingModule,
    SharedModule,
    GenericTableComponent,
    FilterTabComponent,
    ToastModule,
    ConfirmDialog
  ],
  declarations: [SuppliersPage],
  providers: [ConfirmationService, MessageService]
})
export class SuppliersPageModule {}

