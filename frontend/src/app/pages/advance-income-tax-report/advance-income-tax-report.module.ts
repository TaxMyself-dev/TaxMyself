import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { AdvanceIncomeTaxReportPageRoutingModule } from './advance-income-tax-report-routing.module';

import { AdvanceIncomeTaxReportPage } from './advance-income-tax-report.page';
import { SharedModule } from '../../shared/shared.module';
import { FilterTabComponent } from 'src/app/components/filter-tab/filter-tab.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    IonicModule,
    AdvanceIncomeTaxReportPageRoutingModule,
    SharedModule,
    FilterTabComponent
  ],
  declarations: [AdvanceIncomeTaxReportPage]
})
export class AdvanceIncomeTaxReportPageModule {}
