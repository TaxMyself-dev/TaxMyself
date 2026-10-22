import { describe, it } from "@effect/vitest";
import { LLMTestCase } from "deepeval/test-case";

import { nameStoredAgentChatConversation } from "@/agent/chat/conversations/agent-chat-title.server";
import { appRuntime } from "@/server/runtime/app-runtime.server";

import { createAgentEvalDatabase } from "../harness/agent-eval-database";
// Registers DeepEval's toPass matcher and logs the run's hyperparameters.
import "../harness/agent-eval-harness";
import { evalUserId } from "../harness/agent-eval-fixtures";
import type { AgentEvalWrite } from "../harness/agent-eval-fixtures";
import { agentAnswerJudge } from "../harness/agent-eval-judge";

// A new chat's title (src/agent/chat/conversations/agent-chat-title.server.ts): a few
// words in the user's language naming what they asked, and no title yet
// while they have only said hello.

const evalConversationId = "00000000-0000-4000-8000-0000000000c2";

const storedChatMessage = (
  id: string,
  role: "user" | "assistant",
  text: string
) => ({
  id,
  conversation_id: evalConversationId,
  role,
  parts: [{ type: "text", text }],
  created_at: "2026-10-04T10:00:00.000Z",
});

const nameChat = async (messages: ReturnType<typeof storedChatMessage>[]) => {
  const writes: AgentEvalWrite[] = [];

  return await appRuntime.runPromise(
    nameStoredAgentChatConversation(
      createAgentEvalDatabase(
        {
          agent_chat_messages: messages,
          agent_chat_conversations: [{ id: evalConversationId, name: null }],
        },
        writes
      ),
      evalUserId,
      evalConversationId
    )
  );
};

describe.concurrent("chat titles", () => {
  it("names a chat by what the user asked, in Hebrew", async ({ expect }) => {
    const question = "תמצא לי רואה חשבון בחיפה שמתמחה בעסקים קטנים";

    const title = await nameChat([
      storedChatMessage(
        "00000000-0000-4000-8000-0000000000a1",
        "user",
        question
      ),
      storedChatMessage(
        "00000000-0000-4000-8000-0000000000a2",
        "assistant",
        "יצרתי משימה: למצוא רואה חשבון בחיפה לעסקים קטנים."
      ),
    ]);

    const words = title?.split(/\s+/u) ?? [];
    expect(words.length).toBeGreaterThanOrEqual(2);
    expect(words.length).toBeLessThanOrEqual(6);
    await expect(
      new LLMTestCase({ input: question, actualOutput: title ?? "" })
    ).toPass([
      agentAnswerJudge("Names the request", [
        "`test_case.actual_output` is a short Hebrew title about finding an accountant in Haifa.",
      ]),
    ]);
  });

  it("leaves a chat unnamed while the user has only said hello", async ({
    expect,
  }) => {
    const title = await nameChat([
      storedChatMessage("00000000-0000-4000-8000-0000000000b1", "user", "היי"),
      storedChatMessage(
        "00000000-0000-4000-8000-0000000000b2",
        "assistant",
        "היי! במה אפשר לעזור?"
      ),
    ]);

    expect(title).toBeNull();
  });
});
