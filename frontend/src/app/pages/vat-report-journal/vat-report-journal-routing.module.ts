import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { VatReportJournalPage } from './vat-report-journal.page';

const routes: Routes = [
  {
    path: '',
    component: VatReportJournalPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class VatReportJournalPageRoutingModule {}
