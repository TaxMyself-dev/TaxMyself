import { assert, it, describe } from "@effect/vitest";

import { agentChatRetryHasActions } from "../../../../../src/agent/chat/turn/agent-chat-retry";
import type { AgentChatMessagePart } from "../../../../../src/lib/agent-chat/conversation/agent-chat-messages";

const hasAction = (part: AgentChatMessagePart) =>
  agentChatRetryHasActions([
    { id: "answer", role: "assistant", parts: [part] },
  ]);

describe("agent chat retry", () => {
  it("regeneration refuses completed or uncertain writes, while reads and unanswered approvals can retry", () => {
    assert.strictEqual(
      hasAction({
        type: "tool-createTrackingTask",
        toolCallId: "1",
        state: "input-available",
        input: { sentence: "Find an accountant" },
      }),
      true
    );
    assert.strictEqual(
      hasAction({
        type: "tool-deleteTrackingTasks",
        toolCallId: "1",
        state: "output-available",
        input: { taskIds: [] },
        output: { deleted: 1 },
      }),
      true
    );
    assert.strictEqual(
      hasAction({
        type: "tool-sendEmail",
        toolCallId: "1",
        state: "output-error",
        input: { to: "dana@example.com", subject: "Report", body: "Ready." },
        errorText: "timeout",
      }),
      true
    );
    assert.strictEqual(
      hasAction({
        type: "tool-listTrackingTasks",
        toolCallId: "1",
        state: "output-available",
        input: {},
        output: [],
      }),
      false
    );
    assert.strictEqual(
      hasAction({
        type: "tool-deleteTrackingTasks",
        toolCallId: "1",
        state: "approval-requested",
        input: { taskIds: [] },
        approval: { id: "approval" },
      }),
      false
    );
  });
});
