import type { ModelMessage } from "ai";

import { agentToolOnlyShows } from "../tool-runtime/agent-tool-traits";

// A turn's words: the answer the agent wrote, and the user's newest message.

/**
 * One finished step of the answer, as the AI SDK records it.
 */
export interface AgentAnswerCheckStep {
  text: string;
  toolCalls: readonly { toolName: string }[];
}

/**
 * The answer's text: what it wrote after its last tool that did work.
 *
 * @param steps - The turn's steps.
 * @returns The answer's text.
 */
export const agentTurnAnswerText = (steps: readonly AgentAnswerCheckStep[]) => {
  const lastWork = steps.findLastIndex((step) =>
    step.toolCalls.some((call) => !agentToolOnlyShows(call.toolName))
  );

  return steps
    .slice(lastWork + 1)
    .flatMap((step) => (step.text.trim() === "" ? [] : [step.text.trim()]))
    .join("\n\n");
};

/**
 * The text of the user's newest message.
 *
 * @param messages - The conversation's model messages.
 * @returns The message's text, or an empty string when there is none.
 */
export const agentTurnUserText = (messages: readonly ModelMessage[]) => {
  const message = messages.findLast((item) => item.role === "user");

  if (message === undefined) {
    return "";
  }

  return Array.isArray(message.content)
    ? message.content
        .flatMap((part) => (part.type === "text" ? [part.text] : []))
        .join("\n")
    : message.content;
};
