import { tool } from "ai";
import { Schema } from "effect";

import { appRuntime } from "@/server/runtime/app-runtime.server";

import { toStandardSchema } from "../../../../backend/shared/schema/standard-schema";
import { agentToolContextSchema } from "../../core/tool-runtime/agent-tool-context";
import { agentToolModelOutput } from "../../core/tool-runtime/agent-tool-output";

// EXAMPLE TOOL: a slow outside read (WebSearch, example-ports.ts). The
// pattern for any search or scrape:
// - it reports progress while it runs, shown on the chat's status line
//   (pageData.showSearchProgress, a transient stream part);
// - it brings the number the user asked for, or 10, and the answer offers
//   more (agent-instructions.ts <tool_calls>);
// - a long result is cut for the model with a note, and the model reads
//   the rest with readToolResultItems (agent-tool-output.ts);
// - it is "external" in agent-tool-traits.ts: independent reads run side by
//   side in one step, and the answer after it is checked against it.

export const searchWebTool = tool({
  description:
    "Search the web now. Brings maxResults results (the number the user asked for, or 10) with title, link and snippet; answer from them with their links and offer more.",
  inputSchema: toStandardSchema(
    Schema.Struct({
      query: Schema.Trim.check(
        Schema.isMinLength(2),
        Schema.isMaxLength(200)
      ).annotate({ description: "What to search for, in the user's language" }),
      maxResults: Schema.Int.check(
        Schema.isGreaterThanOrEqualTo(1),
        Schema.isLessThanOrEqualTo(50)
      ).annotate({ description: "How many results the user asked for, or 10" }),
    })
  ),
  contextSchema: agentToolContextSchema,
  execute: async ({ query, maxResults }, { context, toolCallId }) =>
    await appRuntime.runPromise(
      context.webSearch.search(query, maxResults, (progress) => {
        context.pageData.showSearchProgress({ toolCallId, ...progress });
      })
    ),
  toModelOutput: ({ output, toolCallId }) =>
    agentToolModelOutput({ output: { results: output }, toolCallId }),
});
