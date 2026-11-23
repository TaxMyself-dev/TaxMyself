import { UI_MESSAGE_STREAM_HEADERS } from "ai";
import { Effect, Option, Schema } from "effect";

import { agentChatError } from "@/agent/chat/messages/agent-chat-message-preparation.server";
import {
  replayAgentChatAnswerStream,
  stopAgentChatAnswer,
} from "@/agent/chat/turn/agent-chat-answer-stream.server";
import {
  addAgentChatUserSteer,
  removeAgentChatUserSteer,
} from "@/agent/chat/turn/agent-chat-user-steers.server";
import { agentChatMessageMaxLength } from "@/lib/agent-chat/conversation/agent-chat-messages";
import { isAppSameOriginRequest } from "@/server/runtime/app-same-origin-request";
import { signedInSupabaseClient } from "@/server/runtime/supabase-client";
import type { UserSupabaseClient } from "@/server/runtime/supabase-client";
import { runSupabaseQuery } from "@/server/runtime/supabase-query";

import { trimmedLengthString } from "../../../../backend/shared/schema/trimmed-length-string";

// The answer streaming in a conversation, for its page: GET follows it
// (useChat's resume, on a page that opens while the agent still answers),
// POST to stop ends it (the stop button), and POST to steer sends a message
// into it (agent-chat-user-steers.server.ts), and GET follow-ups waits for
// an answer's follow-up questions, written after it ended. RLS keeps each user to their own
// conversations: someone else's reads as having no answer.

const agentChatConversationIdPattern =
  /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/u;

// The signed-in user's Supabase client for a valid request, or the error
// response.
const authorizeAgentChatStreamRequest = Effect.fnUntraced(
  function* authorizeAgentChatStreamRequest(
    request: Request,
    conversationId: string
  ) {
    if (!isAppSameOriginRequest(request)) {
      return agentChatError(
        "AGENT_INVALID_ORIGIN",
        "Use the app to chat.",
        403
      );
    }

    if (!agentChatConversationIdPattern.test(conversationId)) {
      return agentChatError(
        "AGENT_INVALID_INPUT",
        "Invalid conversation.",
        400
      );
    }

    const supabase = yield* signedInSupabaseClient;

    const { data: session } = yield* Effect.promise(
      async () => await supabase.auth.getClaims()
    );

    if (!session) {
      return agentChatError("AGENT_AUTH_REQUIRED", "Sign in to chat.", 401);
    }

    return supabase;
  }
);

/**
 * GET /api/agent/chats/$id/stream: the answer streaming now, replayed from
 * its start and followed to its end, or 204 when none is.
 *
 * @param request - The page's request.
 * @param conversationId - The conversation.
 */
export const respondToAgentChatStream = Effect.fn("respondToAgentChatStream")(
  function* respondToAgentChatStream(request: Request, conversationId: string) {
    const supabase = yield* authorizeAgentChatStreamRequest(
      request,
      conversationId
    );

    if (supabase instanceof Response) {
      return supabase;
    }

    const stream = yield* replayAgentChatAnswerStream(
      supabase,
      conversationId,
      request.signal
    );

    if (stream === null) {
      return new Response(null, { status: 204 });
    }

    return new Response(stream.pipeThrough(new TextEncoderStream()), {
      headers: UI_MESSAGE_STREAM_HEADERS,
    });
  }
);

/**
 * POST /api/agent/chats/$id/stop: ends the answer streaming now; what it
 * said by then is saved.
 *
 * @param request - The page's request.
 * @param conversationId - The conversation.
 */
export const respondToAgentChatStop = Effect.fn("respondToAgentChatStop")(
  function* respondToAgentChatStop(request: Request, conversationId: string) {
    const supabase = yield* authorizeAgentChatStreamRequest(
      request,
      conversationId
    );

    if (supabase instanceof Response) {
      return supabase;
    }

    yield* stopAgentChatAnswer(supabase, conversationId);

    return new Response(null, { status: 204 });
  }
);

const invalidAgentChatMessage = () =>
  agentChatError("AGENT_INVALID_INPUT", "Invalid message.", 400);

const agentChatSteerRequestSchema = Schema.Struct({
  id: Schema.String.check(Schema.isUUID()),
  text: trimmedLengthString(1, agentChatMessageMaxLength),
});

