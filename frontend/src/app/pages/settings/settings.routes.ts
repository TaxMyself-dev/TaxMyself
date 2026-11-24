import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';
import { AuthGuard } from '../../shared/guard/auth.guard';
import { BillingGuard } from '../../shared/guard/billing.guard';

export const SETTINGS_ROUTES: Routes = [
  {
    path: 'settings',
    loadComponent: () => import('../settings-new/settings-new.page').then(m => m.SettingsNewPage),
    canActivate: [AuthGuard, BillingGuard],
  },
  {
    path: 'settings-new',
    pathMatch: 'full',
    redirectTo: ({ queryParams, fragment }) => inject(Router).createUrlTree(['/settings'], { queryParams, fragment }),
  },
];
