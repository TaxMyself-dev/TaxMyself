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

    // Strip query params before comparing so /my-account?foo=bar is still allowed.
    const path = state.url.split('?')[0];

    // Billing state could not be verified (offline, backend down, 401).
    // Do NOT fail open — an unverified subscription must never unlock content.
    // Do NOT redirect to /login either: the Firebase session is still valid and
    // this is a connectivity problem, not an auth problem. Route to the
    // dashboard, which is billing-exempt by design below and surfaces the
    // offline banner. Module-gated features there stay locked, because
    // hasModuleAccess() returns false while billingState is null.
    if (!billingState) {
      return path === DASHBOARD_ROUTE ? true : this.router.createUrlTree([DASHBOARD_ROUTE]);
    }

    const status = billingState.subscription?.status;

    if (!status || !BILLING_BLOCKING_STATUSES.includes(status)) {
      return true;
    }

    // Billing is blocking. Allow the dashboard itself (dialog will render there).
    if (path === DASHBOARD_ROUTE) {
      return true;
    }

    return this.router.createUrlTree([DASHBOARD_ROUTE]);
  }
}
