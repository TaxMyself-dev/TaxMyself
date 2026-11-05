import { assert, describe, it } from "@effect/vitest";

import {
  agentShortTermFoldIndex,
  agentShortTermHistory,
} from "../../../../src/agent/memory/short-term-memory.server";
import type { AgentSkillName } from "../../../../src/agent/skills/registry/agent-skills";
import type { AgentChatMessage } from "../../../../src/lib/agent-chat/conversation/agent-chat-messages";

// A long chat keeps its newest messages and replaces the older ones with a
// list of what they hold, which searchEarlierResults opens in full
// (short-term-memory.server.ts). The budget is 48,000 tokens at 4 bytes a
// token (192,000 bytes), left out in steps of 16,000 tokens (64,000 bytes).

const researchBriefSkill = "research-brief";

// Messages of exactly `bytes` bytes each as the model reads them (the part's
// JSON, {"type":"text","text":""} being 25 of them), so the token counts
// below come out whole: 8,000 bytes are 2,000 tokens.
const conversation = (count: number, bytes: number): AgentChatMessage[] =>
  Array.from({ length: count }, (_, index) => {
    const start = `message ${index} `;

    return {
      id: `m${index}`,
      role: index % 2 === 0 ? "user" : "assistant",
      parts: [
        {
          type: "text",
          text: start.padEnd(bytes - 25, "x").slice(0, bytes - 25),
        },
      ],
    };
  });

// 39 messages of 2,000 tokens: 78,000 tokens in all.
const longChat = () => conversation(39, 8000);

const historyText = (history: AgentChatMessage[]) => JSON.stringify(history);

const loadedPlaybook = (name: AgentSkillName): AgentChatMessage => ({
  id: `load-${name}`,
  role: "assistant",
  parts: [
    {
      type: "tool-loadAgentSkill",
      toolCallId: `call-${name}`,
      state: "output-available",
      input: { name },
      output: { name, content: "" },
    },
  ],
});

const jobSearch: AgentChatMessage = {
  id: "jobs",
  role: "assistant",
  metadata: { createdAt: "2026-10-17T09:30:00.000Z" },
  parts: [
    // As a dynamic part, so the fixture needs no full job fields.
    {
      type: "dynamic-tool",
      toolName: "searchWeb",
      toolCallId: "call-jobs",
      state: "output-available",
      input: {},
      output: {
        sites: [
          {
            site: "careers",
            jobs: [
              {
                title: "מנהל/ת צוות שירות לקוחות",
                company: "PassportCard",
                url: "https://careers.example.com/job/38568578/",
              },
              {
                title: "מנהל/ת צוות ENT",
                company: "סלקום",
                url: "https://jobsboard.example.com/job/1",
              },
            ],
          },
        ],
      },
    },
    { type: "text", text: "מצאתי 2 משרות ניהול צוות." },
  ],
};

describe("short term memory", () => {
  it("a conversation within the budget reaches the model as it is", () => {
    const messages = conversation(30, 6000);

    // 30 × 6,000 bytes = 45,000 tokens, under 48,000.
    assert.strictEqual(agentShortTermFoldIndex(messages), 0);
    assert.strictEqual(agentShortTermHistory(messages), messages);
  });

  it("a long conversation leaves out its older part at a user message, keeping the rest within the budget", () => {
    const messages = longChat();
    const fold = agentShortTermFoldIndex(messages);

    // 78,000 tokens: the first fold point (after 16,000 tokens, message 8)
    // leaves 62,000; the second (after 32,000, message 16) leaves 46,000,
    // within the budget.
    assert.strictEqual(fold, 16);
    assert.strictEqual(messages[fold].role, "user");
  });

  it("the fold point stays the same while the conversation grows a little, so the prompt cache keeps matching", () => {
    const messages = longChat();

    // Two more messages of 2,000 tokens: 50,000 after point 16, over the
    // budget, so the next point (after 48,000 tokens, message 24) is used.
    const longer = [...messages, ...conversation(2, 8000)];

    // A short exchange (about 20 tokens): 46,020 after point 16, still
    // within the budget.
    const shortReply = [...messages, ...conversation(2, 40)];

    assert.strictEqual(agentShortTermFoldIndex(shortReply), 16);
    assert.strictEqual(agentShortTermFoldIndex(longer), 24);
  });

  it("the newest messages are never left out, even when they alone pass the budget", () => {
    // Six messages of 60,000 bytes (15,000 tokens): 90,000 tokens.
    const messages = conversation(6, 60_000);
    assert.strictEqual(agentShortTermFoldIndex(messages), 0);
  });

  it("the older part becomes one list ahead of the newest messages, with what each search found", () => {
    const messages = longChat();
    messages.splice(3, 1, jobSearch);
    const fold = agentShortTermFoldIndex(messages);
    const history = agentShortTermHistory(messages);

    assert.isAbove(fold, 3);
    assert.strictEqual(history[0].id, `earlier-${messages[fold - 1].id}`);
    assert.deepStrictEqual(history.slice(1), messages.slice(fold));

    const [list] = history[0].parts;
    const text = list.type === "text" ? list.text : "";
    assert.include(text, "<earlier_in_chat>");
    assert.include(text, "searchEarlierResults");
    assert.include(text, "- user: message 0 x");
    assert.include(
      text,
      "- you 2026-10-17T09:30: מצאתי 2 משרות ניהול צוות.\n  searchWeb found 2: מנהל/ת צוות שירות לקוחות; מנהל/ת צוות ENT"
    );
    // Each message's text is cut to 300 characters.
    assert.notInclude(text, "x".repeat(400));
  });

  it("a playbook loaded in the older part reaches the model whole after the list", () => {
    const messages = longChat();
    messages.splice(1, 1, loadedPlaybook(researchBriefSkill));
    const text = historyText(agentShortTermHistory(messages).slice(0, 1));
    assert.include(text, "<loaded_playbooks>");
    assert.include(text, "# Research brief");
  });

  it("a playbook loaded again among the newest messages is not repeated in the list", () => {
    const messages = [
      ...longChat(),
      { ...loadedPlaybook(researchBriefSkill), id: "reload" },
    ];

    messages.splice(1, 1, loadedPlaybook(researchBriefSkill));
    const text = historyText(agentShortTermHistory(messages).slice(0, 1));
    assert.notInclude(text, "<loaded_playbooks>");
  });
});
