import { assert, it, describe } from "@effect/vitest";

import { applyAgentChatApprovals } from "../../../../../src/agent/chat/turn/agent-chat-approvals";
import type { AgentChatMessage } from "../../../../../src/lib/agent-chat/conversation/agent-chat-messages";

const deleteTasksTool = "tool-deleteTrackingTasks";

const stored: AgentChatMessage = {
  id: "a1",
  role: "assistant",
  parts: [
    { type: "text", text: "מוחק" },
    {
      type: deleteTasksTool,
      toolCallId: "call_1",
      state: "approval-requested",
      input: { taskIds: ["6f1c2a1e-1111-4a1a-8a1a-111111111111"] },
      approval: { id: "approval_1" },
    },
  ],
};

describe("agent chat approvals", () => {
  it("the page's decision answers the approval the agent asked for", () => {
    const answered = applyAgentChatApprovals(stored, [
      {
        type: deleteTasksTool,
        approval: { id: "approval_1", approved: true },
      },
    ]);

    const [, part] = answered.parts;
    assert.ok("state" in part && part.state === "approval-responded");
    assert.ok("approval" in part && part.approval?.approved);
  });

  it("everything else the page sends is ignored", () => {
    const answered = applyAgentChatApprovals(stored, [
      { type: "text", text: "changed by the page" },
      {
        type: deleteTasksTool,
        approval: { id: "made_up", approved: true },
      },
      {
        type: deleteTasksTool,
        input: { taskIds: ["7a1c2a1e-2222-4a1a-8a1a-222222222222"] },
        approval: { id: "approval_1" },
      },
    ]);

    assert.deepStrictEqual(answered, stored);
  });
});
