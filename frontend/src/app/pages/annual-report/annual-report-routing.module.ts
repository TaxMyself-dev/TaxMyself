import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { AnnualReportPage } from './annual-report.page';

const routes: Routes = [
  {
    path: '',
    component: AnnualReportPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AnnualReportPageRoutingModule {}
