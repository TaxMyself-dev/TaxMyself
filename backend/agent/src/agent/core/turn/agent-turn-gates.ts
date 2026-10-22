import type { SystemModelMessage } from "ai";
import { Option, Schema } from "effect";

// The turn gates, stop hooks (agent-stop-hooks.ts) for mistakes the agent
// kept making that code sees in the turn's tool calls, with no model: when
// an answer ends in one of these shapes, it is sent back once with a note
// on what to do instead (love, coffee's repeat and opener gates). Each shape
// was found in eval runs where the instructions already said what to do.

// One finished step of the answer, as the AI SDK records it: the results
// include the tool search OpenAI runs itself.
interface AgentTurnGateStep {
  toolCalls: readonly { toolName: string; providerExecuted?: boolean }[];
  toolResults?: readonly { toolName: string; output: unknown }[];
}

const agentToolSearchResult = Schema.decodeUnknownOption(
  Schema.Struct({ tools: Schema.Array(Schema.Unknown) })
);

/**
 * How the answer ended after a tool search (OpenAI's, run on its side) with
 * no tool called after it: "empty" when the search came back empty, which
 * means the tools were already loaded (a search returns only tools not
 * loaded yet; the agent read that as a missing tool and gave up in evals),
 * "loaded" when it loaded tools the answer then never called, and null
 * otherwise. In the eval runs of
 * 2026-10-15/16 an answer ended this way only when it went wrong.
 *
 * @param steps - The answer's steps.
 * @returns The ending, or null.
 */
export const agentToolSearchEnding = (
  steps: readonly AgentTurnGateStep[]
): "empty" | "loaded" | null => {
  const lastWork = steps.findLastIndex((step) =>
    step.toolCalls.some((call) => call.providerExecuted !== true)
  );

  const searches: number[] = [];

  for (const step of steps.slice(lastWork + 1)) {
    for (const result of step.toolResults ?? []) {
      if (result.toolName === "toolSearch") {
        for (const { tools } of Option.toArray(
          agentToolSearchResult(result.output)
        )) {
          searches.push(tools.length);
        }
      }
    }
  }

  if (searches.length === 0) {
    return null;
  }

  return searches.some((count) => count > 0) ? "loaded" : "empty";
};

export const agentToolSearchNotes = {
  empty: {
    role: "system",
    content:
      "Your last tool search came back empty because the tools you searched for are already loaded: a search returns only tools not loaded yet. Call the tool the request needs now instead of answering without it, and never tell the user a tool is missing.",
  },
  loaded: {
    role: "system",
    content:
      "Your last tool search loaded the tools the request needs, but the answer ended without calling them. Call the tool the request needs now.",
  },
} as const satisfies Record<"empty" | "loaded", SystemModelMessage>;
