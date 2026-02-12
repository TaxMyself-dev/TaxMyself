import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ClientsPage } from './clients.page';
import { ClientsPageRoutingModule } from './clients-routing.module';
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
    ClientsPageRoutingModule,
    SharedModule,
    GenericTableComponent,
    FilterTabComponent,
    ToastModule,
    ConfirmDialog
  ],
  declarations: [ClientsPage],
  providers: [ConfirmationService, MessageService]
})
export class ClientsPageModule {}

