import { assert, it, describe } from "@effect/vitest";
import type { ModelMessage, ToolCallPart } from "ai";

import { agentNamespaceRuleNotes } from "../../../../../src/agent/core/turn/agent-namespace-rules";

// The deferred tools' rules come only while the conversation uses them:
// after tool search loads a namespace, or one of its tools was called; once
// per turn.

const user: ModelMessage = { role: "user", content: "מה המתחרים שלי מפרסמים?" };

const called = (
  toolName: string,
  input: ToolCallPart["input"]
): ModelMessage => ({
  role: "assistant",
  content: [
    { type: "tool-call", toolCallId: `call-${toolName}`, toolName, input },
  ],
});

describe("agent namespace rules", () => {
  it("a chat that uses no deferred tool gets no rules", () => {
    assert.deepStrictEqual(
      agentNamespaceRuleNotes([user, called("listTrackingTasks", {})]),
      []
    );
  });

  it("tool search loading the email tools brings the email rules", () => {
    const [note] = agentNamespaceRuleNotes([
      user,
      called("toolSearch", { arguments: { paths: ["email"] } }),
    ]);

    assert.include(note?.content ?? "", "<email>");
  });

  it("a namespace tool called earlier brings its rules, and each set comes once", () => {
    const notes = agentNamespaceRuleNotes([
      user,
      called("sendEmail", { to: "dana@example.com" }),
      called("sendEmail", { to: "omer@example.com" }),
    ]);

    assert.lengthOf(notes, 1);
    assert.include(notes[0]?.content ?? "", "<email>");

    const given = agentNamespaceRuleNotes([
      user,
      called("searchWeb", { query: "נהג" }),
      ...notes,
    ]);

    assert.deepStrictEqual(given, []);
  });
});
