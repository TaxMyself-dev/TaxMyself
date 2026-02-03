import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { IShaamApprovalRequest, IShaamApprovalResponse } from 'src/app/shared/interface';

@Injectable({
  providedIn: 'root'
})
export class ShaamService {

  constructor(private http: HttpClient) {}

  /**
   * Gets the SHAAM OAuth authorization URL
   * @returns Observable with { url, state }
   */
  getAuthorizeUrl(): Observable<{ url: string; state: string }> {
    const url = `${environment.apiUrl}shaam/oauth/authorize-url`;
    return this.http.get<{ url: string; state: string }>(url);
  }

  /**
   * Initiates SHAAM OAuth flow by redirecting to authorization URL
   * This method redirects the browser to the SHAAM login page
   * @param businessNumber - Optional business number to associate tokens with
   */
  initiateOAuthFlow(businessNumber?: string): void {
    let redirectUrl = `${environment.apiUrl}shaam/oauth/redirect`;
    if (businessNumber) {
      redirectUrl += `?businessNumber=${encodeURIComponent(businessNumber)}`;
    }
    window.location.href = redirectUrl;
  }

  /**
   * Exchanges authorization code for access token
   * @param code - Authorization code from SHAAM callback
   * @param state - State string for validation
   * @param redirectUri - Redirect URI used in authorization
   * @returns Observable with token response
   */
  exchangeCodeForToken(code: string, state: string, redirectUri?: string): Observable<{
    accessToken: string;
    tokenType: string;
    expiresIn: number;
  }> {
    let url = `${environment.apiUrl}shaam/oauth/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;
    if (redirectUri) {
      url += `&redirect_uri=${encodeURIComponent(redirectUri)}`;
    }
    return this.http.get<{
      accessToken: string;
      tokenType: string;
      expiresIn: number;
    }>(url);
  }

  /**
   * Gets a valid access token for a business
   * Checks if token exists and is valid, refreshes if expired
   * @param businessNumber - Business number
   * @returns Observable with access token and expiresIn, or null if no connection exists
   */
  getValidAccessToken(businessNumber: string): Observable<{
    accessToken: string;
    expiresIn: number;
  } | null> {
    const url = `${environment.apiUrl}shaam/access-token?businessNumber=${encodeURIComponent(businessNumber)}`;
    return this.http.get<{
      accessToken: string;
      expiresIn: number;
    } | null>(url);
  }

  /**
   * Submits invoice approval to SHAAM
   * @param accessToken - OAuth2 access token
   * @param approvalData - Invoice approval data
   * @param businessNumber - Business number to get token from backend if accessToken is not provided
   * @returns Observable with approval response containing confirmation_number (allocation number)
   */
  submitInvoiceApproval(accessToken: string, approvalData: IShaamApprovalRequest, businessNumber?: string): Observable<IShaamApprovalResponse> {
    let url = `${environment.apiUrl}shaam/invoices/approval`;
    if (businessNumber) {
      url += `?businessNumber=${encodeURIComponent(businessNumber)}`;
    }
    return this.http.post<IShaamApprovalResponse>(url, approvalData, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  }
}


