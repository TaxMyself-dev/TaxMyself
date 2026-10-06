import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

// ─── Plans ─────────────────────────────────────────────────────────────────

export interface AdminPlan {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  priceMonthlyAgorot: number;
  currency: string;
  modules: string[] | null;
  trialDays: number;
  isActive: boolean;
  isPublic: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePlanPayload {
  slug: string;
  name: string;
  description?: string | null;
  priceMonthlyAgorot: number;
  currency?: string;
  modules?: string[];
  trialDays?: number;
  isActive?: boolean;
  isPublic?: boolean;
  displayOrder?: number;
}

export type UpdatePlanPayload = Partial<CreatePlanPayload>;

// ─── Subscriptions ────────────────────────────────────────────────────────────

export interface AdminSubscription {
  subscriptionId: number;
  firebaseId: string;
  status: string;
  billingAccessMode: BillingAccessMode;
  userId: number | null;
  userName: string | null;
  userEmail: string | null;
  hasOpenBanking: boolean;
  lastLoginAt: string | null;
  businessId: number | null;
  businessName: string | null;
  planId: number | null;
  planName: string | null;
  planSlug: string | null;
  planPriceAgorot: number | null;
  /** Approximation only — planPriceAgorot with the discount applied as of nextBillingDate. */
  nextBillingAmountAgorot: number | null;
  trialEnd: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  nextBillingDate: string | null;
  gracePeriodEndsAt: string | null;
  canceledAt: string | null;
  endedAt: string | null;
  createdAt: string;
  cardTokenExists: boolean;
  cardLast4: string | null;
  cardBrand: string | null;
  cardExpiryMonth: number | null;
  cardExpiryYear: number | null;
  discountPercent: number | null;
  discountAmountAgorot: number | null;
  discountStartDate: string | null;
  discountEndDate: string | null;
  /** Unresolved (UNKNOWN / MANUAL_REVIEW) billing attempts — compact table indicator. */
  unresolvedBillingAttemptCount: number;
  mostSevereUnresolvedAttemptStatus: AdminUnresolvedAttemptStatus | null;
}

// ─── Billing exceptions (read-only) ─────────────────────────────────────────

export type AdminUnresolvedAttemptStatus = 'UNKNOWN' | 'MANUAL_REVIEW';

export type AdminBillingExceptionFailureCategory =
  | 'MISSING_OR_EXPIRED_PAYMENT_METHOD'
  | 'TOKEN_DECRYPTION_FAILED'
  | 'RECONCILIATION_EXHAUSTED'
  | 'PROVIDER_OUTCOME_UNKNOWN';

export type AdminBillingExceptionAction =
  | 'CUSTOMER_PAYMENT_METHOD'
  | 'INTERNAL_REVIEW'
  | 'AUTOMATIC_CHECK';

/** Sanitized attempt DTO: the API never carries tokens, card data or raw provider output. */
export interface AdminUnresolvedBillingAttempt {
  attemptId: number;
  status: AdminUnresolvedAttemptStatus;
  chargeMode: 'LOW_PROFILE_HOSTED' | 'TOKEN_TRANSACTION';
  amountAgorot: number;
  currency: string;
  createdAt: string;
  capturedAt: string | null;
  unknownSince: string | null;
  reconciliationAttempts: number;
  lastReconciledAt: string | null;
  nextActionAt: string | null;
  failureCategory: AdminBillingExceptionFailureCategory;
  requiredAction: AdminBillingExceptionAction;
  cardcomTransactionId: string | null;
  cardcomLowProfileId: string | null;
  cardTokenRecovered: boolean;
}

export type BillingAccessMode = 'STANDARD' | 'COMPLIMENTARY_FULL';

export interface UpdateSubscriptionBillingAccessModePayload {
  billingAccessMode: BillingAccessMode;
  reason?: string;
}

export interface AdminSubscriptionBillingAccessModeResponse {
  subscriptionId: number;
  billingAccessMode: BillingAccessMode;
  status: string;
  planId: number | null;
}

export interface UpdateSubscriptionDiscountPayload {
  discountPercent?: number | null;
  discountAmountAgorot?: number | null;
  discountStartDate?: string | null;
  discountEndDate?: string | null;
}

export interface AdminSubscriptionDiscountResponse {
  subscriptionId: number;
  discountPercent: number | null;
  discountAmountAgorot: number | null;
  discountStartDate: string | null;
  discountEndDate: string | null;
}

export interface UpdateSubscriptionTrialEndPayload {
  trialEnd: string | null;
}

export interface AdminSubscriptionTrialEndResponse {
  subscriptionId: number;
  trialEnd: string | null;
  status: string;
}

export interface UpdateSubscriptionPlanPayload {
  planId: number | null;
}

export interface AdminSubscriptionPlanResponse {
  subscriptionId: number;
  planId: number | null;
  planName: string | null;
  planSlug: string | null;
  planPriceAgorot: number | null;
}

export type RenewalOutcome =
  | 'success'
  | 'retry_scheduled'
  | 'past_due'
  | 'skipped'
  | 'blocked_pending_receipt'
  | 'error';

export interface RenewalResult {
  subscriptionId: number;
  outcome: RenewalOutcome;
  attemptNumber?: number;
  billingPeriod?: string;
  cardcomResponseCode?: number;
  nextBillingDate?: string | null;
  message?: string;
}

export interface RenewalBatchResult {
  totalDue: number;
  processed: number;
  succeeded: number;
  retryScheduled: number;
  pastDue: number;
  skipped: number;
  blockedPendingReceipt: number;
  errors: number;
  results: RenewalResult[];
}

// ─── Pending receipt failures ────────────────────────────────────────────────

export interface PendingReceiptFailure {
  billingEventId: number;
  eventType: string;
  subscriptionId: number | null;
  firebaseId: string;
  userName: string | null;
  userEmail: string | null;
  planId: number | null;
  planName: string | null;
  amountAgorot: number | null;
  cardcomDealNumber: string | null;
  createdAt: string;
}

export interface GenerateReceiptResponse {
  receiptDocId: number;
  docNumber: string;
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class AdminBillingService {
  private readonly base = `${environment.apiUrl}admin/billing`;

  constructor(private readonly http: HttpClient) {}

  // ─── Plans ──────────────────────────────────────────────────────────────────

  getPlans(): Observable<AdminPlan[]> {
    return this.http.get<AdminPlan[]>(`${this.base}/plans`);
  }

  createPlan(payload: CreatePlanPayload): Observable<AdminPlan> {
    return this.http.post<AdminPlan>(`${this.base}/plans`, payload);
  }

  updatePlan(id: number, payload: UpdatePlanPayload): Observable<AdminPlan> {
    return this.http.patch<AdminPlan>(`${this.base}/plans/${id}`, payload);
  }

  deactivatePlan(id: number): Observable<AdminPlan> {
    return this.http.patch<AdminPlan>(`${this.base}/plans/${id}/deactivate`, {});
  }

  activatePlan(id: number): Observable<AdminPlan> {
    return this.http.patch<AdminPlan>(`${this.base}/plans/${id}/activate`, {});
  }

  // ─── Subscriptions ─────────────────────────────────────────────────────────

  getSubscriptions(): Observable<AdminSubscription[]> {
    return this.http.get<AdminSubscription[]>(`${this.base}/subscriptions`);
  }

  /** Read-only: this subscription's unresolved billing attempts, newest first. Loaded when the drawer opens. */
  getUnresolvedBillingAttempts(id: number): Observable<AdminUnresolvedBillingAttempt[]> {
    return this.http.get<AdminUnresolvedBillingAttempt[]>(`${this.base}/subscriptions/${id}/unresolved-attempts`);
  }

  updateSubscriptionDiscount(
    id: number,
    payload: UpdateSubscriptionDiscountPayload,
  ): Observable<AdminSubscriptionDiscountResponse> {
    return this.http.patch<AdminSubscriptionDiscountResponse>(`${this.base}/subscriptions/${id}/discount`, payload);
  }

  updateSubscriptionTrialEnd(
    id: number,
    payload: UpdateSubscriptionTrialEndPayload,
  ): Observable<AdminSubscriptionTrialEndResponse> {
    return this.http.patch<AdminSubscriptionTrialEndResponse>(`${this.base}/subscriptions/${id}/trial-end`, payload);
  }

  updateSubscriptionPlan(
    id: number,
    payload: UpdateSubscriptionPlanPayload,
  ): Observable<AdminSubscriptionPlanResponse> {
    return this.http.patch<AdminSubscriptionPlanResponse>(`${this.base}/subscriptions/${id}/plan`, payload);
  }

  updateSubscriptionBillingAccessMode(
    id: number,
    payload: UpdateSubscriptionBillingAccessModePayload,
  ): Observable<AdminSubscriptionBillingAccessModeResponse> {
    return this.http.patch<AdminSubscriptionBillingAccessModeResponse>(
      `${this.base}/subscriptions/${id}/access-mode`,
      payload,
    );
  }

  /** Manual test trigger for the renewal cron's charge-by-token flow, for one subscription. */
  triggerSubscriptionRenewal(id: number): Observable<RenewalResult> {
    return this.http.post<RenewalResult>(`${this.base}/subscriptions/${id}/renew`, {});
  }

  /** Manual test trigger for the full daily renewal batch — same logic as the 03:00 cron. */
  runDueRenewals(): Observable<RenewalBatchResult> {
    return this.http.post<RenewalBatchResult>(`${this.base}/renewals/run-due`, {});
  }

  // ─── Pending receipt failures ────────────────────────────────────────────────

  /** Successful charges whose receipt generation failed and was never resolved. */
  getPendingReceiptFailures(): Observable<PendingReceiptFailure[]> {
    return this.http.get<PendingReceiptFailure[]>(`${this.base}/receipts/pending`);
  }

  /** Manually generates the missing receipt for one failed charge event. */
  generateReceiptForEvent(billingEventId: number): Observable<GenerateReceiptResponse> {
    return this.http.post<GenerateReceiptResponse>(`${this.base}/receipts/${billingEventId}/generate`, {});
  }
}
