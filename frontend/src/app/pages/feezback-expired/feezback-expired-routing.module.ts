import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { FeezbackExpiredPage } from './feezback-expired.page';

const routes: Routes = [
  {
    path: '',
    component: FeezbackExpiredPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class FeezbackExpiredPageRoutingModule {}

