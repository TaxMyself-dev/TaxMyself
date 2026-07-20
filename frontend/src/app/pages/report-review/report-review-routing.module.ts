import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { ReportReviewPage } from './report-review.page';

const routes: Routes = [
  {
    path: '',
    component: ReportReviewPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ReportReviewPageRoutingModule {}
