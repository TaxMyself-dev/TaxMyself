import { validateUIMessages } from "ai";
import { DateTime, Effect, Predicate, Schema } from "effect";
import { forEach as effectForEach } from "effect/Effect";

import { appAgentTools } from "@/agent/core/tool-runtime/app-agent-tools";
import { agentChatMessageMetadataSchema } from "@/lib/agent-chat/conversation/agent-chat-messages";
import type { AgentChatMessage } from "@/lib/agent-chat/conversation/agent-chat-messages";
import type { Database } from "@/lib/supabase/supabase-database";
import type { UserSupabaseClient } from "@/server/runtime/supabase-client";
import {
  decodeSupabaseValue,
  runSupabaseQuery,
} from "@/server/runtime/supabase-query";
import type { SupabaseQueryError } from "@/server/runtime/supabase-query";

import { toStandardSchema } from "../../../../backend/shared/schema/standard-schema";
import { isNonEmptyText } from "../../../../backend/shared/text/non-empty-text";

// The agent chat's messages in agent_chat_messages, one row per UI message
// with its parts as they are. Every read is validated against the agent's
// tools, so a stored message the agent can no longer read fails loudly.

type AgentChatMessageRow = Pick<
  Database["public"]["Tables"]["agent_chat_messages"]["Row"],
  "id" | "role" | "parts" | "created_at" | "finished_at"
>;

const agentChatMessageColumns = "id, role, parts, created_at, finished_at";

/**
 * A message the agent cannot read: its message is the AI SDK's validation
 * error's own.
 */
export class AgentChatMessageInvalidError extends Schema.TaggedError<
  AgentChatMessageInvalidError,
  { readonly brand: unique symbol }
>()("AgentChatMessageInvalidError", { cause: Schema.Defect() }) {
  /**
   * The validation failure's own message.
   *
   * @returns The cause's message, or the cause as text.
   */
  override get message() {
    return this.cause instanceof Error
      ? this.cause.message
      : String(this.cause);
  }
}

/**
 * Checks messages against the agent's tools and the message metadata; it
 * fails on a message the agent cannot read.
 *
 * @param messages - The messages to check, as stored or sent.
 * @returns An effect with the messages, typed, or the validation failure.
 */
export const validateAgentChatMessages = (messages: unknown[]) =>
  Effect.tryPromise({
    try: async () =>
      await validateUIMessages<AgentChatMessage>({
        messages,
        metadataSchema: toStandardSchema(agentChatMessageMetadataSchema),
        tools: appAgentTools,
      }),
    catch: (cause) => new AgentChatMessageInvalidError({ cause }),
  });

// Postgres answers "…+00:00"; the metadata holds the "…Z" form. An answer
// saved before finished_at existed, and every user message, has no
// finishedAt.
const agentChatRowMetadata = (row: AgentChatMessageRow) => {
  const createdAt = new Date(row.created_at).toISOString();

  return isNonEmptyText(row.finished_at)
    ? { createdAt, finishedAt: new Date(row.finished_at).toISOString() }
    : { createdAt };
};

/**
 * Stored message rows as the chat's messages, checked like any other.
 *
 * @param rows - The conversation's stored rows.
 * @returns An effect with the messages.
 */
export const readAgentChatMessageRows = (rows: AgentChatMessageRow[]) =>
  validateAgentChatMessages(
    rows.map((row) => ({
      id: row.id,
      role: row.role,
      parts: row.parts,
      metadata: agentChatRowMetadata(row),
    }))
  );

/**
 * Explicit pages avoid PostgREST's maximum-row limit truncating the history,
 * including when several conversations are loaded together for the sidebar.
 */
export const readStoredAgentChatRows = Effect.fn("readStoredAgentChatRows")(
  function* readStoredAgentChatRows(
    supabase: UserSupabaseClient,
    conversationIds: string[]
  ): Effect.fn.Return<
    (AgentChatMessageRow & { conversation_id: string })[],
    SupabaseQueryError
  > {
    const rows: (AgentChatMessageRow & { conversation_id: string })[] = [];
    const pageSize = 1000;

    if (conversationIds.length === 0) {
      return rows;
    }

    // The next offset is needed only after a full page.
    for (let offset = 0; ; offset += pageSize) {
      const { data } = yield* runSupabaseQuery("AGENT_CHAT_READ_FAILED", () =>
        supabase
          .from("agent_chat_messages")
          .select(`conversation_id, ${agentChatMessageColumns}`)
          .in("conversation_id", conversationIds)
          .order("created_at")
          .order("id")
          .range(offset, offset + pageSize - 1)
      );

      rows.push(...data);

      if (data.length < pageSize) {
        return rows;
      }
    }
  }
);

/**
 * A conversation's messages, oldest first.
 */
export const readStoredAgentChatMessages = Effect.fn(
  "readStoredAgentChatMessages"
)(function* readStoredAgentChatMessages(
  supabase: UserSupabaseClient,
  conversationId: string
): Effect.fn.Return<
  AgentChatMessage[],
  SupabaseQueryError | AgentChatMessageInvalidError
> {
  const rows = yield* readStoredAgentChatRows(supabase, [conversationId]);

  return rows.length === 0 ? [] : yield* readAgentChatMessageRows(rows);
});

// Attached files are sent to the model once, as data URLs; the stored
// message keeps their name and type only (the url is emptied), so the
// database never holds file contents.
const storableAgentChatParts = (message: AgentChatMessage) =>
  message.parts.map((part) =>
    part.type === "file" && part.url.startsWith("data:")
      ? { ...part, url: "" }
      : part
  );

