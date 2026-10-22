// Mines real agent conversations for eval cases, as love, coffee keeps whole
// conversations from real chats (LC:tests/evals/assistant/real-chats):
//
//   npx tsx --env-file-if-exists=../.env --env-file-if-exists=.env.local tests/evals/traces/mine-agent-chats.ts
//
// Reads the conversations of the users listed in AGENT_EVAL_MINE_USER_IDS
// (.env.local, comma-separated: the owner, test accounts, or users who
// agreed) with the service-role database, masks them (maskMinedAgentChat),
// and writes one JSON file per conversation to .eval/agent/mined/, which
// git ignores. Nothing unmasked is written, and nothing leaves the machine.
// The owner reviews the files; a reviewed conversation becomes a case in
// an eval case in tests/evals/agent/, its wording kept as the user wrote
// it, with an `incident` entry in .eval/agent/dataset/case-sources.json.

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

import { Config, Effect, Layer, Predicate, Schema } from "effect";

import { maskLangfuseTraceData } from "@/server/integrations/langfuse-tracing.server";

import { isJsonArrayValue } from "../../../backend/shared/schema/json-value";
import { SupabaseServiceDatabase } from "../../../backend/shared/supabase/supabase-service-database";

const minedAgentChatsDirectory = ".eval/agent/mined";

// Keys whose value names a person wherever they appear. EXAMPLE keys: add
// each field of your tools' results that holds a person's or a company's
// name.
const minedNameKeys: ReadonlySet<string> = new Set([
  "authorName",
  "contactName",
  "senderName",
  "recipientName",
]);

// An account id on an outside service: digits only, 9 to 20 of them.
const minedAccountIdPattern = /(?<!\d)\d{9,20}(?!\d)/gu;

const isMinedObject = (value: Schema.Json): value is Schema.JsonObject =>
  Predicate.isObject(value) && !Array.isArray(value);

// The names in the conversation: the values of the name keys.
const collectMinedNames = (value: Schema.Json, names: Set<string>) => {
  if (isJsonArrayValue(value)) {
    for (const item of value) {
      collectMinedNames(item, names);
    }

    return;
  }

  if (!isMinedObject(value)) {
    return;
  }

  for (const [key, item] of Object.entries(value)) {
    if (
      Predicate.isString(item) &&
      item.trim() !== "" &&
      minedNameKeys.has(key)
    ) {
      names.add(item);
    }

    collectMinedNames(item, names);
  }
};

/**
 * A conversation (its stored rows, as JSON) with phones and emails masked
 * (maskLangfuseTraceData), each name collected above replaced by a stable
 * placeholder, and each account id by a stable fake id of the same shape. The same name or id gets the same placeholder
 * everywhere in the conversation, so a case still reads coherently.
 *
 * @param chat - The conversation's rows, as JSON.
 * @returns The masked conversation.
 */
export const maskMinedAgentChat = (chat: Schema.Json): Schema.Json => {
  const names = new Set<string>();
  collectMinedNames(chat, names);

  // Longest first, so a name inside a longer one is not replaced first.
  const placeholders = [...names]
    .toSorted((a, b) => b.length - a.length)
    .map((name, index) => [name, `[name ${index + 1}]`] as const);

  const fakeIds = new Map<string, string>();

  const maskText = (text: string) => {
    let masked = String(maskLangfuseTraceData({ data: text }));

    for (const [name, placeholder] of placeholders) {
      masked = masked.replaceAll(name, placeholder);
    }

    return masked.replaceAll(minedAccountIdPattern, (id) => {
      const fake =
        fakeIds.get(id) ??
        `9${String(fakeIds.size + 1).padStart(id.length - 1, "0")}`;

      fakeIds.set(id, fake);

      return fake;
    });
  };

  const mask = (value: Schema.Json): Schema.Json => {
    if (Predicate.isString(value)) {
      return maskText(value);
    }

    if (Array.isArray(value)) {
      return value.map(mask);
    }

    if (isMinedObject(value)) {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, mask(item)])
      );
    }

    return value;
  };

  return mask(chat);
};

// The stored rows as JSON (supabase-js types JSON columns loosely).
const decodeMinedAgentChat = Schema.decodeUnknownSync(Schema.Json);

const mineAgentChats = Effect.gen(function* mineAgentChats() {
  const userIds = (yield* Config.String("AGENT_EVAL_MINE_USER_IDS"))
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id !== "");

  const supabase = yield* (yield* SupabaseServiceDatabase).client;

  const conversations = yield* Effect.promise(() =>
    supabase
      .from("agent_chat_conversations")
      .select("id, name, created_at")
      .in("user_id", userIds)
      .order("created_at")
  );

  if (conversations.error) {
    return yield* Effect.die(conversations.error);
  }

  mkdirSync(minedAgentChatsDirectory, { recursive: true });

  for (const conversation of conversations.data) {
    const messages = yield* Effect.promise(() =>
      supabase
        .from("agent_chat_messages")
        .select("role, parts, created_at")
        .eq("conversation_id", conversation.id)
        .order("created_at")
    );

    if (messages.error) {
      return yield* Effect.die(messages.error);
    }

    // The file is named by a hash, so the conversation's id is not kept.
    const file = createHash("sha256")
      .update(conversation.id)
      .digest("hex")
      .slice(0, 12);

    writeFileSync(
      `${minedAgentChatsDirectory}/${file}.json`,
      JSON.stringify(
        maskMinedAgentChat(
          decodeMinedAgentChat({
            name: conversation.name,
            createdAt: conversation.created_at,
            messages: messages.data,
          })
        ),
        null,
        1
      )
    );
  }

  yield* Effect.log(
    `Mined ${conversations.data.length} conversations of ${userIds.length} users into ${minedAgentChatsDirectory}`
  );

  return yield* Effect.void;
});

if (import.meta.main) {
  await Effect.runPromise(
    mineAgentChats.pipe(
      Effect.provide(Layer.fresh(SupabaseServiceDatabase.layer))
    )
  );
}
