import { assert, it, describe } from "@effect/vitest";
import type { ModelMessage, ToolResultPart } from "ai";
import { ConfigProvider, Effect, Layer } from "effect";

import { JevClient } from "../../../../../backend/shared/ai/typesafe-jev-client";
import {
  agentAnswerCheckNote,
  agentAnswerViolations,
  findAgentAnswerViolations,
} from "../../../../../src/agent/core/turn/agent-answer-check";
import type { AgentAnswerCheckInput } from "../../../../../src/agent/core/turn/agent-answer-check";
import {
  agentTurnToolOutcomes,
  agentUnreadCutResults,
} from "../../../../../src/agent/core/turn/agent-turn-tool-outcomes";
import { timedOutJevClient } from "../../../../backend/shared/fixtures/timed-out-jev-client";

const executionDenied = "execution-denied";

// When an answer ends, Jev reads it against the turn's tool results: an
// answer that says it did what no tool returned is sent back with a note
// naming the claim (once: agent-stop-hooks.test.ts). Turns that only read
// our database are not checked, and Jev failing ends the answer as it is.

const toolCall = (id: string, toolName: string): ModelMessage => ({
  role: "assistant",
  content: [{ type: "tool-call", toolCallId: id, toolName, input: {} }],
});

const toolResult = (
  id: string,
  toolName: string,
  output: ToolResultPart["output"]
): ModelMessage => ({
  role: "tool",
  content: [{ type: "tool-result", toolCallId: id, toolName, output }],
});

const userMessage: ModelMessage = {
  role: "user",
  content: "תשלח הודעה למוכר",
};

const ending = (text: string) => ({ text, toolCalls: [] });

const noAnswers = {
  sent_message: { noul: 0 },
  deleted: { noul: 0 },
  task_changed: { noul: 0 },
  invented_fact: { noul: 0 },
};

// A search of 100 results cut to fit, as agentToolModelOutput writes its
// note (in an eval, the cheapest was the 96th, and the agent named the
// first).
const cutSearch = (id: string) =>
  toolResult(id, "searchWeb", {
    type: "json",
    value: {
      sources: [],
      cut: `results shows 40 of 100 items; the other 60 were left out to fit. Read them with readToolResultItems (resultId "${id}", from 40); a next page or cursor starts after all 100.`,
    },
  });

const readOn = (id: string, resultId: string): ModelMessage => ({
  role: "assistant",
  content: [
    {
      type: "tool-call",
      toolCallId: id,
      toolName: "readToolResultItems",
      input: { resultId, from: 40 },
    },
  ],
});

