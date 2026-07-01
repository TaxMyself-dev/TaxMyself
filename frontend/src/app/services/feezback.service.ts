import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

export interface AdminAccountsAndCardsResponse {
  accounts: any;
  cards: any;
}

@Injectable({
  providedIn: 'root'
})
export class FeezbackService {

  constructor(private http: HttpClient) { }

  /**
   * Creates a consent link for Feezback open banking
   * @returns Observable with the response containing the link
   */
  createConsentLink(): Observable<any> {
    const url = `${environment.apiUrl}feezback/consent-link`;
    // The Authorization header is automatically added by AuthInterceptor
    return this.http.post<any>(url, {});
  }

  /**
   * Gets user accounts data from Feezback
   * @returns Observable with user accounts data
   */
  getUserAccounts(): Observable<any> {
    const url = `${environment.apiUrl}feezback/user-accounts`;
    // The Authorization header is automatically added by AuthInterceptor
    return this.http.get<any>(url);
  }

  /**
   * Admin: fetch live accounts + cards JSON for a specific client (no DB writes),
   * along with the user's per-source sync state (status / transactionCount per source).
   */
  adminGetAccountsAndCards(firebaseId: string): Observable<AdminAccountsAndCardsResponse> {
    return this.http.get<AdminAccountsAndCardsResponse>(
      `${environment.apiUrl}feezback/admin/accounts/${firebaseId}`,
    );
  }

  /**
   * Admin: trigger refreshUserSources for a specific client.
   */
  adminRefreshUserSources(firebaseId: string): Observable<{ status: string }> {
    return this.http.post<{ status: string }>(
      `${environment.apiUrl}feezback/admin/refresh-sources/${firebaseId}`,
      {},
    );
  }

  /**
   * Admin: pull transactions for one specific source (bank account / card) of
   * a client. Returns the per-source result (status + transactionCount/error).
   */
  adminPullSource(
    firebaseId: string,
    type: 'bank' | 'card',
    sourceId: string,
  ): Observable<AdminPullSourceResult> {
    return this.http.post<AdminPullSourceResult>(
      `${environment.apiUrl}feezback/admin/pull-source/${firebaseId}`,
      { type, sourceId },
    );
  }
}

export interface AdminPullSourceResult {
  type: 'bank' | 'card';
  sourceId: string;
  resourceId?: string;
  consentId?: string;
  status: 'not_synced' | 'success' | 'failed';
  transactionCount: number;
  error?: string;
  /**
   * Full raw JSON returned by Feezback for the transactions fetch (account/card
   * metadata, asOf, booked/pending transactions, all raw fields). Present on a
   * successful pull — shown in the collapsible "הצג JSON תנועות מלא" block so an
   * admin can copy the exact response for Feezback support.
   */
  rawTransactionsResponse?: any;
}
