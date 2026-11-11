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

// Phase 3 books reads beyond expenses, in Hebrew (agent-eval-reports.ts has
// the data): bank and card transactions, issued documents, categories and
// clients of the design studio (514789632, active) and the ceramics
// workshop. The evals' day is 2026-10-04. Every case checks the four
// things: in code, the tool and its filters, the figures, and that every
// number comes from a tool result of the same turn
// (answerNumbersNotFromSuccessfulTools); with booksAnswerJudge, Hebrew,
// figures and records only from the tools' outputs, and what the case asks.

describe.concurrent("books reads: transactions", () => {
  it("money in this year comes from the transactions read, with the range", async ({
    expect,
  }) => {
    const { run, reads } = await runPhase3("כמה כסף נכנס לחשבון של העסק השנה?");

    expect(calledToolNames(run)).toContain("queryTransactions");
    expect(readsNamed(reads, "queryTransactions")).toContainEqual(
      expect.objectContaining({ from: "2026-01-01" })
    );
    expect(amountIn(run.answer, "12980")).toBe(true);
    expect(answerNumbersNotFromSuccessfulTools(run)).toEqual([]);
    await expect(agentEvalTestCase(run)).toPass([
      booksAnswerJudge("Money in this year", [
        "`test_case.actual_output` gives the money that came into the account this year as one total and says the period (since the start of the year).",
      ]),
    ]);
  });

  it("names the transactions still to classify", async ({ expect }) => {
    const { run, reads } = await runPhase3(
      "אילו תנועות בחשבון עוד לא סיווגתי השנה?"
    );

    expect(calledToolNames(run)).toContain("queryTransactions");
    expect(readsNamed(reads, "queryTransactions")).toContainEqual(
      expect.objectContaining({ state: "unclassified" })
    );
    expect(answerNumbersNotFromSuccessfulTools(run)).toEqual([]);
    await expect(agentEvalTestCase(run)).toPass([
      booksAnswerJudge("Transactions to classify", [
        "`test_case.actual_output` names WeWork and בטא שיווק as transactions not classified yet.",
      ]),
    ]);
  });

  it("September's money out leaves out a foreign payment with no ₪ amount, and says so", async ({
    expect,
  }) => {
    const { run, reads } = await runPhase3(
      "כמה כסף יצא מהחשבון ומהכרטיס בספטמבר?"
    );

    expect(readsNamed(reads, "queryTransactions")).toContainEqual(
      expect.objectContaining({ from: "2026-09-01", to: "2026-09-30" })
    );
    expect(amountIn(run.answer, "503.36")).toBe(true);
    expect(answerNumbersNotFromSuccessfulTools(run)).toEqual([]);
    await expect(agentEvalTestCase(run)).toPass([
      booksAnswerJudge("September's payments, partial", [
        "`test_case.actual_output` gives September's money out and says that one payment has no shekel amount (was not converted) and is not included in that total.",
      ]),
    ]);
  });

  it("a partial bank sync is reported as partial data", async ({ expect }) => {
    const { run, reads } = await runPhase3("כמה שילמתי השנה בכרטיס הוויזה?", {
      bankSync: "partial",
    });

    expect(calledToolNames(run)).toContain("queryTransactions");
    // The card's own payments: a read narrowed to the Visa card, or one
    // grouped by account that gives the card's subtotal.
    const transactionReads = readsNamed(reads, "queryTransactions");

    const narrowedToCard = transactionReads.some((query) =>
      /ויזה|4580/u.test(JSON.stringify(query))
    );

    const groupedByAccount = transactionReads.some((query) =>
      /"groupBy":"account"/u.test(JSON.stringify(query))
    );

    expect(narrowedToCard || groupedByAccount).toBe(true);
    expect(amountIn(run.answer, "1453.46")).toBe(true);
    expect(answerNumbersNotFromSuccessfulTools(run)).toEqual([]);
    await expect(agentEvalTestCase(run)).toPass([
      booksAnswerJudge("Partial bank data", [
        "`test_case.actual_output` gives this year's payments on the Visa card (כרטיס ויזה 4580) as one total.",
        "`test_case.actual_output` says the bank or card data may be partial or incomplete because the last sync did not finish successfully.",
      ]),
    ]);
  });

  it("without bank data, says there is none instead of inventing transactions", async ({
    expect,
  }) => {
    const { run } = await runPhase3("מה התנועות בחשבון הבנק שלי בספטמבר?", {
      bankSync: "none",
    });

    expect(calledToolNames(run)).toContain("queryTransactions");
    expect(amountIn(run.answer, "4720")).toBe(false);
    expect(answerNumbersNotFromSuccessfulTools(run)).toEqual([]);
    await expect(agentEvalTestCase(run)).toPass([
      booksAnswerJudge("No bank data", [
        "`test_case.actual_output` says no bank transactions are available (no bank data or sync), and names no transaction or amount.",
      ]),
    ]);
  });
});

