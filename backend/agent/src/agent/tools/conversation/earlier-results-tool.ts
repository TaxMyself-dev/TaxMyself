import { tool } from "ai";
import { Effect, Option, Schema } from "effect";

import { findEarlierChat } from "@/agent/chat/messages/agent-chat-earlier-results";
import type { EarlierChatMessage } from "@/agent/chat/messages/agent-chat-earlier-results";
import { appRuntime } from "@/server/runtime/app-runtime.server";
import { runSupabaseQuery } from "@/server/runtime/supabase-query";

import { toStandardSchema } from "../../../../backend/shared/schema/standard-schema";
import { agentToolContextSchema } from "../../core/tool-runtime/agent-tool-context";
import { agentToolModelOutput } from "../../core/tool-runtime/agent-tool-output";

// What this chat said and found before, without searching again
// (agent-chat-earlier-results.ts): no outside or paid read. It reads
// the saved messages' parts as stored JSON: the chat's message types come
// from the agent's tools, so this tool cannot use them.

const earlierResultsMax = 10;

const decodeStoredParts = Schema.decodeUnknownOption(Schema.Array(Schema.Json));

// Each saved message's role and parts; one whose parts are not a list adds
// none.
const storedChatMessages = (
  rows: readonly { role: string; parts: unknown }[]
): EarlierChatMessage[] =>
  rows.map(({ role, parts }) => ({
    role,
    parts: Option.getOrElse(
      decodeStoredParts(parts),
      (): readonly Schema.Json[] => []
    ),
  }));

export const searchEarlierResultsTool = tool({
  description:
    "Find what this chat already said and found (search results, records) by words: each item in full (link, description, price) and the messages that mention them. Use it before searching again, and for the older part of the chat. words: all must appear (a company, a street).",
  inputSchema: toStandardSchema(
    Schema.Struct({
      words: Schema.Trim.check(Schema.isMinLength(2), Schema.isMaxLength(80)),
    })
  ),
  contextSchema: agentToolContextSchema,
  execute: async ({ words }, { context, abortSignal }) =>
    await appRuntime.runPromise(
      runSupabaseQuery("AGENT_CHAT_READ_FAILED", () =>
        context.supabase
          .from("agent_chat_messages")
          .select("role, parts")
          .eq("conversation_id", context.conversationId)
          .order("created_at")
      ).pipe(
        // The user's message this answer replies to is saved first; it is
        // the question, not something said earlier (Rakazo's history search
        // leaves it out too).
        Effect.map(({ data }) =>
          findEarlierChat(
            storedChatMessages(
              data.at(-1)?.role === "user" ? data.slice(0, -1) : data
            ),
            words,
            earlierResultsMax
          )
        )
      ),
      { signal: abortSignal }
    ),
  toModelOutput: ({ output, toolCallId }) =>
    agentToolModelOutput({ output, toolCallId }),
});
