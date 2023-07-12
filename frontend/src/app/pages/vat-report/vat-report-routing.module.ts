import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { VatReportPage } from './vat-report.page';

const routes: Routes = [
  {
    path: '',
    component: VatReportPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class VatReportPageRoutingModule {}
