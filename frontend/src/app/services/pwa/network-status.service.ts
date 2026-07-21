import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { environment } from '../../../environments/environment';

/**
 * Centralized connectivity classification for the whole app.
 *
 *  - ONLINE             — the backend answered a real HTTP response (any status,
 *                         including 4xx/5xx). Reachability is proven.
 *  - OFFLINE            — the browser reports no network interface.
 *  - SERVER_UNREACHABLE — the browser has a network interface but the backend
 *                         could not be reached (status 0 / DNS / CORS / reset /
 *                         timeout while `navigator.onLine === true`).
 *  - CHECKING           — a bounded reachability probe is in flight; the true
 *                         state is not yet known.
 */
export enum ConnectivityState {
  ONLINE = 'ONLINE',
  OFFLINE = 'OFFLINE',
  SERVER_UNREACHABLE = 'SERVER_UNREACHABLE',
  CHECKING = 'CHECKING',
}

/**
 * Single source of truth for connectivity. PWA-infrastructure only — it knows
 * nothing about business data and never queues, retries, persists, or logs out.
 *
 * Everything is a *hint*, never proof:
 *  - `navigator.onLine` reports link-layer state only. It stays true on Wi-Fi
 *    with no working internet, and captive portals look "online".
 *  - HTTP `status === 0` means the request never reached the server, which also
 *    covers CORS and DNS failures that happen while perfectly online.
 *
 * The service resolves those hints into a single {@link ConnectivityState} that
 * every consumer derives from, so connectivity is never re-classified in page
 * components.
 */
@Injectable({ providedIn: 'root' })
export class NetworkStatusService {
  private readonly destroyRef = inject(DestroyRef);

  /** Bounds a single reachability probe. Never bounds real app requests. */
  private static readonly REACHABILITY_TIMEOUT_MS = 5_000;

  /**
   * Public, unauthenticated backend root — the Cloud Run liveness endpoint
   * (`GET /` → `{ status: 'ok' }`). Any HTTP response from it proves the backend
   * was reached; we never read its body and never cache it.
   */
  private readonly healthUrl = environment.apiUrl;

  private readonly _state = signal<ConnectivityState>(
    this.browserOnline() ? ConnectivityState.ONLINE : ConnectivityState.OFFLINE,
  );

  /**
   * Monotonic guard against stale results. Every state-affecting signal (event,
   * real request result, or probe start) bumps this. A probe captures the value
   * at dispatch and only applies its result if nothing newer happened meanwhile,
   * so a delayed failure from an earlier network state can never overwrite a
   * newer online state.
   */
  private _seq = 0;

  /** The current connectivity classification. */
  readonly state = this._state.asReadonly();

  /** True only when reachability is proven. */
  readonly isOnline = computed(() => this._state() === ConnectivityState.ONLINE);
  /** True only when the browser reports no network interface. */
  readonly isOffline = computed(() => this._state() === ConnectivityState.OFFLINE);
  /** True when a connectivity-failure banner should be considered. */
  readonly isConnectivityFailure = computed(
    () =>
      this._state() === ConnectivityState.OFFLINE ||
      this._state() === ConnectivityState.SERVER_UNREACHABLE,
  );

  /**
   * Bumped on every transition *into* ONLINE. Consumers use it to trigger
   * recovery exactly once per outage instead of on every event.
   */
  readonly reconnectedAt = signal<number>(0);

  /**
   * Bumped when an in-app navigation (or access-gated click) is blocked because
   * the browser is offline. {@link PwaBannersComponent} uses this to re-show
   * the offline banner even if the user previously dismissed it.
   */
  readonly offlineNavigationBlockedAt = signal<number>(0);

  constructor() {
    // Guard against non-browser environments (defensive; app is browser-only).
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
      return;
    }

    // Link-layer loss is authoritative for "offline" — surface it immediately,
    // without waiting for any HTTP request to fail.
    const onOffline = () => this.forceState(ConnectivityState.OFFLINE);
    // Link-layer recovery is NOT proof the backend is reachable — probe once.
    const onOnline = () => void this.checkReachability();

    // Android freezes a backgrounded PWA; online/offline events fired while
    // frozen can be missed entirely. Re-evaluate whenever the app resumes so a
    // restored connection can never leave the banner stuck.
    const resync = () => {
      if (!this.browserOnline()) {
        this.forceState(ConnectivityState.OFFLINE);
      } else if (this._state() !== ConnectivityState.ONLINE) {
        void this.checkReachability();
      }
    };
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
   * Report a transport-level HTTP failure (`status === 0`, timeout, DNS, CORS,
   * reset). Classifies as OFFLINE only when the browser independently agrees;
   * otherwise the network exists but the backend could not be reached.
   */
  reportRequestFailure(): void {
    this.forceState(
      this.browserOnline() ? ConnectivityState.SERVER_UNREACHABLE : ConnectivityState.OFFLINE,
    );
  }

