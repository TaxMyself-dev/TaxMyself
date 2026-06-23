import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { DepreciationReportPage } from './depreciation-report.page';

const routes: Routes = [
  {
    path: '',
    component: DepreciationReportPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class DepreciationReportPageRoutingModule {}
