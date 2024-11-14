import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { PnLReportPage } from './pnl-report.page';

const routes: Routes = [
  {
    path: '',
    component: PnLReportPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class PnLReportPageRoutingModule {}
