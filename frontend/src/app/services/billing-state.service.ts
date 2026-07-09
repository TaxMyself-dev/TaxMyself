import { computed, Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from 'src/environments/environment';

export type SubscriptionStatus =
  | 'TRIAL'
  | 'TRIAL_EXPIRED'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'CANCELED';

/** Statuses that trigger both the blocking dialog and the billing guard redirect. */
export const BILLING_BLOCKING_STATUSES: SubscriptionStatus[] = [
  'TRIAL_EXPIRED',
  'PAST_DUE',
  'CANCELED',
];

export interface BillingSubscription {
  id: number;
  status: SubscriptionStatus;
  trialStart: string | null;
  trialEnd: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  nextBillingDate: string | null;
  gracePeriodEndsAt: string | null;
  canceledAt: string | null;
  createdAt: string;
}

export interface BillingPlan {
  id: number;
  slug: string;
  name: string;
  priceMonthlyAgorot: number;
  licensedDealerPriceMonthlyAgorot: number | null;
  currency: string;
  modules: string[];
  features: string[] | null;
  badge: string | null;
  notes: string | null;
  trialDays: number;
}

export interface BillingAccess {
  modulesAccess: string[];
  isTrialActive: boolean;
  isPaymentRequired: boolean;
  isPastDue: boolean;
  gracePeriodActive: boolean;
}

export type BillingBusinessType = 'LICENSED' | 'EXEMPT';

/** Saved CardCom card details for the "My Subscription" payment-method card. */
export interface BillingPaymentMethod {
  brand: string | null;
  last4: string | null;
  expiryMonth: number | null;
  expiryYear: number | null;
  /** Not stored today — present only if a future column adds it. */
  cardholderName?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Active/scheduled subscription discount, mirrored from the backend PricingService. */
export interface BillingDiscount {
  kind: 'PERCENT' | 'AMOUNT';
  percent: number | null;
  amountAgorot: number | null;
  startDate: string | null;
  endDate: string | null;
  isActiveNow: boolean;
}

/** One row of the payment-history table (GET /billing/payments). */
export interface PaymentHistoryRow {
  eventId: number;
  date: string;
  planName: string | null;
  amountAgorot: number | null;
  currency: string;
  status: 'SUCCESS' | 'FAILED';
  receiptDocId: number | null;
  /** True only when the backend confirmed the receipt document exists and is downloadable. */
  receiptAvailable: boolean;
  /** True when the event supports a (future) retry-payment action. Backend-resolved from event type. */
  canRetry: boolean;
}

/** Latest CardCom payment/invoice outcome, used to render the post-return-from-CardCom banner. */
export interface BillingPaymentResult {
  latestPaymentEventId: number | null;
  /**
   * ACTIVATION_FAILED = CardCom charge was independently verified, but our own
   * post-payment logic failed to activate the subscription. Must never be
   * presented to the user as "payment failed" — they may already be charged.
   */
  paymentStatus: 'SUCCESS' | 'FAILED' | 'ACTIVATION_FAILED';
  receiptDocId: number | null;
  receiptEmailSent: boolean | null;
  receiptEmail: string | null;
  /** True when receipt generation (not just email) permanently failed for this payment. */
  receiptFailed: boolean;
  failureReason: string | null;
  createdAt: string;
}

export interface BillingStateResponse {
  hasSubscription: boolean;
  subscription: BillingSubscription | null;
  plan: BillingPlan | null;
  access: BillingAccess;
  billingPaymentResult: BillingPaymentResult | null;
  /** The user's effective billing business type — resolved by the backend. */
  billingBusinessType: BillingBusinessType;
  /**
   * Monthly plan price for the user's billing business type, BEFORE VAT, in
   * agorot — exactly as stored in subscription_plan. Null during trial (no plan).
   * Any active discount is reported separately in `discount`, not subtracted here.
   */
  effectiveMonthlyPriceBeforeVatAgorot: number | null;
  discount: BillingDiscount | null;
  paymentMethod: BillingPaymentMethod | null;
}

@Injectable({ providedIn: 'root' })
export class BillingStateService {
  private readonly http = inject(HttpClient);

  readonly billingState = signal<BillingStateResponse | null>(null);
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);

  // Derived access flags — read directly from backend response, no duplication of business rules.
  readonly isPaymentRequired = computed(
    () => this.billingState()?.access?.isPaymentRequired ?? false
  );
  readonly isTrialExpired = computed(
    () => this.billingState()?.subscription?.status === 'TRIAL_EXPIRED'
  );
  readonly isPastDue = computed(
    () => this.billingState()?.access?.isPastDue ?? false
  );
  readonly isCanceled = computed(
    () => this.billingState()?.subscription?.status === 'CANCELED'
  );
  readonly billingPaymentResult = computed(
    () => this.billingState()?.billingPaymentResult ?? null
  );

  // Shared promise for any in-flight load. Multiple callers receive the same
  // Promise so only one HTTP request is made regardless of how many times
  // loadBillingState() is called concurrently (e.g. AppComponent + BillingGuard).
  private _loadPromise: Promise<void> | null = null;

  async loadBillingState(): Promise<void> {
    // Already settled (success or network error) — return immediately.
    // Call refreshBillingState() to force a reload.
    if (this.billingState() !== null || this.error() !== null) return;

    // In-flight request — join it instead of starting a duplicate.
    if (this._loadPromise) return this._loadPromise;

    this._loadPromise = this._executeLoad().finally(() => {
      this._loadPromise = null;
    });

    return this._loadPromise;
  }

  async refreshBillingState(): Promise<void> {
    this._loadPromise = null;
    this.billingState.set(null);
    this.error.set(null);
    await this.loadBillingState();
  }

  private async _executeLoad(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);
    try {
      const state = await firstValueFrom(
        this.http.get<BillingStateResponse>(`${environment.apiUrl}billing/me`)
      );
      console.log('[BillingStateService] /billing/me response:', state);
      this.billingState.set(state);
    } catch (err: any) {
      // 401 → AuthErrorInterceptor handles redirect to login; do not set error
      // so the dialog does not appear due to a transient auth issue.
      if (err?.status !== 401) {
        this.error.set('שגיאה בטעינת נתוני החיוב');
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  hasModuleAccess(moduleName: string): boolean {
    return (
      this.billingState()?.access?.modulesAccess?.includes(moduleName) ?? false
    );
  }

  /** Loads the user's payment history for the "My Subscription" tab. */
  getPaymentHistory(): Promise<PaymentHistoryRow[]> {
    return firstValueFrom(
      this.http.get<PaymentHistoryRow[]>(`${environment.apiUrl}billing/payments`)
    );
  }

  /**
   * Downloads a payment's receipt PDF as a Blob. The caller is responsible for
   * saving it (reuse FilesService.downloadFile). Backend enforces ownership.
   */
  getReceiptBlob(eventId: number): Promise<Blob> {
    return firstValueFrom(
      this.http.get(`${environment.apiUrl}billing/payments/${eventId}/receipt`, {
        responseType: 'blob',
      })
    );
  }

  /**
   * Retries sending the receipt email for a PAYMENT_SUCCESS event the user owns.
   * On success, patches the local billingPaymentResult so the UI flips to the
   * success message without a full billing/me refetch.
   */
  async resendReceiptEmail(eventId: number): Promise<{ sent: boolean; error?: string }> {
    try {
      const result = await firstValueFrom(
        this.http.post<{ sent: boolean; error?: string }>(
          `${environment.apiUrl}billing/events/${eventId}/receipt/resend-email`,
          {}
        )
      );
      if (result.sent) {
        const current = this.billingState();
        if (current?.billingPaymentResult) {
          this.billingState.set({
            ...current,
            billingPaymentResult: { ...current.billingPaymentResult, receiptEmailSent: true },
          });
        }
      }
      return result;
    } catch (err: any) {
      return { sent: false, error: err?.error?.message ?? 'שליחת החשבונית במייל נכשלה' };
    }
  }

  /**
   * Generates the missing receipt for a PAYMENT_SUCCESS event (INVOICE_FAILED case).
   * On success, refreshes billing state so the banner reflects the new receipt.
   */
  async generateMissingReceipt(eventId: number): Promise<{ created: boolean; sent: boolean; error?: string }> {
    try {
      const result = await firstValueFrom(
        this.http.post<{ created: boolean; sent: boolean; error?: string }>(
          `${environment.apiUrl}billing/events/${eventId}/receipt/generate`,
          {}
        )
      );
      if (result.created || result.sent) {
        await this.refreshBillingState();
      }
      return result;
    } catch (err: any) {
      return { created: false, sent: false, error: err?.error?.message ?? 'הפקת החשבונית נכשלה' };
    }
  }
}
