import {
  decideRenewalDecline,
  MAX_RENEWAL_ATTEMPTS,
  renewalPeriodStart,
} from './billing-renewal-policy';

describe('bounded renewal-decline policy', () => {
  const now = new Date('2026-09-01T03:00:00.000Z');
  const plusDays = (days: number) => {
    const result = new Date(now);
    result.setDate(result.getDate() + days);
    return result;
  };

  it('is the established 3 attempts / +3d / +7d / PAST_DUE + 14d grace policy', () => {
    expect(MAX_RENEWAL_ATTEMPTS).toBe(3);
    expect(decideRenewalDecline(0, now)).toEqual({
      kind: 'RETRY',
      attemptNumber: 1,
      retryAt: plusDays(3),
    });
    expect(decideRenewalDecline(1, now)).toEqual({
      kind: 'RETRY',
      attemptNumber: 2,
      retryAt: plusDays(7),
    });
    expect(decideRenewalDecline(2, now)).toEqual({
      kind: 'PAST_DUE',
      attemptNumber: 3,
      gracePeriodEndsAt: plusDays(14),
    });
  });

  it('never yields a further retry once the attempts are exhausted or the counter is corrupt', () => {
    for (const exhausted of [3, 4, 99]) {
      expect(decideRenewalDecline(exhausted, now).kind).toBe('PAST_DUE');
    }
    for (const corrupt of [null, undefined, -5, 1.5, Number.NaN]) {
      expect(decideRenewalDecline(corrupt as any, now)).toEqual(
        decideRenewalDecline(0, now),
      );
    }
  });

  it('does not mutate the decline time it is given', () => {
    const before = now.getTime();
    decideRenewalDecline(0, now);
    expect(now.getTime()).toBe(before);
  });

  describe('renewalPeriodStart', () => {
    const due = new Date('2026-09-01T00:00:00.000Z');
    const retry = new Date('2026-09-04T03:00:00.000Z');

    it('is nextBillingDate when no retry is pending', () => {
      expect(
        renewalPeriodStart({
          nextBillingDate: due,
          currentPeriodEnd: due,
          renewalAttempts: 0,
        }),
      ).toEqual(due);
      expect(renewalPeriodStart({ nextBillingDate: due })).toEqual(due);
    });

    it('is the ORIGINAL due date (currentPeriodEnd) while a retry date sits in nextBillingDate', () => {
      expect(
        renewalPeriodStart({
          nextBillingDate: retry,
          currentPeriodEnd: due,
          renewalAttempts: 1,
        }),
      ).toEqual(due);
    });

    it('ignores a stale counter when the dates agree (e.g. after PAST_DUE recovery)', () => {
      expect(
        renewalPeriodStart({
          nextBillingDate: due,
          currentPeriodEnd: due,
          renewalAttempts: 3,
        }),
      ).toEqual(due);
    });

    it('falls back to nextBillingDate when there is no earlier original due date', () => {
      expect(
        renewalPeriodStart({
          nextBillingDate: retry,
          currentPeriodEnd: null,
          renewalAttempts: 1,
        }),
      ).toEqual(retry);
      expect(renewalPeriodStart({ nextBillingDate: null })).toBeNull();
    });
  });
});
