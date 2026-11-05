import { Effect } from "effect";

import type {
  ExpenseQuery,
  ExpenseQueryAnswer,
  ExpenseQueryResult,
  ExpenseRow,
  ExpenseTotals,
  ExpensesAcrossBusinessesResult,
  KeepInTaxBooks,
} from "@/agent/core/ports/keepintax-ports";

// KeepInTax's books in memory for the evals (KeepInTaxBooks): a data
// owner's businesses and their expenses, answered as the Nest backend
// answers them (backend/src/agent-harness/agent-domain.service.ts):
// - one business: the one asked for, else the active one, else the only
//   one; several without an active one ask which (BUSINESS_REQUIRED);
// - businessNumbers or allBusinesses: the same query in each, every number
//   checked first (a foreign one is refused outright), and the combined
//   totals only when every business answered;
// - approved and booked expenses counted; pending, private (approved, no
//   account) and rejected ones apart; amounts summed in agorot;
// - every one of the user's words matched in the category, sub-category,
//   supplier and note; the 40 largest groups with the rest summed; at most
//   50 rows with the count left out; the range's categories when nothing
//   matched.

/** Where an expense stands, as the backend reads its approval status. */
export type AgentEvalStanding =
  | "counted"
  | "pending"
  | "mapping"
  | "outsideBooks"
  | "excluded";

/** One expense in the evals' books. */
export type AgentEvalExpense = ExpenseRow & {
  readonly vatRecognized: number;
  readonly taxRecognized: number;
  readonly standing: AgentEvalStanding;
  // The business it belongs to; the first business when left out.
  readonly businessNumber: string | undefined;
};

/** One of the data owner's businesses. */
export interface AgentEvalBusiness {
  readonly number: string;
  readonly name: string;
}

export const evalDesignerBusiness: AgentEvalBusiness = {
  number: "514789632",
  name: "סטודיו נועה",
};

export const evalCeramicsBusiness: AgentEvalBusiness = {
  number: "039876541",
  name: "נועה קרמיקה",
};

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

