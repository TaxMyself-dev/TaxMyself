import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { readClassificationProposal } from "@/agent/tools/books/classification-tools";

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
