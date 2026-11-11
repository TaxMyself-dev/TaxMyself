import { describe, it } from "@effect/vitest";

import { booksAnswerJudge } from "../harness/agent-eval-judge";
import {
  amountIn,
  ceramics,
  readsNamed,
  runPhase3,
} from "../harness/agent-eval-phase3";
import {
  agentEvalTestCase,
  answerNumbersNotFromSuccessfulTools,
  calledToolNames,
} from "../harness/agent-eval-run-checks";

// Phase 3 reports, in Hebrew (agent-eval-reports.ts has the data): the P&L,
// the VAT report by bi-monthly periods (across a year boundary, a refund,
// an exempt business), income-tax advances, the reports coming up, what
// still needs review, and failures. The evals' day is 2026-10-04. Every case
// checks the tool and its range in code, the figures, and that every number
// comes from a tool result of the same turn; booksAnswerJudge checks Hebrew,
// provenance, currency and the case's own statements.

const thisYear = { from: "2026-01-01" };

describe.concurrent("reports: profit and loss", () => {
  it("this year's profit, with what is not in it yet", async ({ expect }) => {
    const { run, reads } = await runPhase3("מה הרווח של העסק מתחילת השנה?");

    expect(calledToolNames(run)).toContain("getProfitAndLoss");
    expect(readsNamed(reads, "getProfitAndLoss")).toContainEqual(
      expect.objectContaining(thisYear)
    );
    expect(amountIn(run.answer, "4377.69")).toBe(true);
    expect(answerNumbersNotFromSuccessfulTools(run)).toEqual([]);
    await expect(agentEvalTestCase(run)).toPass([
      booksAnswerJudge("This year's profit", [
        "`test_case.actual_output` gives the net profit before tax since the start of the year and says the period.",
        "`test_case.actual_output` says something is not in it yet: an expense waiting for review, or depreciation not booked yet.",
      ]),
    ]);
  });

  it("the first quarter's income, before VAT", async ({ expect }) => {
    const { run, reads } = await runPhase3(
      "כמה הכנסות היו לי ברבעון הראשון של השנה?"
    );

    expect(readsNamed(reads, "getProfitAndLoss")).toContainEqual(
      expect.objectContaining({ from: "2026-01-01", to: "2026-03-31" })
    );
    expect(amountIn(run.answer, "7000")).toBe(true);
    expect(answerNumbersNotFromSuccessfulTools(run)).toEqual([]);
    await expect(agentEvalTestCase(run)).toPass([
      booksAnswerJudge("Q1 income", [
        "`test_case.actual_output` gives the income of January to March and says it is before VAT.",
      ]),
    ]);
  });

  it("last December's profit, across the year boundary", async ({ expect }) => {
    const { run, reads } = await runPhase3("מה היה הרווח שלי בדצמבר שעבר?");

    expect(readsNamed(reads, "getProfitAndLoss")).toContainEqual(
      expect.objectContaining({ from: "2025-12-01", to: "2025-12-31" })
    );
    expect(amountIn(run.answer, "2881.78")).toBe(true);
    expect(answerNumbersNotFromSuccessfulTools(run)).toEqual([]);
    await expect(agentEvalTestCase(run)).toPass([
      booksAnswerJudge("Last December's profit", [
        "`test_case.actual_output` gives the profit of December 2025, naming that month.",
      ]),
    ]);
  });
});

