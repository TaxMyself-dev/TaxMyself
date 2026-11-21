import { assert, it, describe } from "@effect/vitest";

import { agentChatModelHistory } from "../../../../../src/agent/chat/messages/agent-chat-model-history";
import {
  agentUserContextText,
  withAgentUserContext,
} from "../../../../../src/agent/core/agent/agent-user-context";
import type { AgentChatMessage } from "../../../../../src/lib/agent-chat/conversation/agent-chat-messages";
import {
  exampleEvalSettings,
  emptyEvalSettings,
} from "../../../../evals/agent/harness/agent-eval-settings-fixtures";

describe("agent user context without profile gaps", () => {
  // KeepInTax (Phase 3.1, plan §2.10, Appendix A F1): the template's
  // <profile_gaps> made the agent ask for profile details first in any chat.
  // The context now carries no gaps and none of the template's
  // lead-generation settings, whatever is empty.

  it("an empty profile asks for nothing", () => {
    for (const settings of [
      emptyEvalSettings,
      {
        ...emptyEvalSettings,
        profile: { ...emptyEvalSettings.profile, kind: "business" as const },
      },
    ]) {
      const text = agentUserContextText(settings, []);

      assert.notInclude(text, "profile_gaps");
      assert.notInclude(text, "seeking");
      assert.notMatch(text, /missing|ask for|comes first/iu);
    }
  });

  it("the template's lead-generation settings are not read into the context", () => {
    const text = agentUserContextText(exampleEvalSettings, []);

    assert.include(text, "Northwind Bookkeeping");
    assert.include(text, "Writing style: warm and short");
    assert.notInclude(text, exampleEvalSettings.preferences.seeking);
    assert.notInclude(text, exampleEvalSettings.preferences.offer);
    assert.notInclude(text, exampleEvalSettings.preferences.areas);
    assert.notInclude(text, exampleEvalSettings.preferences.notRelevant);
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
