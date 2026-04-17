import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

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
   * Gets all transactions for all user accounts from Feezback
   * @param bookingStatus - Optional booking status filter (default: "booked")
   * @returns Observable with all user transactions data
   */
  getUserBankTransactions(bookingStatus?: string): Observable<any> {
    let url = `${environment.apiUrl}feezback/user-bank-transactions`;
    if (bookingStatus) {
      url += `?bookingStatus=${bookingStatus}`;
    }
    // The Authorization header is automatically added by AuthInterceptor
    return this.http.get<any>(url);
  }

  getUserCardTransactions(bookingStatus?: string): Observable<any> {
    let url = `${environment.apiUrl}feezback/user-card-transactions`;
    if (bookingStatus) {
      url += `?bookingStatus=${bookingStatus}`;
    }
    // The Authorization header is automatically added by AuthInterceptor
    return this.http.get<any>(url);
  }

  /**
   * Gets both bank and card transactions in one call (dev use).
   * @param bookingStatus - Optional booking status filter (default: "booked")
   * @returns Observable with { bankTransactions, cardTransactions }
   */
  getAllUserTransactions(bookingStatus?: string): Observable<{ bankTransactions: any; cardTransactions: any; syncSummary?: any }> {
    let url = `${environment.apiUrl}feezback/user-all-transactions`;
    if (bookingStatus) {
      url += `?bookingStatus=${bookingStatus}`;
    }
    return this.http.get<{ bankTransactions: any; cardTransactions: any; syncSummary?: any }>(url);
  }

  ensureSources(): Observable<{ created: number; updated: number }> {
    return this.http.post<{ created: number; updated: number }>(`${environment.apiUrl}feezback/ensure-sources`, {});
  }
}

