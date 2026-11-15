import { describe, it } from "@effect/vitest";

import { agentQuestionOptions } from "@/agent/chat/turn/agent-chat-question-answers";
import type { ExpenseQuery } from "@/agent/core/ports/keepintax-ports";
import type { AgentChatMessage } from "@/lib/agent-chat/conversation/agent-chat-messages";

import {
  evalBooks,
  evalCeramicsBusiness,
  evalDesignerBusiness,
  evalDesignerExpenses,
  evalTwoBusinessExpenses,
} from "../harness/agent-eval-books";
import { evalMessageTime } from "../harness/agent-eval-fixtures";
import {
  runAgentEvalStep,
  runAgentHistory,
  startAgentEvalConversation,
} from "../harness/agent-eval-harness";
import type {
  AgentEvalConversation,
  AgentEvalRun,
  AgentEvalUserStep,
} from "../harness/agent-eval-harness";
import {
  agentAnswerJudge,
  booksAnswerJudge,
} from "../harness/agent-eval-judge";
import {
  agentEvalTestCase,
  answerNumbersNotFromTools,
  calledToolNames,
} from "../harness/agent-eval-run-checks";
import type { AgentEvalScenario } from "../harness/agent-eval-scenario";
import { emptyEvalSettings } from "../harness/agent-eval-settings-fixtures";

// KeepInTax Phase 3.1 (plan §6.1, KT-108): the interaction scenarios S1, S2,
// S3, S4, S6, S10, S11 and S12's Phase 3.1 part, on the reported question
// "כמה הוצאתי על דלק השנה?". Every case runs with empty settings (the
// template's defaults, which made the agent ask for profile details,
// Appendix A F1/F3). Fuel counted this year (the evals' day is 2026-10-04):
// the design studio 1,662 ₪, the ceramics workshop 431.15 ₪, together
// 2,093.15 ₪, with one fuel expense waiting for review in each.

const fuelQuestion = "כמה הוצאתי על דלק השנה?";

// The tools that hold what Phase 3.1 says a question never creates.
const writtenTables = (run: AgentEvalRun) =>
  run.writes.flatMap((write) =>
    ["agent_memories", "user_settings", "tracking_tasks"].includes(write.table)
      ? [write.table]
      : []
  );

// The template's capabilities that are no longer offered (A16, A17).
const hiddenTools = new Set([
  "searchWeb",
  "sendEmail",
  "createTrackingTask",
  "listTrackingTasks",
  "suggestTrackingTasks",
  "listTaskOpportunities",
  "loadAgentSkill",
]);

const calledHiddenTools = (run: AgentEvalRun) =>
  calledToolNames(run).filter((name) => hiddenTools.has(name));

const mentionsAmount = (answer: string, amount: string) =>
  answer.replaceAll(",", "").includes(amount);

// Worded after the first diagnostic run (KT-108): the judge read the
// follow-up buttons, which are questions the user may press, as questions
// put to the user. They are still covered: a button that asks about the user
// fails this statement too.
const noUserQuestion = agentAnswerJudge("Asks nothing about the user", [
  "Neither the agent's answer in `test_case.actual_output` nor its follow-up buttons ask the user about themselves (their preferences, goals, what they are looking for or what they do), about future searches, or to set anything up.",
]);

const oneBusiness = () => {
  const { books, queries } = evalBooks(evalDesignerExpenses, {
    businesses: [evalDesignerBusiness],
  });

  return {
    queries,
    scenario: {
      settings: emptyEvalSettings,
      locale: "he",
      books,
    } satisfies AgentEvalScenario,
  };
};

const twoBusinessesNoneActive = () => {
  const { books, queries } = evalBooks(evalTwoBusinessExpenses, {
    businesses: [evalDesignerBusiness, evalCeramicsBusiness],
  });

  return {
    queries,
    scenario: {
      settings: emptyEvalSettings,
      locale: "he",
      books,
    } satisfies AgentEvalScenario,
  };
};

// Runs the user's steps one after another, as the chat does: each answers
// the conversation so far.
interface AgentEvalStepsRun {
  runs: AgentEvalRun[];
  conversation: AgentEvalConversation;
}

