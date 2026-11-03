import { Predicate, Schema } from "effect";

import type { EmailSender, WebSearch } from "@/agent/core/ports/example-ports";
import type { KeepInTaxBooks } from "@/agent/core/ports/keepintax-ports";
import type {
  TaskOpportunityStore,
  TrackingTaskStore,
} from "@/agent/core/ports/tracking-task-ports";
import type { AgentChatPageData } from "@/agent/core/tool-runtime/agent-chat-page-data-port";
import { userSettingsSchema } from "@/lib/settings/user-settings/user-settings-schema";
import type { UserSupabaseClient } from "@/server/runtime/supabase-client";

import { toStandardSchema } from "../../../../backend/shared/schema/standard-schema";

// What every agent tool receives from the request (see createAppAgent): the
// conversation, the signed-in user, their database client and settings, the
// ports to the outside world (tracking-task-ports.ts, KeepInTax's
// keepintax-ports.ts, and example-ports.ts: replace those with your
// domain's),
// and what it may show on the chat page beyond its answer
// (AgentChatPageData). The server builds the client, ports and page data
// itself, so they are checked only to be objects.
export const agentToolContextSchema = toStandardSchema(
  Schema.Struct({
    conversationId: Schema.String.check(Schema.isUUID()),
    userId: Schema.String.check(Schema.isUUID()),
    supabase: Schema.declare((value): value is UserSupabaseClient =>
      Predicate.isObject(value)
    ),
    settings: userSettingsSchema,
    tasks: Schema.declare((value): value is TrackingTaskStore =>
      Predicate.isObject(value)
    ),
    opportunities: Schema.declare((value): value is TaskOpportunityStore =>
      Predicate.isObject(value)
    ),
    webSearch: Schema.declare((value): value is WebSearch =>
      Predicate.isObject(value)
    ),
    email: Schema.declare((value): value is EmailSender =>
      Predicate.isObject(value)
    ),
    books: Schema.declare((value): value is KeepInTaxBooks =>
      Predicate.isObject(value)
    ),
    pageData: Schema.declare((value): value is AgentChatPageData =>
      Predicate.isObject(value)
    ),
  })
);

/**
 * What every tool call receives besides its input: the conversation, the user,
 * their clients, ports and page data.
 */
export type AgentToolContext = typeof agentToolContextSchema.Type;
