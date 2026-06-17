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

/** Latest CardCom payment/invoice outcome, used to render the post-return-from-CardCom banner. */
export interface BillingPaymentResult {
  latestPaymentEventId: number;
  paymentStatus: 'SUCCESS' | 'FAILED';
  receiptDocId: number | null;
  receiptEmailSent: boolean | null;
  receiptEmail: string | null;
  failureReason: string | null;
  createdAt: string;
}

export interface BillingStateResponse {
  hasSubscription: boolean;
  subscription: BillingSubscription | null;
  plan: BillingPlan | null;
  access: BillingAccess;
  billingPaymentResult: BillingPaymentResult | null;
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
}
