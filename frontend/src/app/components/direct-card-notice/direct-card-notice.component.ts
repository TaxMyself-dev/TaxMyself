import { Component, DestroyRef, Injectable, effect, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { AuthService } from 'src/app/services/auth.service';
import { CashflowPreferences, TransactionsService } from 'src/app/pages/transactions/transactions.page.service';

@Injectable({ providedIn: 'root' })
export class DirectCardNoticeSession {
  private readonly closed = new Set<string>();
  hasClosed(uid: string, login: string | null): boolean {
    const key = `tm.directCardNotice.${uid}`;
    const value = login ?? 'existing-session';
    try { return this.closed.has(`${key}:${value}`) || localStorage.getItem(key) === value; }
    catch { return this.closed.has(`${key}:${value}`); }
  }
  close(uid: string, login: string | null): void {
    const key = `tm.directCardNotice.${uid}`;
    const value = login ?? 'existing-session';
    this.closed.add(`${key}:${value}`);
    try { localStorage.setItem(key, value); } catch { /* Browser storage may be restricted. */ }
  }
}

@Component({
  selector: 'app-direct-card-notice', standalone: true,
  imports: [DialogModule, ButtonModule],
  template: `
    <p-dialog header="חיובי כרטיס דיירקט" [visible]="visible()" (visibleChange)="!$event && close()"
      [modal]="true" [closable]="!saving()" [closeOnEscape]="!saving()" [dismissableMask]="false"
      [style]="{ width: '36rem', maxWidth: '94vw' }" [draggable]="false" [resizable]="false">
      <div dir="rtl">
        <p>זיהינו שיש לך כרטיס דיירקט.<br> אפשר להחריג מהתזרים את חיובי הבנק המקבילים, כדי למנוע כפילויות של תנועות.</p>
        <p>סווגו את חיובי הדיירקט בבנק לתת־הקטגוריה ״כרטיס דיירקט״ תחת ״בנק, אשראי ותנועות״. סיווג קבוע יחול גם על תנועות תואמות בעתיד.</p>
        <label class="preference">
          <input type="checkbox" [checked]="excluded()" [disabled]="saving()" (change)="savePreference($any($event.target).checked)" />
          החרג מהתזרים חיובי בנק שסווגו ככרטיס דיירקט
        </label>
        <p>אפשר לשנות את ההגדרה בכל עת בהגדרות ← הקטגוריות שלי.</p>
        @if (error()) { <p role="alert">{{ error() }}</p> }
        <div class="actions">
          <button pButton type="button" [disabled]="saving()" (click)="close()">סגור</button>
          <button pButton type="button" [disabled]="saving()" (click)="close()">הזכר לי מאוחר יותר</button>
          <button pButton type="button" [disabled]="saving()" (click)="dismissForever()">אל תציג לי שוב</button>
        </div>
      </div>
    </p-dialog>
  `,
  styles: [`p { line-height: 1.65; } .preference { display: flex; gap: .6rem; align-items: baseline; }
    .actions { display: flex; gap: .5rem; flex-wrap: wrap; margin-top: 1rem; }`],
})
export class DirectCardNoticeComponent {
  // Mounted on routed Angular pages, which do not emit Ionic entry hooks.
  active = input(true);
  blocked = input(false);
  refresh = input(0);
  readonly preferenceSaved = output<void>();
  readonly visible = signal(false);
  readonly excluded = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  private readonly auth = inject(AuthService);
  private readonly api = inject(TransactionsService);
  private readonly session = inject(DirectCardNoticeSession);
  private readonly destroyRef = inject(DestroyRef);
  private uid = '';
  private login: string | null = null;

  constructor() {
    effect(onCleanup => {
      const active = this.active();
      const blocked = this.blocked();
      this.refresh();
      const uid = this.auth.currentUser()?.uid;
      this.visible.set(false);
      this.saving.set(false);
      if (!active || blocked || !uid || this.auth.isViewingAsClient()) return;
      const sub = this.api.getCashflowPreferences().subscribe({
        next: value => {
          if (!this.isOwner(uid)) return;
          this.uid = uid;
          this.login = value.lastLoginAt;
          this.excluded.set(value.excludeDirectCardBankTransactionsFromCashflow);
          this.error.set('');
          this.visible.set(this.shouldShow(uid, value));
        },
        // A background notice must never block the dashboard on a read failure.
        error: () => this.visible.set(false),
      });
      onCleanup(() => sub.unsubscribe());
    });
  }

  private shouldShow(uid: string, value: CashflowPreferences): boolean {
    return value.hasDirectCard === true && !value.excludeDirectCardBankTransactionsFromCashflow &&
      !value.directCardNoticeDismissed && !this.session.hasClosed(uid, value.lastLoginAt);
  }

  close(): void {
    if (this.saving()) return;
    if (this.uid) this.session.close(this.uid, this.login);
    this.visible.set(false);
  }

  savePreference(value: boolean): void {
    if (this.saving() || !this.isOwner()) return;
    const uid = this.uid;
    const previous = this.excluded();
    this.excluded.set(value);
    this.saving.set(true);
    this.error.set('');
    this.api.setCashflowPreferences(value).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: result => {
        if (!this.isOwner(uid)) return;
        this.excluded.set(result.excludeDirectCardBankTransactionsFromCashflow);
        this.saving.set(false);
        this.preferenceSaved.emit();
      },
      error: () => {
        if (!this.isOwner(uid)) return;
        this.excluded.set(previous);
        this.saving.set(false);
        this.error.set('ההגדרה לא נשמרה. נסו שוב.');
      },
    });
  }

  dismissForever(): void {
    if (this.saving() || !this.isOwner()) return;
    const uid = this.uid;
    this.saving.set(true);
    this.error.set('');
    this.api.dismissDirectCardNotice().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        if (!this.isOwner(uid)) return;
        this.saving.set(false);
        this.close();
      },
      error: () => {
        if (!this.isOwner(uid)) return;
        this.saving.set(false);
        this.error.set('לא ניתן לשמור את ביטול התזכורת. נסו שוב.');
      },
    });
  }

  private isOwner(uid = this.uid): boolean {
    return !!uid && this.auth.currentUser()?.uid === uid && !this.auth.isViewingAsClient();
  }
}
