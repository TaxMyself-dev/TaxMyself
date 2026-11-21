import { assert, describe, it } from "@effect/vitest";
import type { Schema } from "effect";

import { fitAgentChatPartsToStorage } from "../../../../../src/agent/chat/messages/agent-chat-message-storage.server";

// An answer's parts must fit the database's 256 KB cap
// (agent_chat_messages_parts_check), or the answer is not saved at all. Ones
// that fit stay as they are; bigger ones get the long texts of their tool
// results cut until they fit, never the answer's own text (2026-10-16: an
// answer continued after an approval held both runs' reads and was lost).

const bytes = (value: Schema.Json) =>
  new TextEncoder().encode(JSON.stringify(value)).byteLength;

// A tool read of 300 records of 1,000 characters (about 600 KB as JSON),
// each with an emoji where the cut that fits it (200 characters) falls.
const bigRead = {
  type: "tool-searchWeb",
  toolCallId: "call_1",
  state: "output-available",
  output: {
    results: Array.from({ length: 300 }, (_, index) => ({
      id: String(index),
      text: `${"ד".repeat(199)}😀${"ד".repeat(799)}`,
    })),
  },
};

const answer = {
  type: "text",
  text: `מצאתי 2 תוצאות מתאימות.${"א".repeat(900)}`,
};

describe("agent chat parts storage fit", () => {
  it("parts under the cap are kept as they are", () => {
    const parts = [answer, { ...bigRead, output: { results: [] } }];

    assert.strictEqual(fitAgentChatPartsToStorage(parts), parts);
  });

  it("parts over the cap fit after their tool results' long texts are cut; the answer's text is whole", () => {
    const fitted = fitAgentChatPartsToStorage([answer, bigRead]);

    assert.isTrue(bytes([answer, bigRead]) > 256_000);
    assert.isTrue(bytes(fitted) <= 230_000);
    assert.deepStrictEqual(Array.isArray(fitted) ? fitted[0] : null, answer);
    // No cut leaves half an emoji, which the database refuses.
    assert.notInclude(JSON.stringify(fitted), "\\ud83d");
  });
});
