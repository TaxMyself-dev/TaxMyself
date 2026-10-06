import {
  BillingAttemptStatus,
  BillingObligationStatus,
  PaymentMethodUpdateAttemptStatus,
} from '../enums/billing.enums';

const OBLIGATION_TRANSITIONS: Readonly<
  Record<BillingObligationStatus, readonly BillingObligationStatus[]>
> = {
  [BillingObligationStatus.OPEN]: [
    BillingObligationStatus.SATISFIED,
    BillingObligationStatus.CANCELED,
    BillingObligationStatus.MANUAL_REVIEW,
  ],
  [BillingObligationStatus.MANUAL_REVIEW]: [
    BillingObligationStatus.OPEN,
    BillingObligationStatus.SATISFIED,
    BillingObligationStatus.CANCELED,
  ],
  [BillingObligationStatus.SATISFIED]: [],
  [BillingObligationStatus.CANCELED]: [],
};

const ATTEMPT_TRANSITIONS: Readonly<
  Record<BillingAttemptStatus, readonly BillingAttemptStatus[]>
> = {
  [BillingAttemptStatus.CREATED]: [
    BillingAttemptStatus.MANUAL_REVIEW,
    BillingAttemptStatus.AWAITING_CUSTOMER,
    BillingAttemptStatus.PROCESSING,
    BillingAttemptStatus.CANCELED,
  ],
  [BillingAttemptStatus.AWAITING_CUSTOMER]: [
    BillingAttemptStatus.PROCESSING,
    BillingAttemptStatus.UNKNOWN,
    BillingAttemptStatus.CANCELED,
    BillingAttemptStatus.EXPIRED,
  ],
  [BillingAttemptStatus.PROCESSING]: [
    BillingAttemptStatus.UNKNOWN,
    BillingAttemptStatus.DECLINED,
    BillingAttemptStatus.CAPTURED,
  ],
  [BillingAttemptStatus.UNKNOWN]: [
    BillingAttemptStatus.DECLINED,
    BillingAttemptStatus.CAPTURED,
    BillingAttemptStatus.MANUAL_REVIEW,
  ],
  [BillingAttemptStatus.CAPTURED]: [
    BillingAttemptStatus.COMPLETED,
    BillingAttemptStatus.MANUAL_REVIEW,
  ],
  [BillingAttemptStatus.MANUAL_REVIEW]: [
    BillingAttemptStatus.UNKNOWN,
    BillingAttemptStatus.CAPTURED,
  ],
  [BillingAttemptStatus.DECLINED]: [],
  [BillingAttemptStatus.COMPLETED]: [],
  [BillingAttemptStatus.CANCELED]: [],
  [BillingAttemptStatus.EXPIRED]: [],
};

const PAYMENT_METHOD_UPDATE_TRANSITIONS: Readonly<
  Record<
    PaymentMethodUpdateAttemptStatus,
    readonly PaymentMethodUpdateAttemptStatus[]
  >
> = {
  [PaymentMethodUpdateAttemptStatus.CREATED]: [
    PaymentMethodUpdateAttemptStatus.AWAITING_CUSTOMER,
    PaymentMethodUpdateAttemptStatus.SUPERSEDED,
  ],
  [PaymentMethodUpdateAttemptStatus.AWAITING_CUSTOMER]: [
    PaymentMethodUpdateAttemptStatus.VERIFYING,
    PaymentMethodUpdateAttemptStatus.UNKNOWN,
    PaymentMethodUpdateAttemptStatus.FAILED,
    PaymentMethodUpdateAttemptStatus.SUPERSEDED,
    PaymentMethodUpdateAttemptStatus.EXPIRED,
  ],
  [PaymentMethodUpdateAttemptStatus.VERIFYING]: [
    PaymentMethodUpdateAttemptStatus.UNKNOWN,
    PaymentMethodUpdateAttemptStatus.SUCCEEDED,
    PaymentMethodUpdateAttemptStatus.FAILED,
    PaymentMethodUpdateAttemptStatus.SUPERSEDED,
  ],
  [PaymentMethodUpdateAttemptStatus.UNKNOWN]: [
    PaymentMethodUpdateAttemptStatus.VERIFYING,
    PaymentMethodUpdateAttemptStatus.SUCCEEDED,
    PaymentMethodUpdateAttemptStatus.FAILED,
    PaymentMethodUpdateAttemptStatus.SUPERSEDED,
    PaymentMethodUpdateAttemptStatus.MANUAL_REVIEW,
  ],
  [PaymentMethodUpdateAttemptStatus.MANUAL_REVIEW]: [
    PaymentMethodUpdateAttemptStatus.VERIFYING,
    PaymentMethodUpdateAttemptStatus.FAILED,
    PaymentMethodUpdateAttemptStatus.SUPERSEDED,
  ],
  [PaymentMethodUpdateAttemptStatus.SUCCEEDED]: [],
  [PaymentMethodUpdateAttemptStatus.FAILED]: [],
  [PaymentMethodUpdateAttemptStatus.SUPERSEDED]: [],
  [PaymentMethodUpdateAttemptStatus.EXPIRED]: [],
};

/**
 * Only a definite no-charge terminal state permits another attempt for the
 * same OPEN obligation. COMPLETED also blocks because its obligation must be
 * SATISFIED atomically and can never be reopened.
 */
