import { Effect } from "effect";

import type {
  ExpenseQuery,
  ExpenseRow,
  ExpenseTotals,
  KeepInTaxBooks,
} from "@/agent/core/ports/keepintax-ports";

// KeepInTax's books in memory for the evals (KeepInTaxBooks): a business's
// expenses, answered as the Nest backend answers them
// (backend/src/agent-harness/agent-domain.service.ts): approved ones counted,
// pending ones apart, amounts summed in agorot, every one of the user's
// words matched in the category, sub-category, supplier and note, the 40
// largest groups with the rest summed together, at most 50 rows with the
// count left out, and the range's categories when nothing matched.

/** One expense in the evals' books. */
export type AgentEvalExpense = ExpenseRow & {
  readonly vatRecognized: number;
  readonly taxRecognized: number;
  readonly approved: boolean;
};

const evalBusiness = { number: "514789632", name: "סטודיו נועה" };
const maxRows = 50;
const maxGroups = 40;

const rounded = (amount: number) => Math.round(amount * 100) / 100;
const agorot = (amount: number) => Math.round(amount * 100);

const totalsOf = (expenses: readonly AgentEvalExpense[]): ExpenseTotals => {
  let sum = 0;
  let vat = 0;
  let tax = 0;

  for (const expense of expenses) {
    sum += agorot(expense.sum);
    vat += agorot(expense.vatRecognized);
    tax += agorot(expense.taxRecognized);
  }

  return {
    count: expenses.length,
    sum: sum / 100,
    vatRecognized: vat / 100,
    taxRecognized: tax / 100,
  };
};

const lower = (text: string | null) => (text ?? "").trim().toLowerCase();

// Each filter the query gives holds; one it leaves out holds by default.
const matchesSearch = (haystack: string, search: string | undefined) =>
  search === undefined ||
  lower(search)
    .split(/\s+/u)
    .filter(Boolean)
    .every((word) => haystack.includes(word));

const matchesExactly = (value: string, wanted: string | undefined) =>
  wanted === undefined || lower(value) === lower(wanted);

const matches = (expense: AgentEvalExpense, query: ExpenseQuery) => {
  const haystack = [
    expense.category,
    expense.subCategory,
    expense.supplier,
    expense.note,
  ]
    .map(lower)
    .join(" ");

  const supplierMatches =
    query.supplier === undefined ||
    lower(expense.supplier).includes(lower(query.supplier));

  return (
    matchesSearch(haystack, query.search) &&
    matchesExactly(expense.category, query.category) &&
    matchesExactly(expense.subCategory, query.subCategory) &&
    supplierMatches
  );
};

const groupKey = (
  expense: AgentEvalExpense,
  groupBy: NonNullable<ExpenseQuery["groupBy"]>
) => (groupBy === "month" ? expense.date.slice(0, 7) : expense[groupBy]);

// Totals per group: the largest first (months in order), the rest summed.
const groupTotals = (
  expenses: readonly AgentEvalExpense[],
  groupBy: NonNullable<ExpenseQuery["groupBy"]>
) => {
  const byKey = new Map<string, AgentEvalExpense[]>();

  for (const expense of expenses) {
    const key = groupKey(expense, groupBy);

    byKey.set(key, [...(byKey.get(key) ?? []), expense]);
  }

  const largestFirst = [...byKey.entries()]
    .map(([key, grouped]) => ({ key, grouped, totals: totalsOf(grouped) }))
    .toSorted(
      (a, b) => b.totals.sum - a.totals.sum || a.key.localeCompare(b.key)
    );

  const listed = largestFirst.slice(0, maxGroups);
  const omitted = largestFirst.slice(maxGroups);

  const ordered =
    groupBy === "month"
      ? listed.toSorted((a, b) => a.key.localeCompare(b.key))
      : listed;

  return {
    groups: ordered.map(({ key, totals }) => ({ key, ...totals })),
    groupsOmitted:
      omitted.length === 0
        ? null
        : {
            groups: omitted.length,
            ...totalsOf(omitted.flatMap(({ grouped }) => grouped)),
          },
  };
};

// An expense as the books show it, without the evals' own fields.
const expenseRow = (expense: AgentEvalExpense): ExpenseRow => ({
  id: expense.id,
  date: expense.date,
  supplier: expense.supplier,
  category: expense.category,
  subCategory: expense.subCategory,
  sum: expense.sum,
  originalCurrency: expense.originalCurrency,
  originalSum: expense.originalSum,
  note: expense.note,
});

/**
 * The books of one business with the given expenses, every query recorded.
 *
 * @param expenses - The business's expenses.
 * @returns The books port and the queries it answered.
 */
