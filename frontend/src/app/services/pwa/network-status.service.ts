import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';

/**
 * Reports browser connectivity as reactive signals. PWA-infrastructure only —
 * it deliberately knows nothing about business data and never queues, retries,
 * or persists anything. Consumers use it purely to render an offline notice.
 *
 * Everything here is a *hint*, never proof:
 *  - `navigator.onLine` reports link-layer state only. It stays true on Wi-Fi
 *    with no working internet, and captive portals look "online".
 *  - HTTP `status === 0` means the request never reached the server, which also
 *    covers CORS and DNS failures that happen while perfectly online.
 *
 * Nothing in this service ever triggers a logout.
 */
@Injectable({ providedIn: 'root' })
export class NetworkStatusService {
  private readonly destroyRef = inject(DestroyRef);

  private readonly _isOnline = signal<boolean>(this.readInitialOnline());

  /** True while the browser reports an active network connection. */
  readonly isOnline = this._isOnline.asReadonly();
  /** Convenience inverse of {@link isOnline}. */
  readonly isOffline = computed(() => !this._isOnline());

  /**
   * Bumped on every offline→online transition. Consumers use it to trigger
   * recovery exactly once per outage instead of on every event.
   */
  readonly reconnectedAt = signal<number>(0);

  constructor() {
    // Guard against non-browser environments (defensive; app is browser-only).
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
      return;
    }

    const onOnline = () => this.setOnline(true);
    const onOffline = () => this.setOnline(false);

    // Android freezes a backgrounded PWA. Events fired while frozen can be
    // missed entirely, so re-read the flag whenever the app comes back — this
    // is why a restored connection previously left the offline banner stuck.
    const resync = () => this.setOnline(this.readInitialOnline());
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        resync();
      }
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisibilityChange);
    // Fires on bfcache restore, where neither online/offline nor
    // visibilitychange is guaranteed.
    window.addEventListener('pageshow', resync);
    window.addEventListener('focus', resync);

    this.destroyRef.onDestroy(() => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pageshow', resync);
      window.removeEventListener('focus', resync);
    });
  }

  /**
   * Report a transport-level HTTP failure (`status === 0`).
   *
   * Only downgrades to "offline" when `navigator.onLine` independently agrees,
   * so a CORS misconfiguration, a DNS problem or a single dead endpoint cannot
   * make an online app claim it is offline.
   */
  reportRequestFailure(): void {
    if (!this.readInitialOnline()) {
      this.setOnline(false);
    }
  }

  /** Report any successful response — proof we really are online. */
  reportRequestSuccess(): void {
    this.setOnline(true);
  }

  private setOnline(next: boolean): void {
    const previous = this._isOnline();
    if (previous === next) {
      return;
    }
    this._isOnline.set(next);
    if (next) {
      this.reconnectedAt.set(Date.now());
    }
  }

  private readInitialOnline(): boolean {
    // navigator.onLine defaults to true when unknown — the safest assumption so
    // we never wrongly show an offline notice at startup.
    return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
  }
}
