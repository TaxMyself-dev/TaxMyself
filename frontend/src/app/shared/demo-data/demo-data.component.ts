import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { MessageService } from 'primeng/api';
import { catchError, EMPTY, finalize, firstValueFrom, from, of, switchMap, tap } from 'rxjs';
import { ButtonComponent } from 'src/app/components/button/button.component';
import { ButtonColor, ButtonSize } from 'src/app/components/button/button.enum';
import { AuthService } from 'src/app/services/auth.service';
import { GenericService } from 'src/app/services/generic.service';
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
  private readonly afAuth = inject(AngularFireAuth);
  private readonly authService = inject(AuthService);
  private readonly genericService = inject(GenericService);
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

  onEnterAsPrimary(profile: DemoProfileListItem): void {
    if (!profile.exists) return;
    this.runImpersonation(profile.id, profile.email, profile.password);
  }

  onEnterAsClient(profile: DemoProfileListItem, client: DemoSubUser): void {
    if (!profile.exists) return;
    this.runImpersonation(profile.id, client.email, client.password);
  }

  private runImpersonation(profileId: string, email: string, password: string): void {
    if (this.busyProfileId()) return;
    this.busyProfileId.set(profileId);

    // Mirror the login.page.ts flow: sign out current session, sign in with the
    // target creds, fetch userData from backend, save to localStorage, load
    // businesses, then navigate to /my-account.
    from(this.afAuth.signOut())
      .pipe(
        switchMap(() =>
          from(this.afAuth.signInWithEmailAndPassword(email, password)),
        ),
        switchMap(() => this.authService.signIn()),
        tap((res: any) => {
          sessionStorage.setItem('isLoggedIn', 'true');
          localStorage.setItem('userData', JSON.stringify(res));
        }),
        switchMap(() => from(this.genericService.loadBusinessesFromServer())),
        tap(() => this.router.navigate(['my-account'])),
        catchError((err) => {
          this.toastError(err, 'כניסה כמשתמש דמו נכשלה');
          return EMPTY;
        }),
        finalize(() => this.busyProfileId.set(null)),
      )
      .subscribe();
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
