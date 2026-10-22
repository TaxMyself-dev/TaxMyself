import { tool } from "ai";
import { Schema } from "effect";

import { agentChatSuggestedTaskSchema } from "@/lib/agent-chat/conversation/agent-chat-messages";

import { toStandardSchema } from "../../../../backend/shared/schema/standard-schema";

// Shows tracking tasks the agent suggests as cards in the chat; the user adds
// the ones they want (they wait in Suggestions). Nothing is saved by the tool.
export const suggestTrackingTasksTool = tool({
  description:
    "Show tasks you suggest as cards the user can add; nothing is saved until they add one, and added ones wait in Suggestions. Use it when the user explores what to track, after listTrackingTasks, with tasks they lack. A task the user asked for and agreed to goes through createTrackingTask.",
  inputSchema: toStandardSchema(
    Schema.Struct({
      tasks: Schema.Array(agentChatSuggestedTaskSchema).check(
        Schema.isMinLength(1),
        Schema.isMaxLength(5)
      ),
    })
  ),
  execute: ({ tasks }) => ({ shown: tasks.length }),
});
