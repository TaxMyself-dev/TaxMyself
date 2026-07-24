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

/** Latest outcome of a change-payment-method flow (CreateTokenOnly, no charge). */
export interface PaymentMethodUpdateResult {
  status: 'SUCCESS' | 'FAILED';
  last4: string | null;
  brand: string | null;
  failureReason: string | null;
  createdAt: string;
}

/**
 * Terminal state of ONE change-payment-method attempt, keyed by its
 * LowProfileId. Unlike PaymentMethodUpdateResult (which is "the latest outcome
 * for this user" and cannot distinguish concurrent or retried attempts), this
 * answers only for the attempt the dialog actually submitted.
 */
export interface ChangePaymentMethodStatus {
  lowProfileId: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  last4: string | null;
  brand: string | null;
  failureReason: string | null;
  /** True when the backend had to pull the result from CardCom itself. */
  reconciled: boolean;
}

export interface BillingStateResponse {
  hasSubscription: boolean;
  subscription: BillingSubscription | null;
  plan: BillingPlan | null;
  access: BillingAccess;
  billingPaymentResult: BillingPaymentResult | null;
  /** Outcome of the most recent "replace saved card" flow, or null if never attempted. */
  paymentMethodUpdateResult: PaymentMethodUpdateResult | null;
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
  readonly paymentMethodUpdateResult = computed(
    () => this.billingState()?.paymentMethodUpdateResult ?? null
  );

  /**
   * True when we have no verified billing state at all — nothing was ever
   * confirmed by the backend for this session (or the last successful payload
   * was cleared intentionally).
   *
   * Guards must treat this as "cannot verify", never as "allowed" and never as
   * an authoritative module denial. Prefer last-known `billingState` when it
   * exists; a transient error must not erase it (see {@link refreshBillingState}).
   */
  readonly isUnverified = computed(() => this.billingState() === null);

  /**
   * True when the last load/refresh failed technically while we may still hold
   * a previously successful payload. Never interpret this as confirmed denial.
   */
  readonly hasTechnicalError = computed(() => this.error() !== null);

  // Shared promise for any in-flight load. Multiple callers receive the same
  // Promise so only one HTTP request is made regardless of how many times
  // loadBillingState() / refreshBillingState() are called concurrently.
  private _loadPromise: Promise<void> | null = null;

  /**
   * How long a failed load suppresses further *cold* load attempts. Long enough
   * to stop a request storm while offline (guards call this on every
   * navigation), short enough that the state can never be wedged permanently by
   * one failure if the reconnect handler never fires.
   */
  private static readonly RETRY_AFTER_ERROR_MS = 30_000;
  private lastErrorAt = 0;

  async loadBillingState(): Promise<void> {
    // Verified state already in hand — nothing to do.
    // Call refreshBillingState() to force a reload.
    if (this.billingState() !== null) return;

    // A recent failure suppresses retries briefly, then we try again. This used
    // to be permanent, which meant one offline failure left billing state
    // unverified for the rest of the session even after connectivity returned.
    if (this.error() !== null && Date.now() - this.lastErrorAt < BillingStateService.RETRY_AFTER_ERROR_MS) {
      return;
    }

    // In-flight request — join it instead of starting a duplicate.
    if (this._loadPromise) return this._loadPromise;

    this._loadPromise = this._executeLoad().finally(() => {
      this._loadPromise = null;
    });

    return this._loadPromise;
  }

  /**
   * Force a fresh `/billing/me` fetch (reconnect recovery, payment return, etc.).
   *
   * Preserves the last successful payload until a new response arrives. A
   * technical failure must not erase modules/access or look like confirmed
   * denial. Concurrent callers join the same in-flight request.
   */
  async refreshBillingState(): Promise<void> {
    if (this._loadPromise) {
      return this._loadPromise;
    }

    this.error.set(null);
    this.lastErrorAt = 0;

    this._loadPromise = this._executeLoad().finally(() => {
      this._loadPromise = null;
    });

    return this._loadPromise;
  }

