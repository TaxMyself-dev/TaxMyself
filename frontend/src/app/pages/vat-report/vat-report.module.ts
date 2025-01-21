import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { VatReportPageRoutingModule } from './vat-report-routing.module';

import { VatReportPage } from './vat-report.page';
import { SharedModule } from '../../shared/shared.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    VatReportPageRoutingModule,
    ReactiveFormsModule,
    SharedModule
  ],
  declarations: [VatReportPage]
})
export class VatReportPageModule {}
