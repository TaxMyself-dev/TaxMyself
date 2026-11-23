import { tool } from "ai";
import { Schema } from "effect";

import { readAppKnowledge } from "@/agent/tools/conversation/app-knowledge";

import { toStandardSchema } from "../../../../backend/shared/schema/standard-schema";
import { agentToolModelOutput } from "../../core/tool-runtime/agent-tool-output";

// What KeepInTax is and how to use it (readAppKnowledge), so the
// agent answers questions about the app from the app's own pages, plans and
// help center instead of guessing.
export const readAppKnowledgeTool = tool({
  description:
    "Read how KeepInTax works: its parts, every page with its path, the settings sections, the plans with prices, and the help center's answers with links. Call it for any question about the app that your other tools do not answer.",
  // No input. A Record, not an empty Struct: an empty Struct's JSON Schema is
  // not an object, and the model needs `type: "object"`.
  inputSchema: toStandardSchema(Schema.Record(Schema.String, Schema.Unknown)),
  execute: () => readAppKnowledge(),
  toModelOutput: ({ output, toolCallId }) =>
    agentToolModelOutput({ output, toolCallId }),
});
