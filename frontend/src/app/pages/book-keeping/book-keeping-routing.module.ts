import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { BookKeepingPage } from './book-keeping.page';
import { ModuleAccessGuard } from '../../shared/guard/module-access.guard';
import { AppRoute } from '../../shared/access-control';

const routes: Routes = [
  {
    path: '',
    component: BookKeepingPage,
    children: [
      {
        path: 'incomes',
        canActivate: [ModuleAccessGuard],
        data: { appRoute: AppRoute.BOOK_KEEPING_INCOMES },
        loadChildren: () =>
          import('./incomes/incomes.module').then(m => m.IncomesPageModule)
      },
      {
        path: 'expenses',
        canActivate: [ModuleAccessGuard],
        data: { appRoute: AppRoute.BOOK_KEEPING_EXPENSES },
        loadChildren: () =>
          import('./expenses/expenses.module').then(m => m.ExpensesPageModule)
      },
      {
        path: 'clients',
        loadChildren: () =>
          import('./clients/clients.module').then(m => m.ClientsPageModule)
      },
      {
        path: 'suppliers',
        loadChildren: () =>
          import('./suppliers/suppliers.module').then(m => m.SuppliersPageModule)
      },
      {
        path: 'archived-documents',
        loadChildren: () =>
          import('./archived-documents/archived-documents.module').then(m => m.ArchivedDocumentsPageModule)
      },
      {
        path: 'tasks',
        loadChildren: () =>
          import('./client-tasks/client-tasks.module').then(m => m.ClientTasksPageModule)
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
