import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs/operators';

/**
 * Detects when a newly deployed app version has been fully downloaded by the
 * service worker and is ready to activate. Never reloads on its own — the user
 * must explicitly confirm, so in-progress work is not silently discarded.
 *
 * No-ops entirely when the service worker is disabled (dev / unsupported
 * browsers), so it is safe to inject anywhere.
 */
@Injectable({ providedIn: 'root' })
export class PwaUpdateService {
  private readonly swUpdate = inject(SwUpdate);
  private readonly destroyRef = inject(DestroyRef);

  /** True once a new version is downloaded and ready to activate. */
  readonly updateReady = signal<boolean>(false);
  /** True while activation + reload is in flight (prevents repeat clicks). */
  readonly activating = signal<boolean>(false);

  /** Throttle background update checks to at most once per this window. */
  private static readonly CHECK_THROTTLE_MS = 15 * 60 * 1000;
  private lastCheck = 0;

  constructor() {
    if (!this.swUpdate.isEnabled) {
      return;
    }

    this.swUpdate.versionUpdates
      .pipe(
        filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.updateReady.set(true));

    // If the SW ends up in an unrecoverable state, a fresh full load is the
    // only safe fix. Surface it as an available update so the user can trigger
    // the reload themselves rather than forcing it under their feet.
    this.swUpdate.unrecoverable
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => {
        console.error('[PWA] Service worker unrecoverable:', event.reason);
        this.updateReady.set(true);
      });

    // Conservative background checks: when the tab becomes visible again
    // (app resume), throttled — not on every route navigation.
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void this.checkForUpdate();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    this.destroyRef.onDestroy(() => document.removeEventListener('visibilitychange', onVisible));
  }

  /** Manually poll for a new version. Throttled and safe to call repeatedly. */
  async checkForUpdate(): Promise<void> {
    if (!this.swUpdate.isEnabled) {
      return;
    }
    const now = Date.now();
    if (now - this.lastCheck < PwaUpdateService.CHECK_THROTTLE_MS) {
      return;
    }
    this.lastCheck = now;
    try {
      await this.swUpdate.checkForUpdate();
    } catch (err) {
      console.error('[PWA] checkForUpdate failed:', err);
    }
  }

  /**
   * Activate the downloaded version and reload into it. User-initiated only.
   * Guarded so a double-tap can't start two reloads. On failure we fall back to
   * a plain reload — the new shell is served fresh because ngsw.json/index.html
   * are never HTTP-cached (see firebase.json).
   */
  async activateUpdate(): Promise<void> {
    if (this.activating()) {
      return;
    }
    this.activating.set(true);
    try {
      if (this.swUpdate.isEnabled) {
        await this.swUpdate.activateUpdate();
      }
      document.location.reload();
    } catch (err) {
      console.error('[PWA] activateUpdate failed, forcing reload:', err);
      document.location.reload();
    }
  }
}
