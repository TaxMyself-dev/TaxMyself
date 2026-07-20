import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { NetworkStatusService } from '../../services/pwa/network-status.service';
import { PwaUpdateService } from '../../services/pwa/pwa-update.service';
import { PwaInstallService } from '../../services/pwa/pwa-install.service';

/**
 * Global PWA status surface: offline notice, "new version" prompt, and a subtle
 * install action / iOS hint. Rendered once in the app shell. Pure PWA
 * infrastructure — it holds no business state and performs no data operations.
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

  /**
   * Dismissal is scoped to the *current* outage. It is cleared on every
   * offline→online transition, so a new outage always surfaces the banner
   * again rather than being silenced forever.
   */
  private readonly offlineDismissed = signal(false);

  readonly isOffline = computed(() => this.network.isOffline() && !this.offlineDismissed());

  /** Brief green confirmation shown when connectivity returns. */
  readonly showReconnected = signal(false);
  private wasOffline = false;
  private reconnectedTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly installDismissed = signal(false);
  private readonly iosHintDismissed = signal(false);

  readonly showInstallChip = computed(
    () => this.install.canInstall() && !this.install.isStandalone() && !this.installDismissed(),
  );
  readonly showIosHint = computed(() => this.install.showIosHint() && !this.iosHintDismissed());

  constructor() {
    // Flash a short "back online" confirmation on the offline→online transition.
    effect(() => {
      const offline = this.network.isOffline();
      if (offline) {
        this.wasOffline = true;
        this.showReconnected.set(false);
      } else if (this.wasOffline) {
        this.wasOffline = false;
        // New outage should be visible again even if the last one was dismissed.
        this.offlineDismissed.set(false);
        this.showReconnected.set(true);
        if (this.reconnectedTimer) {
          clearTimeout(this.reconnectedTimer);
        }
        this.reconnectedTimer = setTimeout(() => this.showReconnected.set(false), 3000);
      }
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
