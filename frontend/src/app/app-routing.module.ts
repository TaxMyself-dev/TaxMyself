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
    path: 'income-statement',
    loadChildren: () => import('./pages/income-statement/income-statement.module').then( m => m.IncomeStatementPageModule),
    canActivate: [AuthGuard] 
  },
 
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule {}
