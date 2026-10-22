import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnInit, SimpleChanges, Output, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { DialogModule } from 'primeng/dialog';
import { finalize } from 'rxjs';
import { AuthService } from 'src/app/services/auth.service';
import { BankingConsent, BankingTargets, FeezbackService } from 'src/app/services/feezback.service';
import { GenericTableComponent } from '../generic-table/generic-table.component';
import { IGenericTableAction } from '../generic-table/table-actions';
import { IColumnDataTable, IMobileCardConfig, IRowDataTable } from 'src/app/shared/interface';

@Component({
  selector: 'app-open-banking-management', standalone: true,
  imports: [CommonModule, DialogModule, GenericTableComponent],
  templateUrl: './open-banking-management.component.html',
  styleUrls: ['./open-banking-management.component.scss'],
})
export class OpenBankingManagementComponent implements OnInit, OnChanges {
  @Input() firebaseId?: string;
  @Input() embedded = false;
  @Input() externalBusy = false;
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
  readonly choices = signal<BankingConsent[] | null>(null);
  readonly rows = computed<IRowDataTable[]>(() => {
    const unique = new Map<string, IRowDataTable>();
    for (const consent of this.targets()?.consents ?? []) {
      if (!consent.sources.length) {
        const key = this.consentKey(consent);
        unique.set(key, { id: key, sourceRecordId: 0, consentKey: key,
          sourceName: 'הרשאה ללא אמצעים מזוהים', sourceTypeLabel: 'הרשאה',
          connectionRoleLabel: consent.connectionRole === 'spouse' ? 'בן/בת הזוג' : 'ראשי',
          consentStatus: this.consentStatusLabel(consent.status) });
      }
      consent.sources.forEach((source, index) => {
        const key = source.sourceRecordId ? String(source.sourceRecordId)
          : `${this.consentKey(consent)}:${source.resourceId ?? index}`;
        if (!unique.has(key)) unique.set(key, {
          id: key, sourceRecordId: source.sourceRecordId ?? 0, consentKey: this.consentKey(consent),
          sourceName: source.sourceName, sourceTypeLabel: this.sourceTypeLabel(source.sourceType),
          connectionRoleLabel: consent.connectionRole === 'spouse' ? 'בן/בת הזוג' : 'ראשי',
          consentStatus: this.consentStatusLabel(consent.status),
        });
      });
    }
    return [...unique.values()];
  });
  readonly columns: IColumnDataTable<string, string>[] = [
    { name: 'consentStatus', value: 'סטטוס' }, { name: 'sourceName', value: 'מספר מזהה' },
    { name: 'connectionRoleLabel', value: 'חיבור' }, { name: 'sourceTypeLabel', value: 'סוג' },
  ];
  readonly mobileConfig: IMobileCardConfig = {
    primaryFields: ['sourceName'], highlightedField: 'consentStatus', dateField: 'sourceTypeLabel',
    hiddenFields: [], highlightedValueFormat: 'plain',
  };
  readonly rowActions: IGenericTableAction[] = [{
    name: 'cancelConsent', icon: 'pi pi-unlink', title: 'ביטול הרשאה', desktopDisplay: 'label',
    showWhen: () => this.canManage() && !this.synthetic(),
    isLoading: () => this.loading() || this.busy() || this.externalBusy,
    action: (_, row) => {
      if (Number(row?.['sourceRecordId']) > 0) this.openSourceConsent(Number(row!['sourceRecordId']));
      else this.openConsentKey(String(row?.['consentKey'] ?? ''));
    },
  }];

