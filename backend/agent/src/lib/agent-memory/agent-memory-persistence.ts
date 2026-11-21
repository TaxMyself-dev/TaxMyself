import { Effect, Schema } from "effect";

import {
  deleteStoredAgentMemories,
  readStoredAgentMemories,
} from "@/agent/memory/long-term-memory.server";
import type { AgentMemory } from "@/lib/agent-memory/agent-memory-schema";
import { userIdServerInput } from "@/lib/auth/user-id-server-input";
import { runAppRequest } from "@/server/runtime/app-runtime.server";
import { createServerFn } from "@/server/runtime/server-function";
import { createOwnedSupabaseClient } from "@/server/user-data/user-page-state.server";

import { toStandardSchema } from "../../../backend/shared/schema/standard-schema";

// What the agent remembers about the user, for הגדרות > זיכרון הסוכן (see
// long-term-memory.server.ts).

/**
 * What the agent remembers about the user, read on the server.
 *
 * @param context - data: the signed-in user's id.
 * @returns A promise of the memories.
 */
export const readAgentMemories = createServerFn({ method: "GET" })
  .validator(toStandardSchema(userIdServerInput))
  .handler(
    async ({ data }): Promise<AgentMemory[]> =>
      await runAppRequest(
        Effect.gen(function* readAgentMemoriesHandler() {
          const supabase = yield* createOwnedSupabaseClient(data.userId);

          return yield* readStoredAgentMemories(supabase);
        })
      )
  );

/**
 * Forgets one remembered thing, on the server.
 *
 * @param context - data: the signed-in user's id and the memory's id.
 * @returns A promise that settles once it is forgotten.
 */
export const deleteAgentMemory = createServerFn({ method: "POST" })
  .validator(
    toStandardSchema(
      Schema.Struct({
        ...userIdServerInput.fields,
        memoryId: Schema.String.check(Schema.isUUID()),
      })
    )
  )
  .handler(async ({ data }) => {
    await runAppRequest(
      Effect.gen(function* deleteAgentMemoryHandler() {
        const supabase = yield* createOwnedSupabaseClient(data.userId);
        yield* deleteStoredAgentMemories(supabase, [data.memoryId]);
      })
    );
  });
