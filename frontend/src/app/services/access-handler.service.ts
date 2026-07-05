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

  /**
   * Checks feature access and opens the upgrade popup when behavior is UPGRADE_POPUP.
   * Returns the access result so the caller can also apply HIDE / DISABLE locally.
   */
  handleFeatureAccess(feature: AppFeature): AccessResult {
    if (this.accessService.canAccessFeature(feature)) {
      return { allowed: true };
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
    if (this.accessService.canAccessRoute(route)) {
      return { allowed: true };
    }

    const blockedBehavior = this.accessService.getRouteBlockedBehavior(route);
    if (blockedBehavior === BlockedBehavior.UPGRADE_POPUP) {
      this.upgradeRequired.open({ source: 'route', id: route, displayName: ROUTE_ACCESS_CONFIG[route].displayName });
    }
    return { allowed: false, blockedBehavior };
  }
}
