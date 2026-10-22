import { setTimeout as sleep } from "node:timers/promises";

import { APICallError, wrapLanguageModel } from "ai";
import type { LanguageModelMiddleware } from "ai";

import type { AgentLanguageModel } from "@/agent/core/model/agent-model";

// The agent's model calls, tried again when the model's server fails before
// anything has streamed (a dropped connection, a 429 or 5xx: APICallError's
// isRetryable), and only then: an error once the answer streams, or one that
// will not pass on a second try (a context overflow, a bad request), fails
// the answer as it is. Each retry tells the chat (onRetry), which shows
// "מתחבר מחדש (1/3)" (Codex's and Grok Bot's visible reconnects). The AI
// SDK's own retries are silent, so the agent turns them off (maxRetries: 0).
const agentModelRetries = 3;

// 1, 2, then 4 seconds.
const agentModelRetryDelayMs = (attempt: number) => 1000 * 2 ** (attempt - 1);

/**
 * Runs a model call, trying it again up to three times (after 1, 2 and 4
 * seconds) when the model's server fails before anything streamed.
 *
 * @param call - The model call.
 * @param abortSignal - The answer's stop signal; a stopped answer is not tried
 *   again.
 * @param onRetry - Told of each retry, for the chat's reconnect status.
 * @param attempt - This try's number, from 1.
 * @returns A promise of the call's result.
 */
export const retryAgentModelCall = async <Result>(
  call: () => PromiseLike<Result>,
  abortSignal: AbortSignal | undefined,
  onRetry: (attempt: number, of: number) => void,
  attempt = 1
): Promise<Result> => {
  try {
    return await call();
  } catch (error) {
    if (
      attempt > agentModelRetries ||
      abortSignal?.aborted === true ||
      !APICallError.isInstance(error) ||
      !error.isRetryable
    ) {
      throw error;
    }

    onRetry(attempt, agentModelRetries);
    await sleep(agentModelRetryDelayMs(attempt), undefined, {
      signal: abortSignal,
    });

    return await retryAgentModelCall(call, abortSignal, onRetry, attempt + 1);
  }
};

/**
 * The agent's model, with its calls tried again visibly (retryAgentModelCall).
 *
 * @param model - The language model.
 * @param onRetry - Told of each retry, for the chat's reconnect status.
 * @returns The wrapped model.
 */
export const retryAgentModelVisibly = (
  model: AgentLanguageModel["Service"]["model"],
  onRetry: (attempt: number, of: number) => void
) => {
  const middleware: LanguageModelMiddleware = {
    specificationVersion: "v4",
    wrapStream: async ({ doStream, params }) =>
      await retryAgentModelCall(doStream, params.abortSignal, onRetry),
    wrapGenerate: async ({ doGenerate, params }) =>
      await retryAgentModelCall(doGenerate, params.abortSignal, onRetry),
  };

  return wrapLanguageModel({ model, middleware });
};
