import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';

import { LedgerReportPageRoutingModule } from './ledger-report-routing.module';

import { LedgerReportPage } from './ledger-report.page';
import { SharedModule } from '../../shared/shared.module';
import { FilterTabComponent } from 'src/app/components/filter-tab/filter-tab.component';
import { InputSelectComponent } from 'src/app/components/input-select/input-select.component';
import { InputDateComponent } from 'src/app/components/input-date/input-date.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    LedgerReportPageRoutingModule,
    ReactiveFormsModule,
    SharedModule,
    FilterTabComponent,
    DialogModule,
    ButtonModule,
    InputSelectComponent,
    InputDateComponent,
  ],
  declarations: [LedgerReportPage]
})
export class LedgerReportPageModule {}
