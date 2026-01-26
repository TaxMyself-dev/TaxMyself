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
    AgentManagementComponent
  ],
  declarations: [AdminPanelPage]
})
export class AdminPanelPageModule {}
