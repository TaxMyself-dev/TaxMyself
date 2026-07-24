export enum SubscriptionStatus {
  TRIAL = 'TRIAL',
  TRIAL_EXPIRED = 'TRIAL_EXPIRED',
  ACTIVE = 'ACTIVE',
  PAST_DUE = 'PAST_DUE',
  CANCELED = 'CANCELED',
}

export enum WebhookLogStatus {
  RECEIVED = 'RECEIVED',
  PROCESSED = 'PROCESSED',
  FAILED = 'FAILED',
  IGNORED = 'IGNORED',
}

export enum BillingEventType {
  CHECKOUT_CREATED = 'CHECKOUT_CREATED',
  WEBHOOK_RECEIVED = 'WEBHOOK_RECEIVED',
  PAYMENT_VERIFIED = 'PAYMENT_VERIFIED',
  PAYMENT_SUCCESS = 'PAYMENT_SUCCESS',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  SUBSCRIPTION_ACTIVATED = 'SUBSCRIPTION_ACTIVATED',
  SUBSCRIPTION_CANCELED = 'SUBSCRIPTION_CANCELED',
  RENEWAL_SUCCESS = 'RENEWAL_SUCCESS',
  RENEWAL_FAILED = 'RENEWAL_FAILED',
  RETRY_SCHEDULED = 'RETRY_SCHEDULED',
  PLAN_CHANGE_REQUESTED = 'PLAN_CHANGE_REQUESTED',
  PLAN_CHANGED = 'PLAN_CHANGED',
  /**
   * Restored 2026-07-13: present in the shared keepintax-dev DB's
   * `billing_event.event_type` ENUM (and in a real row, id=164, subscription
   * 49) from earlier uncommitted/WIP payment-method-update work, but absent
   * from every branch's git history. No current code writes these — kept so
   * `synchronize` never truncates existing rows using them. If a
   * payment-method-update flow is (re)built, wire it to these.
   */
  PAYMENT_METHOD_UPDATE_REQUESTED = 'PAYMENT_METHOD_UPDATE_REQUESTED',
  PAYMENT_METHOD_UPDATED = 'PAYMENT_METHOD_UPDATED',
  PAYMENT_METHOD_UPDATE_FAILED = 'PAYMENT_METHOD_UPDATE_FAILED',
  COUPON_REDEEMED = 'COUPON_REDEEMED',
  PROMOTION_APPLIED = 'PROMOTION_APPLIED',
  DISCOUNT_APPLIED = 'DISCOUNT_APPLIED',
  RECEIPT_FAILED = 'RECEIPT_FAILED',
  /**
   * A CardCom webhook verified a real, successful charge, but the subscription
   * was already ACTIVE on the same plan — so no re-activation or receipt was
   * created. Logged purely so a real charge is never invisible in the audit
   * trail, even though internally it was treated as a no-op.
   */
  DUPLICATE_PAYMENT_IGNORED = 'DUPLICATE_PAYMENT_IGNORED',
}
