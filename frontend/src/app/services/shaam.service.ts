import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { environment } from 'src/environments/environment';

export const SHAAM_TSANDBOX_BUSINESS_NOT_ALLOWED =
  'SHAAM_TSANDBOX_BUSINESS_NOT_ALLOWED';

export interface ShaamAllocationStatus {
  state: string;
  canRequest: boolean;
  canFinalizeLocally: boolean;
  requiresAdminResolution: boolean;
  requestId: string | null;
  updatedAt: string | null;
}

export interface ShaamUnknownAllocationAttempt {
  attemptId: number;
  requestId: string;
  issuerBusinessNumber: string;
  docNumber: string;
  docType: string;
  state: string;
  environment: string;
  submittedAt: string;
  unknownSince: string | null;
  httpStatus: number | null;
  failureCategory: string | null;
  providerErrorCode: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class ShaamService {

  constructor(private http: HttpClient) {}

  /**
   * Gets the SHAAM OAuth authorization URL
   * @returns Observable with { url, state }
   */
  getAuthorizeUrl(businessNumber: string, product = 'INVOICE_ALLOCATION'): Observable<{ url: string }> {
    const url = `${environment.apiUrl}shaam/oauth/authorize`;
    return this.http.post<{ url: string }>(url, { businessNumber, product });
  }

  /**
   * Initiates SHAAM OAuth flow by redirecting to authorization URL
   * This method redirects the browser to the SHAAM login page
   * @param businessNumber - Optional business number to associate tokens with
   */
  initiateOAuthFlow(
    businessNumber?: string,
    onError?: (error: unknown) => void,
  ): void {
    if (!businessNumber) throw new Error('businessNumber is required');
    this.getAuthorizeUrl(businessNumber).subscribe({
      next: ({ url }) => window.location.assign(url),
      error: (error) => {
        if (onError) {
          onError(error);
          return;
        }
        console.error('SHAAM OAuth initiation failed');
      },
    });
  }

  /**
   * Gets a valid access token for a business
   * Checks if token exists and is valid, refreshes if expired
   * @param businessNumber - Business number
   * @returns Observable with access token and expiresIn, or null if no connection exists
   */
  getConnectionStatus(businessNumber: string, product = 'INVOICE_ALLOCATION'): Observable<{ connected: boolean; expiresAt: string | null }> {
    const url = `${environment.apiUrl}shaam/connection-status?businessNumber=${encodeURIComponent(businessNumber)}&product=${encodeURIComponent(product)}`;
    return this.http.get<{ connected: boolean; expiresAt: string | null }>(url);
  }

  /** Request allocation for an already-persisted invoice. The backend builds
   * every fiscal field from the stored record and finalizes that same record. */
  requestInvoiceAllocation(
    businessNumber: string,
    docNumber: string,
    docType: string,
  ): Observable<any> {
    const url = `${environment.apiUrl}shaam/invoices/allocation?businessNumber=${encodeURIComponent(businessNumber)}`;
    return this.http.post(url, { docNumber, docType });
  }

  getInvoiceAllocationStatus(
    businessNumber: string,
    docNumber: string,
    docType: string,
  ): Observable<ShaamAllocationStatus> {
    const url = `${environment.apiUrl}shaam/invoices/allocation/status?businessNumber=${encodeURIComponent(businessNumber)}&docNumber=${encodeURIComponent(docNumber)}&docType=${encodeURIComponent(docType)}`;
    return this.http.get<ShaamAllocationStatus>(url);
  }

  listUnknownAllocationAttempts(): Observable<ShaamUnknownAllocationAttempt[]> {
    return this.http.get<ShaamUnknownAllocationAttempt[]>(`${environment.apiUrl}shaam/admin/invoices/allocation/unknown`);
  }

  resolveUnknownAllocationAttempt(
    attemptId: number,
    action: 'CONFIRMED_NOT_ACCEPTED' | 'CONFIRMED_APPROVED',
    evidenceReference: string,
    allocationNumber?: string,
  ): Observable<{ state: string }> {
    return this.http.post<{ state: string }>(
      `${environment.apiUrl}shaam/admin/invoices/allocation/${attemptId}/resolve`,
      { action, evidenceReference, allocationNumber },
    );
  }

  /**
   * Disabled compatibility shim for the retired free-form approval dialog.
   * Arbitrary browser-supplied fiscal data must never reach SHAAM.
   */
  submitInvoiceApproval(_approvalData: unknown, _businessNumber: string): Observable<never> {
    return throwError(() => new Error('Direct invoice approval is disabled; persist the invoice first'));
  }
}


