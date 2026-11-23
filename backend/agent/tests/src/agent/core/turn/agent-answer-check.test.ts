import { assert, it, describe } from "@effect/vitest";
import type { ModelMessage, ToolResultPart } from "ai";
import { ConfigProvider, Effect, Layer } from "effect";

import { JevClient } from "../../../../../backend/shared/ai/typesafe-jev-client";
import {
  agentAnswerCheckNote,
  agentAnswerNumberViolations,
  agentBookEvidenceOutputs,
  agentAnswerViolations,
  findAgentAnswerViolations,
} from "../../../../../src/agent/core/turn/agent-answer-check";
import type { AgentAnswerCheckInput } from "../../../../../src/agent/core/turn/agent-answer-check";
import { agentAnswerUnbackedNumbers } from "../../../../../src/agent/core/turn/agent-answer-check-rules";
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

// The number-provenance violations of an answer after the messages' turn.
const check = (answer: string, messages: readonly ModelMessage[]) =>
  agentAnswerNumberViolations({
    answer,
    outcomes: agentTurnToolOutcomes(messages),
  });

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

  describe("number provenance after a books read", () => {
    const fuel = toolResult("q", "queryExpenses", {
      type: "json",
      value: {
        from: "2026-01-01",
        to: "2026-10-04",
        totals: { count: 4, sum: 1662.4 },
        pending: { count: 1, sum: 299.9 },
      },
    });

    const fuelQuestion: ModelMessage = {
      role: "user",
      content: "כמה הוצאתי על דלק השנה?",
    };

    const fuelTurn = (...more: ModelMessage[]) => [
      fuelQuestion,
      toolCall("q", "queryExpenses"),
      fuel,
      ...more,
    ];

    it("accepts the tool's figures however the answer formats them, and its range's dates", () => {
      assert.deepStrictEqual(
        check(
          "מ-1.1.2026 עד 4.10.2026 הוצאתם 1,662.40 ₪ על דלק (4 הוצאות), ועוד אחת של 299.90 ₪ ממתינה לבדיקה.",
          fuelTurn()
        ),
        []
      );
    });

    it("rejects a rounded figure: 299 is not the tool's 299.9", () => {
      assert.deepStrictEqual(
        agentAnswerUnbackedNumbers("ממתינה הוצאה של 299 ₪.", ['{"sum":299.9}']),
        ["299"]
      );
      assert.lengthOf(check("סך הכל כ-1,662 ₪.", fuelTurn()), 1);
    });

    it("rejects an amount the user typed: the user's message is no evidence of the books", () => {
      const violations = agentAnswerNumberViolations({
        answer: "נכון, הוצאתם 2,500 ₪ על דלק.",
        outcomes: agentTurnToolOutcomes([
          {
            role: "user",
            content: "הוצאתי 2,500 ₪ על דלק השנה, נכון?",
          },
          toolCall("q", "queryExpenses"),
          fuel,
        ]),
      });

      assert.lengthOf(violations, 1);
      assert.include(violations[0], "2,500");
    });

    it("rejects small counts the tool did not return: no allowance for counts", () => {
      assert.deepStrictEqual(
        agentAnswerUnbackedNumbers("יש לכם 3 הוצאות דלק.", ['{"count":4}']),
        ["3"]
      );
    });

    it("a failed books read backs nothing, and its answer is still checked", () => {
      const failedOnly = [
        userMessage,
        toolCall("q", "getVatSummary"),
        toolResult("q", "getVatSummary", {
          type: "error-text",
          value:
            "ACCESS_REVOKED: the access to this client's data was revoked 2026 770.8",
        }),
      ];

      assert.lengthOf(check("המע״מ לתשלום הוא 770.80 ₪.", failedOnly), 1);
      assert.deepStrictEqual(
        check("אין לי יותר גישה לספרים של העסק.", failedOnly),
        []
      );
    });

    it("a denied books read backs nothing, and its answer is still checked", () => {
      const deniedOnly = [
        userMessage,
        toolCall("q", "getProfitAndLoss"),
        toolResult("q", "getProfitAndLoss", { type: executionDenied }),
      ];

      assert.lengthOf(check("הרווח השנה הוא 8,499.80 ₪.", deniedOnly), 1);
    });

    it("a figure from an earlier turn's read backs nothing now", () => {
      const phoneQuestion: ModelMessage = {
        role: "user",
        content: "ומה עם הפלאפון?",
      };

      const earlier = [
        ...fuelTurn(),
        phoneQuestion,
        toolCall("p", "queryExpenses"),
        toolResult("p", "queryExpenses", {
          type: "json",
          value: { totals: { count: 6, sum: 539.4 } },
        }),
      ];

      assert.deepStrictEqual(check("על הפלאפון 539.40 ₪.", earlier), []);
      assert.lengthOf(
        check("על הפלאפון 539.40 ₪, ועל דלק 1,662.40 ₪.", earlier),
        1
      );
    });

    it("a tool schema's digits back nothing: toolSearch's pattern holds 3, the books read returned none", () => {
      const turn = [
        userMessage,
        toolCall("s", "toolSearch"),
        toolResult("s", "toolSearch", {
          type: "json",
          value: {
            tools: [{ parameters: { pattern: "^(?:0[1-9]|[12]\\d|3[01])$" } }],
          },
        }),
        toolCall("q", "queryIssuedDocuments"),
        toolResult("q", "queryIssuedDocuments", {
          type: "json",
          value: { count: 0, byType: [] },
        }),
      ];

      assert.deepStrictEqual(
        agentBookEvidenceOutputs(agentTurnToolOutcomes(turn)),
        ['{"count":0,"byType":[]}']
      );
      assert.lengthOf(check("הוצאתם 3 חשבוניות.", turn), 1);
    });

    it("memory, web results and paging of other results are no evidence of the books", () => {
      const turn = [
        userMessage,
        toolCall("m", "saveAgentMemory"),
        toolResult("m", "saveAgentMemory", {
          type: "json",
          value: { saved: "pays 1,250 a month for WeWork" },
        }),
        toolCall("w", "searchWeb"),
        toolResult("w", "searchWeb", {
          type: "json",
          value: { results: [{ price: 640 }] },
        }),
        toolCall("r", "readToolResultItems"),
        toolResult("r", "readToolResultItems", {
          type: "json",
          value: { items: [{ amount: 299.9 }] },
        }),
        toolCall("q", "queryTransactions"),
        toolResult("q", "queryTransactions", {
          type: "json",
          value: { moneyOut: { count: 2, sum: 1453.46 } },
        }),
      ];

      assert.deepStrictEqual(
        check("בכרטיס יצאו 1,453.46 ₪ ב-2 תשלומים.", turn),
        []
      );

      const unbacked = check(
        "יצאו 1,250 ₪ ל-WeWork, 640 ₪ באתר ו-299.90 ₪ נוספים.",
        turn
      );

      assert.lengthOf(unbacked, 1);

      for (const number of ["1,250", "640", "299.90"]) {
        assert.include(unbacked[0], number);
      }
    });

    it("a turn without any books read is not number-checked", () => {
      assert.deepStrictEqual(
        check("יש לכם 3 משימות.", [
          userMessage,
          toolCall("a", "listTrackingTasks"),
          toolResult("a", "listTrackingTasks", { type: "json", value: [] }),
        ]),
        []
      );
    });

    it("an answer after a books read reaches the check, which names the unbacked numbers", async () => {
      let asked = false;

      const note = await agentAnswerCheckNote(
        async (input) => {
          asked = true;

          return await Promise.resolve(agentAnswerNumberViolations(input));
        },
        [ending("הוצאתם 1,800 ₪ על דלק.")],
        fuelTurn()
      );

      assert.isTrue(asked);
      assert.include(JSON.stringify(note), "1,800");
    });
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

  it.effect("number provenance holds without Jev, and when Jev times out", () =>
    Effect.gen(function* provenanceWithoutJev() {
      const booksInput: AgentAnswerCheckInput = {
        userMessage: "כמה הוצאתי על דלק?",
        answer: "הוצאתם 1,700 ₪ על דלק.",
        outcomes: [
          {
            toolName: "queryExpenses",
            outcome: "done",
            output: '{"totals":{"sum":1662}}',
          },
        ],
        unreadCuts: [],
      };

      const withoutJev = yield* findAgentAnswerViolations(booksInput);
      assert.lengthOf(withoutJev, 1);
      assert.include(withoutJev[0], "1,700");

      const timedOut = yield* findAgentAnswerViolations(booksInput).pipe(
        Effect.provide(timedOutJevClient)
      );

      assert.deepStrictEqual(timedOut, withoutJev);
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

describe("shared profile deletion claims", () => {
  it("accepts only a successful profile deletion receipt, not an ordinary profile update", () => {
    const answers = { ...noAnswers, deleted: { noul: 0.95 } };
    assert.lengthOf(
      agentAnswerViolations(answers, [
        {
          toolName: "updateUserProfile",
          outcome: "done",
          output: JSON.stringify({ profileOperation: "forget_facts" }),
        },
      ]),
      0
    );
    assert.lengthOf(
      agentAnswerViolations(answers, [
        {
          toolName: "updateUserProfile",
          outcome: "done",
          output: JSON.stringify({ profileOperation: "share" }),
        },
      ]),
      1
    );
    assert.lengthOf(
      agentAnswerViolations(answers, [
        {
          toolName: "updateUserProfile",
          outcome: "failed",
          output: JSON.stringify({ profileOperation: "forget_all" }),
        },
      ]),
      1
    );
  });
});