describe.concurrent("reports: VAT", () => {
  it("January's VAT is the January–February period", async ({ expect }) => {
    const { run } = await runPhase3("כמה מע״מ אני צריך לשלם על ינואר?");

    expect(calledToolNames(run)).toContain("getVatSummary");
    expect(amountIn(run.answer, "770.8")).toBe(true);
    expect(answerNumbersNotFromSuccessfulTools(run)).toEqual([]);
    await expect(agentEvalTestCase(run)).toPass([
      booksAnswerJudge("January–February VAT", [
        "`test_case.actual_output` says the VAT to pay covers January and February together (a bi-monthly report), not January alone.",
      ]),
    ]);
  });

  it("the September–October report, with the expense still pending", async ({
    expect,
  }) => {
    const { run, reads } = await runPhase3(
      "כמה מע״מ יוצא לי לתשלום בדוח של ספטמבר-אוקטובר?"
    );

    expect(readsNamed(reads, "getVatSummary")).toContainEqual(
      expect.objectContaining({ from: "2026-09-01" })
    );
    expect(amountIn(run.answer, "598.97")).toBe(true);
    expect(answerNumbersNotFromSuccessfulTools(run)).toEqual([]);
    await expect(agentEvalTestCase(run)).toPass([
      booksAnswerJudge("September–October VAT", [
        "`test_case.actual_output` gives the VAT to pay for September–October.",
        "`test_case.actual_output` says an expense waiting for review is not in the report yet.",
      ]),
    ]);
  });

  it("last year's November–December report, across the year boundary", async ({
    expect,
  }) => {
    const { run, reads } = await runPhase3(
      "כמה מע״מ שילמתי על נובמבר-דצמבר 2025?"
    );

    expect(readsNamed(reads, "getVatSummary")).toContainEqual(
      expect.objectContaining({ from: "2025-11-01" })
    );
    expect(amountIn(run.answer, "508.49")).toBe(true);
    expect(answerNumbersNotFromSuccessfulTools(run)).toEqual([]);
    await expect(agentEvalTestCase(run)).toPass([
      booksAnswerJudge("November–December 2025 VAT", [
        "`test_case.actual_output` gives the VAT of the November–December 2025 period, naming it.",
      ]),
    ]);
  });

  it("a negative VAT figure is a refund", async ({ expect }) => {
    const { run } = await runPhase3("מגיע לי החזר מע״מ על מאי-יוני?");

    expect(calledToolNames(run)).toContain("getVatSummary");
    expect(amountIn(run.answer, "649.8")).toBe(true);
    expect(answerNumbersNotFromSuccessfulTools(run)).toEqual([]);
    await expect(agentEvalTestCase(run)).toPass([
      booksAnswerJudge("May–June refund", [
        "`test_case.actual_output` says May–June comes to a VAT refund (not a payment) and gives its amount.",
      ]),
    ]);
  });

  it("an exempt business gets no VAT figure", async ({ expect }) => {
    const { run, reads } = await runPhase3("כמה מע״מ אני צריך לשלם החודש?", {
      active: ceramics,
    });

    expect(calledToolNames(run)).toContain("getVatSummary");

    // The active business: every VAT read leaves the business out (the
    // active default) or names the workshop, never another business.
    for (const query of readsNamed(reads, "getVatSummary")) {
      expect([undefined, ceramics]).toContain(
        "businessNumber" in query ? query.businessNumber : undefined
      );
    }

    expect(answerNumbersNotFromSuccessfulTools(run)).toEqual([]);
    await expect(agentEvalTestCase(run)).toPass([
      booksAnswerJudge("No VAT for an exempt business", [
        "`test_case.actual_output` says the ceramics workshop is exempt (עוסק פטור) and has no VAT report, and gives no VAT amount.",
      ]),
    ]);
  });
});

describe.concurrent("reports: income-tax advances", () => {
  it("September's advance is read for its reporting period", async ({
    expect,
  }) => {
    const { run } = await runPhase3(
      "כמה מקדמת מס הכנסה אני צריך לשלם על ספטמבר?"
    );

    expect(calledToolNames(run)).toContain("getAdvanceTaxStatus");
    expect(amountIn(run.answer, "75")).toBe(true);
    expect(answerNumbersNotFromSuccessfulTools(run)).toEqual([]);
    await expect(agentEvalTestCase(run)).toPass([
      booksAnswerJudge("September's advance", [
        "`test_case.actual_output` gives the advance left to pay after the tax withheld at source, and says which period it covers.",
      ]),
    ]);
  });

  it("National Insurance advances are not in KeepInTax", async ({ expect }) => {
    const { run } = await runPhase3(
      "כמה אני משלם במקדמות של מס הכנסה וביטוח לאומי על ספטמבר?"
    );

    expect(calledToolNames(run)).toContain("getAdvanceTaxStatus");
    expect(answerNumbersNotFromSuccessfulTools(run)).toEqual([]);
    await expect(agentEvalTestCase(run)).toPass([
      booksAnswerJudge("No National Insurance figure", [
        "`test_case.actual_output` gives the income-tax advance and says National Insurance advances are not in KeepInTax, giving no National Insurance amount.",
      ]),
    ]);
  });
});

