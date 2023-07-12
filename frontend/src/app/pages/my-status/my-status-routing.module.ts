import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { MyStatusPage } from './my-status.page';

const routes: Routes = [
  {
    path: '',
    component: MyStatusPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class MyStatusPageRoutingModule {}
