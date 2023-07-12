import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { AdvanceIncomeTaxReportPage } from './advance-income-tax-report.page';

const routes: Routes = [
  {
    path: '',
    component: AdvanceIncomeTaxReportPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AdvanceIncomeTaxReportPageRoutingModule {}
