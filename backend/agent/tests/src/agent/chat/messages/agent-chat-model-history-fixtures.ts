import type { AgentChatMessage } from "../../../../../src/lib/agent-chat/conversation/agent-chat-messages";

// What the model history tests share: the tool calls and messages they read
// (agent-chat-model-history.test.ts, agent-chat-model-history-notes.test.ts).

export const deleteTasksTool = "tool-deleteTrackingTasks";
export const taskId = "6f1c2a1e-1111-4a1a-8a1a-111111111111";
export const inputAvailable = "input-available";
export const stoppedYou = "עצרתי אותך";
export const documentTextPart = "data-documentText" as const;

/**
 * A user's message as stored, with its time.
 *
 * @param id - The message's id.
 * @param text - What the user wrote.
 * @returns The message.
 */
export const userMessage = (id: string, text: string): AgentChatMessage => ({
  id,
  role: "user",
  metadata: { createdAt: "2026-10-04T09:01:00.000Z" },
  parts: [{ type: "text", text }],
});

/**
 * An answer whose task deletion the user turned down, with their note.
 *
 * @param reason - The user's note, if any.
 * @returns The answer.
 */
export const deniedDeletion = (reason?: string): AgentChatMessage => ({
  id: "a1",
  role: "assistant",
  parts: [
    {
      type: deleteTasksTool,
      toolCallId: "call_1",
      state: "output-denied",
      input: { taskIds: [taskId] },
      approval: { id: "approval_1", approved: false, reason },
    },
  ],
});

/**
 * The note on a message's first part's approval, if any.
 *
 * @param message - The message as the model history wrote it.
 * @returns The note.
 */
export const deniedReason = (message: AgentChatMessage) => {
  const [part] = message.parts;

  return "approval" in part ? part.approval?.reason : undefined;
};
