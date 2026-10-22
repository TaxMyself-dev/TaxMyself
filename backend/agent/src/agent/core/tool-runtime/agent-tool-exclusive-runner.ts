import type { ToolSet } from "ai";

import { isSerializableValue } from "../../../../backend/shared/schema/json-value";
import { patchAgentTools } from "./agent-tool-patch";
import { agentToolRunsAlone } from "./agent-tool-traits";

// Runs execute with these arguments once `previous` settles.
const runAfterAgentTool = async <Args extends unknown[], A>(
  previous: Promise<unknown>,
  execute: (...args: Args) => A,
  args: Args
) => {
  await previous;

  return await execute(...args);
};

/**
 * One answer's tools, with every tool that must run alone (agentToolRunsAlone:
 * changes and approved actions) queued behind the others of its
 * kind, in the order the model called them. The AI SDK runs all the tool calls
 * of a step at once and has no per-tool limit, so two calls to a service
 * that allows one at a time (one browser, one account's quota) would race,
 * and two creations would take the same position. Reads of your database,
 * outside reads and the chat's own UI run side by side. Codex's per-step
 * lock and Claude Code's concurrency-safe flag do the same.
 *
 * The queued tools return promises; a tool that streams its result (an
 * AsyncIterable from execute) must not be queued, since the queue awaits it.
 *
 * @param tools - The answer's tools.
 * @returns The same tools, the exclusive ones queued.
 */
export const queueExclusiveAgentTools = <TOOLS extends ToolSet>(
  tools: TOOLS
): TOOLS => {
  // The queue's tail settles whether the tool before succeeded or failed,
  // so one failure does not stop the tools after it.
  let last: Promise<unknown> = Promise.resolve();

  const runAlone = async <Args extends unknown[], A>(
    execute: (...args: Args) => A,
    args: Args
  ) => {
    const next = runAfterAgentTool(last, execute, args);
    last = Promise.allSettled([next]);

    return await next;
  };

  // Only execute is wrapped, with the same parameters, returning the same
  // result once its turn comes.
  return patchAgentTools(tools, (name, { execute }) =>
    execute === undefined || !agentToolRunsAlone(name)
      ? undefined
      : {
          execute: async (...args: Parameters<typeof execute>) => {
            const result: unknown = await runAlone(execute, args);

            // Tools answer JSON-like results; the model reads them as JSON.
            if (!isSerializableValue(result)) {
              throw new Error(
                `AGENT_TOOL_RESULT_UNSERIALIZABLE: ${name} answered a function, a symbol or a bigint.`
              );
            }

            return result;
          },
        }
  );
};
