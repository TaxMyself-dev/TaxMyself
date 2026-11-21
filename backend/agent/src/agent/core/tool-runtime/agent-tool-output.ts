import { Option, Schema, Struct } from "effect";

import { isJsonArrayValue } from "../../../../backend/shared/schema/json-value";
import type { SerializableValue } from "../../../../backend/shared/schema/json-value";
import { isNonEmptyText } from "../../../../backend/shared/text/non-empty-text";

// What the model reads of a tool's result, capped as Codex caps every tool
// output. About 5,000 tokens. The chat still shows the whole result.
export const agentToolOutputMaxLength = 20_000;

const agentToolResultFields = Schema.decodeUnknownOption(
  Schema.Record(Schema.String, Schema.Json)
);

const decodeAgentToolResultJson = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Json)
);

// A result cut to fit, kept so the model can read the items it left out
// (readToolResultItems, by the tool call's id): the list's field, all its
// items, and the result's other fields.
interface AgentCutToolResult {
  key: string;
  items: Schema.JsonArray;
  fields: Record<string, Schema.Json>;
}

// Deliberate simplification: cut results are kept in this server instance's
// memory, the newest agentCutToolResultsKept of them. Each request rebuilds
// the conversation's model messages from the stored answers, which cuts
// their results again and keeps them here, so a cut from an earlier answer
// can be read on whichever instance answers; one summarized away or pushed
// out by newer cuts is gone (TOOL_RESULT_NOT_KEPT), and the agent searches
// again. Upgrade path: keep cut results in the database (a migration).
const agentCutToolResultsKept = 100;
const agentCutToolResults = new Map<string, AgentCutToolResult>();

const keepAgentCutToolResult = (id: string, result: AgentCutToolResult) => {
  agentCutToolResults.delete(id);
  agentCutToolResults.set(id, result);
  const oldest = agentCutToolResults.keys().next().value;

  if (
    agentCutToolResults.size > agentCutToolResultsKept &&
    isNonEmptyText(oldest)
  ) {
    agentCutToolResults.delete(oldest);
  }
};

/**
 * The full result of a tool call whose output the model got cut, while the
 * answer runs.
 *
 * @param id - The tool call's id.
 * @returns The full result, or undefined when it was not cut.
 */
export const readAgentCutToolResult = (id: string) =>
  agentCutToolResults.get(id);

// The result's longest list among its top-level fields (such as `results`
// or `tasks`), the part a page grows by; none when the result is not
// an object of fields.
const agentToolLongestList = (fields: Record<string, Schema.Json>) => {
  let longest: {
    key: string;
    items: Schema.JsonArray;
    length: number;
  } | null = null;

  for (const [key, field] of Object.entries(fields)) {
    if (isJsonArrayValue(field)) {
      const { length } = JSON.stringify(field);

      if (!longest || length > longest.length) {
        longest = { key, items: field, length };
      }
    }
  }

  return longest;
};

/**
 * A result past the limit keeps its shape: its longest list loses items
 * from the end until the result fits, and `cut` says how many the model
 * did not see and how to read them (readToolResultItems, from the result
 * kept by toolCallId), so fields such as hasMore and nextOffset survive and
 * the JSON stays whole. A result with no list to shorten is cut as text.
 * Tools that shape their result for the model first pass their toolCallId
 * on, so the kept items are the ones the model reads.
 * A tool calls it from an arrow in toModelOutput, placed after execute:
 * tool() infers the output type from execute, left to right, and a function
 * passed by reference before it would set the output type instead.
 *
 * @returns The result as the model reads it, cut to the limit with `cut` when
 *   it was cut.
 */
export const agentToolModelOutput = ({
  output,
  toolCallId,
}: {
  output: SerializableValue;
  toolCallId?: string;
}) => {
  const text = JSON.stringify(output);

  if (text.length <= agentToolOutputMaxLength) {
    return { type: "json" as const, value: decodeAgentToolResultJson(text) };
  }

  // A result that is itself a list (listTrackingTasks) is cut as its `items`.
  const parsed: unknown = JSON.parse(text);

  const fields = Option.getOrNull(
    agentToolResultFields(Array.isArray(parsed) ? { items: parsed } : parsed)
  );

  const list = fields && agentToolLongestList(fields);

  if (fields && list) {
    const shortened = (kept: number) => ({
      ...fields,
      [list.key]: list.items.slice(0, kept),
      cut:
        toolCallId === undefined
          ? `${list.key} shows ${kept} of ${list.items.length} items; the other ${list.items.length - kept} were left out to fit. To see them, ask again more narrowly (a filter, one task, fewer ids); the next page starts after all ${list.items.length}.`
          : `${list.key} shows ${kept} of ${list.items.length} items; the other ${list.items.length - kept} were left out to fit. Read them with readToolResultItems (resultId "${toolCallId}", from ${kept}); a next page or cursor starts after all ${list.items.length}.`,
    });

    // The most items that fit, found by halving.
    let low = 0;
    let high = list.items.length - 1;

    while (low < high) {
      const middle = Math.ceil((low + high) / 2);

      if (
        JSON.stringify(shortened(middle)).length <= agentToolOutputMaxLength
      ) {
        low = middle;
      } else {
        high = middle - 1;
      }
    }

    const fitted = shortened(low);

    if (JSON.stringify(fitted).length <= agentToolOutputMaxLength) {
      if (toolCallId !== undefined) {
        const rest = Struct.omit(fields, [list.key]);
        keepAgentCutToolResult(toolCallId, {
          key: list.key,
          items: list.items,
          fields: rest,
        });
      }

      return { type: "json" as const, value: fitted };
    }
  }

  return {
    type: "text" as const,
    value: `${text.slice(0, agentToolOutputMaxLength)}… [cut: the full result is ${text.length} characters. Ask for less, such as one status or the next page.]`,
  };
};
