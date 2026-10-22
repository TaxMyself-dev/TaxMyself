import { Context, Effect, Layer } from "effect";

import {
  createUserDatabaseClient,
  resolveAgentUserId,
} from "../../../backend/shared/mysql/mysql-agent-clients";
import type { AgentDatabaseClient } from "../../../backend/shared/mysql/mysql-agent-clients";
import { AgentMysqlDatabase } from "../../../backend/shared/mysql/mysql-agent-database";
import { AgentRequestIdentity } from "./agent-request-identity";

// The signed-in user's client: every query runs scoped to their rows (the
// MySQL gateway's row level security, backend/shared/mysql). The template
// read the user from the request's Supabase cookies; in KeepInTax the Nest
// backend verifies the request's Firebase token (FirebaseAuthGuard) and
// hands the agent the verified user (AgentRequestIdentity), and the agent
// maps the Firebase uid to its own user id (agent_users).

/**
 * The signed-in user's client, for modules that receive it as a parameter.
 */
export type UserSupabaseClient = AgentDatabaseClient;

/**
 * The signed-in user's client for the request being served. Every edge (a
 * server function, an API route) provides SupabaseRequestClient.layer per
 * request through runAppRequest (app-runtime.server.ts); tests provide their
 * own client with Layer.succeed. The client is created on first use, so a
 * request turned away before it reads the session never creates one.
 * Without the database's configuration the layer still builds and the first
 * use dies with `DATABASE_NOT_CONFIGURED: …`.
 */
export class SupabaseRequestClient extends Context.Service<
  SupabaseRequestClient,
  { readonly client: Effect.Effect<UserSupabaseClient> }
>()("app/server/SupabaseRequestClient") {
  static readonly layer = Layer.effect(
    SupabaseRequestClient,
    Effect.gen(function* makeSupabaseRequestClient() {
      const identity = yield* AgentRequestIdentity;
      const { database } = yield* AgentMysqlDatabase;

      const client = yield* Effect.cached(
        Effect.gen(function* createRequestClient() {
          const connected = yield* Effect.orDie(database);

          const userId = yield* Effect.promise(
            async () =>
              await resolveAgentUserId(connected, identity.actorFirebaseId)
          );

          return createUserDatabaseClient(connected, userId);
        })
      );

      return SupabaseRequestClient.of({ client });
    })
  );
}

/**
 * The request's signed-in user's client (see SupabaseRequestClient).
 */
export const signedInSupabaseClient = Effect.gen(
  function* readSignedInSupabaseClient() {
    const request = yield* SupabaseRequestClient;

    return yield* request.client;
  }
);
