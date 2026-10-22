/**
 * A request the gateway refuses or a statement MySQL refused, answered as
 * PostgREST answers an error: its HTTP status, and the JSON body supabase-js
 * reads into a query's error (code, message, details, hint). The codes are
 * Postgres' and PostgREST's, so an error reads the same as it would from
 * Supabase: 42501 a row level security refusal, 23505 a duplicate key,
 * PGRST116 a single() that did not find one row.
 */
export class PostgrestGatewayError extends Error {
  override readonly name = "PostgrestGatewayError";
  readonly status: number;
  readonly code: string;
  readonly details: string | null;

  /**
   * @param status - The HTTP status PostgREST answers with.
   * @param code - The Postgres or PostgREST error code.
   * @param message - What went wrong.
   * @param details - More about it, when there is more.
   */
  constructor(
    status: number,
    code: string,
    message: string,
    details: string | null = null
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * The refusal a row level security policy gives a row that is not the user's.
 *
 * @param table - The table.
 * @returns The error.
 */
export const rowLevelSecurityError = (table: string) =>
  new PostgrestGatewayError(
    403,
    "42501",
    `new row violates row-level security policy for table "${table}"`
  );

/**
 * The refusal for a table or column the user has no grant on.
 *
 * @param table - The table.
 * @returns The error.
 */
export const permissionDeniedError = (table: string) =>
  new PostgrestGatewayError(
    403,
    "42501",
    `permission denied for table ${table}`
  );
