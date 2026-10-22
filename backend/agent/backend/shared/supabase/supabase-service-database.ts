import { Context, Effect, Layer } from "effect";

import { createServiceDatabaseClient } from "../mysql/mysql-agent-clients";
import type { AgentDatabaseClient } from "../mysql/mysql-agent-clients";
import { AgentMysqlDatabase } from "../mysql/mysql-agent-database";
import { SupabaseNotConfiguredError } from "./supabase-not-configured-error";

// The service client server code builds from configuration. In KeepInTax
// the agent's tables live in the app's MySQL, answered through the gateway
// (backend/shared/mysql), so this is a supabase-js client over it rather
// than a Supabase project's service-role key. Without the database's
// configuration the layer still builds and each request for a client fails
// with SupabaseNotConfiguredError, which every caller maps to its own code.

/**
 * A supabase-js client typed with the app's database.
 */
export type SupabaseDatabaseClient = AgentDatabaseClient;

/**
 * The service client (the template's service role), which reaches every
 * user's rows: the one definition. Only modules that expose narrow
 * operations over it may use it (the task monitor's TaskMonitorStore),
 * never code that answers a user's request. Created on first use and shared.
 */
export class SupabaseServiceDatabase extends Context.Service<
  SupabaseServiceDatabase,
  {
    readonly client: Effect.Effect<
      SupabaseDatabaseClient,
      SupabaseNotConfiguredError
    >;
  }
>()("app/shared/SupabaseServiceDatabase") {
  static readonly layer = Layer.effect(
    SupabaseServiceDatabase,
    Effect.gen(function* makeSupabaseServiceDatabase() {
      const { database } = yield* AgentMysqlDatabase;

      const client = yield* Effect.cached(
        database.pipe(
          Effect.map(createServiceDatabaseClient),
          Effect.mapError(
            (error) => new SupabaseNotConfiguredError({ keys: error.keys })
          )
        )
      );

      return SupabaseServiceDatabase.of({ client });
    })
  ).pipe(Layer.provide(AgentMysqlDatabase.layer));
}
