import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { CheckboxModule } from 'primeng/checkbox';
import { DialogModule } from 'primeng/dialog';
import { ButtonComponent } from 'src/app/components/button/button.component';
import { ButtonColor, ButtonSize } from 'src/app/components/button/button.enum';
import { InputDateComponent } from 'src/app/components/input-date/input-date.component';
import { GenericService } from 'src/app/services/generic.service';
import { GmailSyncStateService } from 'src/app/services/gmail-sync-state.service';
import {
  GmailAccountSyncStatus,
  GmailImportSummary,
  IntegrationsService,
} from 'src/app/services/integrations.service';
import { inputsSize } from 'src/app/shared/enums';
import { GmailImportSummaryComponent } from 'src/app/shared/gmail-import-summary/gmail-import-summary.component';

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
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    DialogModule,
    CheckboxModule,
    ButtonComponent,
    InputDateComponent,
    GmailImportSummaryComponent,
  ],
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
  /** ייבוא ידני (מהדיאלוג) רץ כרגע — נועל את הדיאלוג ומונע שליחה כפולה. */
  readonly importing = signal(false);
  /** מזהי אינטגרציה שמתנתקים כרגע (spinner per-account). */
  readonly disconnecting = signal<ReadonlySet<number>>(new Set());

  /** דיאלוג "משוך מסמכים עכשיו" — בחירת חשבונות לייבוא ידני. */
  readonly importDialogVisible = signal(false);
  /** מזהי החשבונות המסומנים בדיאלוג; מאותחל מחדש בכל פתיחה. */
  readonly selectedImportIds = signal<ReadonlySet<number>>(new Set());

  /**
   * תוצאת המשיכה האחרונה. כל עוד היא null הדיאלוג מציג את בחירת החשבונות;
   * ברגע שהיא מתמלאת אותו דיאלוג עובר להצגת הסיכום — בלי toast נוסף ובלי
   * דיאלוג שני, כך שהמשתמש רואה את התוצאה במקום שבו התחיל את הפעולה.
   */
  readonly importResult = signal<GmailImportSummary | null>(null);
  /** הודעת שגיאה ידידותית (ללא פרטים טכניים) כשהבקשה כולה נכשלה. */
  readonly importErrorMessage = signal<string | null>(null);

  /**
   * חשבונות שאפשר למשוך מהם ידנית: ACTIVE שגם השלימו משיכה ראשונית.
   * EXPIRED וחשבונות שטרם ביצעו משיכה ראשונית מוצגים בדיאלוג כמושבתים,
   * עם הסבר (אותו כלל נאכף גם בשרת).
   */
  readonly selectableAccounts = computed(() =>
    this.syncState.accounts().filter((a) => this.isImportSelectable(a)),
  );
  readonly hasImportSelection = computed(() => this.selectedImportIds().size > 0);

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

  /** האם חשבון ניתן לבחירה בדיאלוג: מחובר (ACTIVE) וגם השלים משיכה ראשונית. */
  isImportSelectable(account: GmailAccountSyncStatus): boolean {
    return account.connected && account.initialImportCompleted;
  }

  /** פותח את דיאלוג "משוך מסמכים עכשיו"; כל החשבונות הזמינים מסומנים כברירת מחדל. */
  openImportDialog(): void {
    if (this.importing()) return;
    this.selectedImportIds.set(new Set(this.selectableAccounts().map((a) => a.id)));
    this.importResult.set(null);
    this.importErrorMessage.set(null);
    this.importDialogVisible.set(true);
  }

  closeImportDialog(): void {
    // בזמן ריצה הדיאלוג נעול — הסיכום חייב להגיע לפני שהוא נסגר.
    if (this.importing()) return;
    this.importDialogVisible.set(false);
    this.importResult.set(null);
    this.importErrorMessage.set(null);
  }

  isSelectedForImport(integrationId: number): boolean {
    return this.selectedImportIds().has(integrationId);
  }

  toggleImportAccount(account: GmailAccountSyncStatus): void {
    if (!this.isImportSelectable(account) || this.importing()) return;
    const next = new Set(this.selectedImportIds());
    if (next.has(account.id)) next.delete(account.id);
    else next.add(account.id);
    this.selectedImportIds.set(next);
  }

  /** "בחר הכל" — מסמן רק חשבונות זמינים (EXPIRED וללא משיכה ראשונית לא נבחרים). */
  selectAllImportAccounts(): void {
    if (this.importing()) return;
    this.selectedImportIds.set(new Set(this.selectableAccounts().map((a) => a.id)));
  }

  clearImportSelection(): void {
    if (this.importing()) return;
    this.selectedImportIds.set(new Set());
  }

  /**
   * ייבוא מהחשבונות שנבחרו בדיאלוג (כפתור האישור). מצב הטעינה נשאר פעיל עד
   * שהשרת מחזיר את הסיכום המלא, ואז אותו דיאלוג עובר למסך התוצאה.
   */
  importSelected(): void {
    if (this.importing() || !this.hasImportSelection()) return;
    this.importing.set(true);
    this.importErrorMessage.set(null);
    this.integrationsService.importGmail([...this.selectedImportIds()]).subscribe({
      next: (result) => {
        this.importing.set(false);
        // הדיאלוג נשאר פתוח ומציג את הסיכום; אין toast כדי לא לכפול הודעות.
        this.importResult.set(result);
        this.syncState.refresh();
      },
      error: (err) => {
        // הדיאלוג נשאר פתוח לניסיון חוזר; רענון תופס רשימת חשבונות לא עדכנית
        // (למשל חשבון שנבחר והפך EXPIRED בינתיים — השרת מחזיר 404).
        this.importing.set(false);
        this.importErrorMessage.set(this.describeImportError(err));
        this.syncState.refresh();
      },
    });
  }

  /**
   * הודעה בעברית לפי סוג הכשל. הודעת השרת עצמה לא מוצגת — היא טכנית
   * ובאנגלית, ולעיתים כוללת מזהים פנימיים.
   */
  private describeImportError(err: any): string {
    switch (err?.status) {
      case 404:
        return 'אחד החשבונות שנבחרו כבר אינו מחובר. רענן/י את המסך ונסה/י שוב.';
      case 400:
        return 'לא ניתן היה למשוך מסמכים — ודא/י שמוגדר עסק בחשבון, ונסה/י שוב.';
      case 409:
        return 'משיכת מסמכים כבר מתבצעת עבור אחד החשבונות שנבחרו.';
      default:
        return 'לא הצלחנו למשוך את המסמכים. נסה/י שוב בעוד מספר דקות.';
    }
  }

  // הצגת הסיכום עצמו חיה ב-GmailImportSummaryComponent המשותף, כדי שהמשיכה
  // הידנית והמשיכה הראשונית יציגו בדיוק אותו דבר.

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
