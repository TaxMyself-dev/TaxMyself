import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { AdvanceIncomeTaxReportPageRoutingModule } from './advance-income-tax-report-routing.module';

import { AdvanceIncomeTaxReportPage } from './advance-income-tax-report.page';
import { SharedModule } from 'src/app/shared/shared.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    AdvanceIncomeTaxReportPageRoutingModule,
    SharedModule
  ],
  declarations: [AdvanceIncomeTaxReportPage]
})
export class AdvanceIncomeTaxReportPageModule {}