export const BILLING_ATTEMPT_BLOCKING_STATUSES = new Set<BillingAttemptStatus>([
  BillingAttemptStatus.CREATED,
  BillingAttemptStatus.AWAITING_CUSTOMER,
  BillingAttemptStatus.PROCESSING,
  BillingAttemptStatus.UNKNOWN,
  BillingAttemptStatus.CAPTURED,
  BillingAttemptStatus.COMPLETED,
  BillingAttemptStatus.MANUAL_REVIEW,
]);

export const PAYMENT_METHOD_UPDATE_ACTIVE_STATUSES =
  new Set<PaymentMethodUpdateAttemptStatus>([
    PaymentMethodUpdateAttemptStatus.CREATED,
    PaymentMethodUpdateAttemptStatus.AWAITING_CUSTOMER,
    PaymentMethodUpdateAttemptStatus.VERIFYING,
    PaymentMethodUpdateAttemptStatus.UNKNOWN,
    PaymentMethodUpdateAttemptStatus.MANUAL_REVIEW,
  ]);

export function assertCanOpenBillingAttempt(
  activeAttemptStatus: BillingAttemptStatus | null,
): void {
  if (
    activeAttemptStatus !== null &&
    BILLING_ATTEMPT_BLOCKING_STATUSES.has(activeAttemptStatus)
  ) {
    throw new Error(
      `Cannot open a new billing attempt while ${activeAttemptStatus} remains unresolved`,
    );
  }
}

function assertTransition<T extends string>(
  label: string,
  transitions: Readonly<Record<T, readonly T[]>>,
  from: T,
  to: T,
): void {
  if (from === to) return;
  if (!transitions[from].includes(to)) {
    throw new Error(`Invalid ${label} transition: ${from} -> ${to}`);
  }
}

export function assertBillingObligationTransition(
  from: BillingObligationStatus,
  to: BillingObligationStatus,
): void {
  assertTransition('billing obligation', OBLIGATION_TRANSITIONS, from, to);
}

export function assertBillingAttemptTransition(
  from: BillingAttemptStatus,
  to: BillingAttemptStatus,
): void {
  assertTransition('billing attempt', ATTEMPT_TRANSITIONS, from, to);
}

/** Separate operator decision: never a normal provider transition or a captured-funds escape. */
export function assertAdminNoChargeResolution(status: BillingAttemptStatus, hasCapturedFunds: boolean): void {
  if (hasCapturedFunds || ![BillingAttemptStatus.CREATED, BillingAttemptStatus.AWAITING_CUSTOMER,
    BillingAttemptStatus.PROCESSING, BillingAttemptStatus.UNKNOWN, BillingAttemptStatus.MANUAL_REVIEW].includes(status)) {
    throw new Error('Manual release cannot discard captured funds or a terminal outcome');
  }
}

export function assertPaymentMethodUpdateAttemptTransition(
  from: PaymentMethodUpdateAttemptStatus,
  to: PaymentMethodUpdateAttemptStatus,
): void {
  assertTransition(
    'payment-method update attempt',
    PAYMENT_METHOD_UPDATE_TRANSITIONS,
    from,
    to,
  );
}

/**
 * A provider callback may replace the saved card only while applying a
 * verified result for the flow currently selected by the subscription.
 * SUCCEEDED is already terminal and may only produce an idempotent no-op;
 * older/superseded and otherwise unresolved callbacks are audit-only.
 */
export function assertPaymentMethodUpdateCanReplaceCard(
  attemptId: number,
  activeAttemptId: number | null,
  status: PaymentMethodUpdateAttemptStatus,
): void {
  if (
    attemptId !== activeAttemptId ||
    status !== PaymentMethodUpdateAttemptStatus.VERIFYING
  ) {
    throw new Error(
      'Only the subscription active payment-method update attempt may replace the saved card',
    );
  }
}

export function assertCardcomExternalUniqTranId(value: string): void {
  if (!/^[A-Za-z0-9_-]{1,25}$/.test(value)) {
    throw new Error(
      'CardCom ExternalUniqTranId must be 1-25 opaque ASCII characters',
    );
  }
}

export function assertBillingPeriod(periodStart: Date, periodEnd: Date): void {
  if (!(periodStart instanceof Date) || Number.isNaN(periodStart.getTime())) {
    throw new Error('Billing period start must be a valid date');
  }
  if (
    !(periodEnd instanceof Date) ||
    Number.isNaN(periodEnd.getTime()) ||
    periodEnd <= periodStart
  ) {
    throw new Error(
      'Billing period end must be later than period start and is exclusive',
    );
  }
}

export function assertBillingAnchorDay(billingAnchorDay: number): void {
  if (
    !Number.isInteger(billingAnchorDay) ||
    billingAnchorDay < 1 ||
    billingAnchorDay > 31
  ) {
    throw new Error('Billing anchor day must be an integer between 1 and 31');
  }
}

/** Finalization writes these two terminal states in one local transaction. */
export function assertBillingCompletionPair(
  attemptStatus: BillingAttemptStatus,
  obligationStatus: BillingObligationStatus,
): void {
  const attemptCompleted = attemptStatus === BillingAttemptStatus.COMPLETED;
  const obligationSatisfied =
    obligationStatus === BillingObligationStatus.SATISFIED;
  if (attemptCompleted !== obligationSatisfied) {
    throw new Error(
      'COMPLETED billing attempt and SATISFIED obligation must be persisted together',
    );
  }
}
