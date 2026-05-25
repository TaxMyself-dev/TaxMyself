import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ClientTasksPage } from './client-tasks.page';
import { ClientTasksPageRoutingModule } from './client-tasks-routing.module';
import { SharedModule } from '../../../shared/shared.module';
import { ButtonComponent } from '../../../components/button/button.component';
import { FilterTabComponent } from '../../../components/filter-tab/filter-tab.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ClientTasksPageRoutingModule,
    SharedModule,
    ToastModule,
    ConfirmDialogModule,
    ButtonComponent,
    FilterTabComponent,
  ],
  declarations: [ClientTasksPage],
  providers: [MessageService, ConfirmationService],
})
export class ClientTasksPageModule {}
