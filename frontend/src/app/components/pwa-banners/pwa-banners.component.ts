import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ConnectivityState, NetworkStatusService } from '../../services/pwa/network-status.service';
import { PwaUpdateService } from '../../services/pwa/pwa-update.service';
import { PwaInstallService } from '../../services/pwa/pwa-install.service';

/**
 * Global PWA status surface: connectivity notice, "new version" prompt, and a
 * subtle install action / iOS hint. Rendered once in the app shell. Pure PWA
 * infrastructure — it holds no business state, performs no data operations, and
 * never classifies connectivity itself: it derives entirely from
 * {@link NetworkStatusService}.
 */
@Component({
  selector: 'app-pwa-banners',
  standalone: true,
  templateUrl: './pwa-banners.component.html',
  styleUrls: ['./pwa-banners.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PwaBannersComponent {
  private readonly network = inject(NetworkStatusService);
  private readonly update = inject(PwaUpdateService);
  private readonly install = inject(PwaInstallService);

  readonly updateReady = this.update.updateReady;
  readonly activating = this.update.activating;

  /** Current connectivity classification (single source of truth). */
  private readonly state = this.network.state;

  /**
   * Dismissal is scoped to the *current* outage occurrence. It is cleared on
   * recovery and whenever the failure kind changes (OFFLINE ↔ SERVER_UNREACHABLE),
   * so a new or different outage always surfaces the banner again rather than
   * being silenced forever.
   */
  private readonly offlineDismissed = signal(false);

  /** True while a connectivity-failure banner should be shown. */
  readonly showConnectivityBanner = computed(
    () => this.network.isConnectivityFailure() && !this.offlineDismissed(),
  );

  /** Localized message for the current connectivity failure. */
  readonly connectivityMessage = computed(() => {
    switch (this.state()) {
      case ConnectivityState.OFFLINE:
        return 'אין חיבור לאינטרנט';
      case ConnectivityState.SERVER_UNREACHABLE:
        return 'לא ניתן להתחבר לשרת כרגע';
      default:
        return '';
    }
  });

  /** Brief green confirmation shown when connectivity returns. */
  readonly showReconnected = signal(false);
  private wasFailing = false;
  private lastFailureState: ConnectivityState | null = null;
  private reconnectedTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * First connectivity observation is established silently. Starting offline
   * may show the offline banner, but must never flash "connection restored".
   * That banner is reserved for a real failure → ONLINE transition later in
   * the same running session.
   */
  private connectivitySeeded = false;

  private readonly installDismissed = signal(false);
  private readonly iosHintDismissed = signal(false);

  readonly showInstallChip = computed(
    () => this.install.canInstall() && !this.install.isStandalone() && !this.installDismissed(),
  );
  readonly showIosHint = computed(() => this.install.showIosHint() && !this.iosHintDismissed());

  constructor() {
    effect(() => {
      const state = this.state();
      const failing =
        state === ConnectivityState.OFFLINE || state === ConnectivityState.SERVER_UNREACHABLE;

      if (!this.connectivitySeeded) {
        this.connectivitySeeded = true;
        if (failing) {
          this.wasFailing = true;
          this.lastFailureState = state;
        }
        // Silent seed — never showReconnected on first observation.
        return;
      }

      if (failing) {
        // A different kind of outage is a new occurrence — make it visible even
        // if the previous one was dismissed.
        if (state !== this.lastFailureState) {
          this.offlineDismissed.set(false);
        }
        this.lastFailureState = state;
        this.wasFailing = true;
        this.showReconnected.set(false);
      } else if (state === ConnectivityState.ONLINE && this.wasFailing) {
        // Recovery confirmed by a real reachable backend after a session outage.
        this.wasFailing = false;
        this.lastFailureState = null;
        this.offlineDismissed.set(false);
        this.showReconnected.set(true);
        if (this.reconnectedTimer) {
          clearTimeout(this.reconnectedTimer);
        }
        this.reconnectedTimer = setTimeout(() => this.showReconnected.set(false), 3000);
      }
      // CHECKING is intentionally ignored here: no banner change while probing.
    });
  }

  onUpdate(): void {
    void this.update.activateUpdate();
  }

  dismissOffline(): void {
    this.offlineDismissed.set(true);
  }

  async onInstall(): Promise<void> {
    const outcome = await this.install.promptInstall();
    if (outcome !== null) {
      this.installDismissed.set(true);
    }
  }

  dismissInstall(): void {
    this.installDismissed.set(true);
  }

  dismissIosHint(): void {
    this.iosHintDismissed.set(true);
  }
}
