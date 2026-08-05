import { Injectable, signal } from '@angular/core';

export interface UpgradeContext {
  /** Whether the block originated from a feature check or a route guard. */
  source: 'feature' | 'route';
  /** The AppFeature or AppRoute id string that triggered the block. */
  id: string;
  /** Hebrew user-facing label shown in the upgrade popup title. */
  displayName: string;
}

/**
 * Controls the upgrade/upsell popup.
 *
 * Any part of the application can call open() to show the popup.
 * The UpgradeRequiredDialogComponent reads isOpen and context.
 * The real dialog UI is rendered once at app level; this service is the bridge.
 */
@Injectable({ providedIn: 'root' })
export class UpgradeRequiredService {
  /** True while the upgrade popup should be visible. */
  readonly isOpen = signal(false);

  /** Context about what triggered the popup — for future message customization. */
  readonly context = signal<UpgradeContext | null>(null);

  open(context?: UpgradeContext): void {
    this.context.set(context ?? null);
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
    this.context.set(null);
  }
}
