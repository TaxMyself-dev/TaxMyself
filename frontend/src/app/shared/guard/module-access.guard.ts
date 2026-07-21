import { Injectable, inject } from '@angular/core';
import { ActivatedRouteSnapshot, Router, UrlTree } from '@angular/router';
import { AppRoute, BlockedBehavior, ROUTE_ACCESS_CONFIG } from '../access-control';
import { AccessService } from '../../services/access.service';
import { BillingStateService } from '../../services/billing-state.service';
import { UpgradeRequiredService } from '../../services/upgrade-required.service';

const FALLBACK_ROUTE = '/my-account';

/**
 * Protects routes based on subscription module access.
 *
 * Usage — add to any route in app-routing:
 *
 *   {
 *     path: 'transactions',
 *     canActivate: [AuthGuard, BillingGuard, ModuleAccessGuard],
 *     data: { appRoute: AppRoute.TRANSACTIONS },
 *     loadChildren: ...
 *   }
 *
 * Behavior when blocked:
 *   - UPGRADE_POPUP → open UpgradeRequiredService (only after authoritative denial)
 *   - HIDE / DISABLE → redirect to /my-account silently
 *
 * Unverified / technical-error states never open the upgrade popup. Offline
 * navigations are cancelled earlier by {@link OfflineNavigationGuard}.
 */
@Injectable({ providedIn: 'root' })
export class ModuleAccessGuard {
  private readonly billingState = inject(BillingStateService);
  private readonly accessService = inject(AccessService);
  private readonly upgradeRequired = inject(UpgradeRequiredService);
  private readonly router = inject(Router);

  async canActivate(route: ActivatedRouteSnapshot): Promise<boolean | UrlTree> {
    // Join any in-flight cold load. When a prior successful payload exists
    // (including during a reconnect refresh that preserves it), this returns
    // immediately and we evaluate against last-known modules.
    await this.billingState.loadBillingState();

    // No authoritative payload — connectivity/API problem, not denial.
    if (this.billingState.isUnverified()) {
      console.warn('[ModuleAccessGuard] billing state unverified — denying module route without upgrade.');
      return this.router.createUrlTree([FALLBACK_ROUTE]);
    }

    const appRoute = route.data['appRoute'] as AppRoute | undefined;
    console.log("🚀 ~ ModuleAccessGuard ~ canActivate ~ appRoute:", appRoute)
    if (appRoute == null) {
      console.warn('[ModuleAccessGuard] route.data.appRoute is not set — skipping module check.');
      return true;
    }

    if (this.accessService.canAccessRoute(appRoute)) {
      return true;
    }

    // Authoritative denial — successful /billing/me confirmed the module is missing.
    const { blockedBehavior, displayName } = ROUTE_ACCESS_CONFIG[appRoute];
    if (blockedBehavior === BlockedBehavior.UPGRADE_POPUP) {
      this.upgradeRequired.open({ source: 'route', id: appRoute, displayName });
      return false;
    }

    return this.router.createUrlTree([FALLBACK_ROUTE]);
  }
}
