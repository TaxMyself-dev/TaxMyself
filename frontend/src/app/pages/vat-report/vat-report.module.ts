import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { VatReportPageRoutingModule } from './vat-report-routing.module';

import { VatReportPage } from './vat-report.page';
import { SharedModule } from '../../shared/shared.module';
import { InputSelectComponent } from "../../components/input-select/input-select.component";
import { PeriodSelectComponent } from "../../components/period-select/period-select.component";
import { GenericTableComponent } from 'src/app/components/generic-table/generic-table.component';
import { ButtonComponent } from 'src/app/components/button/button.component';
import { InputTextModule } from 'primeng/inputtext';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    VatReportPageRoutingModule,
    ReactiveFormsModule,
    SharedModule,
    InputSelectComponent,
    PeriodSelectComponent,
    ButtonComponent,
    GenericTableComponent,
    InputTextModule
],
  declarations: [VatReportPage]
})
export class VatReportPageModule {}
