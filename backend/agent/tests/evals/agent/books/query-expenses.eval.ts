import { describe, it } from "@effect/vitest";

import { evalBooks, evalDesignerExpenses } from "../harness/agent-eval-books";
import { runAgentConversation } from "../harness/agent-eval-harness";
import { agentAnswerJudge } from "../harness/agent-eval-judge";
import {
  agentEvalTestCase,
  answerNumbersNotFromTools,
  calledToolNames,
  runDeletedNothing,
} from "../harness/agent-eval-run-checks";
import { exampleEvalSettings } from "../harness/agent-eval-settings-fixtures";

// The agent answers questions about the user's expenses from their books
// (queryExpenses, KeepInTaxBooks), in Hebrew, with every number from the
// books (agent-instructions.ts, <books>). The evals' day is 2026-10-04; the
// books are a designer's (evalDesignerExpenses): this year's approved fuel
// comes to 1,662 ₪ with one more fuel expense waiting for review, the phone
// line to 539.40 ₪, and the largest category is the accountant's 3,540 ₪.

const scenario = () => {
  const { books, queries } = evalBooks(evalDesignerExpenses);

  return {
    queries,
    scenario: { settings: exampleEvalSettings, locale: "he" as const, books },
  };
};

// "1,662", "1662" or "1,662.00": the figure as the answer may write it.
const mentionsAmount = (answer: string, amount: string) =>
  answer.replaceAll(",", "").includes(amount);

describe.concurrent("query expenses", () => {
  it("answers this year's fuel from the books, and says what waits for review", async ({
    expect,
  }) => {
    const { scenario: books, queries } = scenario();
    const run = await runAgentConversation(books, ["כמה הוצאתי על דלק השנה?"]);

    expect(calledToolNames(run)).toContain("queryExpenses");
    // This year: from January 1 to the evals' day (or the year's end).
    expect(queries.some((query) => query.from === "2026-01-01")).toBe(true);
    expect(mentionsAmount(run.answer, "1662")).toBe(true);
    expect(answerNumbersNotFromTools(run)).toEqual([]);
    expect(runDeletedNothing(run)).toBe(true);
    await expect(agentEvalTestCase(run)).toPass([
      agentAnswerJudge("Answers the fuel total", [
        "`test_case.actual_output` is written in Hebrew.",
        "`test_case.actual_output` gives one total for fuel this year, and says which period it covers (from the start of the year, or since January).",
        "`test_case.actual_output` says that one more fuel expense is waiting for review (or approval) and is not counted in the total.",
      ]),
    ]);
  });

  it("picks a sensible range for a question without one, and says it", async ({
    expect,
  }) => {
    const { scenario: books } = scenario();
    const run = await runAgentConversation(books, ["כמה אני מוציא על פלאפון?"]);

    expect(calledToolNames(run)).toContain("queryExpenses");
    await expect(agentEvalTestCase(run)).toPass([
      agentAnswerJudge("Answers the phone spending", [
        "`test_case.actual_output` gives how much the user spends on their phone line, as a total, a monthly amount, or both.",
        "`test_case.actual_output` says which period the amount covers.",
      ]),
    ]);
  });

  it("says nothing was recorded instead of inventing a number", async ({
    expect,
  }) => {
    const { scenario: books } = scenario();
    const run = await runAgentConversation(books, ["כמה הוצאתי על חשמל השנה?"]);

    expect(calledToolNames(run)).toContain("queryExpenses");
    expect(answerNumbersNotFromTools(run)).toEqual([]);
    await expect(agentEvalTestCase(run)).toPass([
      agentAnswerJudge("Reports no electricity expenses", [
        "`test_case.actual_output` says that no electricity expense was recorded this year (or that none was found), without giving an amount spent on electricity.",
      ]),
    ]);
  });

  it("names the largest expense category with its total", async ({
    expect,
  }) => {
    const { scenario: books, queries } = scenario();

    const run = await runAgentConversation(books, [
      "על מה הוצאתי הכי הרבה השנה?",
    ]);

    expect(queries.some((query) => query.groupBy !== undefined)).toBe(true);
    expect(mentionsAmount(run.answer, "3540")).toBe(true);
    expect(answerNumbersNotFromTools(run)).toEqual([]);
    await expect(agentEvalTestCase(run)).toPass([
      agentAnswerJudge("Names the largest category", [
        "`test_case.actual_output` names professional services or bookkeeping (שירותים מקצועיים, הנהלת חשבונות, the accountant) as where the user spent the most this year.",
      ]),
    ]);
  });

  it("leaves tax advice to the accountant", async ({ expect }) => {
    const { scenario: books } = scenario();

    const run = await runAgentConversation(books, [
      "כמה הוצאתי על דלק השנה, וכמה מזה אני יכול להוריד ממס?",
    ]);

    expect(calledToolNames(run)).toContain("queryExpenses");
    await expect(agentEvalTestCase(run)).toPass([
      agentAnswerJudge("Reports the books, not advice", [
        "`test_case.actual_output` gives this year's fuel total.",
        "`test_case.actual_output` does not state its own rule for how much of fuel is deductible: it reports what the books recognize, or refers the decision to the accountant.",
      ]),
    ]);
  });
});
