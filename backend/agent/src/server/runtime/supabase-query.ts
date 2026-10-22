import type { PostgrestSingleResponse } from "@supabase/supabase-js";
import { Effect, Schema } from "effect";

import type { SerializableValue } from "../../../backend/shared/schema/json-value";
import { SupabaseServiceDatabase } from "../../../backend/shared/supabase/supabase-service-database";
import type { SupabaseDatabaseClient } from "../../../backend/shared/supabase/supabase-service-database";

/**
 * A failed Supabase query or RPC. Its message, `<CODE>: <Supabase's message>`
 * (USER_SETTINGS_READ_FAILED: …), is what clients, tests and logs match on.
 */
export class SupabaseQueryError extends Schema.TaggedError<
  SupabaseQueryError,
  { readonly brand: unique symbol }
>()("SupabaseQueryError", { code: Schema.String, detail: Schema.String }) {
  /**
   * The error as `<CODE>: <detail>`.
   *
   * @returns The code and detail, as one line.
   */
  override get message() {
    return `${this.code}: ${this.detail}`;
  }
}

/**
 * One query or RPC: its data and count, or the operation's failure code with
 * Supabase's message (a rejected request fails the same way).
 */
export const runSupabaseQuery = Effect.fnUntraced(function* runSupabaseQuery<
  Data,
>(
  code: string,
  query: () => PromiseLike<PostgrestSingleResponse<Data>>
): Effect.fn.Return<{ data: Data; count: number | null }, SupabaseQueryError> {
  const response = yield* Effect.tryPromise({
    try: () => query(),
    catch: (cause) => new SupabaseQueryError({ code, detail: String(cause) }),
  });

  if (response.error) {
    return yield* new SupabaseQueryError({
      code,
      detail: response.error.message,
    });
  }

  return response;
});

/**
 * A value read from Supabase (a row, a snapshot, an RPC's answer) decoded
 * with its schema; one of another shape fails with the operation's code, as a
 * failed query does: `<CODE>: <the schema's issue>`.
 *
 * @param code - The operation's error code.
 * @param schema - The schema to decode with.
 * @returns A function that decodes a value as an Effect failing with
 *   SupabaseQueryError.
 */
export const decodeSupabaseValue =
  <S extends Schema.ConstraintDecoder<unknown>>(code: string, schema: S) =>
  (value: SerializableValue) =>
    Schema.decodeEffect(schema)(value).pipe(
      Effect.mapError(
        (issue) => new SupabaseQueryError({ code, detail: issue.message })
      )
    );

/**
 * runSupabaseQuery with the service-role client (SupabaseServiceDatabase),
 * for the shared catalogs only. Missing configuration fails with the
 * operation's code, as a query that cannot be sent does:
 * `<CODE>: Error: SUPABASE_NOT_CONFIGURED: …`.
 */
export const runServiceDatabaseQuery = Effect.fnUntraced(
  function* runServiceDatabaseQuery<Data>(
    code: string,
    query: (
      client: SupabaseDatabaseClient
    ) => PromiseLike<PostgrestSingleResponse<Data>>
  ): Effect.fn.Return<
    { data: Data; count: number | null },
    SupabaseQueryError,
    SupabaseServiceDatabase
  > {
    const database = yield* SupabaseServiceDatabase;

    const client = yield* database.client.pipe(
      Effect.mapError(
        (error) =>
          new SupabaseQueryError({
            code,
            detail: String(new Error(error.message)),
          })
      )
    );

    return yield* runSupabaseQuery(code, () => query(client));
  }
);
