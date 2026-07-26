/**
 * Framework-free runtime-mode detection — the single place that decides
 * "installed PWA vs. regular browser tab" and "mobile vs. desktop".
 *
 * Deliberately outside Angular DI: Firebase Auth persistence has to be chosen
 * in `main.ts`, before the injector exists (see `firebase-auth-persistence.ts`).
 * {@link RuntimeContextService} wraps these same functions as signals for
 * components and services, so the detection logic itself exists only here and
 * is never duplicated per component.
 */

/**
 * True when the document is being displayed as an installed application window
 * rather than inside a browser tab.
 *
 * Two signals, because no single one covers every platform:
 *  - `(display-mode: standalone)` — Chromium/Android/desktop installs, and the
 *    manifest declares `"display": "standalone"`.
 *  - `navigator.standalone` — iOS Safari "Add to Home Screen", which does not
 *    implement the display-mode media query.
 */
export function isInstalledPwa(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const displayModeStandalone = window.matchMedia?.('(display-mode: standalone)')?.matches ?? false;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return displayModeStandalone || iosStandalone;
}

/** iOS / iPadOS device (Safari has no `beforeinstallprompt`; it needs a manual hint). */
export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }
  const ua = navigator.userAgent || '';
  const isIosUa = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ reports as Macintosh; disambiguate via touch support.
  const isIpadOs = /Macintosh/.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document;
  return isIosUa || isIpadOs;
}

/**
 * True on phones/tablets. Used only for UX decisions (we never offer our own
 * install prompt on desktop) — never for auth or security decisions.
 */
export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }
  const ua = navigator.userAgent || '';
  return isIosDevice() || /Android|webOS|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua);
}

/** Media query used for live display-mode changes; exported so callers don't re-type it. */
export const STANDALONE_MEDIA_QUERY = '(display-mode: standalone)';