export const evalBooks = (expenses: readonly AgentEvalExpense[]) => {
  const queries: ExpenseQuery[] = [];

  const books: KeepInTaxBooks = {
    queryExpenses: (query) =>
      Effect.sync(() => {
        queries.push(query);

        const inRange = expenses.filter(
          (expense) => expense.date >= query.from && expense.date <= query.to
        );

        const matching = inRange.filter((expense) => matches(expense, query));
        const approved = matching.filter((expense) => expense.approved);
        const pending = matching.filter((expense) => !expense.approved);

        const { groups, groupsOmitted } =
          query.groupBy === undefined
            ? { groups: [], groupsOmitted: null }
            : groupTotals(approved, query.groupBy);

        const rows =
          query.includeRows === true
            ? approved
                .toSorted((a, b) => b.date.localeCompare(a.date))
                .slice(0, maxRows)
                .map(expenseRow)
            : [];

        return {
          business: evalBusiness,
          otherBusinesses: [],
          from: query.from,
          to: query.to,
          filters: {
            search: query.search ?? null,
            category: query.category ?? null,
            subCategory: query.subCategory ?? null,
            supplier: query.supplier ?? null,
          },
          totals: totalsOf(approved),
          groups,
          groupsOmitted,
          rows,
          rowsOmitted:
            query.includeRows === true ? approved.length - rows.length : 0,
          matchedClassifications: [
            ...new Set(
              matching.map(
                (expense) => `${expense.category} / ${expense.subCategory}`
              )
            ),
          ].toSorted(),
          pending: totalsOf(pending),
          pendingByStatus: {
            PENDING: pending.length,
            MISSING_ACCOUNTING_MAPPING: 0,
            NO_STATUS: 0,
          },
          approvedOutsideBooks: totalsOf([]),
          excluded: { count: 0 },
          categoriesInRange:
            matching.length === 0
              ? [
                  ...new Set(
                    inRange.flatMap((expense) => [
                      expense.category,
                      expense.subCategory,
                    ])
                  ),
                ].toSorted()
              : [],
        };
      }),
  };

  return { books, queries };
};

const car = "רכב";
const fuel = "דלק";
const communication = "תקשורת";
const mobile = "טלפון נייד";
const partner = "פלאפון";

const expense = (
  id: number,
  date: string,
  supplier: string,
  category: string,
  subCategory: string,
  sum: number,
  approved = true
): AgentEvalExpense => ({
  id,
  date,
  supplier,
  category,
  subCategory,
  sum,
  originalCurrency: null,
  originalSum: null,
  note: null,
  // VAT 18% included; two thirds recognized for a car, all of it otherwise.
  vatRecognized: rounded((sum - sum / 1.18) * (category === car ? 2 / 3 : 1)),
  taxRecognized: rounded((sum / 1.18) * (category === car ? 0.45 : 1)),
  approved,
});

/**
 * A designer's year of expenses up to the evals' day (2026-10-04): fuel,
 * a phone line, software, an accountant and office supplies, with one fuel
 * expense still waiting for review and one fuel expense from last year.
 */
export const evalDesignerExpenses: readonly AgentEvalExpense[] = [
  expense(1, "2025-12-28", "פז", car, fuel, 310),
  expense(2, "2026-01-12", "פז", car, fuel, 420.5),
  expense(3, "2026-02-09", "דלק", car, fuel, 388),
  expense(4, "2026-04-17", "סונול", car, fuel, 402.3),
  expense(5, "2026-07-03", "פז", car, fuel, 451.2),
  expense(6, "2026-09-21", "דלק", car, fuel, 299.9, false),
  expense(7, "2026-01-31", partner, communication, mobile, 89.9),
  expense(8, "2026-02-28", partner, communication, mobile, 89.9),
  expense(9, "2026-03-31", partner, communication, mobile, 89.9),
  expense(10, "2026-04-30", partner, communication, mobile, 89.9),
  expense(11, "2026-05-31", partner, communication, mobile, 89.9),
  expense(12, "2026-06-30", partner, communication, mobile, 89.9),
  expense(13, "2026-03-05", "Adobe", "תוכנה", "מנויי תוכנה", 1980),
  expense(14, "2026-06-15", "Figma", "תוכנה", "מנויי תוכנה", 720),
  expense(
    15,
    "2026-05-10",
    "משרד רו״ח לוי",
    "שירותים מקצועיים",
    "הנהלת חשבונות",
    3540
  ),
  expense(16, "2026-08-22", "אופיס דיפו", "משרד", "ציוד משרדי", 236.4),
];