const decodeAgentChatSteerRequest = Schema.decodeUnknownOption(
  Schema.fromJsonString(agentChatSteerRequestSchema)
);

/**
 * POST /api/agent/chats/$id/steer: sends a message into the answer
 * streaming now, for its next step; 409 AGENT_CHAT_NOT_ANSWERING when none
 * is, so the page sends it as a new message. DELETE with ?id= withdraws one
 * the agent has not read.
 *
 * @param request - The page's request.
 * @param conversationId - The conversation.
 */
export const respondToAgentChatSteer = Effect.fn("respondToAgentChatSteer")(
  function* respondToAgentChatSteer(request: Request, conversationId: string) {
    const supabase = yield* authorizeAgentChatStreamRequest(
      request,
      conversationId
    );

    if (supabase instanceof Response) {
      return supabase;
    }

    if (request.method === "DELETE") {
      const steerId = new URL(request.url).searchParams.get("id") ?? "";

      if (!agentChatConversationIdPattern.test(steerId)) {
        return invalidAgentChatMessage();
      }

      yield* removeAgentChatUserSteer(supabase, conversationId, steerId);

      return new Response(null, { status: 204 });
    }

    const steer = Option.getOrNull(
      decodeAgentChatSteerRequest(
        yield* Effect.promise(async () => await request.text())
      )
    );

    if (steer === null) {
      return invalidAgentChatMessage();
    }

    const added = yield* addAgentChatUserSteer(supabase, conversationId, steer);

    if (added === "not-answering") {
      return agentChatError(
        "AGENT_CHAT_NOT_ANSWERING",
        "The agent is not answering in this conversation.",
        409
      );
    }

    return new Response(null, { status: 204 });
  }
);

// The follow-ups' own call gives up after 8 s (agent-follow-up-questions.ts);
// the page waits a little longer, checking this often.
const agentChatFollowUpsWaitMs = 10_000;
const agentChatFollowUpsPollMs = 400;

const followUpsPart = Schema.Struct({
  type: Schema.Literal("data-followUps"),
  data: Schema.Struct({ questions: Schema.Array(Schema.String) }),
});

const decodeFollowUpsPart = Schema.decodeUnknownOption(followUpsPart);

// The saved answer's follow-up questions, or null while it has none.
const readSavedAgentChatFollowUps = (
  supabase: UserSupabaseClient,
  conversationId: string,
  messageId: string
) =>
  runSupabaseQuery("AGENT_FOLLOW_UPS_READ_FAILED", () =>
    supabase
      .from("agent_chat_messages")
      .select("parts")
      .eq("conversation_id", conversationId)
      .eq("id", messageId)
      .maybeSingle()
  ).pipe(
    Effect.map(({ data }) => {
      const parts: readonly unknown[] = Array.isArray(data?.parts)
        ? data.parts
        : [];

      for (const part of parts) {
        const decoded = Option.getOrNull(decodeFollowUpsPart(part));

        if (decoded !== null) {
          return decoded.data.questions;
        }
      }

      return null;
    })
  );

/**
 * GET /api/agent/chats/$id/follow-ups?message=: the answer's follow-up
 * questions once written, waiting up to agentChatFollowUpsWaitMs; an empty
 * list when none came.
 *
 * @param request - The page's request.
 * @param conversationId - The conversation.
 */
export const respondToAgentChatFollowUps = Effect.fn(
  "respondToAgentChatFollowUps"
)(function* respondToAgentChatFollowUps(
  request: Request,
  conversationId: string
) {
  const supabase = yield* authorizeAgentChatStreamRequest(
    request,
    conversationId
  );

  if (supabase instanceof Response) {
    return supabase;
  }

  const messageId = new URL(request.url).searchParams.get("message") ?? "";

  if (!agentChatConversationIdPattern.test(messageId)) {
    return invalidAgentChatMessage();
  }

  const deadline = Date.now() + agentChatFollowUpsWaitMs;

  for (;;) {
    const questions = yield* readSavedAgentChatFollowUps(
      supabase,
      conversationId,
      messageId
    );

    if (questions !== null || Date.now() > deadline || request.signal.aborted) {
      return Response.json({ questions: questions ?? [] });
    }

    yield* Effect.sleep(agentChatFollowUpsPollMs);
  }
});
