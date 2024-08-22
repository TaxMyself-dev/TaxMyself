import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { FlowReportPage } from './flow-report.page';

const routes: Routes = [
  {
    path: '',
    component: FlowReportPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class FlowReportPageRoutingModule {}
