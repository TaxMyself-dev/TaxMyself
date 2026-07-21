import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

export type GmailSyncRunStatus = 'RUNNING' | 'SUCCESS' | 'ERROR';

/** סטטוס האינטגרציה עצמה (REVOKED לא מוחזר לפרונט). */
export type GmailIntegrationStatus = 'ACTIVE' | 'EXPIRED' | 'REVOKED';

/** מצב סנכרון של חשבון Gmail בודד (שורה אחת מתוך user_integrations). */
export interface GmailAccountSyncStatus {
  id: number;
  accountEmail: string | null;
  /** ACTIVE או EXPIRED בלבד — חשבונות שנותקו (REVOKED) לא מוחזרים. */
  status: GmailIntegrationStatus;
  connected: boolean;
  initialImportCompleted: boolean;
  initialImportCompletedAt: string | null;
  lastSuccessfulSyncAt: string | null;
  lastSyncStatus: GmailSyncRunStatus | null;
  lastSyncError: string | null;
  /**
   * התוצאה הסופית של המשיכה הראשונית (שרצה ברקע). זה הערוץ שדרכו המסלול
   * האסינכרוני מוסר את הסיכום שלו — הפרונט מציג אותו באותו רכיב שבו הוא מציג
   * את תשובת המשיכה הידנית. null כשלא רצה משיכה ראשונית או אחרי סנכרון לילי.
   */
  lastImportSummary: GmailImportSummary | null;
}

/** Response of GET integrations/google/gmail/sync-status. */
export interface GmailSyncStatus {
  /** תאריך מוקדם ביותר מותר לייבוא (YYYY-MM-DD) — מחושב בשרת, לא בפרונט. */
  minFromDate: string;
  /** תאריך מאוחר ביותר מותר (YYYY-MM-DD) — היום. */
  maxToDate: string;
  /** כל חשבונות ה-Gmail שהמשתמש חיבר (מהישן לחדש). */
  accounts: GmailAccountSyncStatus[];
}

/**
 * העסק שתחתיו נשמרו המסמכים — כפי שדווח על ידי צינור הייבוא עצמו בשרת.
 * הפרונט לא בוחר עסק, לא שולח מספר עסק ולא מסיק אותו; הוא רק מציג.
 * אין כאן שום פרט אחסון פנימי (תיקיות/מזהי Drive) — למשתמש אין גישה אליהם.
 */
export interface GmailImportDestination {
  businessNumber: string;
  businessName: string | null;
}

/** סוג הריצה שהפיקה את הסיכום. */
export type GmailImportRunType = 'INITIAL' | 'MANUAL';

/** סיבת כשל של חשבון בודד — קוד בלבד, בלי טקסט טכני מהשרת. */
export type GmailImportErrorCode = 'ACCOUNT_NEEDS_RECONNECT' | 'IMPORT_FAILED';

/** תוצאת חשבון בודד. הספירות זרות זו לזו — כל קובץ נספר פעם אחת בדיוק. */
export interface GmailImportAccountSummary {
  integrationId: number;
  accountEmail: string | null;
  /** מסמכים חדשים שנשמרו. */
  imported: number;
  /** מסמכים שכבר היו קיימים במערכת (כפילות — לא תקלה). */
  alreadyImported: number;
  /** קבצים שדולגו במכוון (לוגו, נספחים שאינם חשבונית/קבלה) — לא תקלה. */
  skippedIrrelevant: number;
  /** מה שבאמת נכשל: קבצים שלא נשמרו + הודעות שלא ניתן היה לקרוא. */
  failed: number;
  errorCode: GmailImportErrorCode | null;
}

/**
 * מודל התוצאה המשותף לשני המסלולים: תשובת המשיכה הידנית, וגם התוצאה הסופית
 * של המשיכה הראשונית (שרצה ברקע ונשמרת על החשבון עד שהפרונט קורא אותה).
 */
export interface GmailImportSummary {
  runType: GmailImportRunType;
  finishedAt: string;
  totalImported: number;
  totalAlreadyImported: number;
  totalSkippedIrrelevant: number;
  totalFailed: number;
  /** בדרך כלל עסק אחד; ריק כשלא טופל אף קובץ. */
  destinations: GmailImportDestination[];
  perAccount: GmailImportAccountSummary[];
}

/** חיבור חשבונות חיצוניים (Google/Gmail) — endpoints של מודול integrations בשרת. */
@Injectable({
  providedIn: 'root',
})
export class IntegrationsService {
  constructor(private http: HttpClient) {}

  /** כתובת מסך ההסכמה של Google — הפרונט מנווט אליה כדי לחבר חשבון. */
  getGoogleConnectUrl(): Observable<{ url: string }> {
    return this.http.get<{ url: string }>(`${environment.apiUrl}integrations/google/connect`);
  }

  /** מצב הסנכרון של Gmail עבור המשתמש הנוכחי (משמש גם ל-polling בזמן ריצה). */
  getGmailSyncStatus(): Observable<GmailSyncStatus> {
    return this.http.get<GmailSyncStatus>(
      `${environment.apiUrl}integrations/google/gmail/sync-status`,
    );
  }

  /** התחלת הייבוא הראשוני לחשבון ספציפי (רץ ברקע; עדכונים דרך sync-status). */
  startInitialGmailImport(
    integrationId: number,
    fromDate: string,
    toDate: string,
  ): Observable<{ started: boolean }> {
    return this.http.post<{ started: boolean }>(
      `${environment.apiUrl}integrations/google/gmail/import-initial`,
      { integrationId, fromDate, toDate },
    );
  }

  /**
   * ייבוא ידני מחשבונות Gmail נבחרים (הבחירה נעשית בדיאלוג "משוך מסמכים עכשיו").
   * נשלחים מזהי החשבונות בלבד — העסק נקבע בשרת ואינו ניתן להשפעה מהפרונט.
   */
  importGmail(integrationIds: number[]): Observable<GmailImportSummary> {
    return this.http.post<GmailImportSummary>(
      `${environment.apiUrl}integrations/google/gmail/import`,
      { integrationIds },
    );
  }

  /** ניתוק הרשאת Gmail של חשבון ספציפי — מבטל את החיבור ומסיר את הטוקנים. */
  disconnectGoogleIntegration(integrationId: number): Observable<void> {
    return this.http.delete<void>(
      `${environment.apiUrl}integrations/google/${integrationId}`,
    );
  }
}
