import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { catchError, EMPTY, finalize } from 'rxjs';
import { ButtonComponent } from 'src/app/components/button/button.component';
import { ButtonColor, ButtonSize } from 'src/app/components/button/button.enum';
import { AuthService } from 'src/app/services/auth.service';
import { ClientPanelService } from 'src/app/services/clients-panel.service';
import {
  AdminPanelService,
  DemoProfileListItem,
  DemoResetResult,
  DemoSeedResult,
  DemoSubUser,
} from 'src/app/services/admin-panel.service';

@Component({
  selector: 'app-demo-data',
  templateUrl: './demo-data.component.html',
  styleUrls: ['./demo-data.component.scss'],
  standalone: true,
  imports: [CommonModule, ButtonComponent],
})
export class DemoDataComponent implements OnInit {
  private readonly adminPanelService = inject(AdminPanelService);
  private readonly messageService = inject(MessageService);
  private readonly clientPanelService = inject(ClientPanelService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly buttonSize = ButtonSize;
  readonly buttonColor = ButtonColor;

  readonly profiles = signal<DemoProfileListItem[]>([]);
  readonly loading = signal<boolean>(false);
  /** id of the profile currently mid-request, if any. */
  readonly busyProfileId = signal<string | null>(null);

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    this.loading.set(true);
    this.adminPanelService
      .listDemoProfiles()
      .pipe(
        finalize(() => this.loading.set(false)),
        catchError((err) => {
          this.toastError(err, 'טעינת הפרופילים נכשלה');
          return EMPTY;
        }),
      )
      .subscribe((rows) => this.profiles.set(rows));
  }

  isBusy(id: string): boolean {
    return this.busyProfileId() === id;
  }

  // ---------- Set ----------

  onSeed(profile: DemoProfileListItem): void {
    if (this.busyProfileId()) return;
    this.busyProfileId.set(profile.id);
    this.adminPanelService
      .seedDemoProfile(profile.id)
      .pipe(
        finalize(() => this.busyProfileId.set(null)),
        catchError((err) => {
          this.toastError(err, 'יצירת המשתמש נכשלה');
          return EMPTY;
        }),
      )
      .subscribe((result) => this.onSeedSuccess(profile, result));
  }

  // ---------- Reset ----------

  onReset(profile: DemoProfileListItem): void {
    if (this.busyProfileId()) return;
    // Native confirm — simple, reliable, no DI scoping concerns with PrimeNG.
    const ok = window.confirm(
      `האם למחוק את המשתמש "${profile.label}" יחד עם כל הנתונים שלו?\n` +
        'הפעולה לא ניתנת לביטול.',
    );
    if (!ok) return;

    this.busyProfileId.set(profile.id);
    this.adminPanelService
      .resetDemoProfile(profile.id)
      .pipe(
        finalize(() => this.busyProfileId.set(null)),
        catchError((err) => {
          this.toastError(err, 'איפוס המשתמש נכשל');
          return EMPTY;
        }),
      )
      .subscribe((result) => this.onResetSuccess(profile, result));
  }

  // ---------- Enter as demo user (primary or any delegated client) ----------
  //
  // Admin stays signed-in to Firebase. We use clientPanelService.setSelectedClient
  // so the auth interceptor adds `x-client-user-id` to every backend call —
  // backend returns the demo user's data. Same mechanism accountants use to
  // act on behalf of their clients. The banner in app.component.html shows the
  // "exit" button to return to the admin view.

  onEnterAsPrimary(profile: DemoProfileListItem): void {
    if (!profile.exists) return;
    if (!profile.firebaseId) {
      this.toastError(new Error('No firebaseId on profile'), 'משתמש דמו ללא firebaseId — נסה ליצור מחדש');
      return;
    }
    this.enterAsUser(profile.firebaseId, profile.label);
  }

  onEnterAsClient(profile: DemoProfileListItem, client: DemoSubUser): void {
    if (!profile.exists) return;
    if (!client.firebaseId) {
      this.toastError(new Error('No firebaseId on client'), 'לקוח דמו ללא firebaseId — נסה ליצור מחדש');
      return;
    }
    this.enterAsUser(client.firebaseId, client.label);
  }

  private enterAsUser(firebaseId: string, label: string): void {
    this.clientPanelService.setSelectedClient(firebaseId, label);
    // Await the view-as user data fetch BEFORE navigating, otherwise pages like
    // /my-account read userData in their ngOnInit before AuthService's
    // viewAsUserData is populated — and they'd render with the admin's name.
    this.authService.loadViewAsUserData().subscribe(() => {
      this.router.navigate(['/my-account']);
    });
  }

  // ---------- Result handlers ----------

  private onSeedSuccess(profile: DemoProfileListItem, result: DemoSeedResult): void {
    this.refresh();
    this.messageService.add({
      severity: 'success',
      summary: 'משתמש דמו נוצר',
      detail: `${result.email} / ${result.password}`,
      life: 8000,
      key: 'br',
    });
  }

  private onResetSuccess(
    profile: DemoProfileListItem,
    result: DemoResetResult,
  ): void {
    this.refresh();
    const totalRows = Object.values(result.deletedRows ?? {}).reduce(
      (a, b) => a + b,
      0,
    );
    const detail = result.existed
      ? `${totalRows} שורות נמחקו`
      : 'לא נמצא משתמש דמו - לא היה מה לאפס';
    this.messageService.add({
      severity: 'success',
      summary: 'משתמש דמו נמחק',
      detail,
      life: 5000,
      key: 'br',
    });
  }

  private toastError(err: any, fallback: string): void {
    const detail = err?.error?.message ?? err?.message ?? fallback;
    this.messageService.add({
      severity: err?.status === 409 ? 'warn' : 'error',
      summary: err?.status === 409 ? 'אזהרה' : 'שגיאה',
      detail,
      life: 5000,
      key: 'br',
    });
  }
}