describe.concurrent("reports: coming up and readiness", () => {
  it("lists the reports due, the overdue one as not marked reported", async ({
    expect,
  }) => {
    const { run } = await runPhase3("אילו דוחות אני צריך להגיש בקרוב?");

    expect(calledToolNames(run)).toContain("listUpcomingReports");
    expect(answerNumbersNotFromSuccessfulTools(run)).toEqual([]);
    await expect(agentEvalTestCase(run)).toPass([
      booksAnswerJudge("Reports coming up", [
        "`test_case.actual_output` names the July–August VAT report as overdue and not marked as reported in KeepInTax, without saying it was never filed.",
        "`test_case.actual_output` names the September advance due on October 15.",
      ]),
    ]);
  });

  it("the next VAT report's due date", async ({ expect }) => {
    const { run } = await runPhase3("מתי צריך להגיש את דוח המע״מ הבא?");

    expect(calledToolNames(run)).toContain("listUpcomingReports");
    expect(run.answer).toMatch(/15/u);
    expect(answerNumbersNotFromSuccessfulTools(run)).toEqual([]);
    await expect(agentEvalTestCase(run)).toPass([
      booksAnswerJudge("Next VAT due date", [
        "`test_case.actual_output` gives November 15, 2026 as the due date of the September–October VAT report (and may mention the overdue July–August one).",
      ]),
    ]);
  });

  it("both businesses' open reports", async ({ expect }) => {
    const { run } = await runPhase3("מה הדוחות הפתוחים בשני העסקים שלי?");

    expect(calledToolNames(run)).toContain("listUpcomingReports");
    expect(answerNumbersNotFromSuccessfulTools(run)).toEqual([]);
    await expect(agentEvalTestCase(run)).toPass([
      booksAnswerJudge("Both businesses' reports", [
        "`test_case.actual_output` names reports of both businesses, including the ceramics workshop's September–October advance.",
      ]),
    ]);
  });

  it("what still needs review before the September–October report", async ({
    expect,
  }) => {
    const { run } = await runPhase3(
      "מה חסר לי לפני דוח המע״מ של ספטמבר-אוקטובר?"
    );

    expect(calledToolNames(run)).toContain("getReportReadiness");
    expect(answerNumbersNotFromSuccessfulTools(run)).toEqual([]);
    await expect(agentEvalTestCase(run)).toPass([
      booksAnswerJudge("Before the report", [
        "`test_case.actual_output` names what still needs attention: the Canva document waiting for an accounting mapping and the WeWork payment with no document.",
        "`test_case.actual_output` gives no shekel amount for the Canva document (its amount is in dollars with no shekel conversion).",
      ]),
    ]);
  });

  it("how many items wait for review", async ({ expect }) => {
    const { run } = await runPhase3(
      "כמה מסמכים ותנועות מחכים לבדיקה לפני הדוח הבא?"
    );

    expect(calledToolNames(run)).toContain("getReportReadiness");
    expect(answerNumbersNotFromSuccessfulTools(run)).toEqual([]);
    await expect(agentEvalTestCase(run)).toPass([
      booksAnswerJudge("Items waiting", [
        "`test_case.actual_output` gives how many documents and payments wait for review, as the tool counted them.",
      ]),
    ]);
  });
});

describe.concurrent("reports: failures", () => {
  it("a revoked access gives no figure", async ({ expect }) => {
    const { run } = await runPhase3("מה הרווח שלי השנה?", { revoked: true });

    expect(calledToolNames(run)).toContain("getProfitAndLoss");
    expect(answerNumbersNotFromSuccessfulTools(run)).toEqual([]);
    await expect(agentEvalTestCase(run)).toPass([
      booksAnswerJudge("Revoked access", [
        "`test_case.actual_output` says the agent can no longer read this account's books, and gives no figure.",
      ]),
    ]);
  });

  it("a VAT report that cannot be read gives no guessed figure", async ({
    expect,
  }) => {
    const { run } = await runPhase3("כמה מע״מ לשלם על ספטמבר-אוקטובר?", {
      failingReads: ["getVatSummary"],
    });

    expect(calledToolNames(run)).toContain("getVatSummary");
    expect(amountIn(run.answer, "598.97")).toBe(false);
    expect(answerNumbersNotFromSuccessfulTools(run)).toEqual([]);
    await expect(agentEvalTestCase(run)).toPass([
      booksAnswerJudge("VAT not readable", [
        "`test_case.actual_output` says the VAT figures cannot be read right now and gives no VAT amount.",
      ]),
    ]);
  });
});
