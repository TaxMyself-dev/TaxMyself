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
import { ButtonComponent } from 'src/app/components/button/button.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    LedgerReportPageRoutingModule,
    ReactiveFormsModule,
    SharedModule,
    FilterTabComponent,
    ButtonComponent,
    DialogModule,
    ButtonModule,
  ],
  declarations: [LedgerReportPage]
})
export class LedgerReportPageModule {}
