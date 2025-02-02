import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { DocCreatePage } from './doc-create.page';

const routes: Routes = [
  {
    path: '',
    component: DocCreatePage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class DocCreatePageRoutingModule {}
