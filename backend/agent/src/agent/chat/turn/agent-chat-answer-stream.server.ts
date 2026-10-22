import { Effect } from "effect";

import { appRuntime } from "@/server/runtime/app-runtime.server";
import type { UserSupabaseClient } from "@/server/runtime/supabase-client";
import { runSupabaseQuery } from "@/server/runtime/supabase-query";

// An answer that outlives its page: the agent keeps answering when the page
// closes, reloads or loses its connection, and a page that opens again
// follows the answer live (useChat's resume, GET /api/agent/chat/$id/stream).
// The answer's UI message stream is saved in order, chunk by chunk
// (agent_chat_stream_chunks), as Rakazo and open-dots keep a turn's events,
// so a reconnect replays it from the start and then follows it, also after
// a server restart, without Redis. Only the stop button ends an answer
// (POST /api/agent/chat/$id/stop); a closed page is a disconnect, as the AI
// SDK's resumable streams treat it.

// The stream is saved at most this often: an answer's text arrives a few
// characters at a time, and a row per chunk would be thousands of writes.
const agentChatStreamFlushMs = 200;

// How often a reconnected page checks for the answer's newer chunks.
const agentChatStreamPollMs = 300;

// A reconnected page stops following after this long; the answer itself
// keeps running and is saved when it ends (the lease's own limit is renewed
// every minute while it runs).
const agentChatStreamFollowMaxMs = 30 * 60_000;

// The answers streaming on this server, by stream, so the stop button ends
// one at once. An answer on another server ends when its lease renewal
// finds the lease released (agent-chat-answer-lease.server.ts), within a
// minute.
const agentChatAnswerStops = new Map<string, AbortController>();

/**
 * Registers an answer's stream, already marked active with its lease
 * (claimAgentChatAnswer): returns the signal the stop button aborts, and
 * drops the chunks of the conversation's earlier answers (each is saved as a
 * message by now) in the background, so the answer does not wait for it.
 *
 * @param supabase - The user's Supabase client.
 * @param conversationId - The conversation the answer is in.
 * @param streamId - The answer's stream.
 * @returns The signal that aborts when the user stops the answer.
 */
export const registerAgentChatAnswerStream = (
  supabase: UserSupabaseClient,
  conversationId: string,
  streamId: string
) => {
  appRuntime.runFork(
    runSupabaseQuery("AGENT_CHAT_STREAM_START_FAILED", () =>
      supabase
        .from("agent_chat_stream_chunks")
        .delete()
        .eq("conversation_id", conversationId)
        .neq("stream_id", streamId)
    ).pipe(
      Effect.matchEffect({
        onFailure: (error) =>
          Effect.logWarning("AGENT_CHAT_STREAM_START_FAILED", error),
        onSuccess: () => Effect.void,
      })
    )
  );

  const stop = new AbortController();
  agentChatAnswerStops.set(streamId, stop);

  return stop.signal;
};

/**
 * Clears the conversation's active stream if it is still this one (a newer
 * answer's stream is left alone); logged, not failed.
 *
 * @param supabase - The user's Supabase client.
 * @param conversationId - The conversation the answer is in.
 * @param streamId - The answer's stream.
 * @returns The effect that clears it.
 */
export const endAgentChatAnswerStream = (
  supabase: UserSupabaseClient,
  conversationId: string,
  streamId: string
) =>
  runSupabaseQuery("AGENT_CHAT_STREAM_END_FAILED", () =>
    supabase
      .from("agent_chat_conversations")
      .update({ active_stream_id: null })
      .eq("id", conversationId)
      .eq("active_stream_id", streamId)
  ).pipe(
    Effect.matchEffect({
      onFailure: (error) =>
        Effect.logError("AGENT_CHAT_STREAM_END_FAILED", error),
      onSuccess: () => Effect.void,
    }),
    Effect.ensuring(
      Effect.sync(() => {
        agentChatAnswerStops.delete(streamId);
      })
    )
  );

/**
 * Reads the answer's server-sent events to their end, saving them in order
 * every agentChatStreamFlushMs, then marks the stream ended. A chunk that
 * cannot be saved is logged; the answer goes on, and a reconnect replays
 * what was saved.
 *
 * @param supabase - The user's Supabase client.
 * @param conversationId - The conversation the answer is in.
 * @param streamId - The answer's stream.
 * @param stream - The answer's events, as sent to the page.
 */
export const saveAgentChatAnswerStream = async (
  supabase: UserSupabaseClient,
  conversationId: string,
  streamId: string,
  stream: ReadableStream<string>
) => {
  let seq = 0;
  let pending: string[] = [];
  let lastFlush = Date.now();

  const flush = async () => {
    if (pending.length === 0) {
      return;
    }

    const chunk = pending.join("");
    pending = [];
    lastFlush = Date.now();
    const row = { stream_id: streamId, conversation_id: conversationId, seq };
    seq += 1;

    await appRuntime.runPromise(
      runSupabaseQuery("AGENT_CHAT_STREAM_SAVE_FAILED", () =>
        supabase.from("agent_chat_stream_chunks").insert({ ...row, chunk })
      ).pipe(
        Effect.matchEffect({
          onFailure: (error) =>
            Effect.logError("AGENT_CHAT_STREAM_SAVE_FAILED", error),
          onSuccess: () => Effect.void,
        })
      )
    );
  };

  try {
    for await (const event of stream) {
      pending.push(event);

      if (Date.now() - lastFlush >= agentChatStreamFlushMs) {
        await flush();
      }
    }
  } finally {
    await flush();
    await appRuntime.runPromise(
      endAgentChatAnswerStream(supabase, conversationId, streamId)
    );
  }
};

