import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root'
})
export class FeezbackService {

  constructor(private http: HttpClient) {}

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
}

