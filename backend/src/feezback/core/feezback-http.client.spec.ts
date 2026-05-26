/**
 * Unit tests for FeezbackHttpClient.request() retry behaviour.
 *
 * Strategy
 * ────────
 * • Mock HttpService.get so we can control success / failure per attempt.
 * • Mock FeezbackAuthService to avoid any real token work.
 * • Replace `sleep` (and `calcBackoffMs`) from feezback-retry.utils with
 *   Jest mocks so tests run instantly with no real timers.
 * • Use jest.mock() — hoisted by ts-jest — so FeezbackHttpClient picks up the
 *   mocked module when it is loaded (CommonJS module system).
 */

import { of, throwError } from 'rxjs';
import { AxiosResponse } from 'axios';
import * as retryUtils from './feezback-retry.utils';
import { FeezbackHttpClient } from './feezback-http.client';

// ── Module mocks ───────────────────────────────────────────────────────────────
// Jest hoists jest.mock() calls before any imports are evaluated.
//
// 1) feezback-auth.service: its real implementation pulls in a transitive chain
//    (feezback-jwt.service → user.entity → source.entity → 'src/enum') that
//    Jest cannot resolve in the unit-test environment (no moduleNameMapper for
//    the src/* path alias).  Mocking it with an empty class short-circuits that
//    entire chain.  The tests never use the real FeezbackAuthService anyway —
//    a plain fake object is passed to the constructor directly.
jest.mock('./feezback-auth.service', () => ({
  FeezbackAuthService: class MockFeezbackAuthService {},
}));

// 2) feezback-retry.utils: keep all real implementations, but replace sleep and
//    calcBackoffMs so tests run instantly without real timers.
jest.mock('./feezback-retry.utils', () => ({
  ...jest.requireActual('./feezback-retry.utils'),
  sleep: jest.fn().mockResolvedValue(undefined),
  // Deterministic backoff so tests don't depend on Math.random().
  calcBackoffMs: jest.fn().mockReturnValue(1_000),
}));

// Typed references to the mocked functions for use inside tests.
const sleepMock = retryUtils.sleep as jest.MockedFunction<typeof retryUtils.sleep>;
const calcBackoffMock = retryUtils.calcBackoffMs as jest.MockedFunction<typeof retryUtils.calcBackoffMs>;

// ── Test helpers ───────────────────────────────────────────────────────────────

/** Build a minimal fake AxiosResponse that firstValueFrom() is happy with. */
function makeOkResponse<T>(data: T) {
  const response: AxiosResponse<T> = {
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: { headers: {} } as any,
  };
  return of(response);
}

/**
 * Build an Axios-compatible error that toFeezbackHttpError() can map.
 * The `isAxiosError` flag is how the mapper detects Axios errors.
 */
function makeAxiosError(status: number, responseHeaders: Record<string, string> = {}): any {
  const err: any = new Error(`Request failed with status code ${status}`);
  err.isAxiosError = true;
  err.response = {
    status,
    data: {},
    headers: responseHeaders,
  };
  return err;
}

/** Build an Axios network error (no HTTP status, only an error code). */
function makeNetworkError(code: string): any {
  const err: any = new Error(`Network error: ${code}`);
  err.isAxiosError = true;
  err.code = code;
  // No err.response — simulates a connection-level failure.
  return err;
}

// ── Test suite ─────────────────────────────────────────────────────────────────

