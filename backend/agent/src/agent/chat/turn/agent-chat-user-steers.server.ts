import { convertToModelMessages } from "ai";
import type { ModelMessage } from "ai";
import { Effect } from "effect";

import { agentChatModelHistory } from "@/agent/chat/messages/agent-chat-model-history";
import { agentChatUserSteerMessage } from "@/lib/agent-chat/conversation/agent-chat-user-steers";
import type { AgentChatUserSteer } from "@/lib/agent-chat/conversation/agent-chat-user-steers";
import { appRuntime } from "@/server/runtime/app-runtime.server";
import type { UserSupabaseClient } from "@/server/runtime/supabase-client";
import { runSupabaseQuery } from "@/server/runtime/supabase-query";

// Messages the user sends while the agent answers (agent-chat-user-steers.ts
// in lib), kept in agent_chat_steers under the answer's stream until the
// agent's next step takes them. The page decides what became of each: a
// steer the answer streamed back (data-userSteer) was read; any other one is
// sent as a new message once the answer ends, so a steer added just as the
// answer finished is never lost or read twice. The next answer in the
// conversation drops the unread ones of the answers before it.

/**
 * Adds a steer to the answer running in the conversation; not-answering
 * when none is, so the page sends it as a new message instead.
 *
 * @param supabase - The user's Supabase client.
 * @param conversationId - The conversation.
 * @param steer - The steer's id and text.
 * @returns added or not-answering.
 */
export const addAgentChatUserSteer = Effect.fn("addAgentChatUserSteer")(
  function* addAgentChatUserSteer(
    supabase: UserSupabaseClient,
    conversationId: string,
    steer: { id: string; text: string }
  ) {
    const { data } = yield* runSupabaseQuery("AGENT_CHAT_STEER_FAILED", () =>
      supabase
        .from("agent_chat_conversations")
        .select("active_stream_id")
        .eq("id", conversationId)
        .maybeSingle()
    );

    const streamId = data?.active_stream_id ?? null;

    if (streamId === null) {
      return "not-answering" as const;
    }

    yield* runSupabaseQuery("AGENT_CHAT_STEER_FAILED", () =>
      supabase.from("agent_chat_steers").insert({
        id: steer.id,
        conversation_id: conversationId,
        stream_id: streamId,
        text: steer.text,
      })
    );

    return "added" as const;
  }
);

/**
 * Withdraws a steer the agent has not read yet (its remove button); one
 * already read stays in the answer.
 *
 * @param supabase - The user's Supabase client.
 * @param conversationId - The conversation.
 * @param steerId - The steer.
 * @returns The effect that withdraws it.
 */
export const removeAgentChatUserSteer = (
  supabase: UserSupabaseClient,
  conversationId: string,
  steerId: string
) =>
  runSupabaseQuery("AGENT_CHAT_STEER_FAILED", () =>
    supabase
      .from("agent_chat_steers")
      .delete()
      .eq("conversation_id", conversationId)
      .eq("id", steerId)
  ).pipe(Effect.asVoid);

// The answer's unread steers, oldest first, deleted as they are read; none
// when the read fails (logged): they then go out as a new message.
const takeStoredAgentChatUserSteers = (
  supabase: UserSupabaseClient,
  conversationId: string,
  streamId: string
) =>
  runSupabaseQuery("AGENT_CHAT_STEER_TAKE_FAILED", () =>
    supabase
      .from("agent_chat_steers")
      .delete()
      .eq("conversation_id", conversationId)
      .eq("stream_id", streamId)
      .select("id, text, created_at")
  ).pipe(
    Effect.map(({ data }) =>
      data
        .map((row): AgentChatUserSteer => ({
          id: row.id,
          text: row.text,
          createdAt: new Date(row.created_at).toISOString(),
        }))
        .toSorted((a, b) => a.createdAt.localeCompare(b.createdAt))
    ),
    Effect.matchEffect({
      onFailure: (error) =>
        Effect.logError("AGENT_CHAT_STEER_TAKE_FAILED", error).pipe(
          Effect.as([])
        ),
      onSuccess: Effect.succeed,
    })
  );

/**
 * A run's response messages with the steers it read placed where it read
 * them: each after the response messages its step had answered by then.
 *
 * @param responseMessages - The run's response messages.
 * @param steers - The run's steers, in the order read, each with how many
 *   response messages came before it.
 * @returns The messages in the order the model read them.
 */
export const placeAgentChatUserSteers = (
  responseMessages: readonly ModelMessage[],
  steers: readonly { after: number; messages: readonly ModelMessage[] }[]
) => {
  const placed: ModelMessage[] = [];
  let from = 0;

  for (const { after, messages } of steers) {
    placed.push(...responseMessages.slice(from, after), ...messages);
    from = after;
  }

  return [...placed, ...responseMessages.slice(from)];
};

/**
 * What an answer's steps read from the user while it runs. take is the
 * agent's (createAppAgent); the rest is the answer stream's
 * (streamAgentChatTurn).
 */
export interface AgentChatUserSteers {
  // The steers sent since the last step, as the model reads them; called
  // before each step after the first, with how many messages the run's
  // steps have answered so far.
  take: (afterResponseMessages: number) => Promise<ModelMessage[]>;
  // The steers read since the last call, for the answer's data-userSteer
  // parts.
  takeUnshown: () => AgentChatUserSteer[];
  // A run's response messages with the steers it read placed where it read
  // them, for the run a stop hook starts after it; resets for that run.
  placeInRun: (responseMessages: readonly ModelMessage[]) => ModelMessage[];
}

/**
 * The steers of one answer, and drops the conversation's unread steers of
 * earlier answers in the background.
 *
 * @param supabase - The user's Supabase client.
 * @param conversationId - The conversation.
 * @param streamId - The answer's stream.
 * @returns The answer's steers.
 */
export const createAgentChatUserSteers = (
  supabase: UserSupabaseClient,
  conversationId: string,
  streamId: string
): AgentChatUserSteers => {
  appRuntime.runFork(
    runSupabaseQuery("AGENT_CHAT_STEER_TAKE_FAILED", () =>
      supabase
        .from("agent_chat_steers")
        .delete()
        .eq("conversation_id", conversationId)
        .neq("stream_id", streamId)
    ).pipe(
      Effect.matchEffect({
        onFailure: (error) =>
          Effect.logWarning("AGENT_CHAT_STEER_TAKE_FAILED", error),
        onSuccess: () => Effect.void,
      })
    )
  );

  let unshown: AgentChatUserSteer[] = [];
  let inRun: { after: number; messages: ModelMessage[] }[] = [];

  return {
    take: async (afterResponseMessages) => {
      const steers = await appRuntime.runPromise(
        takeStoredAgentChatUserSteers(supabase, conversationId, streamId)
      );

      if (steers.length === 0) {
        return [];
      }

      // Read as later turns read them (agentChatModelHistory), with when
      // they were written.
      const messages = await convertToModelMessages(
        agentChatModelHistory(steers.map(agentChatUserSteerMessage))
      );

      unshown = [...unshown, ...steers];
      inRun = [...inRun, { after: afterResponseMessages, messages }];

      return messages;
    },
    takeUnshown: () => {
      const steers = unshown;
      unshown = [];

      return steers;
    },
    placeInRun: (responseMessages) => {
      const placed = placeAgentChatUserSteers(responseMessages, inRun);
      inRun = [];

      return placed;
    },
  };
};
