import type { ModelMessage, ToolResultPart } from "ai";
import { Option, Schema } from "effect";
import { absurd } from "effect/Function";

import { agentToolOnlyShows } from "../tool-runtime/agent-tool-traits";

// What a turn's tool calls came to, as the answer check reads them
// (agent-answer-check.ts): each call's outcome, and the cut results the agent
// never read on.

// What one tool call of the turn came to.
type AgentTurnToolOutcomeKind = "done" | "failed" | "denied" | "waiting";

/**
 * One tool call of the turn: its tool, whether it was done, failed, denied
 * or still waits for approval, and its output as text.
 */
export interface AgentTurnToolOutcome {
  toolName: string;
  outcome: AgentTurnToolOutcomeKind;
  output: string;
}

const agentToolResultOutcome = (
  output: ToolResultPart["output"]
): AgentTurnToolOutcome["outcome"] => {
  if (output.type === "execution-denied") {
    return "denied";
  }

  return output.type === "error-text" || output.type === "error-json"
    ? "failed"
    : "done";
};

const agentToolResultText = (output: ToolResultPart["output"]) => {
  switch (output.type) {
    case "text":
    case "error-text": {
      return output.value;
    }

    case "execution-denied": {
      return output.reason ?? "";
    }

    case "json":
    case "error-json":
    case "content": {
      return JSON.stringify(output.value);
    }

    default: {
      return absurd<never>(output);
    }
  }
};

/**
 * The tool calls of the turn: the model messages after the user's newest
 * message (which hold the results of tools the user approved), each with
 * its outcome. A call with no result yet waits for approval.
 *
 * @param messages - The turn's model messages.
 * @returns Each tool call with its result.
 */
export const agentTurnToolOutcomes = (
  messages: readonly ModelMessage[]
): AgentTurnToolOutcome[] => {
  const turn = messages.slice(
    messages.findLastIndex((message) => message.role === "user") + 1
  );

  const outcomes = new Map<string, AgentTurnToolOutcome>();

  for (const message of turn) {
    if (
      (message.role !== "assistant" && message.role !== "tool") ||
      !Array.isArray(message.content)
    ) {
      continue;
    }

    for (const part of message.content) {
      if (part.type === "tool-call" && !agentToolOnlyShows(part.toolName)) {
        outcomes.set(part.toolCallId, {
          toolName: part.toolName,
          outcome: "waiting",
          output: "",
        });
      }

      if (part.type === "tool-result" && outcomes.has(part.toolCallId)) {
        outcomes.set(part.toolCallId, {
          toolName: part.toolName,
          outcome: agentToolResultOutcome(part.output),
          output: agentToolResultText(part.output),
        });
      }
    }
  }

  return [...outcomes.values()];
};

/** A cut tool result: its id and the first item it did not show. */
export interface AgentCutResult {
  resultId: string;
  from: number;
}

// The cut note of agentToolModelOutput, as it reads inside a result's JSON.
const agentCutNotePattern =
  /readToolResultItems \(resultId \\"(?<resultId>[^"\\]+)\\", from (?<from>\d+)\)/gu;

const agentReadItemsInput = Schema.decodeUnknownOption(
  Schema.Struct({ resultId: Schema.String })
);

// The parts of the turn's assistant and tool messages, after the user's
// newest message.
const agentTurnMessageParts = function* agentTurnMessageParts(
  messages: readonly ModelMessage[]
) {
  const turn = messages.slice(
    messages.findLastIndex((message) => message.role === "user") + 1
  );

  for (const message of turn) {
    if (
      (message.role === "assistant" || message.role === "tool") &&
      Array.isArray(message.content)
    ) {
      yield* message.content;
    }
  }
};

/**
 * The turn's cut tool results that no readToolResultItems call read on.
 *
 * @param messages - The turn's model messages.
 * @returns Each unread cut, where its rest starts.
 */
export const agentUnreadCutResults = (
  messages: readonly ModelMessage[]
): AgentCutResult[] => {
  const read = new Set<string>();
  const cuts: AgentCutResult[] = [];

  for (const part of agentTurnMessageParts(messages)) {
    if (part.type === "tool-call" && part.toolName === "readToolResultItems") {
      for (const { resultId } of Option.toArray(
        agentReadItemsInput(part.input)
      )) {
        read.add(resultId);
      }
    }

    if (part.type === "tool-result") {
      for (const { groups } of agentToolResultText(part.output).matchAll(
        agentCutNotePattern
      )) {
        if (groups?.resultId !== undefined) {
          cuts.push({ resultId: groups.resultId, from: Number(groups.from) });
        }
      }
    }
  }

  return cuts.filter(({ resultId }) => !read.has(resultId));
};
