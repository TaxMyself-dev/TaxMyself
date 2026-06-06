import { Injectable, inject } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
  Router,
  UrlTree,
} from '@angular/router';
import {
  BillingStateService,
  BILLING_BLOCKING_STATUSES,
} from '../../services/billing-state.service';

const DASHBOARD_ROUTE = '/my-account';

@Injectable({ providedIn: 'root' })
export class BillingGuard {
  private readonly billingStateService = inject(BillingStateService);
  private readonly router = inject(Router);

  async canActivate(
    _route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot,
  ): Promise<boolean | UrlTree> {
    // Wait for billing state. If AppComponent already started a load, this joins
    // that same in-flight Promise rather than issuing a second HTTP request.
    await this.billingStateService.loadBillingState();

    const billingState = this.billingStateService.billingState();

    // Network error or 401 — do not block the user; toast covers error visibility.
    if (!billingState) return true;

    const status = billingState.subscription?.status;

    if (!status || !BILLING_BLOCKING_STATUSES.includes(status)) {
      return true;
    }

    // Billing is blocking. Allow the dashboard itself (dialog will render there).
    // Strip query params before comparing so /my-account?foo=bar is still allowed.
    const path = state.url.split('?')[0];
    if (path === DASHBOARD_ROUTE) {
      return true;
    }

    return this.router.createUrlTree([DASHBOARD_ROUTE]);
  }
}
