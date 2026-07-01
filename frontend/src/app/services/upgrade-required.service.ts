import { Injectable, signal } from '@angular/core';

/**
 * Placeholder for the upgrade/upsell popup.
 *
 * This service holds the open/closed signal. The actual popup UI reads isOpen
 * and will be implemented in a later step. Access flow already routes through here,
 * so wiring the real dialog later requires only a change to this service.
 */
@Injectable({ providedIn: 'root' })
export class UpgradeRequiredService {
  /** True while the upgrade popup should be visible. */
  readonly isOpen = signal(false);

  open(): void {
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
  }
}
