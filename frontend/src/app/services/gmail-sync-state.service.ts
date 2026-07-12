import { Injectable, computed, inject, signal } from '@angular/core';
import { MessageService } from 'primeng/api';
import { Subscription, interval } from 'rxjs';
import {
  GmailAccountSyncStatus,
  GmailSyncStatus,
  IntegrationsService,
} from './integrations.service';

/** בזמן ייבוא רץ — בדיקת מצב מול השרת כל 5 שניות. */
const POLL_INTERVAL_MS = 5000;

/**
 * מצב סנכרון Gmail ברמת האפליקציה (root): מחזיק את רשימת החשבונות המחוברים,
 * מנהל את ה-polling בזמן שאיזשהו חשבון מייבא, ומציג התראות סיום דרך ה-toast
 * הגלובלי (key 'br' ב-app.component).
 *
 * חי מחוץ לקומפוננטה בכוונה: משתמש שמתחיל ייבוא ועוזב את מסך ההגדרות ימשיך
 * לקבל את התראת הסיום/כישלון בכל מקום באפליקציה. אינדיקציית "רץ" נשארת רק
 * בתוך סקשן ה-Gmail בהגדרות — אין באנר גלובלי.
 */
@Injectable({ providedIn: 'root' })
export class GmailSyncStateService {
  private readonly integrationsService = inject(IntegrationsService);
  private readonly messageService = inject(MessageService);

  readonly status = signal<GmailSyncStatus | null>(null);
  readonly loading = signal(false);

  /** מזהי אינטגרציה שהייבוא הראשוני שלהם מתחיל כרגע (spinner per-account). */
  readonly starting = signal<ReadonlySet<number>>(new Set());

  readonly accounts = computed<GmailAccountSyncStatus[]>(
    () => this.status()?.accounts ?? [],
  );
  /** האם חשבון כלשהו מייבא כרגע (מפעיל polling ואינדיקציית "רץ"). */
  readonly isAnyRunning = computed(() =>
    this.accounts().some((a) => a.lastSyncStatus === 'RUNNING'),
  );

  private pollSubscription: Subscription | null = null;
  /** מצב הסנכרון הקודם לכל חשבון — לזיהוי מעבר RUNNING→סופי (התראה). */
  private previousStatuses = new Map<number, GmailAccountSyncStatus['lastSyncStatus']>();

  isStarting(integrationId: number): boolean {
    return this.starting().has(integrationId);
  }

  /**
   * טעינת מצב עדכני מהשרת. מפעיל/מכבה polling לפי הסטטוסים שחזרו.
   * loading מוצג רק בטעינה הראשונה (כשעדיין אין סטטוס בזיכרון).
   */
  refresh(): void {
    if (this.status() === null) this.loading.set(true);
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

  /** התחלת הייבוא הראשוני לחשבון ספציפי. רץ ברקע; ההתקדמות נמשכת דרך polling. */
  startInitialImport(integrationId: number, fromDate: string, toDate: string): void {
    if (this.isStarting(integrationId)) return;
    this.setStarting(integrationId, true);
    this.integrationsService.startInitialGmailImport(integrationId, fromDate, toDate).subscribe({
      next: () => {
        this.setStarting(integrationId, false);
        this.messageService.add({
          severity: 'info',
          summary: 'הייבוא התחיל',
          detail: 'ייבוא ההודעות מ-Gmail רץ ברקע — נעדכן כשיסתיים',
          life: 5000,
          key: 'br',
        });
        this.refresh(); // יחזור RUNNING ויפעיל את ה-polling
      },
      error: (err) => {
        this.setStarting(integrationId, false);
        const detail =
          err?.status === 409
            ? 'ייבוא כבר בוצע או רץ כרגע עבור חשבון זה'
            : err?.error?.message ?? 'לא ניתן להתחיל את הייבוא. נסה שוב.';
        this.messageService.add({ severity: 'error', summary: 'שגיאה', detail, life: 5000, key: 'br' });
        this.refresh();
      },
    });
  }

  private setStarting(integrationId: number, value: boolean): void {
    const next = new Set(this.starting());
    if (value) next.add(integrationId);
    else next.delete(integrationId);
    this.starting.set(next);
  }

  /** מעדכן סטטוס, מזהה מעברי RUNNING→סופי לכל חשבון ומנהל את ה-polling. */
  private applyStatus(status: GmailSyncStatus): void {
    for (const account of status.accounts) {
      const previous = this.previousStatuses.get(account.id);
      if (previous === 'RUNNING' && account.lastSyncStatus === 'SUCCESS') {
        this.notifyFinished('success', account);
      } else if (previous === 'RUNNING' && account.lastSyncStatus === 'ERROR') {
        this.notifyFinished('error', account);
      }
    }

    this.status.set(status);
    this.previousStatuses = new Map(
      status.accounts.map((a) => [a.id, a.lastSyncStatus]),
    );

    if (status.accounts.some((a) => a.lastSyncStatus === 'RUNNING')) {
      this.startPolling();
    } else {
      this.stopPolling();
    }
  }

  /** התראה גלובלית — מגיעה למשתמש גם אם עזב את מסך ההגדרות. */
  private notifyFinished(kind: 'success' | 'error', account: GmailAccountSyncStatus): void {
    const email = account.accountEmail ?? '';
    if (kind === 'success') {
      this.messageService.add({
        severity: 'success',
        summary: 'הייבוא הושלם',
        detail: `ייבוא ההודעות מ-Gmail הסתיים בהצלחה${email ? ` (${email})` : ''}`,
        life: 5000,
        key: 'br',
      });
    } else {
      this.messageService.add({
        severity: 'error',
        summary: 'הייבוא נכשל',
        detail:
          account.lastSyncError ||
          `הייבוא מ-Gmail נכשל${email ? ` (${email})` : ''}. ניתן לנסות שוב.`,
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
}
