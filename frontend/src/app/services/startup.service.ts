import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { GenericService } from './generic.service';
import { isFirebaseAuthPersistenceReady } from '../shared/auth/firebase-auth-persistence';

/**
 * Single, explicit "startup ready" gate for the whole app.
 *
 * Startup is ready once Firebase has resolved the initial (restored) auth state.
 * Creating the Auth instance is done synchronously in `main.ts` before bootstrap,
 * so it is already finished by the time this service can be constructed
 * (asserted below).
 *
 * Connectivity does not need awaiting here — {@link NetworkStatusService}
 * establishes its initial value synchronously from `navigator.onLine` in its
 * constructor, so by the time any guard reads it the value is already correct.
 *
 * Guards and the login redirect all await {@link whenReady} so that NO routing
 * decision (enter app vs. show login) is ever made before Firebase has resolved
 * the session — this is what removes the login-page flash and the races between
 * Firebase's first emission, the guards, and the login redirect.
 *
 * The existing global loader (GenericService.isLoading) is turned on here at the
 * earliest point of a cold start and cleared by AppComponent once the first
 * navigation settles — no new loader is introduced, and nothing is gated on a
 * timer.
 */
@Injectable({ providedIn: 'root' })
export class StartupService {
  private readonly auth = inject(AuthService);
  private readonly generic = inject(GenericService);

  private readonly _ready = signal<boolean>(false);
  /** True once Firebase has resolved the initial auth state. */
  readonly ready = this._ready.asReadonly();

  private readyPromise: Promise<void> | null = null;

  /**
   * True while this service is responsible for the global loader. Cleared once
   * by {@link releaseStartupLoader} so a later API-driven loader is never
   * dismissed as a side-effect of startup finishing.
   */
  private holdingStartupLoader = false;

  constructor() {
    if (!isFirebaseAuthPersistenceReady()) {
      // main.ts runs initializeFirebaseAuthPersistence() before bootstrap; if
      // that ever stops being true, Auth is running on the SDK default
      // persistence — a permanent login shared across tabs.
      console.error('[StartupService] Firebase Auth persistence was not initialized before bootstrap.');
    }

    // Show the existing loader from the very start of a cold launch, so the
    // shell never briefly renders the login page while auth is still resolving.
    this.generic.isLoading.set(true);
    this.holdingStartupLoader = true;
    void this.whenReady();
  }

  /** Resolves once initialization has finished. Memoized — safe to await often. */
  whenReady(): Promise<void> {
    if (!this.readyPromise) {
      this.readyPromise = this.auth.waitForAuthInit().then(() => {
        this._ready.set(true);
      });
    }
    return this.readyPromise;
  }

  /**
   * Drop the cold-start loader exactly once, after the first navigation has
   * settled. No-op if something else already took over the loader, or if this
   * was already released.
   */
  releaseStartupLoader(): void {
    if (!this.holdingStartupLoader) {
      return;
    }
    this.holdingStartupLoader = false;
    this.generic.dismissLoader();
  }
}
