import { Injectable, inject } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivateChild,
  RouterStateSnapshot,
} from '@angular/router';
import { NetworkStatusService } from '../../services/pwa/network-status.service';

/**
 * Path prefixes that must remain navigable while the browser is offline
 * (startup, auth, OAuth callback). Everything else under the in-app parent
 * route is blocked for offline in-session navigation.
 */
const OFFLINE_ALLOWED_PREFIXES = [
  '/login',
  '/register',
  '/shaam/callback',
] as const;

/**
 * Central offline navigation gate for authenticated in-app routing.
 *
 * Runs as `canActivateChild` on the protected app shell parent so every
 * sidebar / tab / router / back-forward navigation is checked once, before
 * AuthGuard / BillingGuard / ModuleAccessGuard.
 *
 * Offline → cancel navigation (return false), keep the current page, re-show
 * the offline banner. Never queues the target for later, never opens upgrade.
 */
@Injectable({ providedIn: 'root' })
export class OfflineNavigationGuard implements CanActivateChild {
  private readonly network = inject(NetworkStatusService);

  canActivateChild(
    _childRoute: ActivatedRouteSnapshot,
    state: RouterStateSnapshot,
  ): boolean {
    if (this.network.isBrowserOnline()) {
      return true;
    }

    if (this.isOfflineAllowed(state.url)) {
      return true;
    }

    // Deliberate in-app navigation while offline — stay put and surface feedback.
    this.network.notifyOfflineNavigationBlocked();
    return false;
  }

  private isOfflineAllowed(url: string): boolean {
    const path = url.split('?')[0].split('#')[0];
    return OFFLINE_ALLOWED_PREFIXES.some(
      (prefix) => path === prefix || path.startsWith(prefix + '/'),
    );
  }
}
