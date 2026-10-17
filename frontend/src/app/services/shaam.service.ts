import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { environment } from 'src/environments/environment';

export type UniformFileSubmissionState =
  | 'GENERATED' | 'AUTH_REQUIRED' | 'LINKS_RESERVED' | 'INI_UPLOADED'
  | 'PAIR_UPLOADED' | 'PROCESSING' | 'APPROVED' | 'REJECTED'
  | 'RETRYABLE_FAILURE' | 'UNKNOWN_OUTCOME';

export interface UniformFileSubmissionView {
  id: number;
  businessNumber: string;
  environment: 'tsandbox' | 'production';
  periodStart: string;
  periodEnd: string;
  state: UniformFileSubmissionState;
  iniStatus: 'UPLOADED' | 'APPROVED' | 'REJECTED' | null;
  bkmStatus: 'UPLOADED' | 'APPROVED' | 'REJECTED' | null;
  errorCategory: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  iniByteLength: string;
  bkmByteLength: string;
  generatedAt: string;
  createdAt: string;
  updatedAt: string;
  reused: boolean;
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
    product = 'INVOICE_ALLOCATION',
  ): void {
    if (!businessNumber) throw new Error('businessNumber is required');
    this.getAuthorizeUrl(businessNumber, product)
      .subscribe(({ url }) => window.location.assign(url));
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

  prepareUniformFileSubmission(
    businessNumber: string,
    startDate: string,
    endDate: string,
  ): Observable<UniformFileSubmissionView> {
    const url = `${environment.apiUrl}shaam/uniform-file/submissions`;
    return this.http.post<UniformFileSubmissionView>(url, {
      businessNumber,
      startDate,
      endDate,
    });
  }

  getUniformFileSubmission(
    businessNumber: string,
    submissionId: number,
  ): Observable<UniformFileSubmissionView> {
    const query = encodeURIComponent(businessNumber);
    const url = `${environment.apiUrl}shaam/uniform-file/submissions/${submissionId}?businessNumber=${query}`;
    return this.http.get<UniformFileSubmissionView>(url);
  }

  transferUniformFileSubmission(
    businessNumber: string,
    submissionId: number,
  ): Observable<UniformFileSubmissionView> {
    const query = encodeURIComponent(businessNumber);
    const url = `${environment.apiUrl}shaam/uniform-file/submissions/${submissionId}/transfer?businessNumber=${query}`;
    return this.http.post<UniformFileSubmissionView>(url, {});
  }

  pollUniformFileSubmission(
    businessNumber: string,
    submissionId: number,
  ): Observable<UniformFileSubmissionView> {
    const query = encodeURIComponent(businessNumber);
    const url = `${environment.apiUrl}shaam/uniform-file/submissions/${submissionId}/poll?businessNumber=${query}`;
    return this.http.post<UniformFileSubmissionView>(url, {});
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

  /** Recover an allocation after a timeout/lost response without submitting a
   * second approval request. */
  recoverInvoiceAllocation(
    businessNumber: string,
    docNumber: string,
    docType: string,
  ): Observable<any> {
    const url = `${environment.apiUrl}shaam/invoices/allocation/recover?businessNumber=${encodeURIComponent(businessNumber)}`;
    return this.http.post(url, { docNumber, docType });
  }

  /**
   * Disabled compatibility shim for the retired free-form approval dialog.
   * Arbitrary browser-supplied fiscal data must never reach SHAAM.
   */
  submitInvoiceApproval(_approvalData: unknown, _businessNumber: string): Observable<never> {
    return throwError(() => new Error('Direct invoice approval is disabled; persist the invoice first'));
  }
}


