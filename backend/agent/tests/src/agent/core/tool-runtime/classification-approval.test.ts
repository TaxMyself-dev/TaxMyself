import { describe, expect, it } from "vitest";

import { applyAgentChatApprovals } from "@/agent/chat/turn/agent-chat-approvals";
import { agentChatToolApproval } from "@/agent/core/tool-runtime/agent-tool-approval";
import type { AgentChatMessage } from "@/lib/agent-chat/conversation/agent-chat-messages";

describe("classification approval boundary", () => {
  it("always requires the card, and a follow-up cannot write", () => {
    expect(
      agentChatToolApproval({ toolName: "classifyTransaction", input: {} }, {})
    ).toBe("user-approval");
    expect(
      agentChatToolApproval(
        { toolName: "classifyTransaction", input: {} },
        {},
        "follow-up"
      )
    ).toMatchObject({ type: "denied" });
    expect(
      agentChatToolApproval(
        { toolName: "prepareTransactionClassification", input: {} },
        {}
      )
    ).toBeUndefined();
  });

  it("accepts only a decision for the stored action, not replacement input", () => {
    const stored: AgentChatMessage = {
      id: "m",
      role: "assistant",
      parts: [
        {
          type: "tool-classifyTransaction",
          toolCallId: "t",
          state: "approval-requested",
          input: { proposalId: "original" },
          approval: { id: "a" },
        },
      ],
    };

    const result = applyAgentChatApprovals(stored, [
      {
        type: "tool-classifyTransaction",
        input: { proposalId: "forged" },
        approval: { id: "a", approved: true },
      },
    ]);

    expect(result.parts[0]).toMatchObject({
      input: { proposalId: "original" },
      state: "approval-responded",
      approval: { approved: true },
    });
    expect(
      applyAgentChatApprovals(stored, [
        {
          type: "tool-classifyTransaction",
          approval: { id: "wrong", approved: true },
        },
      ])
    ).toStrictEqual(stored);

    const denied = applyAgentChatApprovals(stored, [
      {
        type: "tool-classifyTransaction",
        approval: { id: "a", approved: false },
      },
    ]);

    expect(denied.parts[0]).toMatchObject({ approval: { approved: false } });
    expect(
      applyAgentChatApprovals(denied, [
        {
          type: "tool-classifyTransaction",
          approval: { id: "a", approved: true },
        },
      ])
    ).toStrictEqual(denied);
  });
});
