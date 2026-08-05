import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import {
  STANDALONE_MEDIA_QUERY,
  isInstalledPwa,
  isIosDevice,
  isMobileDevice,
} from '../../shared/runtime/runtime-mode';

/**
 * The single source of truth for "how is the app running right now": installed
 * PWA vs. regular browser tab, mobile vs. desktop.
 *
 * Consumed for UX decisions only — which PWA banner to offer (install prompt is
 * mobile-browser-only, update prompt is installed-PWA-only) and whether to show
 * the in-app refresh action. Auth is deliberately runtime-independent: every
 * runtime uses the same `browserSessionPersistence`.
 *
 * Every component/service must read these instead of calling `matchMedia` or
 * sniffing the user agent itself; the detection primitives live in
 * `shared/runtime/runtime-mode.ts`.
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