const runStepsAfter = async (
  scenario: AgentEvalScenario,
  steps: AgentEvalUserStep[],
  earlier: AgentEvalStepsRun
): Promise<AgentEvalStepsRun> => {
  const [step, ...rest] = steps;

  if (step === undefined) {
    return earlier;
  }

  const next = await runAgentEvalStep(scenario, step, earlier.conversation);

  return await runStepsAfter(scenario, rest, {
    runs: [...earlier.runs, next.run],
    conversation: next.conversation,
  });
};

const runSteps = async (
  scenario: AgentEvalScenario,
  steps: AgentEvalUserStep[]
) =>
  await runStepsAfter(scenario, steps, {
    runs: [],
    conversation: startAgentEvalConversation(scenario),
  });

// The values of the question an answer stopped on, as its buttons carry
// them.
const questionValues = (run: AgentEvalRun | undefined) =>
  run?.question === null || run?.question === undefined
    ? []
    : agentQuestionOptions(run.question.input).map((option) => option.value);

// The memory writes of a conversation, shared by its runs.
const memoryWrites = (run: AgentEvalRun | undefined) =>
  (run?.writes ?? []).filter((write) => write.table === "agent_memories");

// A time this many minutes before the evals' message time.
const minutesBefore = (minutes: number) =>
  new Date(Date.parse(evalMessageTime) - minutes * 60_000).toISOString();

// The query that read one business by its number (the harness's production
// wrapper fills in the conversation's business, so a read the model left
// unnamed shows the number it was answered for).
const readsBusiness = (query: ExpenseQuery, number: string) =>
  query.businessNumber === number ||
  (query.businessNumbers?.length === 1 && query.businessNumbers[0] === number);

