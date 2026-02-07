import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { AdminPanelPageRoutingModule } from './admin-panel-routing.module';

import { AdminPanelPage } from './admin-panel.page';
import { SharedModule } from '../../shared/shared.module';
import { GenericTableComponent } from '../../components/generic-table/generic-table.component';
import { FeezbackTransactionsDialogComponent } from '../../components/feezback-transactions-dialog/feezback-transactions-dialog.component';
import { AgentManagementComponent } from '../../shared/agent-management/agent-management.component';
import { ShaamInvoiceApprovalDialogComponent } from '../../components/shaam-invoice-approval-dialog/shaam-invoice-approval-dialog.component';
import { ButtonComponent } from '../../components/button/button.component';
import { ToastModule } from 'primeng/toast';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    AdminPanelPageRoutingModule,
    SharedModule,
    ReactiveFormsModule,
    GenericTableComponent,
    FeezbackTransactionsDialogComponent,
    AgentManagementComponent,
    ShaamInvoiceApprovalDialogComponent,
    ButtonComponent,
    ToastModule
  ],
  declarations: [AdminPanelPage]
})
export class AdminPanelPageModule {}
