import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { PnLReportJournalPageRoutingModule } from './pnl-report-journal-routing.module';

import { PnLReportJournalPage } from './pnl-report-journal.page';
import { SharedModule } from '../../shared/shared.module';
import { PeriodSelectComponent } from 'src/app/components/period-select/period-select.component';
import { ButtonComponent } from 'src/app/components/button/button.component';
import { FilterTabComponent } from "src/app/components/filter-tab/filter-tab.component";
import { DialogModule } from 'primeng/dialog';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { CheckboxModule } from 'primeng/checkbox';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    PnLReportJournalPageRoutingModule,
    ReactiveFormsModule,
    SharedModule,
    PeriodSelectComponent,
    ButtonComponent,
    FilterTabComponent,
    DialogModule,
    ConfirmDialogModule,
    CheckboxModule
],
  declarations: [PnLReportJournalPage]
})
export class PnLReportJournalPageModule {}
