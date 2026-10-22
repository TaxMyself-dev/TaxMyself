import { setTimeout as wait } from "node:timers/promises";

import { assert, describe, effect as test } from "@effect/vitest";
import { createClient } from "@supabase/supabase-js";
import { Effect, Schema } from "effect";

import {
  replayAgentChatAnswerStream,
  saveAgentChatAnswerStream,
  registerAgentChatAnswerStream,
  stopAgentChatAnswer,
} from "../../../../../src/agent/chat/turn/agent-chat-answer-stream.server";
import type { Database } from "../../../../../src/lib/supabase/supabase-database";
import {
  fakeFetchBodyText,
  fakeFetchUrl,
} from "../../../../backend/shared/fixtures/fake-fetch-request";

// An answer outlives its page (agent-chat-answer-stream.server.ts): its
// events are saved in order, a page that opens meanwhile replays them from
// the start and follows the rest to the end, and only the stop button ends
// the answer. The fake database below keeps the conversation's active stream
// and the saved chunks as Postgres would; an answer's claim
// (claim_agent_chat_answer) marks its stream active, as startAnswer does.

const conversationId = "00000000-0000-4000-8000-0000000000a1";
const streamId = "00000000-0000-4000-8000-0000000000b1";

const decodeConversationUpdate = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      active_stream_id: Schema.optionalKey(Schema.NullOr(Schema.String)),
      answering_until: Schema.optionalKey(Schema.NullOr(Schema.String)),
    })
  )
);

const decodeChunkInsert = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      stream_id: Schema.String,
      seq: Schema.Int,
      chunk: Schema.String,
    })
  )
);

interface StoredChunk {
  stream_id: string;
  seq: number;
  chunk: string;
}

interface StoredConversation {
  id: string;
  active_stream_id: string | null;
  answering_until: string | null;
}

const postgrestOperator = /^(?:eq|neq|gt)\./u;

// A filter's value without its operator ("eq.x" is x).
const filterValue = (query: URLSearchParams, column: string) =>
  query.get(column)?.replace(postgrestOperator, "") ?? null;

// A Supabase client over an in-memory conversation row and chunk table,
// answering the queries the stream module sends (eq/neq/gt filters, seq
// order).
const makeStreamDatabase = () => {
  const conversation: StoredConversation = {
    id: conversationId,
    active_stream_id: null,
    answering_until: "2026-10-17T12:00:00.000Z",
  };

  const chunks: StoredChunk[] = [];

  const supabase = createClient<Database>(
    "https://stream-test.supabase.co",
    "test-key",
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: async (input, options) => {
          const url = new URL(fakeFetchUrl(input));
          const table = url.pathname.split("/").at(-1);
          const query = url.searchParams;
          const method = options?.method ?? "GET";

          if (table === "agent_chat_conversations") {
            const expected = query.get("active_stream_id");

            const matches =
              expected === null ||
              conversation.active_stream_id === expected.slice(3);

            if (method === "PATCH" && matches) {
              Object.assign(
                conversation,
                decodeConversationUpdate(fakeFetchBodyText(options?.body))
              );
            }

            return await Promise.resolve(Response.json([conversation]));
          }

          if (method === "POST") {
            const { stream_id, seq, chunk } = decodeChunkInsert(
              fakeFetchBodyText(options?.body)
            );

            chunks.push({ stream_id, seq, chunk });

            return await Promise.resolve(new Response(null, { status: 201 }));
          }

          if (method === "DELETE") {
            const kept = filterValue(query, "stream_id");
            chunks.splice(
              0,
              chunks.length,
              ...chunks.filter((chunk) => chunk.stream_id === kept)
            );

            return await Promise.resolve(Response.json([]));
          }

          const after = Number(filterValue(query, "seq") ?? -1);
          const stream = filterValue(query, "stream_id");

          return await Promise.resolve(
            Response.json(
              chunks
                .filter(
                  (chunk) => chunk.stream_id === stream && chunk.seq > after
                )
                .toSorted((a, b) => a.seq - b.seq)
            )
          );
        },
      },
    }
  );

  return { supabase, conversation, chunks };
};

