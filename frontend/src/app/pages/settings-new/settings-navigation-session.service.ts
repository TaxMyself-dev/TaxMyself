import { effect, inject, Injectable } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { distinctUntilChanged } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { ClientPanelService } from '../../services/clients-panel.service';
import { SettingsSection } from './settings-navigation';

/** One app instance only: never stores forms, scroll offsets or browser storage. */
@Injectable({providedIn: 'root'})
export class SettingsNavigationSessionService {
  private readonly auth = inject(AuthService);
  private readonly clients = inject(ClientPanelService);
  private ownerId: string | null = null;
  private clientId: string | null = null;
  private section: SettingsSection = 'account';
  private generation = 0;

  constructor() {
    // Observe identity changes even while the settings page is destroyed.
    this.clients.selectedClientId$.pipe(distinctUntilChanged(), takeUntilDestroyed()).subscribe(id => {
      if (this.clientId !== id) { this.section = 'account'; this.generation++; }
      this.clientId = id;
    });
    effect(() => this.syncOwner());
  }
  private syncOwner(): string | null {
    const id = this.auth.currentUser()?.uid ?? null;
    if (id !== this.ownerId) { this.section = 'account'; this.ownerId = id; this.generation++; }
    return id ? JSON.stringify([id, this.clientId, this.generation]) : null;
  }
  open(): {context: string | null; section: SettingsSection} {
    const context = this.syncOwner();
    return {context, section: context ? this.section : 'account'};
  }
  remember(section: SettingsSection, context: string | null): void {
    const current = this.syncOwner();
    // Ignore trailing scroll events from a page belonging to a previous user.
    if (current && context === current) this.section = section;
  }
}
