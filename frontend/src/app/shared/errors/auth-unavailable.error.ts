/**
 * Raised by AuthInterceptor when a Firebase ID token could not be obtained in
 * time — typically because the device is offline and the SDK is still retrying
 * a token refresh against securetoken.googleapis.com.
 *
 * This is deliberately NOT an HttpErrorResponse and deliberately carries no
 * HTTP status: the request never left the browser, so there is no server
 * verdict to interpret. In particular it must never be treated as a 401 and
 * must never trigger a logout — the user's Firebase session is still valid,
 * we simply could not read a fresh token yet.
 */
export class AuthUnavailableError extends Error {
  /** Discriminator usable across bundle/instance boundaries. */
  readonly isAuthUnavailable = true as const;

  constructor(
    /** URL of the request that was stopped locally. */
    readonly url: string,
    message = 'Authentication is temporarily unavailable (no network / token refresh pending).',
  ) {
    super(message);
    this.name = 'AuthUnavailableError';
    // Required so `instanceof` works after TS downlevelling to ES5 targets.
    Object.setPrototypeOf(this, AuthUnavailableError.prototype);
  }
}

/** Type guard that survives duplicate class identities across chunks. */
export function isAuthUnavailableError(err: unknown): err is AuthUnavailableError {
  return !!err && (err as AuthUnavailableError).isAuthUnavailable === true;
}

/**
 * True for errors that mean "the request could not reach the server", as
 * opposed to a real server verdict. Used to keep connectivity problems from
 * being mistaken for auth failures.
 *
 * `status === 0` is Angular's representation of a transport-level failure
 * (offline, DNS, TLS, CORS preflight, aborted). It is a *hint*, not proof of
 * being offline — CORS and DNS misconfiguration produce it while online.
 */
export function isTransportError(err: unknown): boolean {
  if (isAuthUnavailableError(err)) {
    return true;
  }
  return !!err && typeof err === 'object' && (err as { status?: number }).status === 0;
}
