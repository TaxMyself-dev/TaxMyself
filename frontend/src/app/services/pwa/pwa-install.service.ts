import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { RuntimeContextService } from './runtime-context.service';

/** Minimal typing for the non-standard `beforeinstallprompt` event. */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

/**
 * Owns the browser install experience: captures the deferred
 * `beforeinstallprompt` event (Android/Chromium desktop) and exposes whether an
 * install is offered. Purely presentational — no business logic, no storage.
 *
 * Runtime detection (installed / iOS / mobile) is NOT done here: it belongs to
 * {@link RuntimeContextService}, which this service reads.
 */
@Injectable({ providedIn: 'root' })
export class PwaInstallService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly runtime = inject(RuntimeContextService);

  private deferredPrompt: BeforeInstallPromptEvent | null = null;

  /** True when the browser has offered a programmatic install prompt. */
  readonly canInstall = signal<boolean>(false);

  /** iOS Safari has no `beforeinstallprompt`; it needs manual instructions. */
  readonly isIos = this.runtime.isIosDevice;

  /**
   * Show the iOS "Add to Home Screen" hint: an iOS device, in a real browser
   * tab (never inside the installed app), and never on desktop.
   */
  readonly showIosHint = computed(() => this.isIos && this.runtime.isMobileBrowser());

  /**
   * Our own install prompt may be offered only in a normal mobile browser, when
   * the browser actually has an install event to fire. Desktop is deliberately
   * excluded — Chrome's own address-bar install icon is left alone, we simply
   * never render our UI there.
   */
  readonly canOfferInstall = computed(() => this.canInstall() && this.runtime.isMobileBrowser());

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
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);

    this.destroyRef.onDestroy(() => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
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
}
