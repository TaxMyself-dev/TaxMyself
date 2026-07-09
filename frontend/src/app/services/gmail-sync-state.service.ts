import { Injectable, computed, inject, signal } from '@angular/core';
import { MessageService } from 'primeng/api';
import { Subscription, interval } from 'rxjs';
import { GmailSyncStatus, IntegrationsService } from './integrations.service';

/** בזמן ייבוא רץ — בדיקת מצב מול השרת כל 5 שניות. */
const POLL_INTERVAL_MS = 5000;

/**
 * מצב סנכרון Gmail ברמת האפליקציה (root): מחזיק את הסטטוס, מנהל את ה-polling
 * בזמן ייבוא רץ, ומציג התראות סיום דרך ה-toast הגלובלי (key 'br' ב-app.component).
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
  readonly starting = signal(false);
  readonly isRunning = computed(() => this.status()?.lastSyncStatus === 'RUNNING');

  private pollSubscription: Subscription | null = null;

  /**
   * טעינת מצב עדכני מהשרת. מפעיל/מכבה polling לפי הסטטוס שחזר.
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

  /** התחלת הייבוא הראשוני. רץ ברקע בשרת; ההתקדמות נמשכת דרך ה-polling. */
  startInitialImport(fromDate: string, toDate: string): void {
    if (this.starting() || this.isRunning()) return;
    this.starting.set(true);
    this.integrationsService.startInitialGmailImport(fromDate, toDate).subscribe({
      next: () => {
        this.starting.set(false);
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
        this.starting.set(false);
        const detail =
          err?.status === 409
            ? 'ייבוא כבר בוצע או רץ כרגע עבור חשבון זה'
            : err?.error?.message ?? 'לא ניתן להתחיל את הייבוא. נסה שוב.';
        this.messageService.add({ severity: 'error', summary: 'שגיאה', detail, life: 5000, key: 'br' });
        this.refresh();
      },
    });
  }

  /** מעדכן סטטוס, מזהה מעבר RUNNING→סופי (התראה גלובלית) ומנהל את ה-polling. */
  private applyStatus(status: GmailSyncStatus): void {
    const wasRunning = this.isRunning();
    this.status.set(status);

    if (status.lastSyncStatus === 'RUNNING') {
      this.startPolling();
      return;
    }
    this.stopPolling();

    // ההתראות מוצגות ב-toast הגלובלי — מגיעות למשתמש גם אם עזב את ההגדרות.
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
}
