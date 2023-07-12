import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { AnnualReportPageRoutingModule } from './annual-report-routing.module';

import { AnnualReportPage } from './annual-report.page';
import { SharedModule } from 'src/app/shared/shared.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    AnnualReportPageRoutingModule,
    SharedModule
  ],
  declarations: [AnnualReportPage]
})
export class AnnualReportPageModule {}