describe('FeezbackHttpClient – retry behaviour', () => {
  let client: FeezbackHttpClient;
  let mockHttpGet: jest.Mock;

  beforeEach(() => {
    mockHttpGet = jest.fn();

    const fakeHttpService = { get: mockHttpGet };
    const fakeAuthService = {
      getTppApiUrl: () => 'https://api.feezback.test',
      getAuthHeaders: jest.fn().mockResolvedValue({ Authorization: 'Bearer test-token' }),
    };

    client = new FeezbackHttpClient(fakeHttpService as any, fakeAuthService as any);

    // Reset call counts (but keep mock implementations).
    sleepMock.mockClear();
    calcBackoffMock.mockClear();
  });

  // ── Test 1 ──────────────────────────────────────────────────────────────────

  it('retries exactly once on 429, then returns the successful response', async () => {
    const responseData = { accounts: ['iban123'] };

    mockHttpGet
      .mockReturnValueOnce(throwError(() => makeAxiosError(429)))
      .mockReturnValueOnce(makeOkResponse(responseData));

    const result = await client.get('/accounts');

    expect(result).toEqual(responseData);
    expect(mockHttpGet).toHaveBeenCalledTimes(2);
    expect(sleepMock).toHaveBeenCalledTimes(1);
  });

  // ── Test 2 ──────────────────────────────────────────────────────────────────

  it('sleeps for exactly Retry-After seconds when the header is an integer string', async () => {
    const retryAfterSeconds = 7;

    mockHttpGet
      .mockReturnValueOnce(
        throwError(() => makeAxiosError(429, { 'retry-after': String(retryAfterSeconds) })),
      )
      .mockReturnValueOnce(makeOkResponse({ ok: true }));

    await client.get('/accounts');

    expect(sleepMock).toHaveBeenCalledTimes(1);
    // Retry-After takes priority over calcBackoffMs — sleep must receive exactly N * 1000.
    expect(sleepMock).toHaveBeenCalledWith(retryAfterSeconds * 1_000);
    // calcBackoffMs must NOT have been used (Retry-After wins).
    expect(calcBackoffMock).not.toHaveBeenCalled();
  });

  // ── Test 3 ──────────────────────────────────────────────────────────────────

  it('sleeps for the correct duration when Retry-After is an HTTP-date string', async () => {
    const deltaMs = 4_000; // 4 seconds in the future
    // Use a timestamp that is a round number of seconds so toUTCString() round-trips cleanly.
    const fakeNow = 1_700_000_000_000;
    const retryAfterDate = new Date(fakeNow + deltaMs).toUTCString();

    // Freeze Date.now() so parseRetryAfterMs() produces a deterministic result.
    const dateSpy = jest.spyOn(Date, 'now').mockReturnValue(fakeNow);

    mockHttpGet
      .mockReturnValueOnce(
        throwError(() => makeAxiosError(429, { 'retry-after': retryAfterDate })),
      )
      .mockReturnValueOnce(makeOkResponse({ ok: true }));

    await client.get('/accounts');

    expect(sleepMock).toHaveBeenCalledTimes(1);
    expect(sleepMock).toHaveBeenCalledWith(deltaMs);

    dateSpy.mockRestore();
  });

  // ── Test 4 ──────────────────────────────────────────────────────────────────

  it('retries on 503 Service Unavailable, then returns the successful response', async () => {
    const responseData = { transactions: [] };

    mockHttpGet
      .mockReturnValueOnce(throwError(() => makeAxiosError(503)))
      .mockReturnValueOnce(makeOkResponse(responseData));

    const result = await client.get('/transactions');

    expect(result).toEqual(responseData);
    expect(mockHttpGet).toHaveBeenCalledTimes(2);
    expect(sleepMock).toHaveBeenCalledTimes(1);
    // No Retry-After → calcBackoffMs must have been called.
    expect(calcBackoffMock).toHaveBeenCalledTimes(1);
  });

  // ── Test 5 ──────────────────────────────────────────────────────────────────

  it('does NOT retry on 403 Forbidden — throws immediately after one attempt', async () => {
    mockHttpGet.mockReturnValue(throwError(() => makeAxiosError(403)));

    await expect(client.get('/accounts')).rejects.toMatchObject({ status: 403 });

    expect(mockHttpGet).toHaveBeenCalledTimes(1);
    expect(sleepMock).not.toHaveBeenCalled();
  });

  // ── Bonus: network error ───────────────────────────────────────────────────

  it('retries on ETIMEDOUT network error, then returns the successful response', async () => {
    mockHttpGet
      .mockReturnValueOnce(throwError(() => makeNetworkError('ETIMEDOUT')))
      .mockReturnValueOnce(makeOkResponse({ ok: true }));

    const result = await client.get('/accounts');

    expect(result).toEqual({ ok: true });
    expect(mockHttpGet).toHaveBeenCalledTimes(2);
    expect(sleepMock).toHaveBeenCalledTimes(1);
  });

  // ── Bonus: exhausted retries ───────────────────────────────────────────────

  it('throws after exhausting all retries on persistent 429', async () => {
    // Always return 429 → should exhaust FEEZBACK_RETRY.maxRetries + 1 attempts.
    mockHttpGet.mockReturnValue(throwError(() => makeAxiosError(429)));

    await expect(client.get('/accounts')).rejects.toMatchObject({ status: 429 });

    const { maxRetries } = retryUtils.FEEZBACK_RETRY;
    expect(mockHttpGet).toHaveBeenCalledTimes(maxRetries + 1);
    expect(sleepMock).toHaveBeenCalledTimes(maxRetries); // sleep between attempts, not after last
  });
});
