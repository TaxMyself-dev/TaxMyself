import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ShaamCallbackPage } from './shaam-callback.page';

const routes: Routes = [
  {
    path: '',
    component: ShaamCallbackPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ShaamCallbackPageModule {}

