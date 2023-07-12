import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { IncomeStatementPage } from './income-statement.page';

const routes: Routes = [
  {
    path: '',
    component: IncomeStatementPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class IncomeStatementPageRoutingModule {}
