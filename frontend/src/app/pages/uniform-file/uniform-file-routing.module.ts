import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { UniformFilePage } from './uniform-file.page';

const routes: Routes = [
  {
    path: '',
    component: UniformFilePage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class UniformFilePageRoutingModule {}
