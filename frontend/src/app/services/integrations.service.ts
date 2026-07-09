import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

export type GmailSyncRunStatus = 'RUNNING' | 'SUCCESS' | 'ERROR';

/** Response of GET integrations/google/gmail/sync-status. */
export interface GmailSyncStatus {
  connected: boolean;
  accountEmail: string | null;
  initialImportCompleted: boolean;
  initialImportCompletedAt: string | null;
  /** תאריך מוקדם ביותר מותר לייבוא (YYYY-MM-DD) — מחושב בשרת, לא בפרונט. */
  minFromDate: string;
  /** תאריך מאוחר ביותר מותר (YYYY-MM-DD) — היום. */
  maxToDate: string;
  lastSuccessfulSyncAt: string | null;
  lastSyncStatus: GmailSyncRunStatus | null;
  lastSyncError: string | null;
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

  /** התחלת הייבוא הראשוני (רץ ברקע בשרת; העדכונים מגיעים דרך sync-status). */
  startInitialGmailImport(fromDate: string, toDate: string): Observable<{ started: boolean }> {
    return this.http.post<{ started: boolean }>(
      `${environment.apiUrl}integrations/google/gmail/import-initial`,
      { fromDate, toDate },
    );
  }

  /** ניתוק הרשאת Gmail — מבטל את החיבור ומסיר את הטוקנים השמורים בשרת. */
  disconnectGoogleIntegration(): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}integrations/google`);
  }
}
