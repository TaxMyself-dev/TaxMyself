import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { DepreciationReportPageRoutingModule } from './depreciation-report-routing.module';
import { DepreciationReportPage } from './depreciation-report.page';

import { SharedModule } from '../../shared/shared.module';
import { ButtonComponent } from 'src/app/components/button/button.component';
import { FilterTabComponent } from 'src/app/components/filter-tab/filter-tab.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ReactiveFormsModule,
    SharedModule,
    ButtonComponent,
    FilterTabComponent,
    DepreciationReportPageRoutingModule,
  ],
  declarations: [DepreciationReportPage]
})
export class DepreciationReportPageModule {}
