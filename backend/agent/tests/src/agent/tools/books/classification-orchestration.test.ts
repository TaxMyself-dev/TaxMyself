import type { ModelMessage } from "ai";
import { describe, expect, it } from "vitest";

import { agentChatToolApproval } from "@/agent/core/tool-runtime/agent-tool-approval";
import { agentToolNamespaceName } from "@/agent/core/tool-runtime/agent-tool-search";
import { prepareClassificationApprovalStep } from "@/agent/tools/books/classification-orchestration";

const messages: ModelMessage[] = [
  { role: "user", content: "סווג את תנועת Adobe שהצגת כהוצאות תוכנה" },
];

const prepare = (proposalId = "p", requestApproval = true) => ({
  toolCalls: [{ toolName: "prepareTransactionClassification", input: {} }],
  toolResults: [
    {
      toolName: "prepareTransactionClassification",
      output: { proposalId, requestApproval },
    },
  ],
});

describe("classification approval orchestration", () => {
  it("forces the missing card instead of permitting the failed continuation to end in text", () => {
    const result = prepareClassificationApprovalStep([prepare()], messages);
    expect(result?.toolChoice).toBe("required");
    expect(result?.activeTools).toStrictEqual(["classifyTransaction"]);
    expect(agentToolNamespaceName("classifyTransaction")).toBeUndefined();
    expect(result?.messages.at(-1)?.content).toContain('proposalId="p"');
    expect(
      agentChatToolApproval(
        { toolName: "classifyTransaction", input: { proposalId: "p" } },
        {}
      )
    ).toBe("user-approval");
  });

  it("preserves an explicit proposal-only request and a read-only follow-up", () => {
    expect(
      prepareClassificationApprovalStep([prepare("p", false)], messages)
    ).toBeNull();
    expect(
      prepareClassificationApprovalStep([prepare()], messages, "follow-up")
    ).toBeNull();
  });

  it("never fabricates a card from failure, malformed output or historical messages", () => {
    expect(prepareClassificationApprovalStep([], messages)).toBeNull();
    expect(
      prepareClassificationApprovalStep(
        [
          {
            toolCalls: [],
            toolResults: [
              {
                toolName: "prepareTransactionClassification",
                output: { error: "failed" },
              },
            ],
          },
        ],
        messages
      )
    ).toBeNull();
  });

  it("does not repeat an attempted proposal, including a denied or failed action", () => {
    const attempted = {
      toolCalls: [
        { toolName: "classifyTransaction", input: { proposalId: "p" } },
      ],
    };

    expect(
      prepareClassificationApprovalStep([prepare(), attempted], messages)
    ).toBeNull();
  });

  it("requires a fresh card after re-preparation rather than reusing earlier approval", () => {
    const attempted = {
      toolCalls: [
        { toolName: "classifyTransaction", input: { proposalId: "old" } },
      ],
    };

    const result = prepareClassificationApprovalStep(
      [prepare("old"), attempted, prepare("new")],
      messages,
      "approval"
    );

    expect(result?.messages.at(-1)?.content).toContain('proposalId="new"');
  });

  it("a latest preview does not revive an older pending proposal", () => {
    expect(
      prepareClassificationApprovalStep(
        [prepare("old"), prepare("new", false)],
        messages
      )
    ).toBeNull();
  });
});
