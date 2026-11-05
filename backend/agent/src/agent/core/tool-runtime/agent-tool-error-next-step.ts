import type { ToolSet } from "ai";

import { patchAgentTools } from "./agent-tool-patch";
import { agentToolLeavesNoTrace } from "./agent-tool-traits";

// A failed tool call's error, as the model reads it, ends with what to do
// next, so the recovery sits on the error itself rather than only in the
// instructions (DeepSeek's and Claude Code's tool errors do the same;
// docs/research/agent-harness/overview.md, "Tool errors with a next step").
// Keyed by the error's code, the `<CODE>:` its message starts with.
// EXAMPLE codes: give each failure your tools can raise its next step.
const agentToolErrorNextSteps = new Map([
  [
    "WEB_SEARCH_UNAVAILABLE",
    "The search service did not answer. Try once more; if it fails again, tell the user in plain words and offer to try later.",
  ],
  [
    "WEB_SEARCH_RATE_LIMITED",
    "Nothing was searched. Tell the user the search limit holds it and when it can go; do not retry now.",
  ],
  [
    "EMAIL_OUTCOME_UNKNOWN",
    "The email may have been sent. Tell the user so, and do not send it again.",
  ],
  [
    "ACCESS_REVOKED",
    "The user's access to this data ended while you were answering (a revoked delegation). Read nothing more, and use nothing this chat read before: tell the user, in one line, that you can no longer read this account's books.",
  ],
  [
    "BOOKS_UNAVAILABLE",
    "KeepInTax's books did not answer. Try once more; if it fails again, tell the user the numbers cannot be read right now, without guessing any.",
  ],
  [
    "BUSINESS_NOT_FOUND",
    "That business is not one the user can read. Query again without businessNumber (their current business), or with one from otherBusinesses.",
  ],
  [
    "BUSINESS_REQUIRED",
    "The user has several businesses and none is current. Ask which one they mean (askUserQuestion, with otherBusinesses' names when you have them), then query it.",
  ],
  [
    "EXPENSE_RANGE_INVALID",
    "The range is not valid: from must be on or before to, and the range at most 10 years. Fix the dates and query again.",
  ],
  [
    "TRACKING_TASK_NOT_FOUND",
    "That task no longer exists. Call listTrackingTasks and work from the tasks that exist.",
  ],
  [
    "TRACKING_TASK_CHANGED",
    "The task changed since you read it. Call listTrackingTasks and make the change again on what it shows.",
  ],
]);

// The next step of an error's code, the `<CODE>:` its message starts with.
const agentErrorNextStepByCode = (message: string) => {
  const code = /^(?<code>[A-Z][A-Z0-9_]+):/u.exec(message)?.groups?.code;

  return code === undefined ? undefined : agentToolErrorNextSteps.get(code);
};

/**
 * One source's failure inside a result that searched several (one site of
 * a multi-site search), as the model reads it: the error with its next
 * step, when its code has one. The search fails only when every source does.
 *
 * @param error - The source's error, `<CODE>: <detail>`, or null.
 * @returns The error with its next step, or null.
 */
export const agentSourceErrorText = (error: string | null) => {
  const next = agentErrorNextStepByCode(error ?? "");

  return error === null || next === undefined
    ? error
    : `${error} Next step: ${next}`;
};

// The longest failure text the model reads: an error can carry a whole page
// (a page's HTML), and the cut keeps its code and start (Claude Code cuts
// errors at 10,000 characters).
const agentToolErrorMaxLength = 4000;

const agentToolErrorText = (message: string) =>
  message.length > agentToolErrorMaxLength
    ? `${message.slice(0, agentToolErrorMaxLength)} […${message.length - agentToolErrorMaxLength} characters cut]`
    : message;

// A change that failed without a known code may still have happened.
const agentUnknownOutcomeNextStep =
  "This action's outcome is unknown: check its current state before doing it again.";

const agentToolErrorNextStep = (toolName: string, message: string) => {
  const known = agentErrorNextStepByCode(message);

  return (
    known ??
    (agentToolLeavesNoTrace(toolName) ? null : agentUnknownOutcomeNextStep)
  );
};

/**
 * A tool call's failure as the model reads it: `<CODE>: <detail>`, with its
 * next step when it has one. The chat keeps this text in the tool's saved
 * part (errorText), which later turns and memory read, instead of the
 * generic answer-failure message (agent-chat-response.server.ts).
 */
export class AgentToolError extends Error {
  override readonly name = "AgentToolError";
}

/**
 * The tools, each failure rethrown as an AgentToolError with its next step; a
 * stop (abort) passes through as it is. The wrapped tools return promises, so
 * a tool that streams its result (an AsyncIterable from execute) must not be
 * wrapped.
 *
 * @param tools - The agent's tools.
 * @returns The same tools, each failure explained.
 */
export const addAgentToolErrorNextSteps = <TOOLS extends ToolSet>(
  tools: TOOLS
): TOOLS =>
  // Only execute is wrapped, with the same parameters, returning the same
  // result.
  patchAgentTools(tools, (name, { execute }) =>
    execute === undefined
      ? undefined
      : {
          execute: async (...args: Parameters<typeof execute>) => {
            const [, options] = args;

            try {
              const result: unknown = await execute(...args);

              return result;
            } catch (error) {
              const message =
                error instanceof Error ? error.message : String(error);

              if (options.abortSignal?.aborted === true) {
                throw error;
              }

              const next = agentToolErrorNextStep(name, message);
              const text = agentToolErrorText(message);
              throw new AgentToolError(
                next === null ? text : `${text} Next step: ${next}`,
                { cause: error }
              );
            }
          },
        }
  );
