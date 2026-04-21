/**
 * Shared retry / back-off helpers for Feezback HTTP calls.
 *
 * ─── Config knobs ─────────────────────────────────────────────────────────────
 * All values live in FEEZBACK_RETRY. Wire them to ConfigService / env vars if
 * you want runtime control.
 *
 *   maxRetries  – max re-attempts after the first failure           (default 5)
 *   baseDelayMs – initial exponential back-off window               (default 500 ms)
 *   maxDelayMs  – back-off ceiling                                  (default 20 000 ms)
 *   jitterMs    – random jitter range added to every wait           (default 300 ms)
 *
 * ─── Retry matrix ─────────────────────────────────────────────────────────────
 * Status / code          │ Retry?  │ Rationale
 * ───────────────────────┼─────────┼────────────────────────────────────────────
 * 429 Too Many Requests  │  YES    │ Rate-limited; honour Retry-After header
 * 500 Internal Error     │  YES    │ Transient server fault
 * 502 Bad Gateway        │  YES    │ Upstream transient
 * 503 Unavailable        │  YES    │ Upstream transient
 * 504 Gateway Timeout    │  YES    │ Upstream transient
 * 400 Bad Request        │  NO     │ Our fault; retrying cannot fix it
 * 401 Unauthorized       │  NO     │ Auth failure; caller must refresh token
 * 403 Forbidden          │  NO     │ Permanent access denial
 * 404 Not Found          │  NO     │ Resource does not exist
 * 501 Not Implemented    │  NO     │ Permanent server-side constraint
 * 505 HTTP Version N/S   │  NO     │ Permanent protocol mismatch
 * ETIMEDOUT/ECONNRESET/  │  YES    │ Transient network fault
 *   EAI_AGAIN            │         │
 * anything else          │  NO     │ Conservative default
 */

export const FEEZBACK_RETRY = {
  maxRetries: 5,
  baseDelayMs: 10,
  maxDelayMs: 10,
  jitterMs: 0,
} as const;

// ── Internal status-code sets ──────────────────────────────────────────────────

/** HTTP status codes that are worth retrying (transient server-side conditions). */
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

/**
 * HTTP status codes that must NEVER trigger a retry.
 * Checked first so they always win over RETRYABLE_STATUS_CODES.
 */
const NON_RETRYABLE_STATUS_CODES = new Set([400, 401, 403, 404, 501, 505]);

// ── Exported helpers ───────────────────────────────────────────────────────────

export const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

/**
 * Parse the HTTP `Retry-After` response header into milliseconds.
 *
 * Supports:
 *   1) Delay-in-seconds integer  e.g. "Retry-After: 5"   → 5 000 ms
 *   2) HTTP-date string          e.g. "Retry-After: Wed, 21 Oct 2015 07:28:00 GMT"
 *                                     → max(0, dateMs − nowMs)
 *
 * @param headers - Response headers taken from FeezbackHttpError.headers
 *                  (NOT error.response.headers — FeezbackHttpError has no .response field).
 * @param nowMs   - Current time in milliseconds; injectable for deterministic tests.
 *                  Defaults to Date.now().
 *
 * @returns Milliseconds to wait, or null when the header is absent / unparseable.
 */
export function parseRetryAfterMs(
  headers: Record<string, unknown> | undefined,
  nowMs: number = Date.now(),
): number | null {
  const ra = headers?.['retry-after'];
  if (!ra) return null;

  const raStr = String(ra);

  // Format 1: plain integer seconds
  const asNum = Number(raStr);
  if (!Number.isNaN(asNum)) return Math.max(0, asNum * 1_000);

  // Format 2: HTTP-date string
  const asDate = Date.parse(raStr);
  if (!Number.isNaN(asDate)) return Math.max(0, asDate - nowMs);

  return null;
}

/**
 * Returns true when the error warrants an immediate re-attempt.
 * See the retry matrix in the file header for the full decision table.
 */
export function isRetryableFeezbackError(error: any): boolean {
  const status: number | undefined = error?.status ?? error?.response?.status;

  // Explicit non-retryable status codes take priority over everything else.
  if (status !== undefined && NON_RETRYABLE_STATUS_CODES.has(status)) {
    return false;
  }

  // Explicit retryable HTTP status codes.
  if (status !== undefined && RETRYABLE_STATUS_CODES.has(status)) {
    return true;
  }

  // Transient network-level errors (no HTTP status code present).
  if (isTransientNetworkError(error)) {
    return true;
  }

  // Conservative default: do not retry anything else.
  return false;
}

/**
 * Returns true when the error is an HTTP 429 / TOO_MANY_REQUESTS.
 * Kept separate from isRetryableFeezbackError so the HTTP client can decide
 * whether to look for a Retry-After header (only meaningful on 429 responses).
 */
export function isRateLimitError(error: any): boolean {
  const status = error?.status ?? error?.response?.status;
  return (
    status === 429 ||
    error?.message?.includes('429') ||
    error?.code === 'TOO_MANY_REQUESTS'
  );
}

/** Returns true for transient network-level errors worth retrying. */
export function isTransientNetworkError(error: any): boolean {
  const code = error?.code;
  return code === 'ETIMEDOUT' || code === 'ECONNRESET' || code === 'EAI_AGAIN';
}

/**
 * Exponential back-off with uniform jitter.
 *
 * attempt=0 → ~500 ms
 * attempt=1 → ~1 000 ms
 * attempt=2 → ~2 000 ms
 *  …
 * Capped at maxDelayMs.
 */
export function calcBackoffMs(attempt: number): number {
  const exp = Math.min(
    FEEZBACK_RETRY.maxDelayMs,
    FEEZBACK_RETRY.baseDelayMs * Math.pow(2, attempt),
  );
  return exp + Math.floor(Math.random() * FEEZBACK_RETRY.jitterMs);
}
