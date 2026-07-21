import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';

/** Minimal typing for the non-standard `beforeinstallprompt` event. */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

/**
 * Owns the browser install experience: captures the deferred
 * `beforeinstallprompt` event (Android/Chromium desktop) and exposes whether an
 * install is offered, plus display-mode / iOS detection for UX decisions.
 * Purely presentational — no business logic, no storage.
 */
@Injectable({ providedIn: 'root' })
export class PwaInstallService {
  private readonly destroyRef = inject(DestroyRef);

  private deferredPrompt: BeforeInstallPromptEvent | null = null;

  /** True when the browser has offered a programmatic install prompt. */
  readonly canInstall = signal<boolean>(false);
  /** True once the app is running as an installed standalone window. */
  readonly isStandalone = signal<boolean>(this.detectStandalone());

  /** iOS Safari has no `beforeinstallprompt`; it needs manual instructions. */
  readonly isIos = this.detectIos();
  /** Show the iOS "Add to Home Screen" hint: iOS, in Safari, not yet installed. */
  readonly showIosHint = computed(() => this.isIos && !this.isStandalone());

  constructor() {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
      return;
    }

    const onBeforeInstallPrompt = (e: Event) => {
      // Stop Chromium's mini-infobar; we surface our own subtle action instead.
      e.preventDefault();
      this.deferredPrompt = e as BeforeInstallPromptEvent;
      this.canInstall.set(true);
    };
    const onInstalled = () => {
      this.deferredPrompt = null;
      this.canInstall.set(false);
      this.isStandalone.set(true);
    };
    const mq = window.matchMedia?.('(display-mode: standalone)');
    const onDisplayModeChange = () => this.isStandalone.set(this.detectStandalone());

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    mq?.addEventListener?.('change', onDisplayModeChange);

    this.destroyRef.onDestroy(() => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      mq?.removeEventListener?.('change', onDisplayModeChange);
    });
  }

  /**
   * Trigger the native install prompt. Returns the user's choice, or `null`
   * when no prompt is available. Clears availability after use so the action
   * disappears once handled.
   */
  async promptInstall(): Promise<'accepted' | 'dismissed' | null> {
    const prompt = this.deferredPrompt;
    if (!prompt) {
      return null;
    }
    try {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      this.deferredPrompt = null;
      this.canInstall.set(false);
      return outcome;
    } catch (err) {
      console.error('[PWA] install prompt failed:', err);
      this.deferredPrompt = null;
      this.canInstall.set(false);
      return null;
    }
  }

  private detectStandalone(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }
    const displayModeStandalone = window.matchMedia?.('(display-mode: standalone)')?.matches ?? false;
    // iOS Safari exposes navigator.standalone instead of the display-mode query.
    const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    return displayModeStandalone || iosStandalone;
  }

  private detectIos(): boolean {
    if (typeof navigator === 'undefined') {
      return false;
    }
    const ua = navigator.userAgent || '';
    const isIosDevice = /iPad|iPhone|iPod/.test(ua);
    // iPadOS 13+ reports as Mac; disambiguate via touch support.
    const isIpadOs = /Macintosh/.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document;
    return isIosDevice || isIpadOs;
  }
}
