import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { Subscription, interval } from 'rxjs';
import { ButtonComponent } from 'src/app/components/button/button.component';
import { ButtonColor, ButtonSize } from 'src/app/components/button/button.enum';
import { InputDateComponent } from 'src/app/components/input-date/input-date.component';
import { GenericService } from 'src/app/services/generic.service';
import { GmailSyncStatus, IntegrationsService } from 'src/app/services/integrations.service';
import { inputsSize } from 'src/app/shared/enums';

/** בזמן ייבוא רץ — בדיקת מצב מול השרת כל 5 שניות. */
const POLL_INTERVAL_MS = 5000;

/**
 * חיבור Gmail לקליטת מסמכים (טאב "ניהול הרשאות וחשבונות" בהגדרות).
 *
 * מצבים: לא מחובר → חיבור OAuth; מחובר ללא ייבוא ראשוני → בחירת טווח תאריכים
 * והתחלת ייבוא; ייבוא רץ → polling על sync-status; הושלם → סנכרון לילי אוטומטי.
 * גבולות התאריכים (minFromDate/maxToDate) מגיעים מהשרת בלבד — הפרונט לא מחשב אותם.
 */
@Component({
  selector: 'app-gmail-integration',
  templateUrl: './gmail-integration.component.html',
  styleUrls: ['./gmail-integration.component.scss'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ButtonComponent, InputDateComponent],
})
export class GmailIntegrationComponent implements OnInit, OnDestroy {
  private readonly integrationsService = inject(IntegrationsService);
  private readonly messageService = inject(MessageService);
  private readonly genericService = inject(GenericService);
  private readonly fb = inject(FormBuilder);

  readonly buttonSize = ButtonSize;
  readonly buttonColor = ButtonColor;
  readonly inputsSize = inputsSize;
  readonly isMobile = computed(() => this.genericService.isMobile());

  readonly status = signal<GmailSyncStatus | null>(null);
  readonly loading = signal(true);
  readonly connecting = signal(false);
  readonly starting = signal(false);

  private pollSubscription: Subscription | null = null;

  readonly importFormGroup = this.fb.group({
    fromDate: this.fb.control<Date | null>(null, Validators.required),
    toDate: this.fb.control<Date | null>(null, Validators.required),
  });

  /** Selected fromDate as a signal, so the toDate picker's minimum follows it. */
  private readonly selectedFromDate = toSignal(
    this.importFormGroup.controls.fromDate.valueChanges,
    { initialValue: null as Date | null },
  );

  readonly isRunning = computed(() => this.status()?.lastSyncStatus === 'RUNNING');
  readonly minFromDate = computed(() => this.isoToLocalDate(this.status()?.minFromDate));
  readonly maxToDate = computed(() => this.isoToLocalDate(this.status()?.maxToDate));
  readonly minToDate = computed(() => this.selectedFromDate() ?? this.minFromDate());

  ngOnInit(): void {
    this.fetchStatus();
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  fetchStatus(): void {
    this.integrationsService.getGmailSyncStatus().subscribe({
      next: (status) => {
        this.applyStatus(status);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'שגיאה',
          detail: 'לא ניתן לטעון את מצב חיבור ה-Gmail',
          life: 4000,
          key: 'br',
        });
      },
    });
  }

  /** מפנה למסך ההסכמה של Google (ה-flow הקיים; החזרה נוחתת בדף הבית). */
  connectGmail(): void {
    if (this.connecting()) return;
    this.connecting.set(true);
    this.integrationsService.getGoogleConnectUrl().subscribe({
      next: ({ url }) => {
        window.location.href = url;
      },
      error: () => {
        this.connecting.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'שגיאה',
          detail: 'לא ניתן להתחיל את חיבור חשבון Google. נסה שוב.',
          life: 4000,
          key: 'br',
        });
      },
    });
  }

  startImport(): void {
    if (this.starting() || this.isRunning()) return;
    this.importFormGroup.markAllAsTouched();
    const { fromDate, toDate } = this.importFormGroup.getRawValue();
    if (this.importFormGroup.invalid || !fromDate || !toDate) return;
    if (fromDate.getTime() > toDate.getTime()) {
      this.messageService.add({
        severity: 'warn',
        summary: 'טווח לא תקין',
        detail: 'תאריך ההתחלה חייב להיות לפני תאריך הסיום',
        life: 4000,
        key: 'br',
      });
      return;
    }

    this.starting.set(true);
    this.integrationsService
      .startInitialGmailImport(this.dateToApiString(fromDate), this.dateToApiString(toDate))
      .subscribe({
        next: () => {
          this.starting.set(false);
          this.messageService.add({
            severity: 'info',
            summary: 'הייבוא התחיל',
            detail: 'ייבוא ההודעות מ-Gmail רץ ברקע — נעדכן כאן כשיסתיים',
            life: 5000,
            key: 'br',
          });
          this.fetchStatus(); // יחזור RUNNING ויפעיל את ה-polling
        },
        error: (err) => {
          this.starting.set(false);
          const detail =
            err?.status === 409
              ? 'ייבוא כבר בוצע או רץ כרגע עבור חשבון זה'
              : err?.error?.message ?? 'לא ניתן להתחיל את הייבוא. נסה שוב.';
          this.messageService.add({ severity: 'error', summary: 'שגיאה', detail, life: 5000, key: 'br' });
          this.fetchStatus();
        },
      });
  }

  /** Applies a fresh status and starts/stops polling to match RUNNING state. */
  private applyStatus(status: GmailSyncStatus): void {
    const wasRunning = this.isRunning();
    this.status.set(status);

    if (status.lastSyncStatus === 'RUNNING') {
      this.startPolling();
      return;
    }
    this.stopPolling();

    // מעבר RUNNING → סופי בזמן שהמסך פתוח: עדכון למשתמש על התוצאה.
    if (wasRunning && status.lastSyncStatus === 'SUCCESS') {
      this.messageService.add({
        severity: 'success',
        summary: 'הייבוא הושלם',
        detail: 'ייבוא ההודעות מ-Gmail הסתיים בהצלחה',
        life: 5000,
        key: 'br',
      });
    } else if (wasRunning && status.lastSyncStatus === 'ERROR') {
      this.messageService.add({
        severity: 'error',
        summary: 'הייבוא נכשל',
        detail: status.lastSyncError || 'הייבוא מ-Gmail נכשל. ניתן לנסות שוב.',
        life: 6000,
        key: 'br',
      });
    }
  }

  private startPolling(): void {
    if (this.pollSubscription) return;
    this.pollSubscription = interval(POLL_INTERVAL_MS).subscribe(() => {
      this.integrationsService.getGmailSyncStatus().subscribe({
        next: (status) => this.applyStatus(status),
        // כשל נקודתי ב-polling אינו קריטי — הניסיון הבא ירוץ בעוד 5 שניות.
        error: () => {},
      });
    });
  }

  private stopPolling(): void {
    this.pollSubscription?.unsubscribe();
    this.pollSubscription = null;
  }

  /** Date → YYYY-MM-DD בחלקים מקומיים (בלי הסטת UTC), כמו dateToApiString בהגדרות. */
  private dateToApiString(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /** YYYY-MM-DD → Date בחצות מקומית (בלי הסטת UTC), עבור minDate/maxDate של הפיקר. */
  private isoToLocalDate(isoDate: string | undefined): Date | null {
    if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
    const [y, m, d] = isoDate.split('-');
    const date = new Date(+y, +m - 1, +d);
    return isNaN(date.getTime()) ? null : date;
  }
}