describe("agent answer check", () => {
  it("reads each tool call of the turn with its outcome, after the user's newest message", () => {
    const outcomes = agentTurnToolOutcomes([
      toolCall("old", "createTrackingTask"),
      toolResult("old", "createTrackingTask", { type: "json", value: {} }),
      userMessage,
      toolCall("a", "sendEmail"),
      toolResult("a", "sendEmail", {
        type: executionDenied,
        reason: "המשתמש סירב",
      }),
      toolCall("b", "deleteTrackingTasks"),
      toolResult("b", "deleteTrackingTasks", {
        type: "error-text",
        value: "TASK_NOT_FOUND: gone",
      }),
      toolCall("c", "searchWeb"),
      toolResult("c", "searchWeb", {
        type: "json",
        value: { results: [] },
      }),
      toolCall("d", "sendEmail"),
      toolCall("e", "updatePlan"),
    ]);

    assert.deepStrictEqual(
      outcomes.map(({ toolName, outcome }) => [toolName, outcome]),
      [
        ["sendEmail", "denied"],
        ["deleteTrackingTasks", "failed"],
        ["searchWeb", "done"],
        ["sendEmail", "waiting"],
      ]
    );
  });

  it("a claimed action holds only when its tool returned in this answer", () => {
    const claimsSent = { ...noAnswers, sent_message: { noul: 0.95 } };

    const denied = agentTurnToolOutcomes([
      userMessage,
      toolCall("a", "sendEmail"),
      toolResult("a", "sendEmail", { type: executionDenied }),
    ]);

    assert.lengthOf(agentAnswerViolations(claimsSent, denied), 1);

    const sent = agentTurnToolOutcomes([
      userMessage,
      toolCall("a", "sendEmail"),
      toolResult("a", "sendEmail", {
        type: "json",
        value: { sent: true },
      }),
    ]);

    assert.lengthOf(agentAnswerViolations(claimsSent, sent), 0);
    // Below the threshold, a claim is not counted.
    assert.lengthOf(
      agentAnswerViolations(
        { ...noAnswers, sent_message: { noul: 0.7 } },
        denied
      ),
      0
    );
  });

  it("an answer that claims what its tools do not show gets a note naming it", async () => {
    const inputs: AgentAnswerCheckInput[] = [];

    const note = await agentAnswerCheckNote(
      async (input) => {
        inputs.push(input);

        return await Promise.resolve(["Your answer says a message was sent."]);
      },
      [ending("שלחתי את ההודעה למוכר.")],
      [
        userMessage,
        toolCall("a", "sendEmail"),
        toolResult("a", "sendEmail", {
          type: executionDenied,
        }),
      ]
    );

    assert.strictEqual(inputs[0]?.userMessage, "תשלח הודעה למוכר");
    assert.strictEqual(inputs[0]?.answer, "שלחתי את ההודעה למוכר.");
    assert.strictEqual(inputs[0]?.outcomes[0]?.outcome, "denied");
    assert.include(
      JSON.stringify(note),
      "Your answer says a message was sent."
    );
  });

  it("a turn that only read our database is not checked", async () => {
    let asked = false;

    const note = await agentAnswerCheckNote(
      async () => {
        asked = true;

        return await Promise.resolve(["never"]);
      },
      [ending("יש לכם 3 משימות.")],
      [
        userMessage,
        toolCall("a", "listTrackingTasks"),
        toolResult("a", "listTrackingTasks", { type: "json", value: [] }),
      ]
    );

    assert.isNull(note);
    assert.isFalse(asked);
  });

  it("finds a cut result of the turn that no call read on", () => {
    assert.deepStrictEqual(
      agentUnreadCutResults([
        userMessage,
        toolCall("s", "searchWeb"),
        cutSearch("s"),
      ]),
      [{ resultId: "s", from: 40 }]
    );
    assert.deepStrictEqual(
      agentUnreadCutResults([
        userMessage,
        toolCall("s", "searchWeb"),
        cutSearch("s"),
        readOn("r", "s"),
      ]),
      []
    );
    // A cut before the user's newest message belongs to an earlier answer.
    assert.deepStrictEqual(
      agentUnreadCutResults([
        toolCall("s", "searchWeb"),
        cutSearch("s"),
        userMessage,
      ]),
      []
    );
  });

  it("an answer about the whole of an unread cut result is sent back to read it", () => {
    const cuts = [{ resultId: "s", from: 40 }];
    const aboutAll = { ...noAnswers, whole_result: { noul: 0.9 } };

    assert.include(
      agentAnswerViolations(aboutAll, [], cuts)[0],
      'readToolResultItems resultId "s" from 40'
    );
    // Showing some of the result, or reading it all, is fine.
    assert.deepStrictEqual(
      agentAnswerViolations(
        { ...noAnswers, whole_result: { noul: 0.2 } },
        [],
        cuts
      ),
      []
    );
    assert.deepStrictEqual(agentAnswerViolations(aboutAll, [], []), []);
  });

  it("a turn whose only unread cut is a database read is still checked", async () => {
    const inputs: AgentAnswerCheckInput[] = [];

    await agentAnswerCheckNote(
      async (input) => {
        inputs.push(input);

        return await Promise.resolve([]);
      },
      [ending("הכי זולה: 5,200 ₪.")],
      [userMessage, toolCall("s", "listTrackingTasks"), cutSearch("s")]
    );

    assert.deepStrictEqual(inputs[0]?.unreadCuts, [
      { resultId: "s", from: 40 },
    ]);
  });

  const checkInput: AgentAnswerCheckInput = {
    userMessage: "Delete the accountant task",
    answer: "I deleted the task.",
    outcomes: [
      { toolName: "deleteTrackingTasks", outcome: "failed", output: "" },
    ],
    unreadCuts: [],
  };

  it.effect("Jev's answers become the violations the tools do not back", () =>
    Effect.gen(function* answersBecomeViolations() {
      const jev = Layer.succeed(
        JevClient,
        JevClient.of({
          ask: (_request, _schema) =>
            Effect.succeed(
              // SAFETY: the test answers with the shape the schema parses.
              {
                answers: { ...noAnswers, deleted: { noul: 0.9 } },
              }
            ),
        })
      );

      const violations = yield* findAgentAnswerViolations(checkInput).pipe(
        Effect.provide(jev)
      );

      assert.lengthOf(violations, 1);
      assert.include(violations[0], "deleted or removed");
    })
  );

  it.effect("without Jev, or when it fails, the answer ends as it is", () =>
    Effect.gen(function* checkFallsBack() {
      assert.deepStrictEqual(yield* findAgentAnswerViolations(checkInput), []);

      assert.deepStrictEqual(
        yield* findAgentAnswerViolations(checkInput).pipe(
          Effect.provide(timedOutJevClient)
        ),
        []
      );
    })
  );

  it.effect("AGENT_ANSWER_CHECK=false switches the check off", () =>
    Effect.gen(function* checkSwitchedOff() {
      const jev = Layer.succeed(
        JevClient,
        JevClient.of({ ask: () => Effect.die("not reached") })
      );

      const off = ConfigProvider.layer(
        ConfigProvider.fromUnknown({ AGENT_ANSWER_CHECK: "false" })
      );

      assert.deepStrictEqual(
        yield* findAgentAnswerViolations(checkInput).pipe(
          Effect.provide(Layer.merge(jev, off))
        ),
        []
      );
    })
  );
});
