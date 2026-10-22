import { Effect, Schema } from "effect";

import { runAppRequest } from "@/server/runtime/app-runtime.server";
import { createServerFn } from "@/server/runtime/server-function";
import { signedInSupabaseClient } from "@/server/runtime/supabase-client";

import { toStandardSchema } from "../../../backend/shared/schema/standard-schema";

// The signed-in user's agent session, for the app's pages: the agent's id
// for them (agent_users), which every per-user server function and chat
// request names (userIdServerInput, the chat body's userId), as the
// template's pages read the user id from their Supabase session. KeepInTax
// signs in with Firebase; the agent maps the verified uid to this id.

/**
 * The signed-in user's agent id, read on the server.
 *
 * @returns A promise of the session: the user's agent id.
 */
export const readAgentSession = createServerFn({ method: "GET" })
  .validator(toStandardSchema(Schema.Record(Schema.String, Schema.Unknown)))
  .handler(
    async () =>
      await runAppRequest(
        Effect.gen(function* readAgentSessionHandler() {
          const supabase = yield* signedInSupabaseClient;

          const { data } = yield* Effect.promise(
            async () => await supabase.auth.getClaims()
          );

          return { userId: data?.claims.sub ?? null };
        })
      )
  );
