import { describe, it } from "@effect/vitest";

import type { ExpenseQuery } from "@/agent/core/ports/keepintax-ports";

import {
  evalBooks,
  evalCeramicsBusiness,
  evalDesignerBusiness,
  evalTwoBusinessExpenses,
} from "../harness/agent-eval-books";
import type { AgentEvalBooksOptions } from "../harness/agent-eval-books";
import { runAgentConversation } from "../harness/agent-eval-harness";
import { agentAnswerJudge } from "../harness/agent-eval-judge";
import {
  agentEvalTestCase,
  answerNumbersNotFromTools,
  calledToolNames,
} from "../harness/agent-eval-run-checks";
import { exampleEvalSettings } from "../harness/agent-eval-settings-fixtures";

// query expenses, across businesses: one data owner with two businesses
// (evalTwoBusinessExpenses): the design studio (514789632) and the ceramics
// workshop (039876541). Fuel counted this year: the studio 1,662 ₪, the
// workshop 431.15 ₪, together 2,093.15 ₪ (the books add it, in agorot), with
// one fuel expense waiting for review in each. The evals' day is 2026-10-04.

const both = [evalDesignerBusiness, evalCeramicsBusiness];

const scenario = (options: AgentEvalBooksOptions) => {
  const { books, queries } = evalBooks(evalTwoBusinessExpenses, {
    businesses: both,
    ...options,
  });

  return {
    queries,
    scenario: { settings: exampleEvalSettings, locale: "he" as const, books },
  };
};

// "2,093.15", "2093.15" or "2093.15 ₪": the figure as the answer may write it.
const mentionsAmount = (answer: string, amount: string) =>
  answer.replaceAll(",", "").includes(amount);

// A query that covered both businesses together.
const coversBoth = (query: ExpenseQuery) =>
  query.allBusinesses === true ||
  (query.businessNumbers?.includes(evalDesignerBusiness.number) === true &&
    query.businessNumbers.includes(evalCeramicsBusiness.number));

describe.concurrent("query expenses, across businesses", () => {
  it("gives both businesses' fuel subtotals and the combined total from the books", async ({
    expect,
  }) => {
    const { scenario: books, queries } = scenario({
      active: evalDesignerBusiness.number,
    });

    const run = await runAgentConversation(books, [
      "כמה הוצאתי על דלק השנה בשני העסקים שלי ביחד?",
    ]);

    expect(calledToolNames(run)).toContain("queryExpenses");
    expect(queries.some(coversBoth)).toBe(true);
    expect(mentionsAmount(run.answer, "1662")).toBe(true);
    expect(mentionsAmount(run.answer, "431.15")).toBe(true);
    expect(mentionsAmount(run.answer, "2093.15")).toBe(true);
    // Every figure, the combined one too, comes from the tool's result.
    expect(answerNumbersNotFromTools(run)).toEqual([]);
    await expect(agentEvalTestCase(run)).toPass([
      agentAnswerJudge("Gives the subtotals and the combined total", [
        "`test_case.actual_output` is written in Hebrew.",
        "`test_case.actual_output` gives fuel for each business separately, naming both (the design studio and the ceramics workshop), and one combined total for both.",
        "`test_case.actual_output` says which period it covers (this year, from January).",
        "`test_case.actual_output` says that some fuel expenses still wait for review (or approval) and are not counted.",
      ]),
    ]);
  });

  it("answers a question that names no business for the active one, and says which", async ({
    expect,
  }) => {
    const { scenario: books, queries } = scenario({
      active: evalCeramicsBusiness.number,
    });

    const run = await runAgentConversation(books, ["כמה הוצאתי על דלק השנה?"]);

    expect(calledToolNames(run)).toContain("queryExpenses");
    expect(queries.some(coversBoth)).toBe(false);
    expect(mentionsAmount(run.answer, "431.15")).toBe(true);
    expect(mentionsAmount(run.answer, "2093.15")).toBe(false);
    expect(answerNumbersNotFromTools(run)).toEqual([]);
    await expect(agentEvalTestCase(run)).toPass([
      agentAnswerJudge("Answers for the active business", [
        "`test_case.actual_output` gives this year's fuel for the ceramics workshop (נועה קרמיקה) and names that business.",
      ]),
    ]);
  });

  it("never presents a partial combined total when one business cannot be read", async ({
    expect,
  }) => {
    const { scenario: books } = scenario({
      active: evalDesignerBusiness.number,
      failing: [evalCeramicsBusiness.number],
    });

    const run = await runAgentConversation(books, [
      "כמה הוצאתי על דלק השנה בכל העסקים שלי?",
    ]);

    expect(calledToolNames(run)).toContain("queryExpenses");
    expect(mentionsAmount(run.answer, "2093.15")).toBe(false);
    expect(answerNumbersNotFromTools(run)).toEqual([]);
    await expect(agentEvalTestCase(run)).toPass([
      agentAnswerJudge("Reports the partial result as partial", [
        "`test_case.actual_output` says that the ceramics workshop's expenses could not be read (now), and gives no total for both businesses together.",
        "`test_case.actual_output` does not present the studio's figure as the total of all the user's businesses.",
      ]),
    ]);
  });
});
