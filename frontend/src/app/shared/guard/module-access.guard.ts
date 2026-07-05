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
 *   - UPGRADE_POPUP → open UpgradeRequiredService + redirect to /my-account
 *   - HIDE / DISABLE → redirect to /my-account silently
 */
@Injectable({ providedIn: 'root' })
export class ModuleAccessGuard {
  private readonly billingState = inject(BillingStateService);
  private readonly accessService = inject(AccessService);
  private readonly upgradeRequired = inject(UpgradeRequiredService);
  private readonly router = inject(Router);

  async canActivate(route: ActivatedRouteSnapshot): Promise<boolean | UrlTree> {
    // Ensure billing state is loaded before checking module access.
    await this.billingState.loadBillingState();

    const appRoute = route.data['appRoute'] as AppRoute | undefined;
    console.log("🚀 ~ ModuleAccessGuard ~ canActivate ~ appRoute:", appRoute)
    if (appRoute == null) {
      console.warn('[ModuleAccessGuard] route.data.appRoute is not set — skipping module check.');
      return true;
    }

    if (this.accessService.canAccessRoute(appRoute)) {
      return true;
    }

    const { blockedBehavior, displayName } = ROUTE_ACCESS_CONFIG[appRoute];
    if (blockedBehavior === BlockedBehavior.UPGRADE_POPUP) {
      this.upgradeRequired.open({ source: 'route', id: appRoute, displayName });
      return false;
    }

    return this.router.createUrlTree([FALLBACK_ROUTE]);
  }
}
