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
  // ("דלק", "פלאפון"), case-insensitive: every word of it must appear.
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

/** Totals of a set of expenses, in ILS, summed in agorot (exact). */
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
  // The filters the totals answer, as given; null when not given.
  readonly filters: {
    readonly search: string | null;
    readonly category: string | null;
    readonly subCategory: string | null;
    readonly supplier: string | null;
  };
  // Approved expenses that match and are booked to the business's
  // accounts: what its reports count.
  readonly totals: ExpenseTotals;
  // The totals by groupBy: the 40 largest (months in order); with
  // groupsOmitted they add up to totals exactly.
  readonly groups: readonly ({ readonly key: string } & ExpenseTotals)[];
  // The smaller groups past the list, summed together; null when none.
  readonly groupsOmitted: ({ readonly groups: number } & ExpenseTotals) | null;
  readonly rows: readonly ExpenseRow[];
  // How many counted expenses the rows leave out (the totals still count
  // them).
  readonly rowsOmitted: number;
  // "category / sub-category" of every match: what the search covered.
  readonly matchedClassifications: readonly string[];
  // Matching expenses not approved yet (waiting for review, or for an
  // accounting mapping): not in the totals.
  readonly pending: ExpenseTotals;
  readonly pendingByStatus: {
    readonly PENDING: number;
    readonly MISSING_ACCOUNTING_MAPPING: number;
    readonly NO_STATUS: number;
  };
  // Approved, but booked to no account (private expenses): never in the
  // business's reports, so not in the totals.
  readonly approvedOutsideBooks: ExpenseTotals;
  // Rejected, or filed as not an expense: never counted.
  readonly excluded: { readonly count: number };
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
