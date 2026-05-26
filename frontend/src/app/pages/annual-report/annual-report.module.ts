import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';

import { AnnualReportPageRoutingModule } from './annual-report-routing.module';
import { AnnualReportPage } from './annual-report.page';
import { SharedModule } from '../../shared/shared.module';
import { ButtonComponent } from '../../components/button/button.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    AnnualReportPageRoutingModule,
    SharedModule,
    ToastModule,
    ConfirmDialogModule,
    ButtonComponent,
  ],
  declarations: [AnnualReportPage],
  providers: [MessageService, ConfirmationService],
})
export class AnnualReportPageModule {}
