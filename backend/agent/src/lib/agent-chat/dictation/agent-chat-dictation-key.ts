import { Effect, Schema } from "effect";

import { userIdServerInput } from "@/lib/auth/user-id-server-input";
import { createSonioxDictationKey } from "@/server/integrations/soniox.server";
import { runAppRequest } from "@/server/runtime/app-runtime.server";
import { createServerFn } from "@/server/runtime/server-function";
import { createOwnedSupabaseClient } from "@/server/user-data/user-page-state.server";

import { toStandardSchema } from "../../../../backend/shared/schema/standard-schema";
import { agentDictationLimit } from "./agent-chat-dictation-limit";

class DictationRateLimitError extends Schema.TaggedError<DictationRateLimitError>()(
  "DictationRateLimitError",
  {}
) {
  override readonly message =
    "DICTATION_RATE_LIMITED: too many recordings; try again in a minute";
}

/**
 * A signed-in user's key for one dictation (createSonioxDictationKey).
 */
export const createAgentChatDictationKey = createServerFn({ method: "POST" })
  .validator(toStandardSchema(userIdServerInput))
  .handler(
    async ({ data }) =>
      await runAppRequest(
        Effect.gen(function* issueDictationKey() {
          yield* createOwnedSupabaseClient(data.userId);

          if (!agentDictationLimit.take(data.userId)) {
            return yield* new DictationRateLimitError({});
          }

          return yield* createSonioxDictationKey();
        })
      )
  );
