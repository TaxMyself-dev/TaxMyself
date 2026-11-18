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
import { StartupService } from '../../services/startup.service';

const DASHBOARD_ROUTE = '/my-account';
const PAYMENT_STATUS_ROUTE = '/billing/payment-status';

@Injectable({ providedIn: 'root' })
export class BillingGuard {
  private readonly billingStateService = inject(BillingStateService);
  private readonly startup = inject(StartupService);
  private readonly router = inject(Router);

  async canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot,
  ): Promise<boolean | UrlTree> {
    // Never evaluate billing before auth initialization finished: /billing/me
    // would go out without an ID token and come back 401, which reads as a
    // rejected session. AuthGuard already awaits this on every protected route;
    // repeating it here keeps the guard correct on its own.
    await this.startup.whenReady();

    // Wait for billing state. If AppComponent already started a load, this joins
    // that same in-flight Promise rather than issuing a second HTTP request.
    await this.billingStateService.loadBillingState();

    const billingState = this.billingStateService.billingState();

    // Strip query params before comparing so /my-account?foo=bar is still allowed.
    const path = state.url.split('?')[0];

    // The configured CardCom success URL is the dashboard. Intercept the
    // provider return before MyAccountPage is created, preserving the provider
    // identifiers for the dedicated resolution screen.
    const returnedFromCardCom = path === DASHBOARD_ROUTE &&
      ['ResponseCode', 'responsecode', 'Status', 'status', 'LowProfileCode', 'lowprofilecode',
        'internalDealNumber', 'internaldealnumber']
        .some(key => route.queryParamMap?.has(key));
    if (returnedFromCardCom) {
      return this.router.createUrlTree([PAYMENT_STATUS_ROUTE], {
        queryParams: route.queryParams,
      });
    }

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

    // Verified accountant delegation and verified admin impersonation always
    // pass. The backend derives both states and returns full module access;
    // browser storage alone can never activate this override.
    if (this.billingStateService.hasBillingOverride()) {
      return true;
    }

    // A server-owned unresolved hosted checkout always owns navigation. This
    // also recovers refresh, browser close/reopen and a later login without
    // trusting sessionStorage as the source of truth.
    if (billingState.pendingCheckout) {
      return path === PAYMENT_STATUS_ROUTE
        ? true
        : this.router.createUrlTree([PAYMENT_STATUS_ROUTE]);
    }

    const status = this.billingStateService.effectiveStatus();

    if (
      !this.billingStateService.isPaymentRequired() &&
      (!status || !BILLING_BLOCKING_STATUSES.includes(status))
    ) {
      return true;
    }

    // Billing is blocking. Allow the dashboard itself (dialog will render there).
    if (path === DASHBOARD_ROUTE) {
      return true;
    }

    return this.router.createUrlTree([DASHBOARD_ROUTE]);
  }
}
