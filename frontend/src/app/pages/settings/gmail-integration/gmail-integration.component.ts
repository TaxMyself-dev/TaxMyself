import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonComponent } from 'src/app/components/button/button.component';
import { ButtonColor, ButtonSize } from 'src/app/components/button/button.enum';
import { InputDateComponent } from 'src/app/components/input-date/input-date.component';
import { GenericService } from 'src/app/services/generic.service';
import { GmailSyncStateService } from 'src/app/services/gmail-sync-state.service';
import { IntegrationsService } from 'src/app/services/integrations.service';
import { inputsSize } from 'src/app/shared/enums';

/**
 * חיבור Gmail לקליטת מסמכים (טאב "ניהול הרשאות וחשבונות" בהגדרות).
 *
 * קומפוננטת תצוגה בלבד: המצב, ה-polling והתראות הסיום חיים ב-
 * GmailSyncStateService (root) כדי שימשיכו לפעול גם אחרי ניווט למסך אחר.
 * כאן נשארים רק טופס טווח התאריכים והפניית ה-OAuth.
 * גבולות התאריכים (minFromDate/maxToDate) מגיעים מהשרת בלבד.
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
  readonly disconnecting = signal(false);

  readonly importFormGroup = this.fb.group({
    fromDate: this.fb.control<Date | null>(null, Validators.required),
    toDate: this.fb.control<Date | null>(null, Validators.required),
  });

  /** Selected fromDate as a signal, so the toDate picker's minimum follows it. */
  private readonly selectedFromDate = toSignal(
    this.importFormGroup.controls.fromDate.valueChanges,
    { initialValue: null as Date | null },
  );

  readonly minFromDate = computed(() => this.isoToLocalDate(this.syncState.status()?.minFromDate));
  readonly maxToDate = computed(() => this.isoToLocalDate(this.syncState.status()?.maxToDate));
  readonly minToDate = computed(() => this.selectedFromDate() ?? this.minFromDate());

  ngOnInit(): void {
    // רענון בכל כניסה למסך; אם ייבוא רץ — השירות ממשיך/מחדש את ה-polling.
    this.syncState.refresh();
  }

  /** מפנה למסך ההסכמה של Google; החזרה נוחתת ב-/settings?tab=permissions. */
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
    if (this.syncState.starting() || this.syncState.isRunning()) return;
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

    this.syncState.startInitialImport(this.dateToApiString(fromDate), this.dateToApiString(toDate));
  }

  /** מבקש אישור ואז מנתק את הרשאת הגישה ל-Gmail. */
  confirmDisconnectGmail(): void {
    if (this.disconnecting()) return;
    this.confirmationService.confirm({
      header: 'ניתוק הרשאת Gmail',
      message:
        'האם לנתק את הרשאת הגישה לחשבון Gmail? לאחר הניתוק לא נוכל למשוך מסמכים חדשים מהמייל.',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'נתק הרשאה',
      rejectLabel: 'ביטול',
      accept: () => this.disconnectGmail(),
    });
  }

  private disconnectGmail(): void {
    this.disconnecting.set(true);
    this.integrationsService.disconnectGoogleIntegration().subscribe({
      next: () => {
        this.disconnecting.set(false);
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
        this.disconnecting.set(false);
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
