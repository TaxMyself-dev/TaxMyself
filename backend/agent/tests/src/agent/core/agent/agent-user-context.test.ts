import { assert, it, describe } from "@effect/vitest";

import { agentChatModelHistory } from "../../../../../src/agent/chat/messages/agent-chat-model-history";
import {
  agentProfileGaps,
  agentUserContextText,
  withAgentUserContext,
} from "../../../../../src/agent/core/agent/agent-user-context";
import type { AgentChatMessage } from "../../../../../src/lib/agent-chat/conversation/agent-chat-messages";
import {
  exampleEvalSettings,
  emptyEvalSettings,
} from "../../../../evals/agent/harness/agent-eval-settings-fixtures";

describe("agent profile gaps", () => {
  // The profile details the agent gets first, by account kind
  // (agent-user-context.ts, <profile_gaps>).

  it("a complete business profile has no gaps", () => {
    assert.deepStrictEqual(agentProfileGaps(exampleEvalSettings), []);
  });

  it("a business lists its missing name, offer and customers", () => {
    // Areas are optional (user-settings-schema.ts): they apply only when a
    // task leaves its location empty, so they are never a gap.
    const gaps = agentProfileGaps({
      ...emptyEvalSettings,
      profile: { ...emptyEvalSettings.profile, kind: "business" },
    });

    assert.deepStrictEqual(
      gaps.map((gap) => /\((?<field>\w+)\)/u.exec(gap)?.groups?.field),
      ["name", "offer", "seeking"]
    );
    assert.match(gaps[0] ?? "", /business's name/u);
  });

  it("a private person lists only what they look for", () => {
    const gaps = agentProfileGaps({
      ...emptyEvalSettings,
      profile: { ...emptyEvalSettings.profile, kind: "individual" },
    });

    assert.deepStrictEqual(
      gaps.map((gap) => /\((?<field>\w+)\)/u.exec(gap)?.groups?.field),
      ["seeking"]
    );
  });
});

const userMessage = (id: string, text: string): AgentChatMessage => ({
  id,
  role: "user",
  metadata: { createdAt: "2026-10-04T09:01:00.000Z" },
  parts: [{ type: "text", text }],
});

const answer = (id: string): AgentChatMessage => ({
  id,
  role: "assistant",
  parts: [{ type: "text", text: "בסדר" }],
});

const contextOf = (message: AgentChatMessage | undefined) =>
  message?.parts.flatMap((part) =>
    part.type === "data-userContext" ? [part.data.text] : []
  );

describe("agent user context", () => {
  // The settings and memories reach the model as a message of their own,
  // stored with the user's message only when they changed, so the
  // instructions and the history before stay the same for the prompt cache.
  const broker = agentUserContextText(exampleEvalSettings, []);
  const empty = agentUserContextText(emptyEvalSettings, []);

  it("the first message carries the context, an unchanged one does not", () => {
    const first = withAgentUserContext([userMessage("u1", "היי")], broker);
    assert.deepStrictEqual(contextOf(first[0]), [broker]);

    const second = withAgentUserContext(
      [...first, answer("a1"), userMessage("u2", "מה המשימות שלי?")],
      broker
    );

    assert.deepStrictEqual(contextOf(second.at(-1)), []);
    assert.deepStrictEqual(second.slice(0, -1), [...first, answer("a1")]);
  });

  it("a changed context is added to the new message, never to earlier ones", () => {
    const first = withAgentUserContext([userMessage("u1", "היי")], empty);

    const second = withAgentUserContext(
      [...first, answer("a1"), userMessage("u2", "עכשיו?")],
      broker
    );

    assert.deepStrictEqual(contextOf(second[0]), [empty]);
    assert.deepStrictEqual(contextOf(second.at(-1)), [broker]);
  });

  it("an answer continued after approvals gets no context", () => {
    const messages = [userMessage("u1", "תמחק"), answer("a1")];
    assert.strictEqual(withAgentUserContext(messages, broker), messages);
  });

  it("the model reads the context as its own message before the user's", () => {
    const history = agentChatModelHistory(
      withAgentUserContext([userMessage("u1", "היי")], broker)
    );

    assert.deepStrictEqual(
      history.map((message) => message.id),
      ["u1-context", "u1"]
    );
    assert.deepStrictEqual(history[0].parts, [{ type: "text", text: broker }]);
    assert.notInclude(JSON.stringify(history[1].parts), "user_context");
  });
});