describe.concurrent("books reads: issued documents", () => {
  it("finds the invoices issued to a client", async ({ expect }) => {
    const { run, reads } = await runPhase3(
      "האם הוצאתי השנה חשבונית לחברת אלפא?"
    );

    expect(calledToolNames(run)).toContain("queryIssuedDocuments");
    expect(
      readsNamed(reads, "queryIssuedDocuments").some((query) =>
        JSON.stringify(query).includes("אלפא")
      )
    ).toBe(true);
    expect(answerNumbersNotFromSuccessfulTools(run)).toEqual([]);
    await expect(agentEvalTestCase(run)).toPass([
      booksAnswerJudge("Invoices to Alpha", [
        "`test_case.actual_output` says yes: documents were issued to חברת אלפא this year (a tax invoice and an invoice-receipt).",
      ]),
    ]);
  });

  it("September's documents per type: a quote is no income, the credit invoice and the cancelled one apart", async ({
    expect,
  }) => {
    const { run } = await runPhase3(
      "אילו מסמכים הוצאתי מ-1 בספטמבר ועד היום, ובכמה?"
    );

    expect(calledToolNames(run)).toContain("queryIssuedDocuments");
    expect(amountIn(run.answer, "4720")).toBe(true);
    expect(amountIn(run.answer, "17110")).toBe(false);
    expect(answerNumbersNotFromSuccessfulTools(run)).toEqual([]);
    await expect(agentEvalTestCase(run)).toPass([
      booksAnswerJudge("Documents by type", [
        "`test_case.actual_output` gives the documents by type (tax invoice, credit invoice, price quote) and does not add the price quote to the income or give one total across all types.",
        "`test_case.actual_output` mentions that a cancelled document or a draft is not counted.",
      ]),
    ]);
  });

  it("August's invoices in shekels, dollars and euros stay in their own currencies", async ({
    expect,
  }) => {
    const { run, reads } = await runPhase3(
      "כמה חשבוניות הוצאתי באוגוסט ובאיזה סכומים?"
    );

    expect(readsNamed(reads, "queryIssuedDocuments")).toContainEqual(
      expect.objectContaining({ from: "2026-08-01", to: "2026-08-31" })
    );
    expect(amountIn(run.answer, "1180")).toBe(true);
    expect(amountIn(run.answer, "4180")).toBe(false);
    expect(answerNumbersNotFromSuccessfulTools(run)).toEqual([]);
    await expect(agentEvalTestCase(run)).toPass([
      booksAnswerJudge("Invoices per currency", [
        "`test_case.actual_output` gives August's invoices with each amount in its own currency: 1,180 in shekels, 1,000 in dollars and 2,000 in euros.",
        "`test_case.actual_output` does not add the shekel, dollar and euro amounts into one total.",
      ]),
    ]);
  });

  it("a client with no documents gets no invented invoice", async ({
    expect,
  }) => {
    const { run } = await runPhase3("הוצאתי חשבונית ללקוח אומגה השנה?");

    expect(calledToolNames(run)).toContain("queryIssuedDocuments");
    expect(answerNumbersNotFromSuccessfulTools(run)).toEqual([]);
    await expect(agentEvalTestCase(run)).toPass([
      booksAnswerJudge("No document for Omega", [
        "`test_case.actual_output` says no document was issued to אומגה this year, and gives no amount for it.",
        "Unless `test_case.tools_called` has a listClients call that returned the client list, `test_case.actual_output` does not say that no client named אומגה exists or is saved: no document for them is not the same as no such client.",
      ]),
    ]);
  });

  it("the workshop's receipts, for the business named", async ({ expect }) => {
    const { run, reads } = await runPhase3(
      "אילו קבלות הוצאתי השנה בעסק הקרמיקה?"
    );

    expect(readsNamed(reads, "queryIssuedDocuments")).toContainEqual(
      expect.objectContaining({ businessNumber: ceramics })
    );
    expect(amountIn(run.answer, "800")).toBe(true);
    expect(answerNumbersNotFromSuccessfulTools(run)).toEqual([]);
    await expect(agentEvalTestCase(run)).toPass([
      booksAnswerJudge("The workshop's receipts", [
        "`test_case.actual_output` gives the ceramics workshop's receipt this year (to סטודיו קרמיקה) and names the workshop.",
      ]),
    ]);
  });
});

describe.concurrent("books reads: categories and clients", () => {
  it("lists the car categories", async ({ expect }) => {
    const { run, reads } = await runPhase3(
      "אילו קטגוריות של רכב יש לי במערכת?"
    );

    expect(calledToolNames(run)).toContain("listCategories");
    expect(readsNamed(reads, "listCategories").length).toBeGreaterThan(0);
    expect(run.answer).toContain("דלק");
    expect(answerNumbersNotFromSuccessfulTools(run)).toEqual([]);
    await expect(agentEvalTestCase(run)).toPass([
      booksAnswerJudge("Car categories", [
        "`test_case.actual_output` names דלק as the car category the business has, and names no category the tools did not return.",
      ]),
    ]);
  });

  it("names the category waiting for the accountant's mapping", async ({
    expect,
  }) => {
    const { run } = await runPhase3("יש קטגוריות שעוד מחכות לרואה החשבון?");

    expect(calledToolNames(run)).toContain("listCategories");
    expect(answerNumbersNotFromSuccessfulTools(run)).toEqual([]);
    await expect(agentEvalTestCase(run)).toPass([
      booksAnswerJudge("The unmapped category", [
        "`test_case.actual_output` names עיצוב גרפי as waiting for the accountant (not yet mapped to an account).",
      ]),
    ]);
  });

  it("finds a client's phone number in the client list", async ({ expect }) => {
    const { run } = await runPhase3("מה מספר הטלפון של הלקוח בטא שיווק?");

    expect(calledToolNames(run)).toContain("listClients");
    expect(run.answer.replaceAll("-", "")).toContain("0501234567");
    expect(answerNumbersNotFromSuccessfulTools(run)).toEqual([]);
    await expect(agentEvalTestCase(run)).toPass([
      booksAnswerJudge("A client's phone", [
        "`test_case.actual_output` gives בטא שיווק's phone number, 050-1234567.",
      ]),
    ]);
  });
});
