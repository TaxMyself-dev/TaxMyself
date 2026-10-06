import {
  BillingAttemptStatus,
  BillingChargeMode,
} from '../../enums/billing.enums';

/** The only attempt statuses an admin sees as unresolved billing exceptions. */
export type AdminUnresolvedAttemptStatus =
  | BillingAttemptStatus.CREATED
  | BillingAttemptStatus.AWAITING_CUSTOMER
  | BillingAttemptStatus.PROCESSING
  | BillingAttemptStatus.CAPTURED
  | BillingAttemptStatus.COMPLETED
  | BillingAttemptStatus.DECLINED
  | BillingAttemptStatus.CANCELED
  | BillingAttemptStatus.EXPIRED
  | BillingAttemptStatus.UNKNOWN
  | BillingAttemptStatus.MANUAL_REVIEW;

/**
 * Whitelisted, sanitized failure classification. The persisted
 * `failure_category` string is never returned; it is only mapped to one of
 * these codes (`null` when there is no recorded category to classify).
 */
export type AdminBillingExceptionFailureCategory =
  | 'HOSTED_CREATION_FAILED'
  | 'POST_CAPTURE_PENDING'
  | 'CHECKOUT_NOT_FINISHED'
  | 'MISSING_OR_EXPIRED_PAYMENT_METHOD'
  | 'TOKEN_DECRYPTION_FAILED'
  | 'RECONCILIATION_EXHAUSTED'
  | 'PROVIDER_OUTCOME_UNKNOWN';

/**
 * Who has to act: the customer (payment method), an internal reviewer, or
 * nobody yet because the system is still checking with the provider.
 */
export type AdminBillingExceptionAction =
  | 'CUSTOMER_PAYMENT_METHOD'
  | 'INTERNAL_REVIEW'
  | 'AUTOMATIC_CHECK';

/** Compact per-subscription indicator embedded in the admin list response. */
export interface AdminUnresolvedAttemptIndicator {
  unresolvedBillingAttemptCount: number;
  mostSevereUnresolvedAttemptStatus: AdminUnresolvedAttemptStatus | null;
}

/**
 * Read-only, sanitized view of one unresolved billing attempt. Deliberately
 * excludes every token/credential/raw-provider field and the internal
 * provider keys (ExternalUniqTranId, terminal ref, lease owner, response code).
 */
export interface AdminUnresolvedBillingAttemptResponse {
  stateVersion: number;
  lastResolution?: { action: string; evidence: string; actorFirebaseId: string; createdAt: Date };
  attemptId: number;
  status: AdminUnresolvedAttemptStatus;
  chargeMode: BillingChargeMode;
  amountAgorot: number;
  currency: string;
  createdAt: Date;
  capturedAt: Date | null;
  unknownSince: Date | null;
  reconciliationAttempts: number;
  lastReconciledAt: Date | null;
  nextActionAt: Date | null;
  failureCategory: AdminBillingExceptionFailureCategory;
  requiredAction: AdminBillingExceptionAction;
  cardcomTransactionId: string | null;
  cardcomLowProfileId: string | null;
  cardTokenRecovered: boolean;
}
