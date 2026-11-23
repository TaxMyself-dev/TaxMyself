import { assert, describe, it } from "@effect/vitest";

import type { AgentChatMessage } from "../../../../../src/lib/agent-chat/conversation/agent-chat-messages";
import { agentChatAnswerWithSteers } from "../../../../../src/lib/agent-chat/conversation/agent-chat-user-steers";

// An answer the user wrote into shows as its stretches with the user's
// messages between them, each stretch timed from the steer before it to the
// steer after it, so each shows its own "עבד במשך".

const answerStart = "2026-10-17T10:00:00.000Z";
const steerAt = "2026-10-17T10:00:20.000Z";
const answerEnd = "2026-10-17T10:00:45.000Z";

const steerPart = {
  type: "data-userSteer" as const,
  data: { id: "s1", text: "רק בחיפה", createdAt: steerAt },
};

const answer = (parts: AgentChatMessage["parts"]): AgentChatMessage => ({
  id: "a1",
  role: "assistant",
  metadata: { createdAt: answerStart, finishedAt: answerEnd },
  parts,
});

describe("agent chat user steers", () => {
  it("an answer nobody wrote into stays one message", () => {
    const plain = answer([{ type: "text", text: "מצאתי" }]);

    assert.deepStrictEqual(agentChatAnswerWithSteers(plain), [plain]);
  });

  it("a steer splits the answer into two stretches with the user's message between", () => {
    const shown = agentChatAnswerWithSteers(
      answer([
        { type: "text", text: "מחפש" },
        steerPart,
        { type: "text", text: "מצאתי בחיפה" },
      ])
    );

    assert.deepStrictEqual(shown, [
      {
        id: "a1",
        role: "assistant",
        metadata: { createdAt: answerStart, finishedAt: steerAt },
        parts: [{ type: "text", text: "מחפש" }],
      },
      {
        id: "s1",
        role: "user",
        metadata: { createdAt: steerAt },
        parts: [{ type: "text", text: "רק בחיפה" }],
      },
      {
        id: "a1-steer-1",
        role: "assistant",
        metadata: { createdAt: steerAt, finishedAt: answerEnd },
        parts: [{ type: "text", text: "מצאתי בחיפה" }],
      },
    ]);
  });

  it("a steer the agent read last, with nothing after it yet, ends the list", () => {
    const shown = agentChatAnswerWithSteers(
      answer([{ type: "text", text: "מחפש" }, steerPart])
    );

    assert.deepStrictEqual(
      shown.map((message) => [message.id, message.role]),
      [
        ["a1", "assistant"],
        ["s1", "user"],
      ]
    );
  });

  it("a user's own message is never split", () => {
    const user: AgentChatMessage = {
      id: "u1",
      role: "user",
      parts: [{ type: "text", text: "היי" }],
    };

    assert.deepStrictEqual(agentChatAnswerWithSteers(user), [user]);
  });
});
