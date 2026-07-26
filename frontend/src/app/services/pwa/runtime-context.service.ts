import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import {
  STANDALONE_MEDIA_QUERY,
  isInstalledPwa,
  isIosDevice,
  isMobileDevice,
} from '../../shared/runtime/runtime-mode';
import {
  FirebaseAuthPersistenceMode,
  firebaseAuthPersistenceMode,
} from '../../shared/auth/firebase-auth-persistence';

/**
 * The single source of truth for "how is the app running right now": installed
 * PWA vs. regular browser tab, mobile vs. desktop.
 *
 * Every component/service must read these instead of calling `matchMedia` or
 * sniffing the user agent itself. The detection primitives live in
 * `shared/runtime/runtime-mode.ts` because `main.ts` needs them before the
 * Angular injector exists (to pick the Firebase Auth persistence).
 */
@Injectable({ providedIn: 'root' })
export class RuntimeContextService {
  private readonly destroyRef = inject(DestroyRef);

  /**
   * True while the app is displayed as an installed application window.
   * Live: Chromium fires a display-mode change when the same document moves
   * between a tab and an installed window.
   */
  readonly isInstalledPwa = signal<boolean>(isInstalledPwa());

  /** iOS / iPadOS device (independent of installed state). */
  readonly isIosDevice = isIosDevice();

  /** Phone or tablet. UX only — never an auth or security input. */
  readonly isMobileDevice = isMobileDevice();

  /** Mobile device, in a normal browser tab (i.e. not the installed app). */
  readonly isMobileBrowser = computed(() => this.isMobileDevice && !this.isInstalledPwa());

  /** Desktop, in a normal browser tab. */
  readonly isDesktopBrowser = computed(() => !this.isMobileDevice && !this.isInstalledPwa());

  /**
   * The runtime mode as it was at startup, frozen. Firebase Auth persistence
   * was selected from this value and cannot be changed afterwards without
   * moving the stored session between origins-shared stores — which is exactly
   * what we must not do. A later display-mode change therefore updates
   * {@link isInstalledPwa} (UI) but never the persistence.
   */
  readonly authPersistenceMode: FirebaseAuthPersistenceMode | null = firebaseAuthPersistenceMode();

  /** True when this instance holds a persistent (installed-app) auth session. */
  readonly hasPersistentAuthSession = this.authPersistenceMode === 'installed-pwa-local';

  constructor() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mq = window.matchMedia(STANDALONE_MEDIA_QUERY);
    const onChange = () => this.isInstalledPwa.set(isInstalledPwa());
    mq.addEventListener?.('change', onChange);
    this.destroyRef.onDestroy(() => mq.removeEventListener?.('change', onChange));
  }
}
