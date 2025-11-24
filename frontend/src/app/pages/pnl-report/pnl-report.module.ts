import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { PnLReportPageRoutingModule } from './pnl-report-routing.module';

import { PnLReportPage } from './pnl-report.page';
import { SharedModule } from '../../shared/shared.module';
import { PeriodSelectComponent } from 'src/app/components/period-select/period-select.component';
import { ButtonComponent } from 'src/app/components/button/button.component';
import { FilterTabComponent } from "src/app/components/filter-tab/filter-tab.component";

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    PnLReportPageRoutingModule,
    ReactiveFormsModule,
    SharedModule,
    PeriodSelectComponent,
    ButtonComponent,
    FilterTabComponent
],
  declarations: [PnLReportPage]
})
export class PnLReportPageModule {}
