import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { VatReportJournalPageRoutingModule } from './vat-report-journal-routing.module';

import { VatReportJournalPage } from './vat-report-journal.page';
import { SharedModule } from '../../shared/shared.module';
import { InputSelectComponent } from "../../components/input-select/input-select.component";
import { PeriodSelectComponent } from "../../components/period-select/period-select.component";
import { GenericTableComponent } from 'src/app/components/generic-table/generic-table.component';
import { ButtonComponent } from 'src/app/components/button/button.component';
import { InputTextModule } from 'primeng/inputtext';
import { InputTextComponent } from "../../components/input-text/input-text.component";
import { FilterTabComponent } from "src/app/components/filter-tab/filter-tab.component";
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DialogModule } from 'primeng/dialog';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    VatReportJournalPageRoutingModule,
    ReactiveFormsModule,
    SharedModule,
    InputSelectComponent,
    PeriodSelectComponent,
    ButtonComponent,
    GenericTableComponent,
    InputTextModule,
    InputTextComponent,
    FilterTabComponent,
    ConfirmDialogModule,
    DialogModule
],
  declarations: [VatReportJournalPage]
})
export class VatReportJournalPageModule {}
