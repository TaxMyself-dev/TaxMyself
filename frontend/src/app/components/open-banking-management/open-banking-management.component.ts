import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { DialogModule } from 'primeng/dialog';
import { finalize } from 'rxjs';
import { AuthService } from 'src/app/services/auth.service';
import { BankingConsent, BankingTargets, FeezbackService } from 'src/app/services/feezback.service';

@Component({
  selector: 'app-open-banking-management', standalone: true,
  imports: [CommonModule, DialogModule],
  templateUrl: './open-banking-management.component.html',
  styleUrls: ['./open-banking-management.component.scss'],
})
export class OpenBankingManagementComponent implements OnInit {
  @Input() firebaseId?: string;
  @Output() connectionChanged = new EventEmitter<void>();
  @Output() busyChange = new EventEmitter<boolean>();
  private readonly service = inject(FeezbackService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly targets = signal<BankingTargets | null>(null);
  readonly error = signal('');
  readonly message = signal('');
  readonly synthetic = signal(false);
  readonly confirmation = signal<'all' | BankingConsent | null>(null);
  ngOnInit(): void { this.load(); }
  canManage(): boolean { return !!this.firebaseId || !this.auth.isViewingAsClient(); }
  consentStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      valid: 'בתוקף', received: 'ממתינה לאישור', partiallyauthorised: 'ממתינה להשלמת אישור',
      suspendedbyaspsp: 'מושהית על ידי הבנק', waitingforinitialfetch: 'ממתינה לקבלת מידע ראשוני',
      initialfetchfailed: 'קבלת המידע הראשוני נכשלה',
    };
    return labels[status.toLowerCase()] ?? 'מצב ההרשאה אינו מזוהה';
  }
  affectedConsents(): BankingConsent[] {
    const selection = this.confirmation();
    return selection === 'all' ? this.targets()?.consents ?? [] : selection ? [selection] : [];
  }
  load(): void {
    if (!this.canManage() || this.busy() || this.loading()) return;
    this.loading.set(true); this.error.set(''); this.synthetic.set(false);
    this.service.disconnectionTargets(this.firebaseId).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: data => this.targets.set(data),
      error: err => {
        this.targets.set(null);
        this.synthetic.set(err?.error?.code === 'SYNTHETIC_OPEN_BANKING');
        this.error.set(err?.error?.code === 'SYNTHETIC_OPEN_BANKING'
          ? 'זהו חיבור הדגמה. ניהול וניתוק הרשאות זמינים לחיבור בנקאות פתוחה אמיתי בלבד.'
          : 'לא ניתן לבדוק את ההרשאות כרגע. אפשר לנסות שוב.');
      },
    });
  }
  confirm(): void {
    const selection = this.confirmation();
    if (!selection || !this.canManage() || this.busy() || this.loading()) return;
    this.busy.set(true); this.busyChange.emit(true); this.error.set(''); this.message.set('');
    this.service.disconnect({ firebaseId: this.firebaseId, scope: selection === 'all' ? 'all' : 'consent',
      ...(selection === 'all' ? {} : { consentId: selection.consentId, connectionRole: selection.connectionRole }),
    }).pipe(finalize(() => { this.busy.set(false); this.busyChange.emit(false); })).subscribe({
      next: result => {
        this.confirmation.set(null);
        this.targets.set({ consents: result.remainingConsents, complete: result.complete, hasOpenBanking: result.hasOpenBanking, errors: result.errors });
        if (result.status === 'partial' || !result.complete ||
          (selection === 'all' && (result.hasOpenBanking || result.remainingConsents.length > 0))) {
          this.error.set('הפעולה לא הושלמה במלואה. חלק מההרשאות עדיין פעילות או שמצבן לא אומת. יש לרענן ולנסות שוב.');
        } else { this.message.set(selection === 'all' ? 'הניתוק מבנקאות פתוחה הושלם.' : 'ההרשאה בוטלה.'); }
        this.connectionChanged.emit();
        if (!this.firebaseId) this.auth.restoreUserData().subscribe();
      },
      error: () => {
        this.confirmation.set(null); this.targets.set(null);
        this.error.set('לא ניתן לאשר שהפעולה הושלמה. יש לרענן את מצב ההרשאות לפני ניסיון נוסף.');
        this.connectionChanged.emit();
      },
    });
  }
  reconnect(): void {
    if (this.canManage() && !this.firebaseId && !this.busy() && !this.synthetic()) this.router.navigate(['/billing/open-banking']);
  }
}
