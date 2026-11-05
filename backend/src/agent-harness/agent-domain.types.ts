/**
 * KeepInTax's side of the agent's domain ports. These mirror
 * backend/agent/src/agent/core/ports/keepintax-ports.ts and
 * backend/agent/src/server/runtime/agent-domain.ts: the agent package is ESM
 * on another TypeScript, so its types cannot be imported here. Change both
 * together.
 */

export const expenseGroupings = [
  'category',
  'subCategory',
  'supplier',
  'month',
] as const;

export type ExpenseGrouping = (typeof expenseGroupings)[number];

export interface ExpenseQuery {
  from: string;
  to: string;
  search?: string;
  category?: string;
  subCategory?: string;
  supplier?: string;
  groupBy?: ExpenseGrouping;
  includeRows?: boolean;
  businessNumber?: string;
}

/** Amounts in ₪ (VAT included), summed in agorot so parts add up exactly. */
export interface ExpenseTotals {
  count: number;
  sum: number;
  vatRecognized: number;
  taxRecognized: number;
}

export interface ExpenseRow {
  id: number;
  date: string;
  supplier: string;
  category: string;
  subCategory: string;
  sum: number;
  originalCurrency: string | null;
  originalSum: number | null;
  note: string | null;
}

export interface ExpenseQueryResult {
  business: { number: string; name: string };
  otherBusinesses: { number: string; name: string }[];
  from: string;
  to: string;
  // The filters the totals answer, as given (none: every expense).
  filters: {
    search: string | null;
    category: string | null;
    subCategory: string | null;
    supplier: string | null;
  };
  // Approved expenses booked to the business's accounts: what its reports
  // count.
  totals: ExpenseTotals;
  // The totals by groupBy, largest first (months in order); with
  // groupsOmitted, they add up to totals exactly.
  groups: ({ key: string } & ExpenseTotals)[];
  // The smaller groups past the list's limit, together.
  groupsOmitted: ({ groups: number } & ExpenseTotals) | null;
  // Up to 50 of the counted expenses, newest first, when asked for.
  rows: ExpenseRow[];
  // How many counted expenses the rows leave out.
  rowsOmitted: number;
  // "category / sub-category" of every match, so the answer can say what
  // the search covered.
  matchedClassifications: string[];
  // Not counted yet: waiting for review or for an accounting mapping.
  pending: ExpenseTotals;
  pendingByStatus: Record<'PENDING' | 'MISSING_ACCOUNTING_MAPPING' | 'NO_STATUS', number>;
  // Approved, but booked to no account (a private expense, D5): never in
  // the business's reports.
  approvedOutsideBooks: ExpenseTotals;
  // Rejected, or filed as not an expense: never counted.
  excluded: { count: number };
  // When nothing matched: the range's categories and sub-categories.
  categoriesInRange: string[];
}

/** The domain one agent request may use, bound to its verified user. */
export interface AgentDomain {
  queryExpenses: (query: ExpenseQuery) => Promise<ExpenseQueryResult>;
}
