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

/** תוצאת ייבוא מהחשבונות שנבחרו (POST integrations/google/gmail/import). */
export interface GmailAccountImportResult {
  integrationId: number;
  accountEmail: string | null;
  imported: number;
  alreadyImported: number;
  skipped: number;
  attachmentsFound: number;
  messagesFound: number;
  messagesFailed: number;
  error: string | null;
}

export interface GmailImportAllResult {
  totalImported: number;
  totalAlreadyImported: number;
  totalSkipped: number;
  totalAttachmentsFound: number;
  perAccount: GmailAccountImportResult[];
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

  /** ייבוא ידני מחשבונות Gmail נבחרים (הבחירה נעשית בדיאלוג "משוך מסמכים עכשיו"). */
  importGmail(integrationIds: number[]): Observable<GmailImportAllResult> {
    return this.http.post<GmailImportAllResult>(
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
