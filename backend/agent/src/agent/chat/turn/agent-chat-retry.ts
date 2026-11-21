import { getToolName, isToolUIPart } from "ai";

import { agentToolLeavesNoTrace } from "@/agent/core/tool-runtime/agent-tool-traits";
import type {
  AgentChatMessage,
  AgentChatMessagePart,
} from "@/lib/agent-chat/conversation/agent-chat-messages";

// A tool call that ran or was approved and changed data or acted in the
// user's name.
const isAgentChatAction = (part: AgentChatMessagePart) => {
  if (!isToolUIPart(part) || agentToolLeavesNoTrace(getToolName(part))) {
    return false;
  }

  const ran =
    part.state !== "input-streaming" &&
    part.state !== "approval-requested" &&
    part.state !== "output-denied";

  const refused =
    part.state === "approval-responded" && !part.approval.approved;

  return ran && !refused;
};

/**
 * Regeneration must retain receipts for writes and uncertain actions.
 * A new user turn can continue from those receipts without replaying them.
 * Which tools leave no trace comes from the agent's tool table
 * (agent-tool-traits.ts), so a new read never blocks "try again".
 *
 * @param messages - The messages a retry would replace.
 * @returns Whether any of them holds a tool call that changed data or acted in
 *   the user's name.
 */
export const agentChatRetryHasActions = (messages: AgentChatMessage[]) =>
  messages.some((message) =>
    message.parts.some((part) => isAgentChatAction(part))
  );