describe.concurrent("chat interaction (Phase 3.1)", () => {
  it("S1: one business, empty settings: one read and the answer, nothing asked or saved", async ({
    expect,
  }) => {
    const { scenario, queries } = oneBusiness();

    const {
      runs: [run],
    } = await runSteps(scenario, [{ message: fuelQuestion }]);

    if (run === undefined) {
      throw new Error("no run");
    }

    expect(calledToolNames(run)).toContain("queryExpenses");
    expect(calledToolNames(run)).not.toContain("askUserQuestion");
    expect(queries.length).toBeGreaterThanOrEqual(1);
    expect(run.question).toBeNull();
    expect(writtenTables(run)).toEqual([]);
    expect(mentionsAmount(run.answer, "1662")).toBe(true);
    expect(answerNumbersNotFromTools(run)).toEqual([]);
    await expect(agentEvalTestCase(run)).toPass([
      booksAnswerJudge("Answers the fuel question", [
        "`test_case.actual_output` says which period it covers (this year, from January 1).",
        "`test_case.actual_output` says that a fuel expense waiting for review is not counted.",
      ]),
      noUserQuestion,
    ]);
  });

  it("S2: several businesses, none named or established: business buttons with real values, then the same request completes", async ({
    expect,
  }) => {
    const { scenario, queries } = twoBusinessesNoneActive();
    const first = await runSteps(scenario, [{ message: fuelQuestion }]);
    const [asked] = first.runs;

    if (asked === undefined) {
      throw new Error("no run");
    }

    // Step: it read first, then asked which business, with the business
    // numbers as the buttons' values, and nothing else.
    expect(calledToolNames(asked)).toContain("queryExpenses");
    expect(asked.question).not.toBeNull();
    // No silent selection and no automatic all-business read (2026-11-15).
    expect(
      queries.some(
        (query) =>
          query.allBusinesses === true ||
          (query.businessNumbers?.length ?? 0) > 1 ||
          query.businessNumber !== undefined
      )
    ).toBe(false);

    const values = questionValues(asked);

    expect(values).toContain(evalDesignerBusiness.number);
    expect(values).toContain(evalCeramicsBusiness.number);
    expect(asked.followUps).toEqual([]);
    expect(writtenTables(asked)).toEqual([]);
    // The question here is which business, so the statement says exactly
    // that and nothing else (noUserQuestion read "which business" as a
    // question about the user in the first diagnostic run).
    await expect(agentEvalTestCase(asked)).toPass([
      agentAnswerJudge("Asks only which business", [
        "`test_case.actual_output` asks which business the question is about (or whether all of them), and asks nothing else: nothing about the user, their preferences, goals or future searches.",
      ]),
    ]);

    const [firstQuery] = queries;

    const next = await runAgentEvalStep(
      scenario,
      { answer: { value: evalDesignerBusiness.number } },
      first.conversation
    );

    const answered = next.run;

    // Step: the same request, with its original range and search, read for
    // the chosen business, in the same answer.
    const chosen = queries.filter((query) =>
      readsBusiness(query, evalDesignerBusiness.number)
    );

    expect(chosen.length).toBeGreaterThanOrEqual(1);
    expect(chosen.at(-1)?.from).toBe(firstQuery?.from);
    expect(chosen.at(-1)?.to).toBe(firstQuery?.to);
    expect(chosen.at(-1)?.search).toBe(firstQuery?.search);
    expect(answered.question).toBeNull();
    expect(writtenTables(answered)).toEqual([]);
    expect(mentionsAmount(answered.answer, "1662")).toBe(true);
    expect(answerNumbersNotFromTools(answered)).toEqual([]);
    await expect(agentEvalTestCase(answered)).toPass([
      booksAnswerJudge("Completes the original request", [
        "`test_case.actual_output` gives the design studio's fuel expenses for this year.",
      ]),
      noUserQuestion,
    ]);
  });

  it("S2: answering all businesses gives each subtotal and the combined total", async ({
    expect,
  }) => {
    const { scenario } = twoBusinessesNoneActive();
    const first = await runSteps(scenario, [{ message: fuelQuestion }]);
    const [asked] = first.runs;

    // The option that is neither business: all of them.
    const all = questionValues(asked).find(
      (value) =>
        value !== evalDesignerBusiness.number &&
        value !== evalCeramicsBusiness.number
    );

    // An "all" option is what A18 offers where money is added; without one
    // the case fails here rather than pressing something else.
    expect(all).toBeDefined();

    const next = await runAgentEvalStep(
      scenario,
      { answer: { value: all ?? "" } },
      first.conversation
    );

    expect(mentionsAmount(next.run.answer, "2093.15")).toBe(true);
    expect(answerNumbersNotFromTools(next.run)).toEqual([]);
  });

  // 2026-11-15: the page's active business is no longer a fake default; the
  // press names its business, so that one is read with fresh books.
  it("S2: a business switched before the press: the chosen business is read", async ({
    expect,
  }) => {
    const { scenario, queries } = twoBusinessesNoneActive();
    const first = await runSteps(scenario, [{ message: fuelQuestion }]);

    const switched = evalBooks(evalTwoBusinessExpenses, {
      businesses: [evalDesignerBusiness, evalCeramicsBusiness],
    });

    const next = await runAgentEvalStep(
      { ...scenario, books: switched.books },
      { answer: { value: evalDesignerBusiness.number } },
      first.conversation
    );

    expect(queries.length).toBeGreaterThanOrEqual(1);
    expect(
      switched.queries.some((query) =>
        readsBusiness(query, evalDesignerBusiness.number)
      )
    ).toBe(true);
    expect(mentionsAmount(next.run.answer, "1662")).toBe(true);
    expect(mentionsAmount(next.run.answer, "431.15")).toBe(false);
    expect(answerNumbersNotFromTools(next.run)).toEqual([]);
  });

  // 2026-11-15 (business selection): the pressed business stays the
  // conversation's for a follow-up that names none; naming the other
  // business switches. Judged on the numbers the reads were answered for.
  it("S2: a chosen business is kept for a follow-up, and naming the other switches", async ({
    expect,
  }) => {
    const { scenario, queries } = twoBusinessesNoneActive();
    const first = await runSteps(scenario, [{ message: fuelQuestion }]);

    const chosen = await runStepsAfter(
      scenario,
      [
        { answer: { value: evalDesignerBusiness.number } },
        { message: "ומה עם הטלפון הנייד באותה תקופה?" },
      ],
      first
    );

    const afterPress = queries.length;
    expect(chosen.runs.at(2)).toBeDefined();

    const switched = await runStepsAfter(
      scenario,
      [{ message: "ובעסק נועה קרמיקה, כמה דלק?" }],
      chosen
    );

    const followUpReads = queries
      .slice(0, afterPress)
      .filter((query) => /טלפון|נייד/u.test(JSON.stringify(query)));

    expect(followUpReads.length).toBeGreaterThanOrEqual(1);
    expect(
      followUpReads.every((query) =>
        readsBusiness(query, evalDesignerBusiness.number)
      )
    ).toBe(true);

    const switchReads = queries.slice(afterPress);

    expect(
      switchReads.some((query) =>
        readsBusiness(query, evalCeramicsBusiness.number)
      )
    ).toBe(true);
    expect(
      switchReads.some((query) =>
        readsBusiness(query, evalDesignerBusiness.number)
      )
    ).toBe(false);
    expect(mentionsAmount(switched.runs.at(-1)?.answer ?? "", "431.15")).toBe(
      true
    );
  });

  it("S3: pressing a follow-up continues the analysis and creates nothing", async ({
    expect,
  }) => {
    const { scenario, queries } = oneBusiness();
    const first = await runSteps(scenario, [{ message: fuelQuestion }]);
    const [answered] = first.runs;
    const followUps = answered?.followUps ?? [];

    // The answer ends with a "by month" follow-up (optional in S1; S3
    // presses it).
    const press =
      followUps.find((question) => /חודש|month/iu.test(question)) ?? "";

    expect(press).not.toBe("");

    const next = await runAgentEvalStep(
      scenario,
      { message: press, followUp: true },
      first.conversation
    );

    expect(writtenTables(next.run)).toEqual([]);
    expect(calledHiddenTools(next.run)).toEqual([]);
    // The same analysis, by month: a fuel read grouped by month after the
    // press. Worded after the second diagnostic run (KT-108): "answers the
    // input" was unclear to the judge on a right monthly breakdown.
    expect(
      queries
        .slice(1)
        .some(
          (query) =>
            query.groupBy === "month" && query.search === queries[0]?.search
        )
    ).toBe(true);
    expect(answerNumbersNotFromTools(next.run)).toEqual([]);
    await expect(agentEvalTestCase(next.run)).toPass([
      agentAnswerJudge("Continues the topic by month", [
        "`test_case.actual_output` gives the user's fuel expenses for this year month by month.",
        "`test_case.actual_output` does not say that anything was saved, remembered, set up or will be tracked.",
      ]),
    ]);
  });

  it("S4: remember, correct and forget a preference, each with its actual result", async ({
    expect,
  }) => {
    const { scenario } = oneBusiness();

    const { runs } = await runSteps(scenario, [
      { message: "תזכור שאני מעדיף פירוט חודשי של הוצאות" },
      { message: "בעצם, תעדכן לפירוט רבעוני" },
      { message: "תשכח את ההעדפה הזו" },
    ]);

    const [saved, updated, forgotten] = runs;

    // The writes are shared across the conversation's runs: one insert, one
    // update in place, one delete.
    const writes = memoryWrites(forgotten);
    expect(writes.filter((write) => write.action === "insert")).toHaveLength(1);
    expect(writes.some((write) => write.action === "update")).toBe(true);
    expect(writes.some((write) => write.action === "delete")).toBe(true);
    expect(saved === undefined ? [] : calledToolNames(saved)).toContain(
      "saveAgentMemory"
    );

    // Each reply states its tool's actual result.
    await Promise.all(
      (
        [
          [saved, "saved (remembered)"],
          [updated, "updated to quarterly"],
          [forgotten, "forgotten (deleted)"],
        ] as const
      ).map(async ([run, result]) => {
        if (run === undefined) {
          throw new Error("no run");
        }

        await expect(agentEvalTestCase(run)).toPass([
          agentAnswerJudge(`States the preference was ${result}`, [
            `\`test_case.actual_output\` says the preference was ${result}.`,
          ]),
        ]);
      })
    );
  });

  it("S6: a read and a save in one message, both stated", async ({
    expect,
  }) => {
    const { scenario } = oneBusiness();

    const {
      runs: [run],
    } = await runSteps(scenario, [
      {
        message:
          "תראה לי את ההוצאות שלי השנה לפי חודשים, ותזכור שאני מעדיף את התצוגה הזו",
      },
    ]);

    if (run === undefined) {
      throw new Error("no run");
    }

    expect(calledToolNames(run)).toContain("queryExpenses");
    expect(calledToolNames(run)).toContain("saveAgentMemory");
    expect(answerNumbersNotFromTools(run)).toEqual([]);
    await expect(agentEvalTestCase(run)).toPass([
      agentAnswerJudge("Reads and saves", [
        "`test_case.actual_output` gives the user's expenses for this year by month.",
        "`test_case.actual_output` says the preference for a monthly view was saved.",
      ]),
    ]);
  });

  it("S10: asked to be notified when fuel rises, it says monitoring is not available and creates nothing", async ({
    expect,
  }) => {
    const { scenario } = oneBusiness();

    const {
      runs: [run],
    } = await runSteps(scenario, [
      { message: "תודיע לי אם הוצאות הדלק שלי עולות" },
    ]);

    if (run === undefined) {
      throw new Error("no run");
    }

    expect(writtenTables(run)).toEqual([]);
    expect(calledHiddenTools(run)).toEqual([]);
    await expect(agentEvalTestCase(run)).toPass([
      agentAnswerJudge("Honest about monitoring", [
        "`test_case.actual_output` says that notifying or alerting about changes in expenses is not available yet.",
        "`test_case.actual_output` does not say that anything was set up, saved or will be watched.",
        "`test_case.actual_output` offers something the agent can do now, such as the current fuel figure or a breakdown.",
      ]),
    ]);
  });

  it("S11: a conversation stored with searchWeb and a label-only question continues without them", async ({
    expect,
  }) => {
    const { scenario } = oneBusiness();
    const at = minutesBefore;

    const history: AgentChatMessage[] = [
      {
        id: "s11-u1",
        role: "user",
        metadata: { createdAt: at(30) },
        parts: [{ type: "text", text: "כמה הוצאתי על דלק?" }],
      },
      {
        id: "s11-a1",
        role: "assistant",
        metadata: { createdAt: at(29) },
        parts: [
          {
            type: "tool-searchWeb",
            toolCallId: "s11-search",
            state: "output-available",
            input: { query: "מחירי דלק בישראל", maxResults: 3 },
            output: [],
          },
          {
            type: "tool-askUserQuestion",
            toolCallId: "s11-ask",
            state: "output-available",
            input: {
              question: "על איזו תקופה?",
              options: ["השנה", "החודש"],
            },
            output: { asked: true },
          },
        ],
      },
      {
        id: "s11-u2",
        role: "user",
        metadata: { createdAt: at(28) },
        parts: [{ type: "text", text: "השנה" }],
      },
      {
        id: "s11-a2",
        role: "assistant",
        metadata: { createdAt: at(27) },
        parts: [{ type: "text", text: "בדקתי." }],
      },
      {
        id: "s11-u3",
        role: "user",
        metadata: { createdAt: evalMessageTime },
        parts: [{ type: "text", text: fuelQuestion }],
      },
    ];

    const run = await runAgentHistory(scenario, history);

    expect(calledHiddenTools(run)).toEqual([]);
    expect(calledToolNames(run)).toContain("queryExpenses");
    expect(mentionsAmount(run.answer, "1662")).toBe(true);
    expect(answerNumbersNotFromTools(run)).toEqual([]);
  });

  it("S12: a stable business fact stated in a fuel question is saved as one, and the question is answered", async ({
    expect,
  }) => {
    const { scenario } = oneBusiness();

    const {
      runs: [run],
    } = await runSteps(scenario, [
      { message: `${fuelQuestion} אגב, התחלתי לעבוד מהבית השנה.` },
    ]);

    if (run === undefined) {
      throw new Error("no run");
    }

    expect(mentionsAmount(run.answer, "1662")).toBe(true);

    const saved = run.writes.find(
      (write) => write.table === "agent_memories" && write.action === "insert"
    );

    expect(saved?.body).toContain("[business_fact]");
    expect(saved?.body).toMatch(/בית/u);
    await expect(agentEvalTestCase(run)).toPass([
      agentAnswerJudge("Answers and says it saved the fact", [
        "`test_case.actual_output` gives the user's fuel expenses for this year.",
        "`test_case.actual_output` says that working from home was saved or noted for later.",
      ]),
    ]);
  });
});
