import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { IncomesPage } from './incomes.page';

const routes: Routes = [
  {
    path: '',
    component: IncomesPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class IncomesPageRoutingModule {}