// What the endpoint does when an answer starts: its claim marks the stream
// active (claim_agent_chat_answer), then the stream registers.
const startAnswer = (database: ReturnType<typeof makeStreamDatabase>) => {
  database.conversation.active_stream_id = streamId;

  return registerAgentChatAnswerStream(
    database.supabase,
    conversationId,
    streamId
  );
};

// An answer's events, written by the test one at a time.
const makeAnswerEvents = () => {
  const events = new TransformStream<string, string>();
  const writer = events.writable.getWriter();

  return { stream: events.readable, writer };
};

const readAll = async (stream: ReadableStream<string>) => {
  let text = "";

  for await (const chunk of stream) {
    text += chunk;
  }

  return text;
};

describe("agent chat answer stream", () => {
  test("a page that opens mid-answer replays it from the start and follows it to its end", () =>
    Effect.gen(function* pageFollowsAnswer() {
      const database = makeStreamDatabase();
      const { supabase, conversation } = database;
      startAnswer(database);
      assert.strictEqual(conversation.active_stream_id, streamId);

      const answer = makeAnswerEvents();

      const saving = saveAgentChatAnswerStream(
        supabase,
        conversationId,
        streamId,
        answer.stream
      );

      yield* Effect.promise(async () => {
        await answer.writer.write('data: {"type":"start"}\n\n');
      });
      // Past the 200 ms flush (on the real clock, as the saving reads it),
      // so the first event is saved on its own.
      yield* Effect.promise(async () => {
        await wait(250);
      });

      yield* Effect.promise(async () => {
        await answer.writer.write(
          'data: {"type":"text-delta","delta":"שלום"}\n\n'
        );
      });

      // The page opens now: it gets what was said so far, then the rest.
      const replay = yield* replayAgentChatAnswerStream(
        supabase,
        conversationId,
        // @effect-diagnostics-next-line abortControllerInEffect:off
        new AbortController().signal
      );

      assert.isNotNull(replay);

      const replayed = readAll(replay ?? new ReadableStream());

      yield* Effect.promise(async () => {
        await answer.writer.write('data: {"type":"finish"}\n\n');
        await answer.writer.close();
        await saving;
      });

      // Step: the page saw every event, in order, and the replay ended.
      assert.strictEqual(
        yield* Effect.promise(async () => await replayed),
        'data: {"type":"start"}\n\ndata: {"type":"text-delta","delta":"שלום"}\n\ndata: {"type":"finish"}\n\n'
      );
      // Step: the conversation has no answer streaming anymore.
      assert.isNull(conversation.active_stream_id);
    }));

  test("a page that opens when no answer is streaming gets nothing to follow", () =>
    Effect.gen(function* noAnswerToFollow() {
      const { supabase } = makeStreamDatabase();

      const replay = yield* replayAgentChatAnswerStream(
        supabase,
        conversationId,
        // @effect-diagnostics-next-line abortControllerInEffect:off
        new AbortController().signal
      );

      assert.isNull(replay);
    }));

  test("a new answer drops the earlier answers' saved events", () =>
    Effect.gen(function* newAnswerDropsOld() {
      const database = makeStreamDatabase();
      database.chunks.push({ stream_id: "old", seq: 0, chunk: "old" });

      startAnswer(database);
      // The old chunks are dropped in the background.
      yield* Effect.promise(async () => {
        await wait(100);
      });

      assert.deepStrictEqual(database.chunks, []);
    }));

  test("the stop button aborts the answer and frees the conversation; a closed page does not", () =>
    Effect.gen(function* stopEndsAnswer() {
      const database = makeStreamDatabase();
      const { supabase, conversation } = database;

      const signal = startAnswer(database);

      // A page that follows and then leaves: the answer goes on.
      // @effect-diagnostics-next-line abortControllerInEffect:off
      const leaving = new AbortController();

      const replay = yield* replayAgentChatAnswerStream(
        supabase,
        conversationId,
        leaving.signal
      );

      leaving.abort();
      yield* Effect.promise(async () => {
        await replay?.cancel();
      });
      assert.isFalse(signal.aborted);

      yield* stopAgentChatAnswer(supabase, conversationId);

      assert.isTrue(signal.aborted);
      assert.isNull(conversation.active_stream_id);
      assert.isNull(conversation.answering_until);
    }));
});