const addTotals = (parts: readonly ExpenseTotals[]): ExpenseTotals => {
  let count = 0;
  let sum = 0;
  let vat = 0;
  let tax = 0;

  for (const part of parts) {
    count += part.count;
    sum += agorot(part.sum);
    vat += agorot(part.vatRecognized);
    tax += agorot(part.taxRecognized);
  }

  return {
    count,
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

const filtersOf = (query: ExpenseQuery) => ({
  search: query.search ?? null,
  category: query.category ?? null,
  subCategory: query.subCategory ?? null,
  supplier: query.supplier ?? null,
});

// The evals' books refuse as the backend does: an Error whose message
// starts with its CODE: (agent-tool-error-next-step.ts).
const refusal = (code: string, detail: string) =>
  new Error(`${code}: ${detail}`);

/** How the evals' owner and their books are set up. */
export interface AgentEvalBooksOptions {
  // The owner's businesses, in the app's order; the designer's alone when
  // left out.
  readonly businesses?: readonly AgentEvalBusiness[];
  // The app's active business; left out, the only business when there is
  // one, none when there are several.
  readonly active?: string | null;
  // Businesses whose reads fail (BOOKS_UNAVAILABLE), as a lost connection
  // would.
  readonly failing?: readonly string[];
}

/**
 * The books of one data owner with the given expenses, every query
 * recorded.
 *
 * @param expenses - The owner's expenses, each in its business.
 * @param options - The owner's businesses, the active one, failures.
 * @returns The books port and the queries it answered.
 */
export const evalBooks = (
  expenses: readonly AgentEvalExpense[],
  options: AgentEvalBooksOptions = {}
) => {
  const queries: ExpenseQuery[] = [];
  const businesses = options.businesses ?? [evalDesignerBusiness];
  const [firstBusiness] = businesses;

  // Left out: the only business when there is one, none when there are
  // several.
  const onlyBusiness =
    businesses.length === 1 ? (firstBusiness?.number ?? null) : null;

  const active = options.active === undefined ? onlyBusiness : options.active;

  const businessOf = (expense: AgentEvalExpense) =>
    expense.businessNumber ?? firstBusiness?.number;

  const oneBusiness = (
    query: ExpenseQuery,
    business: AgentEvalBusiness
  ): ExpenseQueryResult => {
    if (options.failing?.includes(business.number) === true) {
      throw refusal("BOOKS_UNAVAILABLE", "connect ECONNREFUSED");
    }

    const inRange = expenses.filter(
      (expense) =>
        businessOf(expense) === business.number &&
        expense.date >= query.from &&
        expense.date <= query.to
    );

    const matching = inRange.filter((expense) => matches(expense, query));

    const standing = (wanted: readonly AgentEvalStanding[]) =>
      matching.filter((expense) => wanted.includes(expense.standing));

    const counted = standing(["counted"]);
    const pending = standing(["pending", "mapping"]);

    const { groups, groupsOmitted } =
      query.groupBy === undefined
        ? { groups: [], groupsOmitted: null }
        : groupTotals(counted, query.groupBy);

    const rows =
      query.includeRows === true
        ? counted
            .toSorted((a, b) => b.date.localeCompare(a.date))
            .slice(0, maxRows)
            .map(expenseRow)
        : [];

    return {
      scope: "business",
      business,
      otherBusinesses: businesses.filter(
        (other) => other.number !== business.number
      ),
      from: query.from,
      to: query.to,
      filters: filtersOf(query),
      totals: totalsOf(counted),
      groups,
      groupsOmitted,
      rows,
      rowsOmitted:
        query.includeRows === true ? counted.length - rows.length : 0,
      matchedClassifications: [
        ...new Set(
          matching.map(
            (expense) => `${expense.category} / ${expense.subCategory}`
          )
        ),
      ].toSorted(),
      pending: totalsOf(pending),
      pendingByStatus: {
        PENDING: standing(["pending"]).length,
        MISSING_ACCOUNTING_MAPPING: standing(["mapping"]).length,
        NO_STATUS: 0,
      },
      approvedOutsideBooks: totalsOf(standing(["outsideBooks"])),
      excluded: { count: standing(["excluded"]).length },
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
  };

  const chooseBusiness = (asked: string | undefined) => {
    const wanted = asked ?? active ?? undefined;

    if (wanted !== undefined) {
      const found = businesses.find((business) => business.number === wanted);

      if (found === undefined) {
        throw refusal(
          "BUSINESS_NOT_FOUND",
          `business ${wanted} is not one of the user's businesses`
        );
      }

      return found;
    }

    if (businesses.length === 1 && firstBusiness !== undefined) {
      return firstBusiness;
    }

    throw refusal(
      "BUSINESS_REQUIRED",
      `the user has ${businesses.length} businesses: ${businesses
        .map((business) => `${business.number} (${business.name})`)
        .join(", ")}`
    );
  };

  const acrossBusinesses = (
    query: ExpenseQuery
  ): ExpensesAcrossBusinessesResult => {
    const requested =
      query.allBusinesses === true
        ? ("all" as const)
        : [...new Set(query.businessNumbers)];

    if (requested !== "all") {
      const foreign = requested.filter(
        (number) => !businesses.some((business) => business.number === number)
      );

      if (requested.length === 0 || foreign.length > 0) {
        throw refusal(
          "BUSINESS_NOT_FOUND",
          `not the user's businesses: ${foreign.join(", ")}`
        );
      }
    }

    const targets =
      requested === "all"
        ? businesses
        : businesses.filter((business) => requested.includes(business.number));

    const answered: ExpenseQueryResult[] = [];
    const failed: ExpensesAcrossBusinessesResult["failed"][number][] = [];

    for (const business of targets) {
      try {
        answered.push(oneBusiness(query, business));
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        const code = /^(?<code>[A-Z_]+):/u.exec(message)?.groups?.code;

        failed.push({
          business,
          code: code ?? "BOOKS_UNAVAILABLE",
          message: message.replace(/^[A-Z_]+: /u, ""),
        });
      }
    }

    const complete = failed.length === 0;

    const sumOf = (pick: (result: ExpenseQueryResult) => ExpenseTotals) =>
      addTotals(answered.map(pick));

    return {
      scope: "businesses",
      requested,
      from: query.from,
      to: query.to,
      filters: filtersOf(query),
      businesses: answered,
      failed,
      complete,
      combined: complete
        ? {
            totals: sumOf((result) => result.totals),
            pending: sumOf((result) => result.pending),
            approvedOutsideBooks: sumOf(
              (result) => result.approvedOutsideBooks
            ),
            excluded: {
              count: answered.reduce(
                (count, result) => count + result.excluded.count,
                0
              ),
            },
          }
        : null,
    };
  };

  const answer = (query: ExpenseQuery): ExpenseQueryAnswer => {
    const several =
      query.allBusinesses === true || query.businessNumbers !== undefined;

    if (
      several &&
      (query.businessNumber !== undefined ||
        (query.allBusinesses === true && query.businessNumbers !== undefined))
    ) {
      throw refusal(
        "EXPENSE_SCOPE_INVALID",
        "give one of businessNumber, businessNumbers or allBusinesses"
      );
    }

    return several
      ? acrossBusinesses(query)
      : oneBusiness(query, chooseBusiness(query.businessNumber));
  };

  const books: KeepInTaxBooks = {
    queryExpenses: (query) =>
      // The ports' contract: an Error whose message starts with its CODE:
      // (keepintax-ports.ts), as createKeepInTaxBooks fails.
      // @effect-diagnostics-next-line globalErrorInEffectCatch:off
      Effect.try({
        try: () => {
          queries.push(query);

          return answer(query);
        },
        catch: (error) =>
          // @effect-diagnostics-next-line globalErrorInEffectFailure:off
          error instanceof Error ? error : new Error(String(error)),
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
  standing: AgentEvalStanding = "counted",
  businessNumber?: string
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
  standing,
  businessNumber,
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
  expense(6, "2026-09-21", "דלק", car, fuel, 299.9, "pending"),
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

const ceramics = evalCeramicsBusiness.number;

/**
 * The same owner's second business, a ceramics workshop, this year: fuel
 * (two counted, one waiting for review, one rejected), materials, and a
 * private grocery expense approved outside the books. Fuel counted this
 * year: 250.40 + 180.75 = 431.15 ₪; with the studio's 1,662 ₪, 2,093.15 ₪.
 */
export const evalCeramicsExpenses: readonly AgentEvalExpense[] = [
  expense(101, "2026-03-14", "פז", car, fuel, 250.4, "counted", ceramics),
  expense(102, "2026-08-02", "סונול", car, fuel, 180.75, "counted", ceramics),
  expense(103, "2026-09-30", "דלק", car, fuel, 99.9, "pending", ceramics),
  expense(104, "2026-06-01", "פז", car, fuel, 60, "excluded", ceramics),
  expense(
    105,
    "2026-04-10",
    "קרמיקה בע״מ",
    "חומרי גלם",
    "חומר וזיגוג",
    1500,
    "counted",
    ceramics
  ),
  expense(
    106,
    "2026-05-05",
    "שופרסל",
    "פרטי",
    "מזון",
    412.3,
    "outsideBooks",
    ceramics
  ),
];

/** The owner of both businesses: the studio's expenses and the workshop's. */
export const evalTwoBusinessExpenses: readonly AgentEvalExpense[] = [
  ...evalDesignerExpenses.map((one) => ({
    ...one,
    businessNumber: evalDesignerBusiness.number,
  })),
  ...evalCeramicsExpenses,
];