  ngOnInit(): void { this.load(); }
  ngOnChanges(changes: SimpleChanges): void {
    const external = changes['externalBusy'];
    if (external?.previousValue === true && external.currentValue === false && !this.targets()) this.load();
  }
  canManage(): boolean { return !!this.firebaseId || !this.auth.isViewingAsClient(); }
  sourceTypeLabel(type: string): string { return type === 'BANK_ACCOUNT' ? 'חשבון בנק' : 'כרטיס'; }
  consentKey(consent: BankingConsent): string { return `${consent.connectionRole}:${consent.consentId}`; }
  consentStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      valid: 'בתוקף', received: 'ממתינה לאישור', partiallyauthorised: 'ממתינה להשלמת אישור',
      suspendedbyaspsp: 'מושהית על ידי הבנק', waitingforinitialfetch: 'ממתינה לקבלת מידע ראשוני',
      initialfetchfailed: 'קבלת המידע הראשוני נכשלה',
    };
    return labels[status.toLowerCase()] ?? 'מצב ההרשאה אינו מזוהה';
  }
  diagnosticMessages(): string[] {
    return [...new Set((this.targets()?.errors ?? []).map(error => {
      const identity = error.connectionRole === 'spouse' ? 'חיבור בן/בת הזוג' : 'החיבור הראשי';
      const operation = error.operation ?? error.code.split('_')[0];
      const subject = operation === 'cards' ? 'הכרטיסים' : operation === 'accounts' ? 'חשבונות הבנק' : 'ההרשאות';
      const cause = error.stage === 'authentication' ? 'האימות מול ספק הבנקאות נכשל'
        : error.stage === 'response' ? 'התקבלה תשובה שאינה תקינה מספק הבנקאות'
        : `לא ניתן היה לבדוק את ${subject}`;
      return `${identity}: ${cause}.`;
    }))];
  }
  affectedConsents(): BankingConsent[] {
    const selection = this.confirmation();
    return selection === 'all' ? this.targets()?.consents ?? [] : selection ? [selection] : [];
  }
  closePreview(): void {
    if (this.busy()) return;
    this.confirmation.set(null); this.choices.set(null);
  }
  load(onLoaded?: () => void): void {
    if (!this.canManage() || this.busy() || this.loading() || this.externalBusy) return;
    this.closePreview(); this.loading.set(true); this.error.set(''); this.message.set(''); this.synthetic.set(false);
    this.service.disconnectionTargets(this.firebaseId).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: data => { this.targets.set(data); onLoaded?.(); },
      error: err => {
        this.targets.set(null);
        this.synthetic.set(err?.error?.code === 'SYNTHETIC_OPEN_BANKING');
        this.error.set(this.synthetic()
          ? 'זהו חיבור הדגמה. ניהול וניתוק הרשאות זמינים לחיבור בנקאות פתוחה אמיתי בלבד.'
          : 'לא ניתן לבדוק את ההרשאות כרגע. אפשר לנסות שוב.');
      },
    });
  }
  openSourceConsent(sourceRecordId: number): void {
    if (!Number.isInteger(sourceRecordId) || sourceRecordId <= 0) return;
    this.load(() => this.previewCandidates((this.targets()?.consents ?? [])
      .filter(consent => consent.sources.some(source => source.sourceRecordId === sourceRecordId))));
  }
  openConsentKey(key: string): void {
    this.load(() => this.previewCandidates((this.targets()?.consents ?? []).filter(consent => this.consentKey(consent) === key)));
  }
  private previewCandidates(consents: BankingConsent[]): void {
    if (consents.length === 1) this.confirmation.set(consents[0]);
    else if (consents.length > 1) this.choices.set(consents);
    else {
      this.error.set('לא נמצאה הרשאה נוכחית לאמצעי הזה. מצב ההרשאות רוענן; אפשר לבדוק את הטבלה מחדש.');
      this.connectionChanged.emit();
    }
  }
  selectConsent(consent: BankingConsent): void {
    if (this.busy() || this.externalBusy || !this.choices()?.some(item => this.consentKey(item) === this.consentKey(consent))) return;
    this.choices.set(null); this.confirmation.set(consent);
  }
  openFullDisconnect(): void { this.load(() => this.confirmation.set('all')); }
  canConfirm(): boolean {
    const state = this.targets(); const selection = this.confirmation();
    return this.canManage() && !this.synthetic() && !this.busy() && !this.loading() && !this.externalBusy && !!state?.complete &&
      !!selection && (selection === 'all' ? state.consents.length > 0
        : state.consents.some(consent => this.consentKey(consent) === this.consentKey(selection)));
  }
  confirm(): void {
    const selection = this.confirmation();
    if (!selection || !this.canConfirm()) return;
    this.busy.set(true); this.busyChange.emit(true); this.error.set(''); this.message.set('');
    this.service.disconnect({ firebaseId: this.firebaseId, scope: selection === 'all' ? 'all' : 'consent',
      ...(selection === 'all' ? {} : { consentId: selection.consentId, connectionRole: selection.connectionRole }),
    }).pipe(finalize(() => { this.busy.set(false); this.busyChange.emit(false); })).subscribe({
      next: result => {
        this.confirmation.set(null); this.choices.set(null);
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
    if (this.canManage() && !this.firebaseId && !this.busy() && !this.loading() && !this.externalBusy && !this.synthetic())
      this.router.navigate(['/billing/open-banking']);
  }
}
