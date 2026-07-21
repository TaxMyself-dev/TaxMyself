import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';
// route guard
import { AuthGuard } from './shared/guard/auth.guard';
import { BillingGuard } from './shared/guard/billing.guard';
import { ViewOnlyBlockDocGuard } from './shared/guard/view-only-block-doc.guard';
import { ModuleAccessGuard } from './shared/guard/module-access.guard';
import { StartupRedirectGuard } from './shared/guard/startup-redirect.guard';
import { AppRoute } from './shared/access-control';
const routes: Routes = [
  {
    // Cold-start gate: waits for Firebase auth, then UrlTree → restored route
    // (online + authenticated) or /login. Replaces the unconditional redirect
    // that caused the login-page flash.
    path: '',
    pathMatch: 'full',
    canActivate: [StartupRedirectGuard],
    children: [],
  },
  {
    path: 'register',
    loadComponent: () => import('./pages/register/register.page').then(m => m.RegisterPage)
  },

  {
    path: 'reports',
    loadChildren: () => import('./pages/reports/reports.module').then(m => m.ReportsPageModule),
    canActivate: [AuthGuard, BillingGuard]
  },
  {
    path: 'my-storage',
    loadChildren: () => import('./pages/my-storage/my-storage.module').then(m => m.MyStoragePageModule),
    canActivate: [AuthGuard, BillingGuard]
  },
  {
    path: 'book-keeping',
    loadChildren: () => import('./pages/book-keeping/book-keeping.module').then(m => m.BookKeepingPageModule),
    canActivate: [AuthGuard, BillingGuard]
  },
  {
    path: 'my-account',
    loadComponent: () => import('./pages/my-account/my-account.page').then(m => m.MyAccountPage),
    canActivate: [AuthGuard, BillingGuard]
  },
  {
    path: 'settings',
    loadComponent: () => import('./pages/settings/settings.page').then(m => m.SettingsPage),
    canActivate: [AuthGuard, BillingGuard]
  },
  {
    path: 'login',
    loadChildren: () => import('./pages/login/login.module').then(m => m.LoginPageModule)
  },
  {
    path: 'transactions',
    canActivate: [AuthGuard, BillingGuard, ModuleAccessGuard],
    data: { appRoute: AppRoute.TRANSACTIONS },
    loadChildren: () => import('./pages/transactions/transactions.module').then(m => m.TransactionsPageModule),
  },
  {
    path: 'vat-report',
    loadChildren: () => import('./pages/vat-report-journal/vat-report-journal.module').then( m => m.VatReportJournalPageModule),
    canActivate: [AuthGuard, BillingGuard, ModuleAccessGuard],
    data: { appRoute: AppRoute.VAT_REPORT },
  },
  {
    path: 'annual-report',
    loadChildren: () => import('./pages/annual-report/annual-report.module').then(m => m.AnnualReportPageModule),
    canActivate: [AuthGuard, BillingGuard]
  },
  {
    path: 'advance-income-tax-report',
    loadChildren: () => import('./pages/advance-income-tax-report/advance-income-tax-report.module').then(m => m.AdvanceIncomeTaxReportPageModule),
    canActivate: [AuthGuard, BillingGuard, ModuleAccessGuard],
    data: { appRoute: AppRoute.ADVANCE_INCOME_TAX_REPORT },
  },
  {
    path: 'uniform-file',
    loadChildren: () => import('./pages/uniform-file/uniform-file.module').then(m => m.UnifromFilePageModule),
    canActivate: [AuthGuard, BillingGuard, ModuleAccessGuard],
    data: { appRoute: AppRoute.UNIFORM_FILE },
  },
  {
    path: 'pnl-report',
    loadChildren: () => import('./pages/pnl-report-journal/pnl-report-journal.module').then( m => m.PnLReportJournalPageModule),
    canActivate: [AuthGuard, BillingGuard, ModuleAccessGuard],
    data: { appRoute: AppRoute.PNL_REPORT },
  },
  {
    path: 'ledger-report',
    loadChildren: () => import('./pages/ledger-report/ledger-report.module').then( m => m.LedgerReportPageModule),
    canActivate: [AuthGuard, BillingGuard]
  },
  {
    path: 'report-review',
    loadChildren: () => import('./pages/report-review/report-review.module').then(m => m.ReportReviewPageModule),
    canActivate: [AuthGuard, BillingGuard]
  },
  {
    path: 'depreciation-report',
    loadChildren: () => import('./pages/depreciation-report/depreciation-report.module').then(m => m.DepreciationReportPageModule),
    canActivate: [AuthGuard, BillingGuard]
  },
  {
    path: 'flow-report',
    loadChildren: () => import('./pages/flow-report/flow-report.module').then(m => m.FlowReportPageModule)
  },
  {
    path: 'admin-panel',
    loadChildren: () => import('./pages/admin-panel/admin-panel.module').then(m => m.AdminPanelPageModule)
  },
  {
    path: 'client-panel',
    loadChildren: () => import('./pages/clients-panel/clients-panel.module').then(m => m.ClientPanelPageModule)
  },
  {
    path: 'doc-create',
    loadChildren: () => import('./pages/doc-create/doc-create.module').then(m => m.DocCreatePageModule),
    canActivate: [AuthGuard, BillingGuard, ModuleAccessGuard, ViewOnlyBlockDocGuard],
    data: { appRoute: AppRoute.DOC_CREATE },
  },
  {
    path: 'add-expense',
    loadComponent: () => import('./pages/add-expense/add-expense.component').then(m => m.AddExpenseComponent)
  },
  {
    path: 'shaam/callback',
    loadChildren: () => import('./pages/shaam-callback/shaam-callback.module').then(m => m.ShaamCallbackPageModule)
  },
  {
    path: 'flow-analysis',
    canActivate: [AuthGuard, BillingGuard, ModuleAccessGuard],
    data: { appRoute: AppRoute.FLOW_ANALYSIS },
    loadComponent: () => import('./pages/flow-analysis/flow-analysis.component').then(m => m.FlowAnalysisComponent),
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
export class AppRoutingModule { }
