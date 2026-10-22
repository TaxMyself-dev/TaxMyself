import { assert, it, describe } from "@effect/vitest";
import type { ModelMessage } from "ai";

import {
  agentTurnEndedAnswer,
  createAgentStopHooks,
} from "../../../../../src/agent/core/turn/agent-stop-hooks";

// When an answer ends (text, no tool call), the plan gate sends it back while
// its plan has open steps, twice at most, then the answer check runs once;
// a turn that stops for a card or an approval runs no hook.

const openPlan = {
  text: "",
  toolCalls: [
    {
      toolName: "updatePlan",
      input: { steps: [{ text: "לחפש ברשת", status: "pending" }] },
    },
  ],
};

const answer = { text: "שלחתי הודעה למוכר.", toolCalls: [] };

const messages: ModelMessage[] = [
  { role: "user", content: "תשלח הודעה למוכר" },
  {
    role: "assistant",
    content: [
      {
        type: "tool-call",
        toolCallId: "a",
        toolName: "sendEmail",
        input: {},
      },
    ],
  },
];

describe("agent stop hooks", () => {
  it("an answer ends on text with no tool call, not on a card or an approval", () => {
    assert.isTrue(agentTurnEndedAnswer([answer]));
    assert.isFalse(
      agentTurnEndedAnswer([
        {
          text: "איזו עיר?",
          toolCalls: [{ toolName: "askUserQuestion", input: {} }],
        },
      ])
    );
    assert.isFalse(agentTurnEndedAnswer([{ text: "", toolCalls: [] }]));
  });

  it("the plan gate sends an answer back twice, then the answer check runs once", async () => {
    const checked: string[] = [];

    const hooks = createAgentStopHooks(async (input) => {
      checked.push(input.answer);

      return await Promise.resolve(["Your answer says a message was sent."]);
    });

    assert.include(
      JSON.stringify(await hooks([openPlan, answer], messages)),
      "- לחפש ברשת"
    );
    assert.include(
      JSON.stringify(await hooks([openPlan, answer, answer], messages)),
      "- לחפש ברשת"
    );
    assert.include(
      JSON.stringify(await hooks([openPlan, answer, answer, answer], messages)),
      "a message was sent"
    );
    assert.isNull(
      await hooks([openPlan, answer, answer, answer, answer], messages)
    );
    assert.lengthOf(checked, 1);
  });

  it("an empty reply is sent back to answer, twice at most", async () => {
    const hooks = createAgentStopHooks();
    const empty = { text: " ", toolCalls: [] };

    assert.include(
      JSON.stringify(await hooks([empty], messages)),
      "Your last reply was empty"
    );
    assert.include(
      JSON.stringify(await hooks([empty, empty], messages)),
      "Your last reply was empty"
    );
    assert.isNull(await hooks([empty, empty, empty], messages));
  });

  // Seen in a development chat: the model ran OpenAI's tool search, found
  // nothing, and ended with no text; the answer was empty.
  it("a reply with only a tool search OpenAI ran is empty too", async () => {
    const hooks = createAgentStopHooks();

    const searchedOnly = {
      text: "",
      toolCalls: [
        { toolName: "toolSearch", input: {}, providerExecuted: true },
      ],
    };

    assert.include(
      JSON.stringify(await hooks([searchedOnly], messages)),
      "Your last reply was empty"
    );
  });

  it("no hook runs on a turn that waits, nor a check without a runner", async () => {
    const hooks = createAgentStopHooks();
    assert.isNull(
      await hooks(
        [
          {
            text: "",
            toolCalls: [{ toolName: "sendEmail", input: {} }],
          },
        ],
        messages
      )
    );
    assert.isNull(await hooks([answer], messages));
  });
});
