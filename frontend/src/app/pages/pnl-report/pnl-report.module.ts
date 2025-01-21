import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { PnLReportPageRoutingModule } from './pnl-report-routing.module';

import { PnLReportPage } from './pnl-report.page';
import { SharedModule } from '../../shared/shared.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    PnLReportPageRoutingModule,
    ReactiveFormsModule,
    SharedModule
  ],
  declarations: [PnLReportPage]
})
export class PnLReportPageModule {}
