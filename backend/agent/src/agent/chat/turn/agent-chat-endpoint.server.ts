import { Effect } from "effect";

import { agentChatError } from "@/agent/chat/messages/agent-chat-message-preparation.server";
import { readAgentChatRequest } from "@/agent/chat/turn/agent-chat-request.server";
import {
  answerAgentChatRequest,
  startAgentChatPrepTiming,
} from "@/agent/chat/turn/agent-chat-response.server";
import { recordProductEvent } from "@/server/integrations/posthog-product-events.server";
import { isAppSameOriginRequest } from "@/server/runtime/app-same-origin-request";
import { signedInSupabaseClient } from "@/server/runtime/supabase-client";

// The agent chat page's endpoint (POST /api/agent/chat): only the app's own
// pages, signed in as the request's user, reach the answer
// (answerAgentChatRequest). Gate it further here (a paid plan, a quota)
// with its own error code.

/**
 * Runs from the route without the request's signal: a disconnect cancels
 * neither the answer's preparation (the user's message is still saved) nor
 * the answer; only the stop button ends it (stopAgentChatAnswer).
 */
export const respondToAgentChat = Effect.fn("respondToAgentChat")(
  function* respondToAgentChat(request: Request) {
    if (!isAppSameOriginRequest(request)) {
      return agentChatError(
        "AGENT_INVALID_ORIGIN",
        "Use the app to chat.",
        403
      );
    }

    if (
      request.headers.get("content-type")?.startsWith("application/json") !==
      true
    ) {
      return agentChatError(
        "AGENT_INVALID_INPUT",
        "Use application/json.",
        415
      );
    }

    // Each step before the model starts, for chat-server-prep.
    const prep = yield* startAgentChatPrepTiming;
    const supabase = yield* signedInSupabaseClient;

    const { data: session } = yield* Effect.promise(
      async () => await supabase.auth.getClaims()
    );

    yield* prep.mark("authMs");

    if (!session) {
      return agentChatError("AGENT_AUTH_REQUIRED", "Sign in to chat.", 401);
    }

    const body = yield* readAgentChatRequest(request);
    yield* prep.mark("readBodyMs");

    if (!body) {
      return agentChatError(
        "AGENT_INVALID_INPUT",
        "Invalid chat request.",
        400
      );
    }

    if (body.userId !== session.claims.sub) {
      return agentChatError(
        "AGENT_AUTH_REQUIRED",
        "The signed-in account changed. Reload the chat.",
        401
      );
    }

    yield* recordProductEvent(body.userId, "agent_message_sent", {
      channel: "app",
    });

    return yield* answerAgentChatRequest(request, supabase, body, prep);
  }
);
