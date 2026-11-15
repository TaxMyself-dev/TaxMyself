import { convertToModelMessages } from "ai";
import type { ModelMessage } from "ai";
import { Effect, Option } from "effect";

import { agentChatModelHistory } from "@/agent/chat/messages/agent-chat-model-history";
import {
  agentQuestionAnswerFor,
  decodeAgentQuestionInput,
} from "@/agent/chat/turn/agent-chat-question-answers";
import type {
  AgentQuestionAnswer,
  AgentQuestionInput,
} from "@/agent/chat/turn/agent-chat-question-answers";
import {
  agentUserContextText,
  withAgentUserContext,
} from "@/agent/core/agent/agent-user-context";
import { appAgentTools } from "@/agent/core/tool-runtime/app-agent-tools";
import { readStoredAgentMemories } from "@/agent/memory/long-term-memory.server";
import { agentSkillListMessages } from "@/agent/skills/registry/agent-skills";
import type {
  AgentChatMessage,
  AgentChatTurnOrigin,
} from "@/lib/agent-chat/conversation/agent-chat-messages";
import { appRuntime } from "@/server/runtime/app-runtime.server";
import { readStoredUserSettings } from "@/server/user-data/user-settings-storage.server";

import { isNonEmptyText } from "../../../../backend/shared/text/non-empty-text";
import type { createAgentEvalDatabase } from "./agent-eval-database";
import { evalMessageTime, evalUserId } from "./agent-eval-fixtures";
import type {
  AgentEvalConversation,
  AgentEvalUserStep,
} from "./agent-eval-harness";

// The user's step in an agent eval as the model reads it
// (agent-eval-harness.ts), as the chat endpoint sends it.

/**
 * The user context from the case's database as it is now, as the chat
 * endpoint reads it for each new message.
 *
 * @param supabase - The case's database.
 * @returns The user context's text.
 */
export const readAgentEvalUserContext = async (
  supabase: ReturnType<typeof createAgentEvalDatabase>
) =>
  await appRuntime.runPromise(
    Effect.all(
      [
        readStoredUserSettings(supabase, evalUserId),
        readStoredAgentMemories(supabase),
      ],
      { concurrency: "unbounded" }
    ).pipe(
      Effect.map(([settings, memories]) =>
        agentUserContextText(settings, memories)
      )
    )
  );

/**
 * KeepInTax (Phase 3.1, A18): the question an answer stopped on, waiting
 * for the page: its call and its decoded input.
 */
export interface AgentEvalOpenQuestion {
  toolCallId: string;
  input: AgentQuestionInput;
}

/**
 * The askUserQuestion call in these model messages that has no result yet,
 * as the chat keeps it open (agent-chat-question-answers.ts).
 *
 * @param messages - The conversation so far, as the model reads it.
 * @returns The open question, or null.
 */
export const openAgentEvalQuestion = (
  messages: readonly ModelMessage[]
): AgentEvalOpenQuestion | null => {
  const answered = new Set(
    messages.flatMap((message) =>
      message.role === "tool"
        ? message.content.flatMap((part) =>
            part.type === "tool-result" ? [part.toolCallId] : []
          )
        : []
    )
  );

  const calls = messages.flatMap((message) =>
    message.role === "assistant" && Array.isArray(message.content)
      ? message.content.flatMap((part) =>
          part.type === "tool-call" &&
          part.toolName === "askUserQuestion" &&
          !answered.has(part.toolCallId)
            ? Option.toArray(decodeAgentQuestionInput(part.input)).map(
                (input) => ({ toolCallId: part.toolCallId, input })
              )
            : []
        )
      : []
  );

  return calls.at(-1) ?? null;
};

// The open question's result, as the chat writes it: the answer picked, or
// superseded by a typed message.
const agentEvalQuestionResult = (
  question: AgentEvalOpenQuestion,
  answer: AgentQuestionAnswer | null
): ModelMessage => ({
  role: "tool",
  content: [
    {
      type: "tool-result",
      toolCallId: question.toolCallId,
      toolName: "askUserQuestion",
      output: {
        type: "json",
        value:
          answer === null
            ? { superseded: true }
            : { value: answer.value, label: answer.label },
      },
    },
  ],
});

