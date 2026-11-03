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
  totals: ExpenseTotals;
  groups: ({ key: string } & ExpenseTotals)[];
  rows: ExpenseRow[];
  pending: ExpenseTotals;
  categoriesInRange: string[];
}

/** The domain one agent request may use, bound to its verified user. */
export interface AgentDomain {
  queryExpenses: (query: ExpenseQuery) => Promise<ExpenseQueryResult>;
}
