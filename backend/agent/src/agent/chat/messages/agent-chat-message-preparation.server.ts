import { DateTime, Effect, Option, Schema } from "effect";

import { addAgentChatDocumentTexts } from "@/agent/chat/messages/agent-chat-document-text.server";
import {
  deleteStoredAgentChatMessages,
  validateAgentChatMessages,
} from "@/agent/chat/messages/agent-chat-message-storage.server";
import { applyAgentChatApprovals } from "@/agent/chat/turn/agent-chat-approvals";
import { agentChatSentPartsSchema } from "@/agent/chat/turn/agent-chat-request.server";
import type { agentChatRequestSchema } from "@/agent/chat/turn/agent-chat-request.server";
import { agentChatRetryHasActions } from "@/agent/chat/turn/agent-chat-retry";
import type { AgentChatMessage } from "@/lib/agent-chat/conversation/agent-chat-messages";
import type { UserSupabaseClient } from "@/server/runtime/supabase-client";
import { runSupabaseQuery } from "@/server/runtime/supabase-query";
import type { SupabaseQueryError } from "@/server/runtime/supabase-query";

// The messages an agent chat answer continues from (respondToAgentChat in
// agent-chat-response.server.ts).

/**
 * A chat endpoint's refusal as a JSON response, in the shape the chat client
 * reads (agentChatRequestFailure).
 *
 * @param code - The refusal's code, such as AGENT_CHAT_BUSY.
 * @param message - What went wrong, in plain words.
 * @param status - The HTTP status.
 * @returns The response.
 */
export const agentChatError = (code: string, message: string, status: number) =>
  Response.json({ error: { code, message } }, { status });

/**
 * Whether a message with this id is already stored, in any of the user's
 * conversations; read alongside the history.
 */
export const isAgentChatMessageStored = Effect.fn("isAgentChatMessageStored")(
  function* isAgentChatMessageStored(
    supabase: UserSupabaseClient,
    messageId: string
  ): Effect.fn.Return<boolean, SupabaseQueryError> {
    const { data } = yield* runSupabaseQuery("AGENT_CHAT_READ_FAILED", () =>
      supabase
        .from("agent_chat_messages")
        .select("id")
        .eq("id", messageId)
        .maybeSingle()
    );

    return data !== null;
  }
);

/**
 * Continue only trusted stored messages; incoming parts may answer a pending
 * approval or introduce a new user message, but cannot rewrite action receipts.
 */
export const prepareAgentChatMessages = Effect.fn("prepareAgentChatMessages")(
  function* prepareAgentChatMessages(
    supabase: UserSupabaseClient,
    body: typeof agentChatRequestSchema.Type,
    history: AgentChatMessage[],
    messageStored: boolean
  ): Effect.fn.Return<AgentChatMessage[] | Response, SupabaseQueryError> {
    const stored = history.find((message) => message.id === body.message.id);
    let messages: unknown[];

    if (stored?.role === "user") {
      // Trying again: the answer starts over from this message, and what came
      // after it is removed.
      const index = history.indexOf(stored);

      if (
        stored !== history.findLast((message) => message.role === "user") ||
        agentChatRetryHasActions(history.slice(index + 1))
      ) {
        return agentChatError(
          "AGENT_CHAT_RETRY_UNSAFE",
          "This answer contains actions. Send a new message to continue without repeating them.",
          409
        );
      }

      yield* deleteStoredAgentChatMessages(
        supabase,
        history.slice(index + 1).map((message) => message.id)
      );
      messages = history.slice(0, index + 1);
    } else if (stored) {
      if (stored !== history.at(-1)) {
        return agentChatError(
          "AGENT_INVALID_INPUT",
          "Only the last answer can be continued.",
          400
        );
      }

      const approved = applyAgentChatApprovals(stored, body.message.parts);

      if (!approved.parts.some((part, index) => part !== stored.parts[index])) {
        return agentChatError(
          "AGENT_INVALID_INPUT",
          "Answer a pending approval before continuing.",
          400
        );
      }

      messages = [...history.slice(0, -1), approved];
    } else {
      if (messageStored) {
        return agentChatError(
          "AGENT_INVALID_INPUT",
          "This message belongs to another conversation.",
          400
        );
      }

      const sentParts = Schema.decodeUnknownOption(agentChatSentPartsSchema)(
        body.message.parts
      );

      if (body.message.role !== "user" || Option.isNone(sentParts)) {
        return agentChatError(
          "AGENT_INVALID_INPUT",
          "Send a user message within the message limits.",
          400
        );
      }

      // The page's parts are validated with the rest below; the time is the
      // server's. Attached documents are read and saved here, once.
      messages = [
        ...history,
        {
          ...body.message,
          parts: yield* addAgentChatDocumentTexts(
            supabase,
            body.id,
            sentParts.value
          ),
          metadata: { createdAt: DateTime.formatIso(yield* DateTime.now) },
        },
      ];
    }

    return yield* validateAgentChatMessages(messages).pipe(
      Effect.catchTag("AgentChatMessageInvalidError", () =>
        Effect.succeed(
          agentChatError("AGENT_INVALID_INPUT", "Invalid chat message.", 400)
        )
      )
    );
  }
);