/**
 * The user's step as the model reads it: a message as the chat endpoint
 * sends it (with its user context when that changed, and its
 * \<message_time\>; agentChatModelHistory), or the decisions as approval
 * responses. input is what the judges read for it: the user's own message,
 * without the context. KeepInTax (Phase 3.1): an answer to the open
 * question, accepted only as one of its own values (as the server's
 * applyAgentChatQuestionAnswers); a message typed while a question is open
 * closes it as superseded first; a follow-up press must be one of the last
 * answer's follow-ups. origin is the turn's, as the chat records it.
 *
 * @param step - The user's message, approval decisions or answer.
 * @param index - The step's place in the conversation.
 * @param earlier - The conversation so far.
 * @param lastFollowUps - The follow-ups under the last answer.
 * @returns The model messages, the judges' input, the stored messages and
 *   the turn's origin.
 */
export const agentEvalStepMessages = async (
  step: AgentEvalUserStep,
  index: number,
  earlier: AgentEvalConversation,
  lastFollowUps: readonly string[] = []
): Promise<{
  messages: ModelMessage[];
  input: string;
  stored: AgentChatMessage[];
  origin: AgentChatTurnOrigin;
}> => {
  const open = openAgentEvalQuestion(earlier.messages);

  if ("answer" in step) {
    const answer =
      open === null
        ? null
        : agentQuestionAnswerFor(open.input, step.answer.value);

    if (open === null || answer === null) {
      throw new Error(
        `AGENT_EVAL_HARNESS_ERROR: no open question takes the value ${step.answer.value}`
      );
    }

    return {
      stored: earlier.stored,
      messages: [agentEvalQuestionResult(open, answer)],
      input: `[pressed "${answer.label}"]`,
      origin: "question-answer",
    };
  }

  if ("decisions" in step) {
    return {
      stored: earlier.stored,
      origin: "approval",
      messages: [
        {
          role: "tool",
          content: step.decisions.map((decision) => ({
            type: "tool-approval-response" as const,
            ...decision,
          })),
        },
      ],
      input: step.decisions
        .map((decision) => {
          const reason = isNonEmptyText(decision.reason)
            ? `: ${decision.reason}`
            : "";

          return `[approval card ${decision.approved ? "approved" : "denied"}${reason}]`;
        })
        .join("\n"),
    };
  }

  if (step.followUp === true && !lastFollowUps.includes(step.message)) {
    throw new Error(
      `AGENT_EVAL_HARNESS_ERROR: "${step.message}" is not one of the last answer's follow-ups (${lastFollowUps.join(" | ")})`
    );
  }

  const superseded = open === null ? [] : [agentEvalQuestionResult(open, null)];

  const id = `eval-user-${index}`;

  const stored = withAgentUserContext(
    [
      ...earlier.stored,
      {
        id,
        role: "user",
        metadata: { createdAt: evalMessageTime },
        parts: [{ type: "text", text: step.message }],
      },
    ],
    await readAgentEvalUserContext(earlier.supabase)
  );

  // The new message as the endpoint's history reads it: its context and
  // notes, then itself.
  // The conversation starts with the skill list, as the chat sends it.
  const messages = await convertToModelMessages(
    [
      ...(earlier.stored.length === 0 ? agentSkillListMessages() : []),
      ...agentChatModelHistory(stored).filter(
        (message) => message.id === id || message.id.startsWith(`${id}-`)
      ),
    ],
    { tools: appAgentTools }
  );

  // The judges read the message as the model did, its time included, so
  // "today" and "an hour ago" can be checked against it.
  const own = messages.at(-1);

  const input = Array.isArray(own?.content)
    ? own.content
        .flatMap((part) => (part.type === "text" ? [part.text] : []))
        .join("\n")
    : (own?.content ?? "");

  return {
    messages: [...superseded, ...messages],
    input,
    stored,
    origin: step.followUp === true ? "follow-up" : "typed",
  };
};
