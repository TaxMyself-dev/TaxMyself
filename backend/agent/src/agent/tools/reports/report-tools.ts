import { tool } from "ai";
import { Schema } from "effect";

import { toStandardSchema } from "../../../../backend/shared/schema/standard-schema";
import { agentToolContextSchema } from "../../core/tool-runtime/agent-tool-context";
import {
  businessNumberInput,
  fromInput,
  runBooksRead,
  toInput,
} from "../books/books-tool-schema";

// listUpcomingReports' selector differs from the others': left out, it
// lists every business, not the active one.

// The reports tools (Phase 3, §3.4 of docs/plans/ai-agent-tools-plan.md):
// the P&L, the VAT report, income-tax advances, the reports coming up and
// what still needs review before one. Each gives the figures the report
// service computes, as the data owner, in one business, and changes nothing:
// no report is prepared, submitted or marked.

const rangeInput = toStandardSchema(
  Schema.Struct({
    from: fromInput,
    to: toInput,
    businessNumber: businessNumberInput,
  })
);

export const getProfitAndLossTool = tool({
  description:
    "Read the profit and loss (רווח והפסד) of one of the user's businesses for a date range, from its books: income before VAT, expenses as recognized for income tax per accounting section, total expenses and net profit before tax. notCounted says what is not in it yet: expenses waiting for review, and depreciation the P&L screen has not booked yet.",
  inputSchema: rangeInput,
  contextSchema: agentToolContextSchema,
  execute: async (query, { context, abortSignal }) =>
    await runBooksRead(context.books.getProfitAndLoss(query), abortSignal),
});

export const getVatSummaryTool = tool({
  description:
    "Read the VAT report's figures (דוח מע״מ) of one of the user's businesses: sales subject to VAT, exempt sales, input VAT on expenses and on assets, and the VAT to pay (negative: a refund). The range widens to whole VAT periods (a bi-monthly business reports two months together); range says what was covered. An exempt business, or one not required to report VAT, gets applies false and no figures.",
  inputSchema: rangeInput,
  contextSchema: agentToolContextSchema,
  execute: async (query, { context, abortSignal }) =>
    await runBooksRead(context.books.getVatSummary(query), abortSignal),
});

export const getAdvanceTaxStatusTool = tool({
  description:
    "Read the income-tax advance (מקדמות מס הכנסה) of one of the user's businesses for a range, as the advance-tax report computes it: the income, the advance percent set for the business, the advance, the tax withheld at source and what is left to pay. It covers whole reporting periods (range). National Insurance advances are not in KeepInTax (notTracked).",
  inputSchema: rangeInput,
  contextSchema: agentToolContextSchema,
  execute: async (query, { context, abortSignal }) =>
    await runBooksRead(context.books.getAdvanceTaxStatus(query), abortSignal),
});

export const listUpcomingReportsTool = tool({
  description:
    "List the VAT and income-tax advance reports of every one of the user's businesses (or one): each period with its due date and state, open (the period has not ended), due, overdue (past its due date and not marked as reported in KeepInTax) or reported, and where that state comes from. Reported ones are left out unless includeReported. activeBusiness is the business a question naming none is about (null when none is active): use it for that question's next report.",
  inputSchema: toStandardSchema(
    Schema.Struct({
      businessNumber: Schema.optionalKey(
        Schema.String.check(Schema.isPattern(/^\d{5,12}$/u)).annotate({
          description:
            "Only this one of the user's businesses; left out, all of them",
        })
      ),
      includeReported: Schema.optionalKey(
        Schema.Boolean.annotate({
          description: "Also list the periods already reported",
        })
      ),
    })
  ),
  contextSchema: agentToolContextSchema,
  execute: async (query, { context, abortSignal }) =>
    await runBooksRead(context.books.listUpcomingReports(query), abortSignal),
});

export const getReportReadinessTool = tool({
  description:
    "Check what still needs review in one business before a report for a range, as the review screen lists it now: documents with no payment, payments with no document, matched pairs, and how many are ready, wait for an accounting mapping, are private or unclassified, plus expenses waiting for review. It reads the rows as they stand: files not yet read from the Drive inbox and new automatic matches are not included.",
  inputSchema: rangeInput,
  contextSchema: agentToolContextSchema,
  execute: async (query, { context, abortSignal }) =>
    await runBooksRead(context.books.getReportReadiness(query), abortSignal),
});
