import type { Effect } from "effect";

// KeepInTax's ports: what the agent's domain tools may ask of KeepInTax's
// books. The Nest backend implements them over its own services, with the
// request's verified identity (the data owner, the business, the delegation
// scopes), so a tool reaches only what the user could reach in the app
// (backend/src/agent-harness/agent-domain.service.ts). The agent evals give
// them fixed answers (tests/evals/agent/harness). Each fails with an Error
// whose message starts with its CODE: (agent-tool-error-next-step.ts).

/** How queryExpenses groups its totals. */
export const expenseGroupings = [
  "category",
  "subCategory",
  "supplier",
  "month",
] as const;

/** One expense query: a date range and optional filters. */
export interface ExpenseQuery {
  // The range, inclusive, as YYYY-MM-DD (the expense's date).
  readonly from: string;
  readonly to: string;
  // Matches the category, the sub-category, the supplier or the note
  // ("דלק", "פלאפון"), case-insensitive, any word of it.
  readonly search?: string;
  readonly category?: string;
  readonly subCategory?: string;
  readonly supplier?: string;
  readonly groupBy?: (typeof expenseGroupings)[number];
  // The matching expenses themselves (newest first, up to 50), not only
  // their totals.
  readonly includeRows?: boolean;
  // One of the owner's businesses; their only or current one when left out.
  readonly businessNumber?: string;
}

/** Totals of a set of expenses, in ILS. */
export interface ExpenseTotals {
  readonly count: number;
  // What was paid, VAT included.
  readonly sum: number;
  // The VAT recognized for the VAT report.
  readonly vatRecognized: number;
  // The amount recognized as an expense for income tax.
  readonly taxRecognized: number;
}

/** One expense as the agent reads it. */
export interface ExpenseRow {
  readonly id: number;
  readonly date: string;
  readonly supplier: string;
  readonly category: string;
  readonly subCategory: string;
  readonly sum: number;
  readonly originalCurrency: string | null;
  readonly originalSum: number | null;
  readonly note: string | null;
}

/** What queryExpenses answers. */
export interface ExpenseQueryResult {
  readonly business: { readonly number: string; readonly name: string };
  // The other businesses the owner has, to query when asked about them.
  readonly otherBusinesses: readonly {
    readonly number: string;
    readonly name: string;
  }[];
  readonly from: string;
  readonly to: string;
  // Approved expenses that match: what the reports count.
  readonly totals: ExpenseTotals;
  readonly groups: readonly ({ readonly key: string } & ExpenseTotals)[];
  readonly rows: readonly ExpenseRow[];
  // Matching expenses not approved yet (waiting for review): not in the
  // totals.
  readonly pending: ExpenseTotals;
  // When nothing matched the filters: the categories and sub-categories the
  // range has, to try again with the user's words mapped to one of them.
  readonly categoriesInRange: readonly string[];
}

/**
 * The user's books: expenses so far (more queries come with the next
 * tools).
 */
export interface KeepInTaxBooks {
  queryExpenses: (
    query: ExpenseQuery
  ) => Effect.Effect<ExpenseQueryResult, Error>;
}
