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
import type { BusinessView } from "@/agent/core/ports/keepintax-ports";
import { appAgentTools } from "@/agent/core/tool-runtime/app-agent-tools";
import { readStoredAgentMemories } from "@/agent/memory/long-term-memory.server";
import { agentSkillListMessages } from "@/agent/skills/registry/agent-skills";
import {
  agentBusinessesSection,
  agentConversationBusiness,
  agentConversationBusinessState,
  businessContextPart,
  withAgentBusinessContext,
} from "@/agent/tools/books/agent-conversation-business";
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
 * @param businesses - The <businesses> section (agentBusinessesSection).
 * @returns The user context's text.
 */
export const readAgentEvalUserContext = async (
  supabase: ReturnType<typeof createAgentEvalDatabase>,
  businesses = ""
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
        agentUserContextText(settings, memories, businesses)
      )
    )
  );

/**
 * The data owner's businesses and the conversation's business before a
 * step (agent-eval-harness.ts carries it from answer to answer).
 */
export interface AgentEvalStepBusiness {
  readonly directory: readonly BusinessView[];
  readonly current: string | null;
}

const noBusinesses: AgentEvalStepBusiness = { directory: [], current: null };

// The stored eval conversation keeps only the user's messages, so the
// conversation's business is the one this message establishes
// (agentConversationBusiness on it: one named, or null for several), else
// the one carried from the earlier answers (whose reads the production
// wrapper recorded).
const conversationBusinessAfter = (
  messages: AgentChatMessage[],
  business: AgentEvalStepBusiness
) => {
  const last = messages.at(-1);

  return last?.parts.some((part) => part.type === businessContextPart) === true
    ? agentConversationBusiness([last], business.directory)
    : business.current;
};

// The carried business as a stored message names it, so the production
// reader (agentConversationBusiness) sees it before the new event.
const carriedBusiness = (business: AgentEvalStepBusiness) =>
  business.current === null
    ? []
    : [
        {
          role: "user",
          parts: [
            {
              type: businessContextPart,
              data: { numbers: [business.current] },
            },
          ],
        },
      ];

/**
 * The conversation's business once a question is answered: the answer as
 * the chat stores it (a returned tool-askUserQuestion part with the
 * pressed value), read by the production reader after the carried
 * business. A business value establishes it, "all" clears it, any other
 * value leaves it. It holds before the answer's first read.
 *
 * @param answer - The pressed option (agentQuestionAnswerFor).
 * @param business - The directory and the business before the press.
 * @returns The business after the press, or null.
 */
export const agentEvalBusinessAfterChoice = (
  answer: AgentQuestionAnswer,
  business: AgentEvalStepBusiness
) => {
  const choice = {
    type: "tool-askUserQuestion",
    state: "output-available",
    output: answer,
  };

  return agentConversationBusiness(
    [...carriedBusiness(business), { role: "assistant", parts: [choice] }],
    business.directory
  );
};

/**
 * A stored conversation prepared as the chat endpoint prepares it
 * (agent-chat-response.server.ts): the businesses each user message names
 * recorded on it, as the endpoint recorded them when it was sent, and the conversation's business read from every
 * stored message (named, pressed or read by number). Nothing else, such as
 * a legacy page-header value, establishes one.
 *
 * @param history - The stored conversation, oldest first.
 * @param directory - The data owner's businesses.
 * @returns The prepared history and the business state for its answer.
 */
export const agentEvalHistoryBusiness = (
  history: AgentChatMessage[],
  directory: readonly BusinessView[]
) => {
  let prepared: AgentChatMessage[] = [];

  for (const next of history) {
    prepared = withAgentBusinessContext([...prepared, next], directory);
  }

  return {
    history: prepared,
    business: agentConversationBusinessState(directory, prepared),
  };
};

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
 * @param business - The directory and the conversation's business before it.
 * @returns The model messages, the judges' input, the stored messages, the
 *   turn's origin and the conversation's business after it.
 */
export const agentEvalStepMessages = async (
  step: AgentEvalUserStep,
  index: number,
  earlier: AgentEvalConversation,
  lastFollowUps: readonly string[] = [],
  business: AgentEvalStepBusiness = noBusinesses
): Promise<{
  messages: ModelMessage[];
  input: string;
  stored: AgentChatMessage[];
  origin: AgentChatTurnOrigin;
  // The conversation's business after this step's message.
  current: string | null;
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
      current: agentEvalBusinessAfterChoice(answer, business),
      stored: earlier.stored,
      messages: [agentEvalQuestionResult(open, answer)],
      input: `[pressed "${answer.label}"]`,
      origin: "question-answer",
    };
  }

  if ("decisions" in step) {
    return {
      current: business.current,
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

  // As the chat endpoint prepares it (agent-chat-response.server.ts): the
  // businesses the message names recorded on it, the conversation's
  // business, then the user context with the <businesses> section.
  const named = withAgentBusinessContext(
    [
      ...earlier.stored,
      {
        id,
        role: "user",
        metadata: { createdAt: evalMessageTime },
        parts: [{ type: "text", text: step.message }],
      },
    ],
    business.directory
  );

  const current = conversationBusinessAfter(named, business);

  const stored = withAgentUserContext(
    named,
    await readAgentEvalUserContext(
      earlier.supabase,
      agentBusinessesSection(business.directory, current)
    )
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
    current,
    messages: [...superseded, ...messages],
    input,
    stored,
    origin: step.followUp === true ? "follow-up" : "typed",
  };
};
