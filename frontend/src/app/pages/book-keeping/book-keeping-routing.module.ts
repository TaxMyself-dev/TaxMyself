import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { BookKeepingPage } from './book-keeping.page';

const routes: Routes = [
  {
    path: '',
    component: BookKeepingPage,
    children: [
      {
        path: 'incomes',
        loadChildren: () =>
          import('./incomes/incomes.module').then(m => m.IncomesPageModule)
      },
      {
        path: 'expenses',
        loadChildren: () =>
          import('./expenses/expenses.module').then(m => m.ExpensesPageModule)
      },
      {
        path: 'clients',
        loadChildren: () =>
          import('./clients/clients.module').then(m => m.ClientsPageModule)
      },
      { path: '', redirectTo: 'incomes', pathMatch: 'full' }
    ]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class BookKeepingPageRoutingModule {}
