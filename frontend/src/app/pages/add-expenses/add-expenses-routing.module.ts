import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { AddInvoicePage } from './add-expenses.page';

const routes: Routes = [
  {
    path: '',
    component: AddInvoicePage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AddExpensesPageRoutingModule {}
