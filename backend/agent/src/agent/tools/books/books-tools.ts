import { tool } from "ai";
import { Schema } from "effect";

import {
  issuedDocumentGroupings,
  issuedDocumentTypes,
  transactionDirections,
  transactionGroupings,
  transactionStates,
} from "@/agent/core/ports/keepintax-ports";

import { toStandardSchema } from "../../../../backend/shared/schema/standard-schema";
import { agentToolContextSchema } from "../../core/tool-runtime/agent-tool-context";
import {
  businessNumberInput,
  fromInput,
  includeRowsInput,
  runBooksRead,
  textInput,
  toInput,
} from "./books-tool-schema";

// The books tools beside queryExpenses (Phase 3, §3.3 of
// docs/plans/ai-agent-tools-plan.md): bank and card transactions, issued
// documents, categories and clients. Each reads what its app screen reads,
// as the data owner, in one business, and changes nothing.

export const queryTransactionsTool = tool({
  description:
    "Read the user's bank and card transactions in KeepInTax for a date range, in one business (the one named, else the conversation's), as the transactions page shows them: money in and money out (₪, absolute amounts), how many are unclassified, classified or confirmed as expenses, optionally grouped, and the transactions themselves. bankData says what the last bank sync recorded; complete is false when the totals may leave something out (notConverted transactions are not in them). When an account filter matches nothing, accountsInRange lists the account names to read again with. Use it for questions about what came in or went out of the account, payments to a merchant, or transactions still to classify; for expenses as booked, use queryExpenses.",
  inputSchema: toStandardSchema(
    Schema.Struct({
      from: fromInput,
      to: toInput,
      businessNumber: businessNumberInput,
      direction: Schema.optionalKey(
        Schema.Literals(transactionDirections).annotate({
          description:
            "in: money received; out: money paid; all (the default): both",
        })
      ),
      search: textInput(
        "Words to find in the merchant, the note, the category or the sub-category; every word must match"
      ),
      account: textInput(
        "Part of the bank account's or card's name, or its number"
      ),
      state: Schema.optionalKey(
        Schema.Literals(transactionStates).annotate({
          description:
            "unclassified: no category yet; classified: has a category, not yet an expense; confirmed: turned into an expense; all (the default)",
        })
      ),
      groupBy: Schema.optionalKey(
        Schema.Literals(transactionGroupings).annotate({
          description:
            "Totals per merchant, category or account (largest first), or per month (in order)",
        })
      ),
      includeRows: includeRowsInput(
        "Also return the transactions themselves, newest first (up to 50)"
      ),
    })
  ),
  contextSchema: agentToolContextSchema,
  execute: async (query, { context, abortSignal }) =>
    await runBooksRead(context.books.queryTransactions(query), abortSignal),
});

export const queryIssuedDocumentsTool = tool({
  description:
    'Read the documents the user\'s business issued in KeepInTax (tax invoices, receipts, invoice-receipts, credit invoices, quotes…) for a range of document dates, in one business: per document type and currency, how many and their totals with and without VAT in that currency as issued (never one total across types or currencies: a credit invoice reduces income, a quote is not income, and a dollar or euro total is not shekels), optionally per client or month, and the documents themselves. count is how many match, of every type and currency. Cancelled documents (cancelled) and drafts or ones awaiting allocation (notIssued) are excluded from count and every total: when either is above zero, say they are not included. It reads documents only: no document for a client never means the client is not saved (only listClients says that). Use it for "did I issue an invoice to X?" or "how much did I invoice this month?".',
  inputSchema: toStandardSchema(
    Schema.Struct({
      from: fromInput,
      to: toInput,
      businessNumber: businessNumberInput,
      docType: Schema.optionalKey(
        Schema.Literals(issuedDocumentTypes).annotate({
          description: "Only this document type",
        })
      ),
      client: textInput(
        "Part of the client's name, or their exact ID or VAT number"
      ),
      groupBy: Schema.optionalKey(
        Schema.Literals(issuedDocumentGroupings).annotate({
          description: "Totals per client (largest first) or per month",
        })
      ),
      includeRows: includeRowsInput(
        "Also return the documents themselves, newest first (up to 50)"
      ),
    })
  ),
  contextSchema: agentToolContextSchema,
  execute: async (query, { context, abortSignal }) =>
    await runBooksRead(context.books.queryIssuedDocuments(query), abortSignal),
});

export const listCategoriesTool = tool({
  description:
    "List the expense categories and sub-categories the user's business classifies with in KeepInTax (the app's, their accountant's and their own), each with whether it is ready (booked to an account), waits for the accountant's mapping, or is private (never in the business's books), and the account and percents its booking card carries. Use it for \"what categories do I have?\" and to find the right category name for a question.",
  inputSchema: toStandardSchema(
    Schema.Struct({
      businessNumber: businessNumberInput,
      search: textInput(
        "Words to find in the category or sub-category name; every word must match"
      ),
    })
  ),
  contextSchema: agentToolContextSchema,
  execute: async (query, { context, abortSignal }) =>
    await runBooksRead(context.books.listCategories(query), abortSignal),
});

export const listClientsTool = tool({
  description:
    "List the user's own customers saved in KeepInTax for one business (name, ID or VAT number, phone, email, address). Use it for questions about who their clients are, or to find a client's exact name before reading their documents.",
  inputSchema: toStandardSchema(
    Schema.Struct({
      businessNumber: businessNumberInput,
      search: textInput(
        "Words to find in the client's name or email, or their exact ID number"
      ),
    })
  ),
  contextSchema: agentToolContextSchema,
  execute: async (query, { context, abortSignal }) =>
    await runBooksRead(context.books.listClients(query), abortSignal),
});

/** Enqueue the existing user-authorized background classifier; never grants consent. */
export const startAutomaticClassificationTool = tool({
  description:
    "Start automatic classification of ALL eligible unclassified outgoing transactions across the owner's businesses, ONLY when the user explicitly asks to classify everything. The server requires the owner's standing consent in Settings / My Agent, complete onboarding for each business, active open banking and linked payment sources. Never enables consent. Returns queued, not completed; questions and progress appear in Settings / My Agent. Background creates permanent rules only; one-time choices remain on the individual chat approval card.",
  inputSchema: toStandardSchema(
    Schema.Struct({ scope: Schema.Literal("all") })
  ),
  contextSchema: agentToolContextSchema,
  execute: async (_query, { context, abortSignal }) => {
    const start = context.books.startAutomaticClassification;

    if (start === undefined) {
      throw new Error("AUTOMATION_UNAVAILABLE: unavailable");
    }

    return await runBooksRead(start({}), abortSignal);
  },
});
