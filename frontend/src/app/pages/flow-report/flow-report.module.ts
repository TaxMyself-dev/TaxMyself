import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { FlowReportPageRoutingModule } from './flow-report-routing.module';

import { FlowReportPage } from './flow-report.page';
import { SharedModule } from '../../shared/shared.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    FlowReportPageRoutingModule,
    SharedModule
  ],
  declarations: [FlowReportPage]
})
export class FlowReportPageModule {}