const readActiveStreamId = (
  supabase: UserSupabaseClient,
  conversationId: string
) =>
  runSupabaseQuery("AGENT_CHAT_STREAM_READ_FAILED", () =>
    supabase
      .from("agent_chat_conversations")
      .select("active_stream_id")
      .eq("id", conversationId)
      .maybeSingle()
  ).pipe(Effect.map(({ data }) => data?.active_stream_id ?? null));

const readStreamChunks = (
  supabase: UserSupabaseClient,
  streamId: string,
  afterSeq: number
) =>
  runSupabaseQuery("AGENT_CHAT_STREAM_READ_FAILED", () =>
    supabase
      .from("agent_chat_stream_chunks")
      .select("seq, chunk")
      .eq("stream_id", streamId)
      .gt("seq", afterSeq)
      .order("seq")
  ).pipe(Effect.map(({ data }) => data));

// The stream's chunks after afterSeq, waiting for newer ones while the
// answer runs; done once the answer ended (its last chunks read after) or
// the deadline passed.
const waitForAgentChatStreamChunks = Effect.fnUntraced(
  function* waitForAgentChatStreamChunks(
    supabase: UserSupabaseClient,
    conversationId: string,
    streamId: string,
    afterSeq: number,
    deadline: number
  ) {
    for (;;) {
      const chunks = yield* readStreamChunks(supabase, streamId, afterSeq);

      if (chunks.length > 0) {
        return { chunks, done: false };
      }

      const active = yield* readActiveStreamId(supabase, conversationId);

      if (active !== streamId || Date.now() > deadline) {
        return {
          chunks: yield* readStreamChunks(supabase, streamId, afterSeq),
          done: true,
        };
      }

      yield* Effect.sleep(agentChatStreamPollMs);
    }
  }
);

/**
 * The conversation's answer streaming now, for a page that opens again: its
 * saved events from the start (useChat rebuilds the answer from a full
 * replay), then each newer one as it is saved, until the answer ends or the
 * page leaves. null when no answer is streaming.
 *
 * @param supabase - The user's Supabase client.
 * @param conversationId - The conversation.
 * @param signal - The page's request, which ends the following.
 * @returns The events, or null.
 */
export const replayAgentChatAnswerStream = Effect.fn(
  "replayAgentChatAnswerStream"
)(function* replayAgentChatAnswerStream(
  supabase: UserSupabaseClient,
  conversationId: string,
  signal: AbortSignal
) {
  const streamId = yield* readActiveStreamId(supabase, conversationId);

  if (streamId === null) {
    return null;
  }

  const deadline = Date.now() + agentChatStreamFollowMaxMs;
  let afterSeq = -1;

  return new ReadableStream<string>({
    pull: async (controller) => {
      // A failed read ends the following, not the answer.
      const read = waitForAgentChatStreamChunks(
        supabase,
        conversationId,
        streamId,
        afterSeq,
        deadline
      ).pipe(
        Effect.matchEffect({
          onFailure: (error) =>
            Effect.logWarning("AGENT_CHAT_STREAM_READ_FAILED", error).pipe(
              Effect.as({ chunks: [], done: true })
            ),
          onSuccess: Effect.succeed,
        })
      );

      let next: Effect.Success<typeof read>;

      // The page leaving (signal) interrupts the wait: the following ends.
      try {
        next = await appRuntime.runPromise(read, { signal });
      } catch {
        controller.close();

        return;
      }

      const { chunks, done } = next;

      afterSeq = chunks.at(-1)?.seq ?? afterSeq;

      if (chunks.length > 0) {
        controller.enqueue(chunks.map((row) => row.chunk).join(""));
      }

      if (done) {
        controller.close();
      }
    },
  });
});

/**
 * Stops the conversation's answer at the user's request: aborts it at once
 * when it streams on this server, and releases its lease and its stream, so
 * one on another server stops at its next lease renewal. What the answer
 * said by then is saved, as when it ends.
 *
 * @param supabase - The user's Supabase client.
 * @param conversationId - The conversation.
 */
export const stopAgentChatAnswer = Effect.fn("stopAgentChatAnswer")(
  function* stopAgentChatAnswer(
    supabase: UserSupabaseClient,
    conversationId: string
  ) {
    const streamId = yield* readActiveStreamId(supabase, conversationId);

    if (streamId === null) {
      return;
    }

    agentChatAnswerStops.get(streamId)?.abort();

    yield* runSupabaseQuery("AGENT_CHAT_STREAM_STOP_FAILED", () =>
      supabase
        .from("agent_chat_conversations")
        .update({ active_stream_id: null, answering_until: null })
        .eq("id", conversationId)
        .eq("active_stream_id", streamId)
    );
  }
);