  /**
   * Synchronous link-layer connectivity hint (`navigator.onLine`). Used by
   * startup routing decisions — never awaits a probe and never treats
   * SERVER_UNREACHABLE as offline for cold-start purposes.
   */
  isBrowserOnline(): boolean {
    return this.browserOnline();
  }

  /**
   * Re-surface the offline banner after a blocked in-app navigation attempt.
   * Also forces OFFLINE when the browser agrees, so the banner has a failure
   * state to display even if the user previously dismissed it.
   */
  notifyOfflineNavigationBlocked(): void {
    if (!this.browserOnline()) {
      this.forceState(ConnectivityState.OFFLINE);
    }
    this.offlineNavigationBlockedAt.set(Date.now());
  }

  /**
   * Report any real HTTP response — proof the backend was reached.
   * Ignored while the browser itself reports offline, so a spurious/cached
   * response cannot flip an airplane-mode cold start to ONLINE and trigger
   * the "connection restored" banner.
   */
  reportRequestSuccess(): void {
    if (!this.browserOnline()) {
      return;
    }
    this.forceState(ConnectivityState.ONLINE);
  }

  /**
   * Report that a Firebase ID token could not be acquired in time, so a
   * protected request was stopped before it was ever sent.
   *
   * We do NOT blindly treat this as an internet outage: offline it is, but while
   * the link layer is up it may be a transient Firebase token issue. In that
   * case probe the backend rather than asserting a state we cannot prove.
   */
  reportAuthUnavailable(): void {
    if (!this.browserOnline()) {
      this.forceState(ConnectivityState.OFFLINE);
    } else {
      void this.checkReachability();
    }
  }

  /**
   * One bounded reachability probe against the public backend root. A resolved
   * response of ANY status proves reachability (ONLINE). A transport failure
   * means OFFLINE (if the browser agrees) or SERVER_UNREACHABLE. Guarded by the
   * sequence counter so a newer state always wins.
   */
  private async checkReachability(): Promise<void> {
    const seq = this.beginCheck();

    if (!this.browserOnline()) {
      this.applyIfCurrent(seq, ConnectivityState.OFFLINE);
      return;
    }
    if (typeof fetch !== 'function') {
      // No fetch (very old / non-browser) — fall back to the link-layer hint.
      this.applyIfCurrent(seq, ConnectivityState.ONLINE);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      NetworkStatusService.REACHABILITY_TIMEOUT_MS,
    );
    try {
      // Public endpoint, no credentials. Any response (incl. 4xx/5xx) = reached.
      await fetch(this.healthUrl, {
        method: 'GET',
        cache: 'no-store',
        mode: 'cors',
        credentials: 'omit',
        signal: controller.signal,
      });
      this.applyIfCurrent(seq, ConnectivityState.ONLINE);
    } catch {
      this.applyIfCurrent(
        seq,
        this.browserOnline() ? ConnectivityState.SERVER_UNREACHABLE : ConnectivityState.OFFLINE,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  /** Enter CHECKING and reserve a fresh sequence value for this probe. */
  private beginCheck(): number {
    const seq = ++this._seq;
    this.setState(ConnectivityState.CHECKING);
    return seq;
  }

  /** Apply a probe result only if no newer signal has superseded it. */
  private applyIfCurrent(seq: number, next: ConnectivityState): void {
    if (seq !== this._seq) {
      return;
    }
    this.setState(next);
  }

  /** Immediate, authoritative state change from a fresh signal. */
  private forceState(next: ConnectivityState): void {
    ++this._seq;
    this.setState(next);
  }

  private setState(next: ConnectivityState): void {
    // Never claim ONLINE while the browser link layer is down.
    if (next === ConnectivityState.ONLINE && !this.browserOnline()) {
      next = ConnectivityState.OFFLINE;
    }
    const previous = this._state();
    if (previous === next) {
      return;
    }
    this._state.set(next);
    // reconnectedAt stays 0 until a real transition into ONLINE during the
    // session. The initial constructor value does not go through setState, so
    // an online cold start never looks like a reconnect.
    if (next === ConnectivityState.ONLINE && previous !== ConnectivityState.ONLINE) {
      this.reconnectedAt.set(Date.now());
    }
  }

  private browserOnline(): boolean {
    // navigator.onLine defaults to true when unknown — the safest assumption so
    // we never wrongly show an offline notice at startup.
    return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
  }
}
