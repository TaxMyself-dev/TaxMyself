import { tool } from "ai";
import { Schema } from "effect";

import { toStandardSchema } from "../../../../backend/shared/schema/standard-schema";
import {
  agentToolModelOutput,
  readAgentCutToolResult,
} from "../../core/tool-runtime/agent-tool-output";

/**
 * The items a tool result left out to fit what the model reads
 * (agentToolModelOutput's cut), read from where the cut note says: the
 * result's id and the first item not shown. A long site search or group list
 * is read in parts this way instead of losing its end, since a site's cursor
 * continues after every item gathered, shown or not. Reads only what was
 * already returned; it searches nothing.
 * The items of a cut result from `from` on, with the result's other fields;
 * a result no longer kept fails with TOOL_RESULT_NOT_KEPT.
 *
 * @param resultId - The cut result's tool call id.
 * @param from - The first item to read, where the cut note says the result
 *   stopped.
 * @returns The result's other fields with its list from `from` on, where it
 *   starts (shownFrom) and the list's full length (of); it throws
 *   TOOL_RESULT_NOT_KEPT once the result is gone.
 */
export const readCutToolResultItems = (resultId: string, from: number) => {
  const cut = readAgentCutToolResult(resultId);

  if (cut === undefined) {
    throw new Error(
      "TOOL_RESULT_NOT_KEPT: that result is no longer kept. Run its search again, more narrowly (a filter, fewer results), or continue it with its cursor."
    );
  }

  return {
    ...cut.fields,
    [cut.key]: cut.items.slice(from),
    shownFrom: from,
    of: cut.items.length,
  };
};

export const readToolResultItemsTool = tool({
  description:
    "Read the items a tool result left out to fit: its cut note gives the result's id (resultId) and the first item not shown (from). Returns the next items of the same list, as many as fit, with a new cut note when more are left. Searches nothing new.",
  inputSchema: toStandardSchema(
    Schema.Struct({
      resultId: Schema.String.check(Schema.isMaxLength(100)),
      from: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    })
  ),
  execute: ({ resultId, from }) => readCutToolResultItems(resultId, from),
  toModelOutput: ({ output, toolCallId }) =>
    agentToolModelOutput({ output, toolCallId }),
});
