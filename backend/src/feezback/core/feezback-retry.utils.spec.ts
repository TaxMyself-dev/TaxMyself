import {
  calcBackoffMs,
  FEEZBACK_RETRY,
  isRetryableFeezbackError,
  isTransientNetworkError,
  parseRetryAfterMs,
} from './feezback-retry.utils';

// ── parseRetryAfterMs ──────────────────────────────────────────────────────────

describe('parseRetryAfterMs', () => {
  it('returns null when headers are undefined', () => {
    expect(parseRetryAfterMs(undefined)).toBeNull();
  });

  it('returns null when the retry-after key is absent', () => {
    expect(parseRetryAfterMs({})).toBeNull();
  });

  it('returns null for an unparseable string', () => {
    expect(parseRetryAfterMs({ 'retry-after': 'not-a-date-or-number' })).toBeNull();
  });

  it('parses an integer seconds value → ms', () => {
    expect(parseRetryAfterMs({ 'retry-after': '5' })).toBe(5_000);
  });

  it('parses a float seconds value → rounds via Number()', () => {
    // "3.7" → 3700 ms
    expect(parseRetryAfterMs({ 'retry-after': '3.7' })).toBe(3_700);
  });

  it('clamps negative seconds to 0', () => {
    expect(parseRetryAfterMs({ 'retry-after': '-10' })).toBe(0);
  });

  it('parses an HTTP-date string using the injected nowMs', () => {
    const nowMs = 1_700_000_000_000;
    const futureMs = nowMs + 8_000; // 8 s in the future
    const httpDate = new Date(futureMs).toUTCString();

    expect(parseRetryAfterMs({ 'retry-after': httpDate }, nowMs)).toBe(8_000);
  });

  it('clamps a past HTTP-date to 0', () => {
    const nowMs = 1_700_000_010_000;
    const pastMs = nowMs - 5_000;
    const httpDate = new Date(pastMs).toUTCString();

    expect(parseRetryAfterMs({ 'retry-after': httpDate }, nowMs)).toBe(0);
  });
});

// ── isRetryableFeezbackError ───────────────────────────────────────────────────

describe('isRetryableFeezbackError – retry matrix', () => {
  const errWithStatus = (status: number) => ({ status });
  const errWithCode = (code: string) => ({ code });

  describe('retryable status codes', () => {
    it.each([429, 500, 502, 503, 504])(
      'returns true for HTTP %i',
      (status) => {
        expect(isRetryableFeezbackError(errWithStatus(status))).toBe(true);
      },
    );
  });

  describe('non-retryable status codes', () => {
    it.each([400, 401, 403, 404, 501, 505])(
      'returns false for HTTP %i',
      (status) => {
        expect(isRetryableFeezbackError(errWithStatus(status))).toBe(false);
      },
    );
  });

  describe('transient network errors', () => {
    it.each(['ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN'])(
      'returns true for code %s',
      (code) => {
        expect(isRetryableFeezbackError(errWithCode(code))).toBe(true);
      },
    );
  });

  it('returns false for unknown errors with no status or code', () => {
    expect(isRetryableFeezbackError(new Error('generic error'))).toBe(false);
  });

  it('also reads status from error.response.status', () => {
    expect(isRetryableFeezbackError({ response: { status: 503 } })).toBe(true);
    expect(isRetryableFeezbackError({ response: { status: 403 } })).toBe(false);
  });
});

// ── isTransientNetworkError ────────────────────────────────────────────────────

describe('isTransientNetworkError', () => {
  it.each(['ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN'])(
    'returns true for %s',
    (code) => {
      expect(isTransientNetworkError({ code })).toBe(true);
    },
  );

  it('returns false for other codes', () => {
    expect(isTransientNetworkError({ code: 'ENOTFOUND' })).toBe(false);
    expect(isTransientNetworkError({})).toBe(false);
  });
});

// ── calcBackoffMs ──────────────────────────────────────────────────────────────

describe('calcBackoffMs', () => {
  it('returns a value >= baseDelayMs on attempt 0', () => {
    const result = calcBackoffMs(0);
    expect(result).toBeGreaterThanOrEqual(FEEZBACK_RETRY.baseDelayMs);
  });

  it('grows with each attempt', () => {
    // Strip jitter by checking the minimum possible value at each attempt.
    // calcBackoffMs(n) >= baseDelayMs * 2^n (before cap)
    const a0 = calcBackoffMs(0);
    const a1 = calcBackoffMs(1);
    const a2 = calcBackoffMs(2);
    // With jitter the values are non-deterministic, but each must fit in the
    // valid range [base*2^n, min(max, base*2^n) + jitter].
    expect(a0).toBeLessThanOrEqual(FEEZBACK_RETRY.baseDelayMs + FEEZBACK_RETRY.jitterMs);
    expect(a1).toBeGreaterThanOrEqual(FEEZBACK_RETRY.baseDelayMs * 2);
    expect(a2).toBeGreaterThanOrEqual(FEEZBACK_RETRY.baseDelayMs * 4);
  });

  it('never exceeds maxDelayMs + jitterMs', () => {
    for (let i = 0; i < 20; i++) {
      expect(calcBackoffMs(i)).toBeLessThanOrEqual(
        FEEZBACK_RETRY.maxDelayMs + FEEZBACK_RETRY.jitterMs,
      );
    }
  });
});
