import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { PnLReportJournalPage } from './pnl-report-journal.page';

const routes: Routes = [
  {
    path: '',
    component: PnLReportJournalPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PnLReportJournalPageRoutingModule {}
