import { DateTime, Effect, Option, Schema } from "effect";

import { addAgentChatDocumentTexts } from "@/agent/chat/messages/agent-chat-document-text.server";
import {
  deleteStoredAgentChatMessages,
  validateAgentChatMessages,
  writeStoredAgentChatMessages,
} from "@/agent/chat/messages/agent-chat-message-storage.server";
import {
  applyAgentChatApprovals,
  supersedeOpenAgentApprovals,
} from "@/agent/chat/turn/agent-chat-approvals";
import {
  applyAgentChatQuestionAnswers,
  sendsAgentQuestionAnswer,
  supersedeOpenAgentQuestions,
} from "@/agent/chat/turn/agent-chat-question-answers";
import {
  agentChatSentPartsSchema,
  agentChatSentText,
} from "@/agent/chat/turn/agent-chat-request.server";
import type { agentChatRequestSchema } from "@/agent/chat/turn/agent-chat-request.server";
import { agentChatRetryHasActions } from "@/agent/chat/turn/agent-chat-retry";
import {
  agentChatTurnOriginPart,
  agentChatUserTurnOrigin,
} from "@/agent/chat/turn/agent-chat-turn-origin";
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

// The question was answered, replaced by a newer message, or never asked
// here: a stale or repeated press changes nothing.
const agentQuestionClosed = () =>
  agentChatError(
    "AGENT_QUESTION_CLOSED",
    "This question was already answered or replaced by a newer message.",
    409
  );

/**
 * The conversation continued from its last stored answer, with the page's
 * approval decisions and question answers applied (only the agent's own
 * open ones, a question only with one of its own values), and the turn's
 * origin recorded on it; or the refusal.
 *
 * @param stored - The stored answer the page sent back.
 * @param history - The stored conversation.
 * @param sentParts - The parts the page sent.
 * @returns The messages to answer, or the error response.
 */
const continueStoredAgentChatAnswer = (
  stored: AgentChatMessage,
  history: AgentChatMessage[],
  sentParts: readonly unknown[]
): AgentChatMessage[] | Response => {
  const answersQuestion = sendsAgentQuestionAnswer(sentParts);

  if (stored !== history.at(-1)) {
    if (answersQuestion) {
      return agentQuestionClosed();
    }

    if (stored.parts.some((part) => "approval" in part)) {
      return agentChatError(
        "AGENT_APPROVAL_SUPERSEDED",
        "This approval card is no longer active because the conversation continued. Request a fresh card; this attempt performed no action.",
        409
      );
    }

    return agentChatError(
      "AGENT_INVALID_INPUT",
      "Only the last answer can be continued.",
      400
    );
  }

  const answers = applyAgentChatQuestionAnswers(
    applyAgentChatApprovals(stored, sentParts),
    sentParts
  );

  if (answers.invalid.length > 0) {
    return agentChatError(
      "AGENT_QUESTION_ANSWER_INVALID",
      "Answer with one of the question's own options.",
      400
    );
  }

  const changed = answers.message.parts.some(
    (part, index) => part !== stored.parts[index]
  );

  if (!changed) {
    return answersQuestion
      ? agentQuestionClosed()
      : agentChatError(
          "AGENT_INVALID_INPUT",
          "Answer a pending approval before continuing.",
          400
        );
  }

  // The continued answer records why it went on: the question's answer, or
  // the approval decisions.
  return [
    ...history.slice(0, -1),
    {
      ...answers.message,
      parts: [
        ...answers.message.parts,
        answers.answered.length > 0
          ? agentChatTurnOriginPart("question-answer", {
              toolCallIds: answers.answered,
            })
          : agentChatTurnOriginPart("approval"),
      ],
    },
  ];
};

/**
 * Continue only trusted stored messages; incoming parts may answer a pending
 * approval or introduce a new user message, but cannot rewrite action receipts.
 *
 * KeepInTax (Phase 3.1, A18, plan §2.6 and §2.7 item 4): the parts may also
 * answer an open question (agent-chat-question-answers.ts), only with one of
 * its own values and only while it is open; a typed message closes an open
 * question as superseded, and that answer is saved closed; each turn's origin
 * is recorded (agent-chat-turn-origin.ts).
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
    // The last stored answer, rewritten with its open questions closed, to
    // save once the messages are valid.
    let superseded: AgentChatMessage | null = null;

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
      const continued = continueStoredAgentChatAnswer(
        stored,
        history,
        body.message.parts
      );

      if (continued instanceof Response) {
        return continued;
      }

      messages = continued;
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

      // A message typed while a question is open answers it as superseded:
      // the question is closed, and the newer message is what the agent
      // follows.
      const closedQuestions = supersedeOpenAgentQuestions(history.at(-1));
      superseded =
        supersedeOpenAgentApprovals(closedQuestions ?? history.at(-1)) ??
        closedQuestions;

      const earlier =
        superseded === null ? history : [...history.slice(0, -1), superseded];

      // The page's parts are validated with the rest below; the time is the
      // server's. Attached documents are read and saved here, once. The
      // turn's origin is the server's too.
      messages = [
        ...earlier,
        {
          ...body.message,
          parts: [
            agentChatUserTurnOrigin(
              agentChatSentText(body.message.parts),
              body.origin === "follow-up",
              history.at(-1)
            ),
            ...(yield* addAgentChatDocumentTexts(
              supabase,
              body.id,
              sentParts.value
            )),
          ],
          metadata: { createdAt: DateTime.formatIso(yield* DateTime.now) },
        },
      ];
    }

    const validated = yield* validateAgentChatMessages(messages).pipe(
      Effect.catchTag("AgentChatMessageInvalidError", () =>
        Effect.succeed(
          agentChatError("AGENT_INVALID_INPUT", "Invalid chat message.", 400)
        )
      )
    );

    // Closed questions/approvals are saved before the answer starts, so reload
    // cannot make an earlier card appear active again.
    if (!(validated instanceof Response) && superseded !== null) {
      const closed = validated.at(-2);

      if (closed !== undefined) {
        yield* writeStoredAgentChatMessages(supabase, body.id, [closed]);
      }
    }

    return validated;
  }
);
