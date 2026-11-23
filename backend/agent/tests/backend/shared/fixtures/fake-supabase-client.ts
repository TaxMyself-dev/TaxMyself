import { createClient } from "@supabase/supabase-js";
import { Schema } from "effect";

import type { Database } from "../../../../src/lib/supabase/supabase-database";

/**
 * The auth answers a scenario's session gives: its claims, and the session
 * the app server forwards the user's token from.
 */
export interface FakeSupabaseAuth {
  readonly getClaims: () => Promise<{
    data: { claims: Record<string, string> } | null;
    error: null;
  }>;
  readonly getSession?: () => Promise<{
    // Supabase answers a signed-out session as null.
    data: { session: { user: { id: string }; access_token: string } | null };
    error: null;
  }>;
}

/**
 * A real Supabase client of the test project whose requests the fake fetch
 * answers (PostgREST at https://test.supabase.co/rest/v1/...), with auth's
 * claims and session replaced by the scenario's, so a test sees the queries
 * the code under test builds.
 *
 * @param fetchDatabase - Answers the client's PostgREST requests.
 * @param auth - The auth methods the scenario replaces.
 * @returns The client.
 */
export const makeFakeSupabaseClient = (
  fetchDatabase: typeof globalThis.fetch,
  auth: FakeSupabaseAuth
) => {
  const supabase = createClient<Database>(
    "https://test.supabase.co",
    "test-publishable-key",
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: { fetch: fetchDatabase },
      db: { retry: false },
    }
  );

  Object.assign(supabase.auth, auth);

  return supabase;
};

/**
 * A client for code that takes one but, in the test, reads nothing: any
 * database read fails with FAKE_SUPABASE_UNUSED.
 *
 * @returns The client.
 */
export const makeUnusedSupabaseClient = () =>
  makeFakeSupabaseClient(
    async () =>
      await Promise.reject(
        new Error("FAKE_SUPABASE_UNUSED: this test reads no database")
      ),
    {
      getClaims: async () => await Promise.resolve({ data: null, error: null }),
    }
  );

const decodeRowValues = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Record(Schema.String, Schema.Json))
);

/**
 * A PostgREST request as a fake fetch receives it: the table (or rpc/name),
 * the method, the eq filters in order, and the JSON body.
 *
 * @param input - The fetch's input.
 * @param init - The fetch's options.
 * @returns The table, method, eq filters and body.
 */
export const readPostgrestRequest = (
  input: string | URL | Request,
  init: RequestInit | undefined
) => {
  const url = new URL(input instanceof Request ? input.url : input);
  const body = init?.body ?? null;

  return {
    path: url.pathname.replace("/rest/v1/", ""),
    method: init?.method ?? "GET",
    filters: [...url.searchParams].flatMap(([field, value]) =>
      value.startsWith("eq.") ? [[field, value.slice(3)] as const] : []
    ),
    body: body === null ? null : decodeRowValues(body),
  };
};
