import { TimeoutError } from 'rxjs';
import { isAuthUnavailableError } from './auth-unavailable.error';

/**
 * Centralized, transport-level classification of a failed HTTP request.
 *
 * This deliberately lives outside any page/component so connectivity is never
 * re-classified ad-hoc in the UI. A component maps one of these kinds to its own
 * operation-specific copy; it must not inspect `status === 0` / `navigator.onLine`
 * itself.
 */
export enum RequestFailureKind {
  /**
   * The request provably never left the browser (no ID token could be acquired),
   * or the browser is offline. Nothing reached the server.
   */
  OFFLINE_NOT_SENT = 'OFFLINE_NOT_SENT',

  /**
   * A transport failure or timeout where the request *may* already have reached
   * the server (`status === 0` while online, or a client-side timeout). The
   * result is unknown and must not be presented as a definite failure.
   */
  AMBIGUOUS = 'AMBIGUOUS',

  /** The server answered with a 4xx — a real business/validation verdict. */
  VALIDATION = 'VALIDATION',

  /** The server answered with a 5xx — a confirmed backend failure. */
  SERVER_ERROR = 'SERVER_ERROR',
}

/**
 * Classify a request error using the underlying error and browser connectivity.
 * Never logs out, never mutates state — pure classification.
 */
export function classifyRequestError(err: unknown): RequestFailureKind {
  // Token never obtained → the protected request was stopped before sending.
  if (isAuthUnavailableError(err)) {
    return RequestFailureKind.OFFLINE_NOT_SENT;
  }

  // Client-side timeout: the request left the browser but no response came back
  // in time — its outcome is genuinely unknown.
  if (err instanceof TimeoutError) {
    return RequestFailureKind.AMBIGUOUS;
  }

  const status = (err as { status?: number } | null | undefined)?.status;

  // status 0 = transport-level failure (offline / DNS / CORS / reset / abort).
  if (status === 0) {
    return browserOnline() ? RequestFailureKind.AMBIGUOUS : RequestFailureKind.OFFLINE_NOT_SENT;
  }

  if (typeof status === 'number') {
    if (status >= 500) {
      return RequestFailureKind.SERVER_ERROR;
    }
    if (status >= 400) {
      return RequestFailureKind.VALIDATION;
    }
  }

  // Unknown shape — treat as a server-side problem rather than a connectivity one.
  return RequestFailureKind.SERVER_ERROR;
}

function browserOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
}
