import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonComponent } from 'src/app/components/button/button.component';
import { ButtonColor, ButtonSize } from 'src/app/components/button/button.enum';
import { InputDateComponent } from 'src/app/components/input-date/input-date.component';
import { GenericService } from 'src/app/services/generic.service';
import { GmailSyncStateService } from 'src/app/services/gmail-sync-state.service';
import {
  GmailAccountSyncStatus,
  IntegrationsService,
} from 'src/app/services/integrations.service';
import { inputsSize } from 'src/app/shared/enums';

/**
 * חיבור Gmail לקליטת מסמכים (טאב "ניהול הרשאות וחשבונות" בהגדרות).
 *
 * תומך בכמה חשבונות Gmail למשתמש: מציג רשימת חשבונות מחוברים, לכל אחד מצב
 * הסנכרון, טופס טווח לייבוא הראשוני וכפתור ניתוק משלו. המצב, ה-polling
 * והתראות הסיום חיים ב-GmailSyncStateService (root) כדי שימשיכו לפעול גם אחרי
 * ניווט למסך אחר. גבולות התאריכים (minFromDate/maxToDate) מגיעים מהשרת בלבד.
 */
@Component({
  selector: 'app-gmail-integration',
  templateUrl: './gmail-integration.component.html',
  styleUrls: ['./gmail-integration.component.scss'],
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, ButtonComponent, InputDateComponent],
})
export class GmailIntegrationComponent implements OnInit {
  readonly syncState = inject(GmailSyncStateService);
  private readonly integrationsService = inject(IntegrationsService);
  private readonly messageService = inject(MessageService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly genericService = inject(GenericService);
  private readonly fb = inject(FormBuilder);

  readonly buttonSize = ButtonSize;
  readonly buttonColor = ButtonColor;
  readonly inputsSize = inputsSize;
  readonly isMobile = computed(() => this.genericService.isMobile());

  readonly connecting = signal(false);
  readonly importingAll = signal(false);
  /** מזהי אינטגרציה שמתנתקים כרגע (spinner per-account). */
  readonly disconnecting = signal<ReadonlySet<number>>(new Set());

  /** טופס טווח תאריכים לכל חשבון (נבנה לפי דרישה, נשמר בין רינדורים). */
  private readonly importForms = new Map<number, FormGroup>();

  readonly minFromDate = computed(() => this.isoToLocalDate(this.syncState.status()?.minFromDate));
  readonly maxToDate = computed(() => this.isoToLocalDate(this.syncState.status()?.maxToDate));

  ngOnInit(): void {
    // רענון בכל כניסה למסך; אם ייבוא רץ — השירות ממשיך/מחדש את ה-polling.
    this.syncState.refresh();
  }

  isDisconnecting(integrationId: number): boolean {
    return this.disconnecting().has(integrationId);
  }

  /** טופס טווח התאריכים של חשבון מסוים (נוצר בפעם הראשונה שהוא נדרש). */
  importFormFor(integrationId: number): FormGroup {
    let form = this.importForms.get(integrationId);
    if (!form) {
      form = this.fb.group({
        fromDate: this.fb.control<Date | null>(null, Validators.required),
        toDate: this.fb.control<Date | null>(null, Validators.required),
      });
      this.importForms.set(integrationId, form);
    }
    return form;
  }

  /** התאריך המינימלי המותר ל-"עד תאריך" — לא לפני ה-fromDate שנבחר. */
  minToDateFor(integrationId: number): Date | null {
    const from = this.importFormFor(integrationId).controls['fromDate'].value as Date | null;
    return from ?? this.minFromDate();
  }

  /** מפנה למסך ההסכמה של Google לחיבור חשבון (נוסף); החזרה נוחתת בהגדרות. */
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

  /** ייבוא מכל החשבונות המחוברים בבת אחת (כפתור גלובלי). */
  importAll(): void {
    if (this.importingAll()) return;
    this.importingAll.set(true);
    this.integrationsService.importAllGmail().subscribe({
      next: (result) => {
        this.importingAll.set(false);
        const failed = result.perAccount.filter((a) => a.error).length;
        this.messageService.add({
          severity: failed > 0 ? 'warn' : 'success',
          summary: 'ייבוא הושלם',
          detail:
            `יובאו ${result.totalImported} מסמכים חדשים` +
            (failed > 0 ? ` (${failed} חשבונות נכשלו)` : ''),
          life: 5000,
          key: 'br',
        });
        this.syncState.refresh();
      },
      error: (err) => {
        this.importingAll.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'שגיאה',
          detail: err?.error?.message ?? 'לא ניתן היה לייבא מהחשבונות. נסה שוב.',
          life: 5000,
          key: 'br',
        });
      },
    });
  }

  startImport(account: GmailAccountSyncStatus): void {
    if (this.syncState.isStarting(account.id) || account.lastSyncStatus === 'RUNNING') return;
    const form = this.importFormFor(account.id);
    form.markAllAsTouched();
    const { fromDate, toDate } = form.getRawValue() as { fromDate: Date | null; toDate: Date | null };
    if (form.invalid || !fromDate || !toDate) return;
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

    this.syncState.startInitialImport(
      account.id,
      this.dateToApiString(fromDate),
      this.dateToApiString(toDate),
    );
  }

  /** מבקש אישור ואז מנתק את הרשאת הגישה לחשבון Gmail ספציפי. */
  confirmDisconnectGmail(account: GmailAccountSyncStatus): void {
    if (this.isDisconnecting(account.id)) return;
    this.confirmationService.confirm({
      header: 'ניתוק הרשאת Gmail',
      message: `האם לנתק את חשבון ${account.accountEmail ?? 'ה-Gmail'}? לאחר הניתוק לא נוכל למשוך מסמכים חדשים ממנו.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'נתק הרשאה',
      rejectLabel: 'ביטול',
      accept: () => this.disconnectGmail(account.id),
    });
  }

  private disconnectGmail(integrationId: number): void {
    this.setDisconnecting(integrationId, true);
    this.integrationsService.disconnectGoogleIntegration(integrationId).subscribe({
      next: () => {
        this.setDisconnecting(integrationId, false);
        this.syncState.refresh();
        this.messageService.add({
          severity: 'success',
          summary: 'הצלחה',
          detail: 'הרשאת Gmail נותקה בהצלחה',
          life: 4000,
          key: 'br',
        });
      },
      error: () => {
        this.setDisconnecting(integrationId, false);
        this.messageService.add({
          severity: 'error',
          summary: 'שגיאה',
          detail: 'לא הצלחנו לנתק את הרשאת Gmail. נסה שוב.',
          life: 4000,
          key: 'br',
        });
      },
    });
  }

  private setDisconnecting(integrationId: number, value: boolean): void {
    const next = new Set(this.disconnecting());
    if (value) next.add(integrationId);
    else next.delete(integrationId);
    this.disconnecting.set(next);
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
