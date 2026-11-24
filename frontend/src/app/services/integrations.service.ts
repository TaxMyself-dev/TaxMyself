import { EMPTY, expand, reduce } from 'rxjs';
import { DocumentRetrySummary } from './document-retry';
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

export type GmailSyncRunStatus = 'RUNNING' | 'SUCCESS' | 'ERROR';

/** סטטוס האינטגרציה עצמה (REVOKED לא מוחזר לפרונט). */
export type GmailIntegrationStatus = 'ACTIVE' | 'EXPIRED' | 'REVOKED';
export interface EmailSenderRule { sender:string;action:'BLOCK'|'BUSINESS';businessNumber?:string; }
export interface EmailRoutingSettings { businessNumber:string|null;rules:EmailSenderRule[]; }
export interface EmailRoutingConfiguration {settings:EmailRoutingSettings;businesses:{businessNumber:string;businessName:string}[];}

/** מצב סנכרון של חשבון Gmail בודד (שורה אחת מתוך user_integrations). */
export interface GmailAccountSyncStatus {
  provider?: 'GOOGLE' | 'MICROSOFT';
  passwordRequiredCount?: number;
  id: number;
  accountEmail: string | null;
  /** ACTIVE או EXPIRED בלבד — חשבונות שנותקו (REVOKED) לא מוחזרים. */
  status: GmailIntegrationStatus;
  connected: boolean;
  remoteDisconnectPending: boolean;
  initialImportCompleted: boolean;
  initialImportCompletedAt: string | null;
  lastSuccessfulSyncAt: string | null;
  lastSyncStatus: GmailSyncRunStatus | null;
  lastSyncError: string | null;
  syncErrorPredatesConnection?: boolean;
}

/** Response of GET integrations/google/gmail/sync-status. */
export interface GmailDurableRun {
 id:string;integrationId:number;businessNumber:string;scan_state:string;pull_state:string;processing_state:string;error_code:string|null;
 messages:Record<string,number>;attachments:Record<string,number>;documents:Record<string,number>;
}
export interface GmailSyncStatus {
  runs?: GmailDurableRun[];
  /** תאריך מוקדם ביותר מותר לייבוא (YYYY-MM-DD) — מחושב בשרת, לא בפרונט. */
  minFromDate: string;
  /** תאריך מאוחר ביותר מותר (YYYY-MM-DD) — היום. */
  maxToDate: string;
  /** כל חשבונות ה-Gmail שהמשתמש חיבר (מהישן לחדש). */
  accounts: GmailAccountSyncStatus[];
}

/** תוצאת ייבוא מהחשבונות שנבחרו (POST integrations/google/gmail/import). */
export interface GmailAccountImportResult {
  passwordRequired?: number;
  filteredAttachments?: number;
  reviewRequired?: number;
  aiReviewQueued?: number;
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
  started?:boolean;
  runIds?:string[];
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
  retryMailboxProcessing(integrationId:number):Observable<DocumentRetrySummary> {
    const page=(cursor=0)=>this.http.post<DocumentRetrySummary>(environment.apiUrl+'integrations/email/'+integrationId+'/retry-processing',{cursor});
    return page().pipe(
      expand(result=>result.nextCursor!==undefined?page(result.nextCursor):EMPTY,1),
      reduce((total,result)=>({results:[...total.results,...result.results],retried:total.retried+result.retried,skipped:total.skipped+result.skipped}),{results:[],retried:0,skipped:0} as DocumentRetrySummary)
    );
  }

  constructor(private http: HttpClient) {}

  getEmailRouting(id:number):Observable<EmailRoutingConfiguration>{
    return this.http.get<EmailRoutingConfiguration>(`${environment.apiUrl}integrations/google/${id}/routing`);
  }
  getEmailRoutingOptions():Observable<Pick<EmailRoutingConfiguration,'businesses'>>{
    return this.http.get<Pick<EmailRoutingConfiguration,'businesses'>>(`${environment.apiUrl}integrations/google/routing-options`);
  }
  saveEmailRouting(id:number,settings:EmailRoutingSettings):Observable<{settings:EmailRoutingSettings}>{
    return this.http.post<{settings:EmailRoutingSettings}>(`${environment.apiUrl}integrations/google/${id}/routing`,settings);
  }

  /** כתובת מסך ההסכמה של Google — הפרונט מנווט אליה כדי לחבר חשבון. */
  getGoogleConnectUrl(integrationId?: number, businessNumber?:string): Observable<{ url: string }> {
    return this.http.get<{ url: string }>(`${environment.apiUrl}integrations/google/connect`, {
      params: {...(integrationId===undefined?{}:{integrationId:String(integrationId)}),...(businessNumber?{businessNumber}:{})},
    });
  }

  getOutlookConnectUrl(integrationId?: number, businessNumber?:string): Observable<{ url: string }> {
    return this.http.get<{ url: string }>(`${environment.apiUrl}integrations/outlook/connect`, {
      params: {...(integrationId===undefined?{}:{integrationId:String(integrationId)}),...(businessNumber?{businessNumber}:{})},
    });
  }

  disconnectEmailIntegration(integrationId: number): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}integrations/email/${integrationId}`);
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
  importGmail(integrationIds: number[], fromDate: string, toDate: string): Observable<GmailImportAllResult> {
    return this.http.post<GmailImportAllResult>(
      `${environment.apiUrl}integrations/google/gmail/import`,
      { integrationIds, fromDate, toDate },
    );
  }

  /** ניתוק הרשאת Gmail של חשבון ספציפי — מבטל את החיבור ומסיר את הטוקנים. */
  disconnectGoogleIntegration(integrationId: number): Observable<void> {
    return this.http.delete<void>(
      `${environment.apiUrl}integrations/google/${integrationId}`,
    );
  }
}
