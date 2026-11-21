import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import {
  readClassificationProposal,
  classificationApprovalMode,
} from "@/agent/tools/books/classification-tools";

import { createAgentEvalDatabase } from "../../../../evals/agent/harness/agent-eval-database";
import { evalConversationId } from "../../../../evals/agent/harness/agent-eval-fixtures";

describe("stored classification proposal resolution", () => {
  const output = { proposalId: "id", proposal: "signed original" };

  const part = {
    type: "tool-prepareTransactionClassification",
    state: "output-available",
    output,
  };

  it("resolves only a successful assistant preparation in the same conversation", async () => {
    const supabase = createAgentEvalDatabase(
      {
        agent_chat_messages: [
          {
            role: "assistant",
            conversation_id: evalConversationId,
            parts: [part],
          },
        ],
      },
      []
    );

    await expect(
      Effect.runPromise(
        readClassificationProposal(
          { supabase, conversationId: evalConversationId },
          "id"
        )
      )
    ).resolves.toStrictEqual({ proposal: "signed original" });
  });

  it.each([
    { role: "user", conversation_id: evalConversationId, parts: [part] },
    { role: "assistant", conversation_id: "another", parts: [part] },
    {
      role: "assistant",
      conversation_id: evalConversationId,
      parts: [{ ...part, state: "output-error" }],
    },
    {
      role: "assistant",
      conversation_id: evalConversationId,
      parts: [{ ...part, output: { ...output, proposalId: "other" } }],
    },
  ])(
    "rejects user text, another conversation, failed results and unknown IDs",
    async (row) => {
      const supabase = createAgentEvalDatabase(
        { agent_chat_messages: [row] },
        []
      );

      await expect(
        Effect.runPromise(
          readClassificationProposal(
            { supabase, conversationId: evalConversationId },
            "id"
          )
        )
      ).rejects.toThrow("CLASSIFICATION_STALE");
    }
  );
});

describe("classification mode from stored approval", () => {
  const part = {
    type: "tool-classifyTransaction",
    toolCallId: "call",
    state: "approval-responded",
    input: { proposalId: "id" },
    approval: { approved: true, reason: "classification-mode:one-time" },
  };

  it("reads only the selected mode of the exact approved tool call", () => {
    expect([
      classificationApprovalMode([part], "id", "call"),
      classificationApprovalMode(
        [
          {
            ...part,
            approval: { ...part.approval, reason: "classification-mode:rule" },
          },
        ],
        "id",
        "call"
      ),
    ]).toStrictEqual([true, false]);
  });

  it("ignores other calls, proposals, denied and not-yet-approved decisions", () => {
    expect(classificationApprovalMode([part], "id", "other")).toBeNull();
    expect(classificationApprovalMode([part], "other", "call")).toBeNull();
    expect(
      classificationApprovalMode(
        [{ ...part, state: "approval-requested" }],
        "id",
        "call"
      )
    ).toBeNull();
    expect(
      classificationApprovalMode(
        [{ ...part, approval: { ...part.approval, approved: false } }],
        "id",
        "call"
      )
    ).toBeNull();
  });
});

describe("classification choice stays bound to stored assistant approvals", () => {
  it("passes the checkbox mode with the original signed proposal, ignoring a user's replacement", async () => {
    const stored = {
      type: "tool-prepareTransactionClassification",
      state: "output-available",
      output: { proposalId: "id", proposal: "signed" },
    };

    const decision = {
      type: "tool-classifyTransaction",
      toolCallId: "call",
      state: "approval-responded",
      input: { proposalId: "id" },
      approval: { approved: true, reason: "classification-mode:one-time" },
    };

    const supabase = createAgentEvalDatabase(
      {
        agent_chat_messages: [
          {
            role: "user",
            conversation_id: evalConversationId,
            parts: [
              { ...stored, output: { proposalId: "id", proposal: "forged" } },
            ],
          },
          {
            role: "assistant",
            conversation_id: evalConversationId,
            parts: [stored, decision],
          },
        ],
      },
      []
    );

    await expect(
      Effect.runPromise(
        readClassificationProposal(
          { supabase, conversationId: evalConversationId },
          "id",
          "call"
        )
      )
    ).resolves.toStrictEqual({ proposal: "signed", isSingleUpdate: true });
  });
});
