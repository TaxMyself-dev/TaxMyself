import { Injectable, inject } from '@angular/core';
import {
  AccessResult,
  AppFeature,
  AppRoute,
  BlockedBehavior,
  FEATURE_ACCESS_CONFIG,
  ROUTE_ACCESS_CONFIG,
} from '../shared/access-control';
import { AccessService } from './access.service';
import { UpgradeRequiredService } from './upgrade-required.service';
import { BillingStateService } from './billing-state.service';
import { NetworkStatusService } from './pwa/network-status.service';

/**
 * Executes access decisions with side-effects.
 *
 * AccessService answers "can the user do X?" — this service acts on the answer:
 * opening the upgrade popup when appropriate, and returning a structured result
 * the caller can use to adjust its own rendering (hide, disable, etc.).
 *
 * Use this in components before triggering a navigation or action.
 * For template-only visibility checks, inject AccessService directly.
 */
@Injectable({ providedIn: 'root' })
export class AccessHandlerService {
  private readonly accessService = inject(AccessService);
  private readonly upgradeRequired = inject(UpgradeRequiredService);
  private readonly billingState = inject(BillingStateService);
  private readonly network = inject(NetworkStatusService);

  /**
   * Checks feature access and opens the upgrade popup when behavior is UPGRADE_POPUP.
   * Returns the access result so the caller can also apply HIDE / DISABLE locally.
   */
  handleFeatureAccess(feature: AppFeature): AccessResult {
    if (this.blockOfflineAttempt()) {
      return { allowed: false };
    }

    if (this.accessService.canAccessFeature(feature)) {
      return { allowed: true };
    }

    // No authoritative billing payload → never treat as confirmed denial.
    if (this.billingState.isUnverified()) {
      return { allowed: false };
    }

    const blockedBehavior = this.accessService.getFeatureBlockedBehavior(feature);
    if (blockedBehavior === BlockedBehavior.UPGRADE_POPUP) {
      this.upgradeRequired.open({ source: 'feature', id: feature, displayName: FEATURE_ACCESS_CONFIG[feature].displayName });
    }
    return { allowed: false, blockedBehavior };
  }

  /**
   * Checks route access and opens the upgrade popup when behavior is UPGRADE_POPUP.
   * Primarily used by ModuleAccessGuard; can also be called before programmatic navigation.
   */
  handleRouteAccess(route: AppRoute): AccessResult {
    if (this.blockOfflineAttempt()) {
      return { allowed: false };
    }

    if (this.accessService.canAccessRoute(route)) {
      return { allowed: true };
    }

    if (this.billingState.isUnverified()) {
      return { allowed: false };
    }

    const blockedBehavior = this.accessService.getRouteBlockedBehavior(route);
    if (blockedBehavior === BlockedBehavior.UPGRADE_POPUP) {
      this.upgradeRequired.open({ source: 'route', id: route, displayName: ROUTE_ACCESS_CONFIG[route].displayName });
    }
    return { allowed: false, blockedBehavior };
  }

  /**
   * Clicks that decide access before calling Router still need offline feedback
   * and must not open the upgrade popup. The router guard covers routerLink /
   * back-forward; this covers AccessHandler-gated buttons.
   */
  private blockOfflineAttempt(): boolean {
    if (this.network.isBrowserOnline()) {
      return false;
    }
    this.network.notifyOfflineNavigationBlocked();
    return true;
  }
}
