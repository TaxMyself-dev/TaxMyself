import { Option, Predicate, Schema } from "effect";

import { agentQuestionInputSchema } from "@/agent/tools/conversation/ask-user-question-tool";
import type {
  AgentChatMessage,
  AgentChatMessagePart,
} from "@/lib/agent-chat/conversation/agent-chat-messages";

// KeepInTax change (Phase 3.1, A18, plan §2.6; GUIDE.md "What KeepInTax
// changed"), beside the template's agent-chat-approvals.ts and on its model:
// the page answers an open askUserQuestion, and the server accepts only a
// stored, still-open question's own values, once. An open question is the
// call in the last stored answer that has no result yet (state
// input-available): the answer stopped on it. Its result is written here,
// from the stored options, never from the page's labels:
// - { value, label } once answered;
// - { superseded: true } when the user typed a message instead.
// A question answered, superseded or from the template ({ asked: true }) is
// closed: a second press, a second tab or a stale page changes nothing.

const questionToolPart = "tool-askUserQuestion";

/**
 * One option as the page shows it and the server accepts it.
 */
export interface AgentQuestionOption {
  label: string;
  value: string;
}

/**
 * What an answered question's call returns to the model.
 */
export interface AgentQuestionAnswer {
  value: string;
  label: string;
}

/**
 * A question's input, as the call holds it once decoded.
 */
export type AgentQuestionInput = typeof agentQuestionInputSchema.Type;

/**
 * A question's input read from a call whose input is not typed (a model
 * message): the question, or none when it is not one.
 */
export const decodeAgentQuestionInput = Schema.decodeUnknownOption(
  agentQuestionInputSchema
);

/**
 * A question's options with their values; a label-only option (stored by
 * the template) is its own value.
 *
 * @param input - The askUserQuestion call's input.
 * @returns The options.
 */
export const agentQuestionOptions = ({
  options,
}: AgentQuestionInput): AgentQuestionOption[] =>
  options.map((option) =>
    Predicate.isString(option) ? { label: option, value: option } : option
  );

/**
 * The answer to a question when the value is one of its own, else none.
 *
 * @param input - The askUserQuestion call's input.
 * @param value - The value the page sent.
 * @returns The result for the model, with the stored option's label.
 */
export const agentQuestionAnswerFor = (
  input: AgentQuestionInput,
  value: string
): AgentQuestionAnswer | null => {
  const option = agentQuestionOptions(input).find(
    (candidate) => candidate.value === value
  );

  return option === undefined
    ? null
    : { value: option.value, label: option.label };
};

/**
 * Whether a part is a question the user has not answered yet.
 *
 * @param part - A stored message's part.
 * @returns Whether it is an open askUserQuestion call.
 */
export const isOpenAgentQuestion = (part: AgentChatMessagePart) =>
  part.type === questionToolPart && part.state === "input-available";

const agentChatQuestionAnswerSchema = Schema.Struct({
  type: Schema.Literal(questionToolPart),
  toolCallId: Schema.String.check(Schema.isMaxLength(200)),
  output: Schema.Struct({
    value: Schema.String.check(Schema.isMaxLength(100)),
  }),
});

const decodeAgentChatQuestionAnswer = Schema.decodeUnknownOption(
  agentChatQuestionAnswerSchema
);

/**
 * The question answers the page sent, by tool call id.
 *
 * @param sentParts - The parts the page sent back.
 * @returns The value sent for each question.
 */
export const sentAgentQuestionAnswers = (sentParts: readonly unknown[]) =>
  new Map(
    sentParts.flatMap((part) => {
      const parsed = decodeAgentChatQuestionAnswer(part);

      return Option.isSome(parsed)
        ? [[parsed.value.toolCallId, parsed.value.output.value] as const]
        : [];
    })
  );

/**
 * The outcome of applying the page's answers to the stored answer: the
 * message with the accepted answers, which question calls were answered,
 * and the refusals: an answer to a question that is not open (answered,
 * superseded, or not in this message), and a value the question does not
 * offer.
 */
export interface AgentChatQuestionAnswersApplied {
  message: AgentChatMessage;
  answered: string[];
  closed: string[];
  invalid: string[];
}

/**
 * The page may only answer the questions the agent asked and left open,
 * each with one of its own values; nothing else in the stored message
 * changes.
 *
 * @param stored - The stored message that asked the questions.
 * @param sentParts - The parts the page sent back, with its answers.
 * @returns The message with the accepted answers, and what was refused.
 */
export const applyAgentChatQuestionAnswers = (
  stored: AgentChatMessage,
  sentParts: readonly unknown[]
): AgentChatQuestionAnswersApplied => {
  const sent = sentAgentQuestionAnswers(sentParts);
  const answered: string[] = [];
  const invalid: string[] = [];

  const parts = stored.parts.map((part): AgentChatMessagePart => {
    if (part.type !== questionToolPart || !sent.has(part.toolCallId)) {
      return part;
    }

    if (!isOpenAgentQuestion(part)) {
      return part;
    }

    const answer = agentQuestionAnswerFor(
      part.input,
      sent.get(part.toolCallId) ?? ""
    );

    if (answer === null) {
      invalid.push(part.toolCallId);

      return part;
    }

    answered.push(part.toolCallId);

    return { ...part, state: "output-available", output: answer };
  });

  const closed = [...sent.keys()].filter(
    (id) => !answered.includes(id) && !invalid.includes(id)
  );

  return {
    message: answered.length > 0 ? { ...stored, parts } : stored,
    answered,
    closed,
    invalid,
  };
};

/**
 * The stored answer with its open questions closed as superseded, when the
 * user wrote a message instead of pressing an answer; none when it has no
 * open question. A question left without a result would also be a call the
 * model's next request has no output for.
 *
 * @param message - The conversation's last message.
 * @returns The message with its open questions closed, or null.
 */
export const supersedeOpenAgentQuestions = (
  message: AgentChatMessage | undefined
): AgentChatMessage | null => {
  if (
    message?.role !== "assistant" ||
    !message.parts.some(isOpenAgentQuestion)
  ) {
    return null;
  }

  return {
    ...message,
    parts: message.parts.map((part): AgentChatMessagePart =>
      part.type === questionToolPart && isOpenAgentQuestion(part)
        ? { ...part, state: "output-available", output: { superseded: true } }
        : part
    ),
  };
};

/**
 * Whether the page's parts try to answer a question at all, so a refusal
 * names the question rather than a missing approval.
 *
 * @param sentParts - The parts the page sent.
 * @returns Whether any is a question answer.
 */
export const sendsAgentQuestionAnswer = (sentParts: readonly unknown[]) =>
  sentAgentQuestionAnswers(sentParts).size > 0;