// The parts as stored JSON. Serializing first drops the fields the AI SDK
// leaves undefined (JSON has no undefined), as the database's JSON would;
// Schema.Json then checks what is left is JSON.
const decodeAgentChatStoredParts = decodeSupabaseValue(
  "AGENT_CHAT_WRITE_FAILED",
  Schema.fromJsonString(Schema.Json)
);

// The database caps a message's parts at 256 KB
// (agent_chat_messages_parts_check); a budget under it, in UTF-8 bytes of
// the JSON, leaves room for its own encoding.
const agentChatPartsMaxBytes = 230_000;

// The lengths long texts in tool results are cut to, in turn, until the
// parts fit.
const agentChatPartsTextCuts = [400, 200, 100, 50];

const agentChatJsonBytes = (value: Schema.Json) =>
  new TextEncoder().encode(JSON.stringify(value)).byteLength;

// Whether the JSON is an object (not a list or a plain value).
const isJsonObject = (value: Schema.Json): value is Schema.JsonObject =>
  Predicate.isObject(value) && !Array.isArray(value);

// The JSON with every text changed by change.
const mapJsonTexts = (
  value: Schema.Json,
  change: (text: string) => string
): Schema.Json => {
  if (Predicate.isString(value)) {
    return change(value);
  }

  if (isJsonObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        mapJsonTexts(item, change),
      ])
    );
  }

  if (Array.isArray(value)) {
    return value.map((item: Schema.Json) => mapJsonTexts(item, change));
  }

  return value;
};

// Half of an emoji or other paired character, left alone by a cut (with
// the u flag, a whole pair is one character and never matches).
const loneSurrogate = /[\uD800-\uDFFF]/gu;

const wholeCharacters = (text: string) => text.replaceAll(loneSurrogate, "");

// The JSON with every string longer than max cut to it, never splitting a
// character.
const cutLongTexts = (value: Schema.Json, max: number): Schema.Json =>
  mapJsonTexts(value, (text) =>
    text.length > max ? `${wholeCharacters(text.slice(0, max))}…` : text
  );

// Whether the part is a tool call's, with its result.
const isToolOutputPart = (part: Schema.JsonObject) => {
  const { type, output } = part;

  return (
    Predicate.isString(type) && type.startsWith("tool-") && output !== undefined
  );
};

// A tool call's part with its long texts cut; any other part as it is.
const cutToolOutputTexts = (part: Schema.Json, max: number): Schema.Json =>
  isJsonObject(part) && isToolOutputPart(part)
    ? Object.fromEntries(
        Object.entries(part).map(([key, item]) => [
          key,
          key === "output" ? cutLongTexts(item, max) : item,
        ])
      )
    : part;

/**
 * A message's stored parts that fit the database's cap: as they are when
 * they fit; otherwise the long texts in tool results (their output) cut
 * shorter, step by step, until they do. The answer's own text is never cut.
 * Before, an answer continued after an approval held both runs' tool
 * results, went past the cap, and was not saved at all (2026-10-16).
 *
 * @param parts - The message's parts, as stored JSON.
 * @returns The parts, fitting when cutting tool results can make them.
 */
export const fitAgentChatPartsToStorage = (parts: Schema.Json): Schema.Json => {
  if (
    !Array.isArray(parts) ||
    agentChatJsonBytes(parts) <= agentChatPartsMaxBytes
  ) {
    return parts;
  }

  let fitted: Schema.Json = parts;

  for (const max of agentChatPartsTextCuts) {
    fitted = parts.map((part: Schema.Json) => cutToolOutputTexts(part, max));

    if (agentChatJsonBytes(fitted) <= agentChatPartsMaxBytes) {
      return fitted;
    }
  }

  return fitted;
};

// Every text in whole characters: a text cut at a fixed length (a tool's
// preview, fitAgentChatPartsToStorage) can end in half an emoji, which the
// database refuses as invalid JSON, losing the whole answer (2026-10-17).
const agentChatStoredParts = (message: AgentChatMessage) =>
  decodeAgentChatStoredParts(
    JSON.stringify(storableAgentChatParts(message))
  ).pipe(
    Effect.map((parts) =>
      fitAgentChatPartsToStorage(mapJsonTexts(parts, wholeCharacters))
    )
  );

/**
 * Saves new or changed messages of a conversation.
 */
export const writeStoredAgentChatMessages = Effect.fn(
  "writeStoredAgentChatMessages"
)(function* writeStoredAgentChatMessages(
  supabase: UserSupabaseClient,
  conversationId: string,
  messages: AgentChatMessage[]
): Effect.fn.Return<void, SupabaseQueryError> {
  const now = DateTime.formatIso(yield* DateTime.now);

  const rows = yield* effectForEach(messages, (message) =>
    agentChatStoredParts(message).pipe(
      Effect.map((parts) => ({
        id: message.id,
        conversation_id: conversationId,
        role: message.role,
        parts,
        created_at: message.metadata?.createdAt ?? now,
        finished_at: message.metadata?.finishedAt ?? null,
      }))
    )
  );

  yield* runSupabaseQuery("AGENT_CHAT_WRITE_FAILED", () =>
    supabase.from("agent_chat_messages").upsert(rows)
  );
});

/**
 * Deletes stored chat messages by id, as the signed-in user (RLS keeps it to
 * their own).
 *
 * @param supabase - The user's Supabase client.
 * @param messageIds - The ids of the messages to delete.
 */
export const deleteStoredAgentChatMessages = Effect.fn(
  "deleteStoredAgentChatMessages"
)(function* deleteStoredAgentChatMessages(
  supabase: UserSupabaseClient,
  messageIds: string[]
): Effect.fn.Return<void, SupabaseQueryError> {
  if (messageIds.length === 0) {
    return;
  }

  yield* runSupabaseQuery("AGENT_CHAT_DELETE_FAILED", () =>
    supabase.from("agent_chat_messages").delete().in("id", messageIds)
  );
});
