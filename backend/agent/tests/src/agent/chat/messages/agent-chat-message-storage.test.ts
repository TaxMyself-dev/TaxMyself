import { assert, effect as test } from "@effect/vitest";
import { createClient } from "@supabase/supabase-js";
import type { ProviderMetadata } from "ai";
import { Effect } from "effect";

import {
  readAgentChatMessageRows,
  readStoredAgentChatMessages,
  writeStoredAgentChatMessages,
} from "../../../../../src/agent/chat/messages/agent-chat-message-storage.server";
import type { Database } from "../../../../../src/lib/supabase/supabase-database";
import {
  fakeFetchBodyText,
  fakeFetchUrl,
} from "../../../../backend/shared/fixtures/fake-fetch-request";

const noTasksAnswer = "אין כרגע משימות";

// Parts as the AI SDK builds them: an optional field it was not given is
// still a key, set to undefined.
const sdkTextPart = (text: string, providerMetadata?: ProviderMetadata) => ({
  type: "text" as const,
  text,
  providerMetadata,
});

const sdkListedTasksPart = (title?: string) => ({
  type: "tool-listTrackingTasks" as const,
  toolCallId: "call_1",
  state: "output-available" as const,
  input: {},
  output: [],
  title,
});

test("stored messages read back with Postgres's timestamp format", () =>
  Effect.gen(function* storedMessagesReadBack() {
    const [question, answer] = yield* readAgentChatMessageRows([
      {
        id: "6f1c2a1e-1111-4a1a-8a1a-111111111111",
        role: "user",
        parts: [{ type: "text", text: "מה המשימות שלי?" }],
        created_at: "2026-10-04T14:02:11.123456+00:00",
        finished_at: null,
      },
      {
        id: "6f1c2a1e-2222-4a1a-8a1a-222222222222",
        role: "assistant",
        parts: [{ type: "text", text: noTasksAnswer }],
        created_at: "2026-10-04T14:02:12.000000+00:00",
        finished_at: "2026-10-04T14:02:24.500000+00:00",
      },
    ]);

    assert.deepStrictEqual(question.metadata, {
      createdAt: "2026-10-04T14:02:11.123Z",
    });
    assert.deepStrictEqual(answer.metadata, {
      createdAt: "2026-10-04T14:02:12.000Z",
      finishedAt: "2026-10-04T14:02:24.500Z",
    });
  }));

test("an answer saves even with the fields the AI SDK leaves undefined", () =>
  Effect.gen(function* answerSavesEvenFields() {
    const saved: unknown[] = [];

    const supabase = createClient<Database>(
      "https://chat-test.supabase.co",
      "test-publishable-key",
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          fetch: async (_request, options) => {
            saved.push(JSON.parse(fakeFetchBodyText(options?.body)));

            return await Promise.resolve(new Response(null, { status: 201 }));
          },
        },
      }
    );

    yield* writeStoredAgentChatMessages(supabase, "c1", [
      {
        id: "a1",
        role: "assistant",
        metadata: {
          createdAt: "2026-10-04T14:02:25.000Z",
          finishedAt: "2026-10-04T14:02:31.000Z",
        },
        parts: [sdkTextPart(noTasksAnswer), sdkListedTasksPart()],
      },
    ]);
    assert.deepStrictEqual(saved, [
      [
        {
          id: "a1",
          conversation_id: "c1",
          role: "assistant",
          parts: [
            { type: "text", text: noTasksAnswer },
            {
              type: "tool-listTrackingTasks",
              toolCallId: "call_1",
              state: "output-available",
              input: {},
              output: [],
            },
          ],
          created_at: "2026-10-04T14:02:25.000Z",
          finished_at: "2026-10-04T14:02:31.000Z",
        },
      ],
    ]);
  }));

test("a text cut in half an emoji saves in whole characters", () =>
  Effect.gen(function* halfEmojiSaves() {
    const saved: string[] = [];

    const supabase = createClient<Database>(
      "https://chat-test.supabase.co",
      "test-publishable-key",
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          fetch: async (_request, options) => {
            saved.push(fakeFetchBodyText(options?.body));

            return await Promise.resolve(new Response(null, { status: 201 }));
          },
        },
      }
    );

    // A text cut after the first half of 😀 (U+D83D U+DE00).
    const cutPreview = `דירה יפה ${"😀".slice(0, 1)}`;

    yield* writeStoredAgentChatMessages(supabase, "c1", [
      {
        id: "a1",
        role: "assistant",
        metadata: { createdAt: "2026-10-17T12:00:00.000Z" },
        parts: [sdkTextPart(cutPreview)],
      },
    ]);

    // Postgres refuses an escaped half (\\ud83d) as invalid JSON.
    assert.notInclude(saved[0] ?? "", "\\ud83d");
    assert.include(saved[0] ?? "", "דירה יפה ");
  }));

test("long conversations retain every message past the database row limit", () =>
  Effect.gen(function* longConversationsRetainEvery() {
    const rows = Array.from({ length: 1003 }, (_, index) => ({
      id: crypto.randomUUID(),
      conversation_id: "c1",
      role: "user",
      parts: [{ type: "text", text: `message ${index}` }],
      created_at: new Date(Date.UTC(2026, 9, 4, 0, 0, index)).toISOString(),
      finished_at: null,
    }));

    const offsets: number[] = [];

    const supabase = createClient<Database>(
      "https://chat-test.supabase.co",
      "test-key",
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          fetch: async (request) => {
            const url = new URL(fakeFetchUrl(request));
            const offset = Number(url.searchParams.get("offset"));
            const limit = Number(url.searchParams.get("limit"));
            offsets.push(offset);

            return await Promise.resolve(
              Response.json(rows.slice(offset, offset + limit))
            );
          },
        },
      }
    );

    const messages = yield* readStoredAgentChatMessages(supabase, "c1");
    assert.deepStrictEqual(offsets, [0, 1000]);
    assert.strictEqual(messages.length, 1003);
    assert.deepStrictEqual<unknown>(messages.at(-1)?.parts, rows.at(-1)?.parts);
  }));
