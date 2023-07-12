import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { MyStoragePage } from './my-storage.page';

const routes: Routes = [
  {
    path: '',
    component: MyStoragePage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class MyStoragePageRoutingModule {}
