import {
  BillingAttemptStatus,
  BillingObligationStatus,
  PaymentMethodUpdateAttemptStatus,
} from '../enums/billing.enums';
import {
  assertBillingAttemptTransition,
  assertBillingAnchorDay,
  assertCanOpenBillingAttempt,
  assertBillingObligationTransition,
  assertBillingCompletionPair,
  assertBillingPeriod,
  assertCardcomExternalUniqTranId,
  assertPaymentMethodUpdateCanReplaceCard,
  assertPaymentMethodUpdateAttemptTransition,
  BILLING_ATTEMPT_BLOCKING_STATUSES,
  PAYMENT_METHOD_UPDATE_ACTIVE_STATUSES,
} from './billing-state-machine';

describe('billing persistence state invariants', () => {
  it('permits reconciliation outcomes but never treats UNKNOWN as a retryable terminal state', () => {
    expect(() =>
      assertBillingAttemptTransition(
        BillingAttemptStatus.PROCESSING,
        BillingAttemptStatus.UNKNOWN,
      ),
    ).not.toThrow();
    expect(() =>
      assertBillingAttemptTransition(
        BillingAttemptStatus.UNKNOWN,
        BillingAttemptStatus.CAPTURED,
      ),
    ).not.toThrow();
    expect(
      BILLING_ATTEMPT_BLOCKING_STATUSES.has(BillingAttemptStatus.UNKNOWN),
    ).toBe(true);
    expect(() =>
      assertBillingAttemptTransition(
        BillingAttemptStatus.UNKNOWN,
        BillingAttemptStatus.PROCESSING,
      ),
    ).toThrow('Invalid billing attempt transition');
  });

  it('allows a new business attempt only after a definite decline', () => {
    expect(() =>
      assertBillingAttemptTransition(
        BillingAttemptStatus.PROCESSING,
        BillingAttemptStatus.DECLINED,
      ),
    ).not.toThrow();
    expect(
      BILLING_ATTEMPT_BLOCKING_STATUSES.has(BillingAttemptStatus.DECLINED),
    ).toBe(false);
    expect(
      BILLING_ATTEMPT_BLOCKING_STATUSES.has(BillingAttemptStatus.CAPTURED),
    ).toBe(true);
    expect(
      BILLING_ATTEMPT_BLOCKING_STATUSES.has(BillingAttemptStatus.MANUAL_REVIEW),
    ).toBe(true);
    expect(
      BILLING_ATTEMPT_BLOCKING_STATUSES.has(BillingAttemptStatus.COMPLETED),
    ).toBe(true);
    expect(
      BILLING_ATTEMPT_BLOCKING_STATUSES.has(BillingAttemptStatus.EXPIRED),
    ).toBe(false);
  });

  it('makes financial success terminal only after local completion', () => {
    expect(() =>
      assertBillingAttemptTransition(
        BillingAttemptStatus.PROCESSING,
        BillingAttemptStatus.CAPTURED,
      ),
    ).not.toThrow();
    expect(() =>
      assertBillingAttemptTransition(
        BillingAttemptStatus.CAPTURED,
        BillingAttemptStatus.COMPLETED,
      ),
    ).not.toThrow();
    expect(() =>
      assertBillingAttemptTransition(
        BillingAttemptStatus.COMPLETED,
        BillingAttemptStatus.PROCESSING,
      ),
    ).toThrow();
    expect(() =>
      assertBillingCompletionPair(
        BillingAttemptStatus.COMPLETED,
        BillingObligationStatus.SATISFIED,
      ),
    ).not.toThrow();
    expect(() =>
      assertBillingCompletionPair(
        BillingAttemptStatus.COMPLETED,
        BillingObligationStatus.OPEN,
      ),
    ).toThrow('must be persisted together');
  });

  it('keeps CAPTURED and its MANUAL_REVIEW ancestry blocking without a no-charge escape', () => {
    expect(() =>
      assertBillingAttemptTransition(
        BillingAttemptStatus.CAPTURED,
        BillingAttemptStatus.MANUAL_REVIEW,
      ),
    ).not.toThrow();
    expect(() =>
      assertBillingAttemptTransition(
        BillingAttemptStatus.MANUAL_REVIEW,
        BillingAttemptStatus.CANCELED,
      ),
    ).toThrow('Invalid billing attempt transition');
    expect(() =>
      assertBillingAttemptTransition(
        BillingAttemptStatus.MANUAL_REVIEW,
        BillingAttemptStatus.DECLINED,
      ),
    ).toThrow('Invalid billing attempt transition');
    expect(
      BILLING_ATTEMPT_BLOCKING_STATUSES.has(BillingAttemptStatus.CAPTURED),
    ).toBe(true);
    expect(
      BILLING_ATTEMPT_BLOCKING_STATUSES.has(BillingAttemptStatus.MANUAL_REVIEW),
    ).toBe(true);
    expect(() =>
      assertCanOpenBillingAttempt(BillingAttemptStatus.CAPTURED),
    ).toThrow('Cannot open a new billing attempt');
    expect(() =>
      assertCanOpenBillingAttempt(BillingAttemptStatus.MANUAL_REVIEW),
    ).toThrow('Cannot open a new billing attempt');
    expect(() =>
      assertCanOpenBillingAttempt(BillingAttemptStatus.DECLINED),
    ).not.toThrow();
  });

  it('does not reopen satisfied or canceled obligations', () => {
    expect(() =>
      assertBillingObligationTransition(
        BillingObligationStatus.OPEN,
        BillingObligationStatus.SATISFIED,
      ),
    ).not.toThrow();
    expect(() =>
      assertBillingObligationTransition(
        BillingObligationStatus.SATISFIED,
        BillingObligationStatus.OPEN,
      ),
    ).toThrow();
    expect(() =>
      assertBillingObligationTransition(
        BillingObligationStatus.CANCELED,
        BillingObligationStatus.OPEN,
      ),
    ).toThrow();
  });

  it('allows an unresolved payment-method update to be superseded, but not a succeeded one', () => {
    expect(() =>
      assertPaymentMethodUpdateAttemptTransition(
        PaymentMethodUpdateAttemptStatus.VERIFYING,
        PaymentMethodUpdateAttemptStatus.SUPERSEDED,
      ),
    ).not.toThrow();
    expect(
      PAYMENT_METHOD_UPDATE_ACTIVE_STATUSES.has(
        PaymentMethodUpdateAttemptStatus.UNKNOWN,
      ),
    ).toBe(true);
    expect(() =>
      assertPaymentMethodUpdateAttemptTransition(
        PaymentMethodUpdateAttemptStatus.SUCCEEDED,
        PaymentMethodUpdateAttemptStatus.SUPERSEDED,
      ),
    ).toThrow();
    expect(() =>
      assertPaymentMethodUpdateAttemptTransition(
        PaymentMethodUpdateAttemptStatus.SUPERSEDED,
        PaymentMethodUpdateAttemptStatus.SUCCEEDED,
      ),
    ).toThrow();

    const rejectedStatuses = Object.values(
      PaymentMethodUpdateAttemptStatus,
    ).filter((status) => status !== PaymentMethodUpdateAttemptStatus.VERIFYING);

    expect(() =>
      assertPaymentMethodUpdateCanReplaceCard(
        12,
        12,
        PaymentMethodUpdateAttemptStatus.VERIFYING,
      ),
    ).not.toThrow();
    expect(() =>
      assertPaymentMethodUpdateCanReplaceCard(
        11,
        12,
        PaymentMethodUpdateAttemptStatus.VERIFYING,
      ),
    ).toThrow('Only the subscription active');
    for (const status of rejectedStatuses) {
      expect(() =>
        assertPaymentMethodUpdateCanReplaceCard(12, 12, status),
      ).toThrow('Only the subscription active');
    }
  });

  it('enforces CardCom ExternalUniqTranId provider limits', () => {
    expect(() =>
      assertCardcomExternalUniqTranId('A7x_92-kLm3Pq8Rt2Vw5Z'),
    ).not.toThrow();
    expect(() => assertCardcomExternalUniqTranId('x'.repeat(26))).toThrow();
    expect(() =>
      assertCardcomExternalUniqTranId('renewal:person@example.com'),
    ).toThrow();
  });

  it('treats period_end as exclusive and preserves a 1-31 anchor', () => {
    expect(() =>
      assertBillingPeriod(
        new Date('2026-01-31T00:00:00Z'),
        new Date('2026-02-28T00:00:00Z'),
      ),
    ).not.toThrow();
    expect(() =>
      assertBillingPeriod(
        new Date('2026-02-28T00:00:00Z'),
        new Date('2026-02-28T00:00:00Z'),
      ),
    ).toThrow();
    expect(() => assertBillingAnchorDay(31)).not.toThrow();
    expect(() => assertBillingAnchorDay(32)).toThrow();
  });
});