  /**
   * Fetches `/billing/me`. On success replaces `billingState`. On technical
   * failure sets `error` but never clears a previously successful payload —
   * that distinction is what keeps reconnect failures from looking like
   * confirmed module denial.
   */
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
        this.lastErrorAt = Date.now();
        // Do NOT billingState.set(null) — keep last successful permissions.
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

  /**
   * Starts the "replace saved card" flow. Creates a NEW token only — never
   * charges the customer. Both fields refer to the SAME CardCom LowProfile deal:
   *   lowProfileId — initializes the embedded Open Fields dialog.
   *   paymentUrl   — hosted-page redirect (legacy flow + Open Fields fallback).
   */
  changePaymentMethod(): Promise<{ paymentUrl: string; lowProfileId: string }> {
    return firstValueFrom(
      this.http.post<{ paymentUrl: string; lowProfileId: string }>(
        `${environment.apiUrl}billing/change-payment-method`,
        {}
      )
    );
  }

  /**
   * Reloads billing/me WITHOUT clearing the current state first — unlike
   * refreshBillingState(), consumers keep rendering the previous state until the
   * new response lands. Used by short-interval polling (change-payment-method
   * dialog) so the UI behind the dialog never flashes its loading skeleton.
   */
  async reloadBillingStateQuietly(): Promise<void> {
    try {
      const state = await firstValueFrom(
        this.http.get<BillingStateResponse>(`${environment.apiUrl}billing/me`)
      );
      this.billingState.set(state);
    } catch {
      // Keep the previous state — a failed poll tick is not an error condition.
    }
  }

  /** One-shot read of a specific attempt's terminal state. */
  getChangePaymentMethodStatus(lowProfileId: string): Promise<ChangePaymentMethodStatus> {
    return firstValueFrom(
      this.http.get<ChangePaymentMethodStatus>(
        `${environment.apiUrl}billing/change-payment-method/status`,
        { params: { lowProfileId } }
      )
    );
  }

  /**
   * Polls one change-payment-method attempt, addressed by its LowProfileId,
   * until it reaches SUCCESS or FAILED — or until the caller cancels.
   *
   * Deliberately has NO overall deadline. The previous implementation gave up
   * after ~90s and left the dialog claiming the card "will update automatically"
   * while nothing was still watching. Instead the cadence relaxes: fast ticks
   * while a webhook is plausibly in flight, then a slower heartbeat that keeps
   * running for as long as the dialog is open, so a late webhook still completes
   * the flow on its own.
   *
   * `onSlowdown` fires once at that transition — the dialog uses it to show its
   * "still processing" copy without tearing down the poll.
   *
   * Past the slowdown point each tick also drives the backend's idempotent
   * reconciliation, so a webhook that never arrives at all is recovered here
   * rather than being waited on forever.
   */
  async pollChangePaymentMethodStatus(options: {
    lowProfileId: string;
    isCancelled?: () => boolean;
    onSlowdown?: () => void;
    fastIntervalMs?: number;
    fastAttempts?: number;
    slowIntervalMs?: number;
  }): Promise<ChangePaymentMethodStatus | null> {
    const fastIntervalMs = options.fastIntervalMs ?? 2500;
    const fastAttempts = options.fastAttempts ?? 36; // ~90s
    const slowIntervalMs = options.slowIntervalMs ?? 5000;

    let attempt = 0;
    let slowdownAnnounced = false;

    while (true) {
      const isSlow = attempt >= fastAttempts;
      if (isSlow && !slowdownAnnounced) {
        slowdownAnnounced = true;
        options.onSlowdown?.();
      }

      await new Promise((resolve) =>
        setTimeout(resolve, isSlow ? slowIntervalMs : fastIntervalMs)
      );
      if (options.isCancelled?.()) return null;

      let status: ChangePaymentMethodStatus;
      try {
        status = await this.getChangePaymentMethodStatus(options.lowProfileId);
      } catch {
        // Network blip or a transient 5xx — keep polling rather than declaring
        // a live attempt failed.
        attempt++;
        continue;
      }
      if (options.isCancelled?.()) return null;

      if (status.status !== 'PENDING') {
        // Refresh billing state so the subscription page reflects the new card
        // before the dialog closes.
        await this.reloadBillingStateQuietly();
        return status;
      }

      attempt++;
    }
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
