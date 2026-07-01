import { Injectable, inject } from '@angular/core';
import { BillingStateService } from './billing-state.service';
import {
  AppFeature,
  AppRoute,
  BlockedBehavior,
  FEATURE_ACCESS_CONFIG,
  ModuleName,
  ROUTE_ACCESS_CONFIG,
} from '../shared/access-control';

/**
 * Single entry point for all UI permission checks.
 *
 * BillingStateService is the source of truth for subscription state.
 * This service maps that state to module-, route-, and feature-level access decisions.
 * It does not trigger any UI side-effects — use AccessHandlerService for that.
 */
@Injectable({ providedIn: 'root' })
export class AccessService {
  private readonly billingState = inject(BillingStateService);

  constructor() {
    this.validateFeatureConfigs();
  }

  /** Returns true when the user's current subscription includes the given module. */
  canAccessModule(module: ModuleName): boolean {
    return this.billingState.hasModuleAccess(module);
  }

  /** Returns true when the user can navigate to the given route. */
  canAccessRoute(route: AppRoute): boolean {
    return this.canAccessModule(ROUTE_ACCESS_CONFIG[route].requiredModule);
  }

  /** Returns the blocked behavior configured for the given route. */
  getRouteBlockedBehavior(route: AppRoute): BlockedBehavior {
    return ROUTE_ACCESS_CONFIG[route].blockedBehavior;
  }

  /** Returns true when the user can use the given UI feature. */
  canAccessFeature(feature: AppFeature): boolean {
    const config = FEATURE_ACCESS_CONFIG[feature];
    if (config.relatedRoute != null) {
      return this.canAccessRoute(config.relatedRoute);
    }
    return this.canAccessModule(config.requiredModule!);
  }

  /** Returns the blocked behavior configured for the given feature. */
  getFeatureBlockedBehavior(feature: AppFeature): BlockedBehavior {
    return FEATURE_ACCESS_CONFIG[feature].blockedBehavior;
  }

  /** Validates all feature configs at startup to catch developer mistakes early. */
  private validateFeatureConfigs(): void {
    for (const [feature, config] of Object.entries(FEATURE_ACCESS_CONFIG)) {
      const hasModule = config.requiredModule != null;
      const hasRoute = config.relatedRoute != null;

      if (!hasModule && !hasRoute) {
        throw new Error(
          `[AccessService] Feature "${feature}" must define either requiredModule or relatedRoute.`
        );
      }
      if (hasModule && hasRoute) {
        throw new Error(
          `[AccessService] Feature "${feature}" defines both requiredModule and relatedRoute — use exactly one.`
        );
      }
    }
  }
}
