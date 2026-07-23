import { Injectable, inject, signal } from '@angular/core';
import { BillingStateService } from '../billing-state.service';
import { GenericService } from '../generic.service';
import { AuthService } from '../auth.service';

/**
 * Reloads the small set of app-wide state that every screen depends on.
 *
 * ## Safety contract
 *
 * This service performs **idempotent GET loads only**, from an explicit
 * allow-list. It exists precisely so that "recover after reconnect" and
 * "user tapped refresh" cannot become "replay whatever failed".
 *
 * Never do any of the following here, and never add a generic HTTP retry:
 *   POST / PUT / PATCH / DELETE, billing or payment actions, document
 *   creation, Gmail imports, bank synchronisation, e-mail jobs, file uploads.
 *
 * Failed mutations are intentionally *not* queued anywhere in the app, so
 * there is nothing to replay — a mutation that failed while offline must be
 * re-triggered by the user, deliberately.
 *
 * It also never navigates, never reloads the document and never touches auth
 * state, so in-progress forms and the current route survive a refresh.
 */
@Injectable({ providedIn: 'root' })
export class AppRefreshService {
  private readonly billingState = inject(BillingStateService);
  private readonly genericService = inject(GenericService);
  private readonly authService = inject(AuthService);

  /** True while a refresh is in flight — drives button state. */
  readonly isRefreshing = signal(false);

  /** Guards against overlapping runs (rapid taps, reconnect + manual tap). */
  private inFlight: Promise<void> | null = null;

  /**
   * Re-fetch shared application state.
   *
   * No-ops when signed out — there is nothing user-scoped to load, and firing
   * these requests unauthenticated would 401.
   */
  async refreshSharedState(): Promise<void> {
    if (this.inFlight) {
      return this.inFlight;
    }
    if (!this.authService.isLoggedIn) {
      return;
    }

    this.isRefreshing.set(true);
    this.inFlight = this.run().finally(() => {
      this.inFlight = null;
      this.isRefreshing.set(false);
    });
    return this.inFlight;
  }

  private async run(): Promise<void> {
    // Allow-listed idempotent GETs only. Settled independently so one failure
    // does not hide the other; each already handles its own errors.
    const results = await Promise.allSettled([
      // GET billing/me — also clears the "load already failed" suppression so a
      // previously-unverified state can become verified again.
      this.billingState.refreshBillingState(),
      // GET business/get-businesses
      this.genericService.loadBusinessesFromServer(),
    ]);

    results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .forEach((r) => console.warn('[AppRefreshService] shared state reload failed:', r.reason));
  }
}
