import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';
// route guard
import { AuthGuard } from './shared/guard/auth.guard';
const routes: Routes = [
  {
    path: '',
    redirectTo: '/login',
    pathMatch: 'full'
  },
  {
    path: 'register',
    loadChildren: () => import('./pages/register/register.module').then( m => m.RegisterPageModule)
  },
  
  {
    path: 'reports',
    loadChildren: () => import('./pages/reports/reports.module').then( m => m.ReportsPageModule),
    canActivate: [AuthGuard] 
  },
  {
    path: 'my-storage',
    loadChildren: () => import('./pages/my-storage/my-storage.module').then( m => m.MyStoragePageModule),
    canActivate: [AuthGuard] 
  },
  {
    path: 'my-account',
    loadChildren: () => import('./pages/my-account/my-account.module').then( m => m.MyAccountPageModule),
    canActivate: [AuthGuard] 
  },
  {
    path: 'login',
    loadChildren: () => import('./pages/login/login.module').then( m => m.LoginPageModule)
  },
  {
    path: 'transactions',
    loadChildren: () => import('./pages/transactions/transactions.module').then( m => m.TransactionsPageModule),
    canActivate: [AuthGuard] 
  },
  {
    path: 'my-status',
    loadChildren: () => import('./pages/my-status/my-status.module').then( m => m.MyStatusPageModule),
    canActivate: [AuthGuard] 
  },
  {
    path: 'vat-report',
    loadChildren: () => import('./pages/vat-report/vat-report.module').then( m => m.VatReportPageModule),
    canActivate: [AuthGuard] 
  },
  {
    path: 'annual-report',
    loadChildren: () => import('./pages/annual-report/annual-report.module').then( m => m.AnnualReportPageModule),
    canActivate: [AuthGuard] 
  },
  
  {
    path: 'advance-income-tax-report',
    loadChildren: () => import('./pages/advance-income-tax-report/advance-income-tax-report.module').then( m => m.AdvanceIncomeTaxReportPageModule),
    canActivate: [AuthGuard] 
  },
  {
    path: 'pnl-report',
    loadChildren: () => import('./pages/pnl-report/pnl-report.module').then( m => m.PnLReportPageModule),
    canActivate: [AuthGuard] 
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
    loadChildren: () => import('./pages/doc-create/doc-create.module').then( m => m.DocCreatePageModule)
  },
 
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule {}
