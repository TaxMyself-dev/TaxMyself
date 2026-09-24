/**
 * Bounded renewal-decline policy (KT-038 Task 4B).
 *
 * This is the established policy of the original renewal implementation
 * (docs/features/billing/cardcom-billing.md, "Renewal charge failure"):
 * three charge attempts per billing cycle; after the 1st confirmed decline
 * retry in 3 days, after the 2nd in 7 days, after the 3rd the subscription
 * becomes PAST_DUE with a 14-day grace period. The retry date is stored in
 * `subscription.nextBillingDate`, the field the renewal cron selects on, and
 * `subscription.renewalAttempts` is the counter (reset by a successful
 * renewal).
 *
 * Pure functions only: no I/O, no provider knowledge. Only a definitive
 * provider decline may reach `decideRenewalDecline`; UNKNOWN, timeouts,
 * malformed responses and expired leases never do.
 */

/** Total charge attempts allowed per billing cycle before PAST_DUE. */
export const MAX_RENEWAL_ATTEMPTS = 3;
/** Days to wait after a confirmed decline, indexed by (attemptNumber - 1). */
export const RENEWAL_RETRY_DELAYS_DAYS: readonly number[] = [3, 7];
/** Grace period length once a subscription becomes PAST_DUE. */
export const RENEWAL_GRACE_PERIOD_DAYS = 14;

/** End of the grace period for a subscription that becomes PAST_DUE at `now`. */
export function renewalGracePeriodEnd(now: Date): Date {
  const gracePeriodEndsAt = new Date(now);
  gracePeriodEndsAt.setDate(
    gracePeriodEndsAt.getDate() + RENEWAL_GRACE_PERIOD_DAYS,
  );
  return gracePeriodEndsAt;
}

export type RenewalDeclineDecision =
  | { kind: 'RETRY'; attemptNumber: number; retryAt: Date }
  | { kind: 'PAST_DUE'; attemptNumber: number; gracePeriodEndsAt: Date };

/**
 * @param renewalAttempts confirmed declines already recorded for this cycle.
 * @param now decline time; the retry/grace dates are measured from it.
 */
export function decideRenewalDecline(
  renewalAttempts: number | null | undefined,
  now: Date,
): RenewalDeclineDecision {
  const previous =
    typeof renewalAttempts === 'number' &&
    Number.isInteger(renewalAttempts) &&
    renewalAttempts > 0
      ? renewalAttempts
      : 0;
  const attemptNumber = previous + 1;

  if (attemptNumber >= MAX_RENEWAL_ATTEMPTS) {
    return {
      kind: 'PAST_DUE',
      attemptNumber,
      gracePeriodEndsAt: renewalGracePeriodEnd(now),
    };
  }

  const retryAt = new Date(now);
  retryAt.setDate(
    retryAt.getDate() + RENEWAL_RETRY_DELAYS_DAYS[attemptNumber - 1],
  );
  return { kind: 'RETRY', attemptNumber, retryAt };
}

/**
 * The start of the billing period being collected, i.e. the canonical
 * obligation identity. While a decline retry is pending `nextBillingDate` has
 * been moved forward to the retry date, but `currentPeriodEnd` still holds the
 * original due date, so the retry keeps collecting the SAME period (and the
 * same obligation) instead of opening a new one per retry. Otherwise
 * `nextBillingDate` is the period start.
 */
export function renewalPeriodStart(subscription: {
  nextBillingDate?: Date | null;
  currentPeriodEnd?: Date | null;
  renewalAttempts?: number | null;
}): Date | null {
  const due = subscription.nextBillingDate ?? null;
  if (!due) return null;
  const originalDue = subscription.currentPeriodEnd ?? null;
  if (
    (subscription.renewalAttempts ?? 0) > 0 &&
    originalDue &&
    originalDue.getTime() < due.getTime()
  ) {
    return originalDue;
  }
  return due;
}
