import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { LedgerReportPage } from './ledger-report.page';

const routes: Routes = [
  {
    path: '',
    component: LedgerReportPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class LedgerReportPageRoutingModule {}
