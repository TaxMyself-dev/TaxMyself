import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';
// route guard
import { AuthGuard } from './shared/guard/auth.guard';
import { BillingGuard } from './shared/guard/billing.guard';
import { ViewOnlyBlockDocGuard } from './shared/guard/view-only-block-doc.guard';
const routes: Routes = [
  {
    path: '',
    redirectTo: '/login',
    pathMatch: 'full'
  },
  {
    path: 'register',
    loadComponent: () => import('./pages/register/register.page').then( m => m.RegisterPage)
  },
  
  {
    path: 'reports',
    loadChildren: () => import('./pages/reports/reports.module').then( m => m.ReportsPageModule),
    canActivate: [AuthGuard, BillingGuard]
  },
  {
    path: 'my-storage',
    loadChildren: () => import('./pages/my-storage/my-storage.module').then( m => m.MyStoragePageModule),
    canActivate: [AuthGuard, BillingGuard]
  },
  {
    path: 'book-keeping',
    loadChildren: () => import('./pages/book-keeping/book-keeping.module').then( m => m.BookKeepingPageModule),
    canActivate: [AuthGuard, BillingGuard]
  },
  {
    path: 'my-account',
    loadComponent: () => import('./pages/my-account/my-account.page').then( m => m.MyAccountPage),
    canActivate: [AuthGuard, BillingGuard]
  },
  {
    path: 'settings',
    loadComponent: () => import('./pages/settings/settings.page').then( m => m.SettingsPage),
    canActivate: [AuthGuard, BillingGuard]
  },
  {
    path: 'login',
    loadChildren: () => import('./pages/login/login.module').then( m => m.LoginPageModule)
  },
  {
    path: 'transactions',
    loadChildren: () => import('./pages/transactions/transactions.module').then( m => m.TransactionsPageModule),
    canActivate: [AuthGuard, BillingGuard]
  },
  {
    path: 'vat-report',
    loadChildren: () => import('./pages/vat-report/vat-report.module').then( m => m.VatReportPageModule),
    canActivate: [AuthGuard, BillingGuard]
  },
  {
    path: 'annual-report',
    loadChildren: () => import('./pages/annual-report/annual-report.module').then( m => m.AnnualReportPageModule),
    canActivate: [AuthGuard, BillingGuard]
  },
  {
    path: 'advance-income-tax-report',
    loadChildren: () => import('./pages/advance-income-tax-report/advance-income-tax-report.module').then( m => m.AdvanceIncomeTaxReportPageModule),
    canActivate: [AuthGuard, BillingGuard]
  },
  {
    path: 'uniform-file',
    loadChildren: () => import('./pages/uniform-file/uniform-file.module').then( m => m.UnifromFilePageModule),
    canActivate: [AuthGuard, BillingGuard]
  },
  {
    path: 'pnl-report',
    loadChildren: () => import('./pages/pnl-report/pnl-report.module').then( m => m.PnLReportPageModule),
    canActivate: [AuthGuard, BillingGuard]
  },
  {
    path: 'flow-report',
    loadChildren: () => import('./pages/flow-report/flow-report.module').then( m => m.FlowReportPageModule)
  },
  {
    path: 'admin-panel',
    loadChildren: () => import('./pages/admin-panel/admin-panel.module').then( m => m.AdminPanelPageModule)
  },
  {
    path: 'client-panel',
    loadChildren: () => import('./pages/clients-panel/clients-panel.module').then( m => m.ClientPanelPageModule)
  },
  {
    path: 'doc-create',
    loadChildren: () => import('./pages/doc-create/doc-create.module').then( m => m.DocCreatePageModule),
    canActivate: [AuthGuard, BillingGuard, ViewOnlyBlockDocGuard]
  },
  {
    path: 'add-expense',
    loadComponent: () => import('./pages/add-expense/add-expense.component').then( m => m.AddExpenseComponent)
  },
  {
    path: 'shaam/callback',
    loadChildren: () => import('./pages/shaam-callback/shaam-callback.module').then(m => m.ShaamCallbackPageModule)
  },
  {
    path: 'flow-analysis',
    loadComponent: () => import('./pages/flow-analysis/flow-analysis.component').then( m => m.FlowAnalysisComponent)
  },
  {
    path: 'billing',
    canActivate: [AuthGuard],
    children: [
      { path: '', redirectTo: 'plans', pathMatch: 'full' },
      {
        path: 'plans',
        loadComponent: () => import('./pages/billing/billing-plans.page').then(m => m.BillingPlansPage),
      },
    ],
  },

];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule {}
