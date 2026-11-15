import { Effect } from "effect";

import type {
  AdvanceTaxResult,
  CategoryListResult,
  CategoryQuery,
  ClientListResult,
  ClientQuery,
  CoveredRange,
  IssuedDocumentQuery,
  IssuedDocumentQueryResult,
  IssuedDocumentTotals,
  IssuedDocumentType,
  KeepInTaxBooks,
  ProfitAndLossResult,
  ReadinessItem,
  ReportObligation,
  ReportRangeQuery,
  ReportReadinessResult,
  TransactionGroup,
  TransactionQuery,
  TransactionQueryResult,
  TransactionRow,
  UpcomingReportsQuery,
  UpcomingReportsResult,
  VatSummaryResult,
} from "@/agent/core/ports/keepintax-ports";

// KeepInTax's other books and reports reads in memory, for the evals and the
// agent's unit tests (Phase 3). Each answers as the Nest backend's
// AgentBooksService does (backend/src/agent-harness/agent-books.service.ts):
// one business (the one asked for, else the active one, else the only one),
// amounts summed in agorot, issued documents per type, VAT and advances by
// whole periods (a bi-monthly business by two months), what is not counted
// apart, and its failures as `CODE: detail` errors. The data is a design
// studio's (licensed, bi-monthly VAT, monthly advances of 5%) and a ceramics
// workshop's (exempt), up to the evals' day, 2026-10-04.

/** The evals' day: "today" for the reads that need one. */
export const evalToday = "2026-10-04";

const studio = "514789632";
const ceramics = "039876541";

const alpha = 'חברת אלפא בע"מ';
const beta = "בטא שיווק";
const gamma = "גמא הפקות";
const delta = "דלתא תקשורת";
const paz = "פז";
const septemberFirst = "2026-09-01";
const septemberFifteenth = "2026-09-15";
const fuel = "דלק";
const car = "רכב";
const software = "תוכנה";
const subscriptions = "מנויי תוכנה";
const carSection = "רכב ותחבורה";
const softwareSection = "תוכנה ומחשוב";
const bank = "עו״ש לאומי 12-345";
const visa = "כרטיס ויזה 4580";
const ceramicsClient = "סטודיו קרמיקה";
const unclassifiedLabel = "לא מסווג";
const workflowSource = "workflow";
const vatType = "VAT";
const advanceType = "ADVANCE_TAX";
const studioVatCadence = "bi-monthly";
const usd = "USD";
const ils = "ILS";

const agorot = (amount: number) => Math.round(amount * 100);
const shekels = (amountInAgorot: number) => amountInAgorot / 100;

const lower = (text: string | null | undefined) =>
  (text ?? "").trim().toLowerCase();

const everyWord = (haystack: string, search: string | undefined) =>
  search === undefined ||
  lower(search)
    .split(/\s+/u)
    .filter(Boolean)
    .every((word) => haystack.includes(word));

const refusal = (code: string, detail: string) =>
  new Error(`${code}: ${detail}`);

const isoDay = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/u;

const realDay = (day: string) =>
  isoDay.test(day) &&
  new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day;

// A range of real days, as validDayRange checks it.
const checkRange = ({ from, to }: { from: string; to: string }) => {
  if (!realDay(from) || !realDay(to) || from > to) {
    throw refusal("RANGE_INVALID", `not a valid range: ${from} to ${to}`);
  }
};

const monthOf = (day: string) => day.slice(0, 7);

const sumAgorot = (amounts: readonly number[]) =>
  amounts.reduce((total, amount) => total + agorot(amount), 0);

// ─── The data ──────────────────────────────────────────────────────────────

interface EvalTransaction {
  readonly id: number;
  readonly business: string | null;
  readonly date: string;
  readonly merchant: string;
  readonly account: string;
  // Signed, in the transaction's currency.
  readonly amount: number;
  readonly currency: string;
  // The ₪ amount, null when no conversion was stamped.
  readonly ils: number | null;
  readonly category: string | null;
  readonly subCategory: string | null;
  readonly state: TransactionRow["state"];
}

const tx = (
  id: number,
  date: string,
  merchant: string,
  amount: number,
  state: TransactionRow["state"],
  fields: Partial<EvalTransaction> = {}
): EvalTransaction => ({
  id,
  business: studio,
  date,
  merchant,
  account: bank,
  amount,
  currency: ils,
  ils: Math.abs(amount),
  category: state === "unclassified" ? null : "הכנסה",
  subCategory: null,
  state,
  ...fields,
});

const fuelClass = { category: car, subCategory: fuel };
const softwareClass = { category: software, subCategory: subscriptions };

/** The studio's bank and card transactions this year (and one last year). */
export const evalTransactions: readonly EvalTransaction[] = [
  tx(1, "2026-01-15", alpha, 5900, "classified"),
  tx(2, "2026-03-10", beta, 2360, "unclassified"),
  tx(3, septemberFirst, alpha, 4720, "classified"),
  tx(4, "2026-01-12", paz, -420.5, "confirmed", fuelClass),
  tx(5, "2026-02-09", fuel, -388, "confirmed", fuelClass),
  tx(6, "2026-09-21", fuel, -299.9, "classified", fuelClass),
  tx(7, "2026-08-30", "WeWork", -1250, "unclassified", { account: visa }),
  tx(8, "2026-09-05", "Adobe", -54.99, "classified", {
    ...softwareClass,
    account: visa,
    currency: usd,
    ils: 203.46,
  }),
  tx(9, "2026-09-28", "Zoom", -15.99, "classified", {
    ...softwareClass,
    account: visa,
    currency: usd,
    ils: null,
  }),
  tx(10, "2026-07-03", "חברת החשמל", -312, "unclassified", { business: null }),
  tx(11, "2025-12-28", paz, -310, "confirmed", fuelClass),
  tx(12, "2026-05-20", ceramicsClient, 800, "classified", {
    business: ceramics,
  }),
];

interface EvalIssuedDocument {
  readonly business: string;
  readonly docType: IssuedDocumentType;
  readonly docNumber: string;
  readonly date: string;
  readonly client: string;
  readonly clientId: string | null;
  readonly withVat: number;
  readonly beforeVat: number;
  readonly vat: number;
  readonly status: "issued" | "cancelled" | "draft";
  // As issued: the totals are in this currency, never converted to ₪.
  readonly currency: string;
}

const doc = (
  docType: IssuedDocumentType,
  docNumber: string,
  date: string,
  client: string,
  beforeVat: number,
  status: EvalIssuedDocument["status"] = "issued"
): EvalIssuedDocument => ({
  business: studio,
  docType,
  docNumber,
  date,
  client,
  clientId: client === alpha ? "515151515" : null,
  beforeVat,
  vat: shekels(agorot(beforeVat * 0.18)),
  withVat: shekels(agorot(beforeVat * 1.18)),
  status,
  currency: ils,
});

// A document issued abroad in a foreign currency, with no VAT.
const foreignDoc = (
  docNumber: string,
  date: string,
  client: string,
  amount: number,
  currency: string
): EvalIssuedDocument => ({
  ...doc("TAX_INVOICE", docNumber, date, client, amount),
  vat: 0,
  withVat: amount,
  currency,
});

/** The documents the studio issued (the workshop issues receipts, no VAT). */
export const evalIssuedDocuments: readonly EvalIssuedDocument[] = [
  doc("TAX_INVOICE", "1000", "2025-12-20", alpha, 3000),
  doc("TAX_INVOICE_RECEIPT", "1001", "2026-01-15", alpha, 5000),
  doc("TAX_INVOICE", "1002", "2026-03-10", beta, 2000),
  doc("TAX_INVOICE", "1003", septemberFirst, alpha, 4000),
  doc("CREDIT_INVOICE", "1004", septemberFifteenth, beta, 500),
  doc("PRICE_QUOTE", "1005", "2026-09-20", gamma, 10_000),
  doc("TAX_INVOICE", "1006", "2026-09-25", delta, 1000, "cancelled"),
  doc("TAX_INVOICE", "1007", "2026-10-01", alpha, 2000, "draft"),
  // August: one invoice in each of three currencies.
  doc("TAX_INVOICE", "1008", "2026-08-05", beta, 1000),
  foreignDoc("1009", "2026-08-10", "Acme Inc", 1000, usd),
  foreignDoc("1010", "2026-08-20", "Berlin Design GmbH", 2000, "EUR"),
  {
    ...doc("RECEIPT", "1", "2026-05-20", ceramicsClient, 800),
    business: ceramics,
    vat: 0,
    withVat: 800,
  },
];

const client = (
  business: string,
  name: string,
  fields: Partial<ClientListResult["clients"][number]> = {}
) => ({
  business,
  name,
  taxId: null,
  phone: null,
  email: null,
  address: null,
  ...fields,
});

const evalClients = [
  client(studio, alpha, {
    taxId: "515151515",
    phone: "03-5551234",
    email: "office@alpha.co.il",
    address: "תל אביב",
  }),
  client(studio, beta, { phone: "050-1234567" }),
  client(studio, gamma, {
    taxId: "033333333",
    email: "gamma@example.com",
    address: "חיפה",
  }),
  client(studio, delta),
  client(ceramics, ceramicsClient),
];

type SubCategoryView =
  CategoryListResult["categories"][number]["subCategories"][number];

interface EvalCard {
  readonly account: string;
  readonly section: string;
  readonly vat: number;
  readonly tax: number;
}

const sub = (
  name: string,
  owner: SubCategoryView["owner"],
  status: SubCategoryView["status"],
  bookingCard: EvalCard | null
): SubCategoryView => ({
  name,
  owner,
  private: status === "private",
  status,
  accountName: bookingCard?.account ?? null,
  sectionName: bookingCard?.section ?? null,
  vatPercent: bookingCard?.vat ?? null,
  taxPercent: bookingCard?.tax ?? null,
});

const evalCategories: CategoryListResult["categories"] = [
  {
    name: "משרד",
    subCategories: [
      sub("ציוד משרדי", "system", "ready", {
        account: "ציוד משרדי",
        section: "הוצאות משרד",
        vat: 100,
        tax: 100,
      }),
    ],
  },
  { name: "פרטי", subCategories: [sub("מזון", "system", "private", null)] },
  {
    name: car,
    subCategories: [
      sub(fuel, "system", "ready", {
        account: fuel,
        section: carSection,
        vat: 66.67,
        tax: 45,
      }),
    ],
  },
  {
    name: "שיווק",
    subCategories: [sub("עיצוב גרפי", "own", "missing_mapping", null)],
  },
  {
    name: software,
    subCategories: [
      sub(subscriptions, "own", "ready", {
        account: subscriptions,
        section: softwareSection,
        vat: 100,
        tax: 100,
      }),
    ],
  },
  {
    name: "תקשורת",
    subCategories: [
      sub("טלפון נייד", "accountant", "ready", {
        account: "טלפון נייד",
        section: "תקשורת",
        vat: 66.67,
        tax: 50,
      }),
    ],
  },
];

// The studio's journal by month: income before VAT, and expenses as
// recognized for income tax per section.
const evalJournal: readonly {
  readonly month: string;
  readonly income: number;
  readonly expenses: readonly (readonly [string, number])[];
}[] = [
  { month: "2025-12", income: 3000, expenses: [[carSection, 118.22]] },
  { month: "2026-01", income: 5000, expenses: [[carSection, 160.36]] },
  { month: "2026-02", income: 0, expenses: [[carSection, 147.97]] },
  { month: "2026-03", income: 2000, expenses: [[softwareSection, 1677.97]] },
  { month: "2026-04", income: 0, expenses: [[carSection, 153.42]] },
  { month: "2026-05", income: 0, expenses: [["שירותים מקצועיים", 3000]] },
  { month: "2026-06", income: 0, expenses: [[softwareSection, 610.17]] },
  { month: "2026-07", income: 0, expenses: [[carSection, 172.08]] },
  { month: "2026-08", income: 0, expenses: [["הוצאות משרד", 200.34]] },
  { month: "2026-09", income: 3500, expenses: [] },
];

interface EvalVatPeriod {
  readonly sales: number;
  readonly inputExpenses: number;
  readonly toPay: number;
  readonly lines: number;
}

// The studio's VAT report per bi-monthly period, as the report computes it.
const evalVatPeriods = new Map<string, EvalVatPeriod>([
  [
    "11-12/2025",
    { sales: 3000, inputExpenses: 31.51, toPay: 508.49, lines: 1 },
  ],
  ["1-2/2026", { sales: 5000, inputExpenses: 129.2, toPay: 770.8, lines: 2 }],
  ["3-4/2026", { sales: 2000, inputExpenses: 363.35, toPay: -3.35, lines: 2 }],
  ["5-6/2026", { sales: 0, inputExpenses: 649.8, toPay: -649.8, lines: 2 }],
  ["7-8/2026", { sales: 0, inputExpenses: 68.83, toPay: -68.83, lines: 1 }],
  ["9-10/2026", { sales: 3500, inputExpenses: 31.03, toPay: 598.97, lines: 1 }],
]);

const evalVatMarkedReported = new Set(["1-2/2026", "3-4/2026", "5-6/2026"]);

// Tax withheld at source on the studio's documents, by month.
const evalWithholding = new Map([["2026-09", 100]]);

const obligation = (
  type: ReportObligation["type"],
  period: string,
  dates: readonly [string, string, string],
  state: ReportObligation["state"],
  statusSource: ReportObligation["statusSource"]
): ReportObligation => {
  const [periodStart, periodEnd, dueDate] = dates;
  const reported = state === "reported" ? "REPORTED" : "WAITING_FOR_CLIENT";

  return {
    type,
    period,
    periodStart,
    periodEnd,
    dueDate,
    state,
    statusSource,
    workflowStatus: statusSource === workflowSource ? reported : null,
  };
};

const julyAugust = ["2026-07-01", "2026-08-31", septemberFifteenth] as const;
const septemberOctober = [septemberFirst, "2026-10-31", "2026-11-15"] as const;

// Each business's report periods on the evals' day.
const evalObligations = new Map<string, readonly ReportObligation[]>([
  [
    studio,
    [
      obligation(
        vatType,
        "5-6/2026",
        ["2026-05-01", "2026-06-30", "2026-07-15"],
        "reported",
        workflowSource
      ),
      obligation(
        advanceType,
        "8/2026",
        ["2026-08-01", "2026-08-31", septemberFifteenth],
        "reported",
        workflowSource
      ),
      obligation(vatType, "7-8/2026", julyAugust, "overdue", workflowSource),
      obligation(
        advanceType,
        "9/2026",
        [septemberFirst, "2026-09-30", "2026-10-15"],
        "due",
        "none"
      ),
      obligation(
        advanceType,
        "10/2026",
        ["2026-10-01", "2026-10-31", "2026-11-15"],
        "open",
        "none"
      ),
      obligation(vatType, "9-10/2026", septemberOctober, "open", "none"),
    ],
  ],
  [
    ceramics,
    [
      obligation(
        advanceType,
        "7-8/2026",
        julyAugust,
        "reported",
        workflowSource
      ),
      obligation(advanceType, "9-10/2026", septemberOctober, "open", "none"),
    ],
  ],
]);

const readinessItem = (
  kind: ReadinessItem["kind"],
  date: string,
  name: string,
  amounts: { ils: number | null; currency?: string; original?: number },
  status: ReadinessItem["status"]
): ReadinessItem => ({
  kind,
  date,
  name,
  amountIls: amounts.ils,
  currency: amounts.currency ?? ils,
  originalAmount: amounts.original ?? null,
  status,
});

const evalReadinessItems: readonly ReadinessItem[] = [
  readinessItem(
    "matched",
    "2026-09-05",
    "Adobe",
    { ils: 203.46, currency: usd, original: 54.99 },
    "ready"
  ),
  readinessItem(
    "document_without_payment",
    "2026-09-12",
    "משרד רו״ח לוי",
    { ils: 1770 },
    "ready"
  ),
  readinessItem(
    "document_without_payment",
    "2026-09-18",
    "Canva",
    { ils: null, currency: usd, original: 12.99 },
    "missing_mapping"
  ),
  readinessItem(
    "payment_without_document",
    "2026-08-30",
    "WeWork",
    { ils: 1250 },
    "unclassified"
  ),
  readinessItem(
    "payment_without_document",
    "2026-09-21",
    fuel,
    { ils: 299.9 },
    "ready"
  ),
];

// ─── The reads ─────────────────────────────────────────────────────────────

/** One of the evals' owner's businesses. */
export interface AgentEvalReportBusiness {
  readonly number: string;
  readonly name: string;
}

/** The query of any report read. */
export type AgentEvalReadQuery =
  | TransactionQuery
  | IssuedDocumentQuery
  | CategoryQuery
  | ClientQuery
  | ReportRangeQuery
  | UpcomingReportsQuery;

/** What the evals' books give the report reads. */
export interface AgentEvalReportsContext {
  readonly businesses: readonly AgentEvalReportBusiness[];
  // The active business (the backend's verified one, else the only one).
  readonly active: AgentEvalReportBusiness | null;
  // The business the read is for (as the backend chooses it).
  readonly chooseBusiness: (
    asked: string | undefined
  ) => AgentEvalReportBusiness;
  // Pending expenses of a business in a range, as queryExpenses counts them.
  readonly pendingExpenses: (
    business: string,
    from: string,
    to: string
  ) => { readonly count: number; readonly sum: number };
  // Called before a read with its name and query; throws to fail it.
  readonly record: (name: string, query: AgentEvalReadQuery) => void;
  // How the last bank sync ended.
  readonly bankSync: "success" | "partial" | "none";
}

const view = (business: AgentEvalReportBusiness) => ({
  number: business.number,
  name: business.name,
});

const others = (
  context: AgentEvalReportsContext,
  business: AgentEvalReportBusiness
) =>
  context.businesses
    .filter((other) => other.number !== business.number)
    .map(view);

const isExempt = (business: AgentEvalReportBusiness) =>
  business.number === ceramics;

const lastDay = (year: number, monthIndex: number) =>
  new Date(Date.UTC(year, monthIndex + 1, 0)).toISOString().slice(0, 10);

const periodLabel = (cursor: Date, pairs: boolean) => {
  const month = cursor.getUTCMonth() + 1;
  const year = cursor.getUTCFullYear();

  return pairs
    ? `${month - ((month + 1) % 2)}-${month + (month % 2)}/${year}`
    : `${month}/${year}`;
};

// Whole months, or month pairs for the studio's bi-monthly VAT.
const covered = (
  business: AgentEvalReportBusiness,
  from: string,
  to: string
): CoveredRange => {
  const pairs = !isExempt(business);
  const [fromYear = 0, fromMonth = 1] = from.split("-").map(Number);
  const [toYear = 0, toMonth = 1] = to.split("-").map(Number);
  const first = pairs ? fromMonth - 1 - ((fromMonth - 1) % 2) : fromMonth - 1;
  const last = pairs ? toMonth - 1 + (toMonth % 2) : toMonth - 1;

  const start = new Date(Date.UTC(fromYear, first, 1))
    .toISOString()
    .slice(0, 10);

  const end = lastDay(toYear, last);
  const periods: string[] = [];

  for (
    let cursor = new Date(`${start}T00:00:00Z`);
    cursor.toISOString().slice(0, 10) <= end;
    cursor = new Date(
      Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1)
    )
  ) {
    const label = periodLabel(cursor, pairs);

    if (!periods.includes(label)) {
      periods.push(label);
    }
  }

  return {
    requested: { from, to },
    from: start,
    to: end,
    rangeExpanded: start !== from || end !== to,
    periods,
  };
};

// Per type and currency, never added across currencies.
const totalsByType = (
  docs: readonly EvalIssuedDocument[]
): IssuedDocumentTotals[] => {
  const keys = [
    ...new Set(docs.map((one) => `${one.docType}|${one.currency}`)),
  ].toSorted();

  return keys.map((key) => {
    const list = docs.filter((one) => `${one.docType}|${one.currency}` === key);
    const [first] = list;

    return {
      docType: first?.docType ?? "GENERAL",
      currency: first?.currency ?? ils,
      count: list.length,
      totalWithVat: shekels(sumAgorot(list.map((one) => one.withVat))),
      totalBeforeVat: shekels(sumAgorot(list.map((one) => one.beforeVat))),
      vat: shekels(sumAgorot(list.map((one) => one.vat))),
    };
  });
};

const asEffect = <Query extends AgentEvalReadQuery, Answer>(
  context: AgentEvalReportsContext,
  name: string,
  query: Query,
  answer: (query: Query) => Answer
) =>
  // The ports' contract: an Error whose message starts with its CODE:
  // (keepintax-ports.ts), as createKeepInTaxBooks fails.
  // @effect-diagnostics-next-line globalErrorInEffectCatch:off
  Effect.try({
    try: () => {
      context.record(name, query);

      return answer(query);
    },
    catch: (error) =>
      // @effect-diagnostics-next-line globalErrorInEffectFailure:off
      error instanceof Error ? error : new Error(String(error)),
  });

// ─── Transactions ──────────────────────────────────────────────────────────

const transactionKeys = {
  merchant: (one: EvalTransaction) => one.merchant,
  category: (one: EvalTransaction) => one.category ?? unclassifiedLabel,
  account: (one: EvalTransaction) => one.account,
  month: (one: EvalTransaction) => monthOf(one.date),
};

const moneyOf = (list: readonly EvalTransaction[]) => ({
  count: list.length,
  sum: shekels(sumAgorot(list.map((one) => one.ils ?? 0))),
});

const transactionRow = (one: EvalTransaction): TransactionRow => {
  const amount = one.ils ?? 0;

  return {
    id: one.id,
    date: one.date,
    merchant: one.merchant,
    account: one.account,
    amount: one.amount > 0 ? amount : -amount,
    currency: one.currency,
    originalAmount: one.currency === ils ? null : Math.abs(one.amount),
    category: one.category,
    subCategory: one.subCategory,
    state: one.state,
  };
};

const transactionMatches = (
  one: EvalTransaction,
  query: TransactionQuery,
  business: string
) => {
  const direction = query.direction ?? "all";
  const goesIn = one.amount > 0;

  const haystack = [one.merchant, one.category, one.subCategory]
    .map(lower)
    .join(" ");

  const accountMatches =
    query.account === undefined ||
    lower(one.account).includes(lower(query.account));

  const directionMatches =
    direction === "all" || (direction === "in") === goesIn;

  const stateMatches = [undefined, "all", one.state].includes(query.state);

  return [
    one.business === business,
    directionMatches,
    stateMatches,
    everyWord(haystack, query.search),
    accountMatches,
  ].every(Boolean);
};

const transactionGroups = (
  matched: readonly EvalTransaction[],
  groupBy: NonNullable<TransactionQuery["groupBy"]>
): TransactionGroup[] => {
  const keyOf = transactionKeys[groupBy];

  const groups = [...new Set(matched.map(keyOf))].map((key) => {
    const list = matched.filter((one) => keyOf(one) === key);

    return {
      key,
      count: list.length,
      moneyIn: moneyOf(list.filter((one) => one.amount > 0)).sum,
      moneyOut: moneyOf(list.filter((one) => one.amount < 0)).sum,
    };
  });

  return groupBy === "month"
    ? groups.toSorted((a, b) => a.key.localeCompare(b.key))
    : groups.toSorted(
        (a, b) => b.moneyIn + b.moneyOut - (a.moneyIn + a.moneyOut)
      );
};

const bankDataOf = (sync: AgentEvalReportsContext["bankSync"]) => {
  const recorded = sync !== "none";
  const succeeded = sync === "success";
  const result = succeeded ? "success" : "partial_success";

  return {
    syncRecorded: recorded,
    syncStatus: recorded ? "completed" : null,
    lastSyncResult: recorded ? result : null,
    lastSyncFinishedAt: recorded ? "2026-10-04T03:00:00.000Z" : null,
    lastSyncSkipReason: null,
    lastSyncSucceeded: succeeded,
  };
};

const queryTransactions = (
  context: AgentEvalReportsContext,
  query: TransactionQuery
): TransactionQueryResult => {
  checkRange(query);
  const business = context.chooseBusiness(query.businessNumber);
  const bankData = bankDataOf(context.bankSync);

  const inRange = bankData.syncRecorded
    ? evalTransactions.filter(
        (one) => one.date >= query.from && one.date <= query.to
      )
    : [];

  const kept = inRange.filter((one) =>
    transactionMatches(one, query, business.number)
  );

  // The business's account names, for an account filter that matched none:
  // only from the direction read, as the backend reads money in and money
  // out separately.
  const direction = query.direction ?? "all";

  const readDirection = (one: EvalTransaction) =>
    direction === "all" || (direction === "in") === one.amount > 0;

  const accountsInRange =
    query.account !== undefined && kept.length === 0
      ? [
          ...new Set(
            inRange.flatMap((one) =>
              one.business === business.number && readDirection(one)
                ? [one.account]
                : []
            )
          ),
        ].toSorted()
      : [];

  const matched = kept.filter((one) => one.ils !== null);
  const notConverted = kept.length - matched.length;
  const notLinked = inRange.filter((one) => one.business === null).length;

  const rows =
    query.includeRows === true
      ? matched
          .toSorted((a, b) => b.date.localeCompare(a.date))
          .slice(0, 50)
          .map(transactionRow)
      : [];

  const countState = (state: TransactionRow["state"]) =>
    matched.filter((one) => one.state === state).length;

  return {
    business: view(business),
    otherBusinesses: others(context, business),
    from: query.from,
    to: query.to,
    filters: {
      direction: query.direction ?? "all",
      search: query.search ?? null,
      account: query.account ?? null,
      state: query.state ?? "all",
    },
    bankData,
    moneyIn: moneyOf(matched.filter((one) => one.amount > 0)),
    moneyOut: moneyOf(matched.filter((one) => one.amount < 0)),
    byState: {
      unclassified: countState("unclassified"),
      classified: countState("classified"),
      confirmed: countState("confirmed"),
    },
    groups:
      query.groupBy === undefined
        ? []
        : transactionGroups(matched, query.groupBy),
    groupsOmitted: null,
    rows,
    rowsOmitted: query.includeRows === true ? matched.length - rows.length : 0,
    notConverted: { count: notConverted },
    notLinkedToBusiness: { count: notLinked },
    accountsInRange,
    // Unlinked rows may be this business's: their omission is incomplete too.
    complete:
      bankData.lastSyncSucceeded && notConverted === 0 && notLinked === 0,
  };
};

// ─── Issued documents ──────────────────────────────────────────────────────

const clientNames = (list: readonly EvalIssuedDocument[]) =>
  [...new Set(list.map((one) => one.client))].toSorted();

const documentRow = (one: EvalIssuedDocument) => ({
  docType: one.docType,
  docNumber: one.docNumber,
  date: one.date,
  client: one.client,
  clientId: one.clientId,
  totalWithVat: one.withVat,
  currency: one.currency,
  foreignAmount: null,
});

const documentGroups = (
  matching: readonly EvalIssuedDocument[],
  groupBy: NonNullable<IssuedDocumentQuery["groupBy"]>
) => {
  const keyOf = (one: EvalIssuedDocument) =>
    groupBy === "client" ? one.client : monthOf(one.date);

  return [...new Set(matching.map(keyOf))].toSorted().map((key) => ({
    key,
    byType: totalsByType(matching.filter((one) => keyOf(one) === key)),
  }));
};

const queryIssuedDocuments = (
  context: AgentEvalReportsContext,
  query: IssuedDocumentQuery
): IssuedDocumentQueryResult => {
  checkRange(query);
  const business = context.chooseBusiness(query.businessNumber);

  const inRange = evalIssuedDocuments.filter(
    (one) =>
      one.business === business.number &&
      one.date >= query.from &&
      one.date <= query.to &&
      [undefined, one.docType].includes(query.docType)
  );

  const clientMatches = (one: EvalIssuedDocument) =>
    query.client === undefined ||
    lower(one.client).includes(lower(query.client)) ||
    one.clientId === query.client;

  const issued = inRange.filter((one) => one.status === "issued");
  const matching = issued.filter(clientMatches);

  const countStatus = (status: EvalIssuedDocument["status"]) =>
    inRange.filter((one) => one.status === status && clientMatches(one)).length;

  const rows =
    query.includeRows === true
      ? matching
          .toSorted((a, b) => b.date.localeCompare(a.date))
          .map(documentRow)
      : [];

  return {
    business: view(business),
    otherBusinesses: others(context, business),
    from: query.from,
    to: query.to,
    filters: { docType: query.docType ?? null, client: query.client ?? null },
    count: matching.length,
    byType: totalsByType(matching),
    groups:
      query.groupBy === undefined
        ? []
        : documentGroups(matching, query.groupBy),
    groupsOmitted: 0,
    rows,
    rowsOmitted: 0,
    matchedClients: clientNames(matching),
    clientsInRange:
      query.client !== undefined && matching.length === 0
        ? clientNames(issued)
        : [],
    cancelled: { count: countStatus("cancelled") },
    notIssued: { count: countStatus("draft") },
  };
};

// ─── Categories and clients ────────────────────────────────────────────────

const listCategories = (
  context: AgentEvalReportsContext,
  query: CategoryQuery
): CategoryListResult => {
  const business = context.chooseBusiness(query.businessNumber);

  const categories = evalCategories.flatMap((category) => {
    const subCategories = category.subCategories.filter((one) =>
      everyWord(lower(`${category.name} ${one.name}`), query.search)
    );

    return subCategories.length === 0
      ? []
      : [{ name: category.name, subCategories }];
  });

  return {
    business: view(business),
    categories,
    subCategoryCount: categories.reduce(
      (count, category) => count + category.subCategories.length,
      0
    ),
    omitted: 0,
  };
};

const listClients = (
  context: AgentEvalReportsContext,
  query: ClientQuery
): ClientListResult => {
  const business = context.chooseBusiness(query.businessNumber);

  const clients = evalClients.flatMap(({ business: owner, ...one }) => {
    const found =
      query.search === undefined ||
      everyWord(lower(`${one.name} ${one.email ?? ""}`), query.search) ||
      one.taxId === query.search;

    return owner === business.number && found ? [one] : [];
  });

  return {
    business: view(business),
    clients,
    total: clients.length,
    omitted: 0,
  };
};

// ─── Reports ───────────────────────────────────────────────────────────────

const journalMonths = (
  business: AgentEvalReportBusiness,
  from: string,
  to: string
) =>
  isExempt(business)
    ? []
    : evalJournal.filter(
        ({ month }) => month >= monthOf(from) && month <= monthOf(to)
      );

const getProfitAndLoss = (
  context: AgentEvalReportsContext,
  query: ReportRangeQuery
): ProfitAndLossResult => {
  checkRange(query);
  const business = context.chooseBusiness(query.businessNumber);
  const months = journalMonths(business, query.from, query.to);
  const bySection = new Map<string, number>();

  for (const [section, amount] of months.flatMap(({ expenses }) => expenses)) {
    bySection.set(section, (bySection.get(section) ?? 0) + agorot(amount));
  }

  const income = sumAgorot(months.map((one) => one.income));
  const total = [...bySection.values()].reduce((sum, one) => sum + one, 0);

  return {
    business: view(business),
    from: query.from,
    to: query.to,
    income: shekels(income),
    expensesBySection: [...bySection.entries()]
      .toSorted(([, a], [, b]) => b - a)
      .map(([section, amount]) => ({ section, amount: shekels(amount) })),
    totalExpenses: shekels(total),
    netProfitBeforeTax: shekels(income - total),
    notCounted: {
      pendingExpenses: context.pendingExpenses(
        business.number,
        query.from,
        query.to
      ),
      depreciationMayBeMissing: true,
    },
  };
};

const noVat = (business: AgentEvalReportBusiness): VatSummaryResult => ({
  business: view(business),
  applies: false,
  reason: "EXEMPT_BUSINESS",
  cadence: null,
  range: null,
  vatRatePercent: null,
  salesSubjectToVat: null,
  exemptSales: null,
  inputVatOnExpenses: null,
  inputVatOnAssets: null,
  vatToPay: null,
  inputVatLines: null,
  markedReported: null,
  notCounted: null,
});

const getVatSummary = (
  context: AgentEvalReportsContext,
  query: ReportRangeQuery
): VatSummaryResult => {
  checkRange(query);
  const business = context.chooseBusiness(query.businessNumber);

  if (isExempt(business)) {
    return noVat(business);
  }

  const range = covered(business, query.from, query.to);

  const periods = range.periods.flatMap((label) => {
    const one = evalVatPeriods.get(label);

    return one === undefined ? [] : [one];
  });

  const sum = (pick: (one: EvalVatPeriod) => number) =>
    shekels(sumAgorot(periods.map(pick)));

  const [onlyPeriod] = range.periods;

  return {
    business: view(business),
    applies: true,
    reason: null,
    cadence: studioVatCadence,
    range,
    vatRatePercent: 18,
    salesSubjectToVat: sum((one) => one.sales),
    exemptSales: 0,
    inputVatOnExpenses: sum((one) => one.inputExpenses),
    inputVatOnAssets: 0,
    vatToPay: sum((one) => one.toPay),
    inputVatLines: periods.reduce((count, one) => count + one.lines, 0),
    markedReported:
      range.periods.length === 1
        ? evalVatMarkedReported.has(onlyPeriod ?? "")
        : null,
    notCounted: {
      pendingExpenses: context.pendingExpenses(
        business.number,
        range.from,
        range.to
      ),
    },
  };
};

const getAdvanceTaxStatus = (
  context: AgentEvalReportsContext,
  query: ReportRangeQuery
): AdvanceTaxResult => {
  checkRange(query);
  const business = context.chooseBusiness(query.businessNumber);
  const range = covered(business, query.from, query.to);
  const months = journalMonths(business, range.from, range.to);
  const income = sumAgorot(months.map((one) => one.income));
  const exempt = isExempt(business);
  const percent = exempt ? 0 : 5;
  // As the report: the advance rounded to whole shekels.
  const advance = Math.round((income / 100) * (percent / 100)) * 100;

  const withheld = sumAgorot(
    months.map(({ month }) => evalWithholding.get(month) ?? 0)
  );

  return {
    business: view(business),
    businessKind: exempt ? "exempt" : "licensed",
    advanceTaxCadence: exempt ? studioVatCadence : "monthly",
    range,
    totalIncome: shekels(income),
    advanceTaxPercent: percent,
    advanceTaxPercentSet: percent > 0,
    advanceTax: shekels(advance),
    withholdingAtSource: shekels(withheld),
    toPay: shekels(advance - withheld),
    notTracked: ["national_insurance_advances"],
  };
};

const byDueDate = (a: ReportObligation, b: ReportObligation) =>
  a.dueDate.localeCompare(b.dueDate) || a.type.localeCompare(b.type);

const isDone = (one: ReportObligation) =>
  ["reported", "dismissed"].includes(one.state);

const listUpcomingReports = (
  context: AgentEvalReportsContext,
  query: UpcomingReportsQuery
): UpcomingReportsResult => {
  const targets =
    query.businessNumber === undefined
      ? context.businesses
      : [context.chooseBusiness(query.businessNumber)];

  const withReported = query.includeReported === true;

  const all = targets.map(
    (business) => evalObligations.get(business.number) ?? []
  );

  const reportedOmitted = withReported
    ? 0
    : all.flat().filter((one) => isDone(one)).length;

  const businesses = targets.map(
    (business, index): UpcomingReportsResult["businesses"][number] => ({
      business: view(business),
      vatCadence: isExempt(business) ? "not_required" : studioVatCadence,
      advanceTaxCadence: isExempt(business) ? studioVatCadence : "monthly",
      obligations: (all[index] ?? [])
        .filter((one) => withReported || !isDone(one))
        .toSorted(byDueDate),
    })
  );

  return {
    today: evalToday,
    activeBusiness: context.active === null ? null : view(context.active),
    businesses,
    reportedOmitted,
  };
};

const getReportReadiness = (
  context: AgentEvalReportsContext,
  query: ReportRangeQuery
): ReportReadinessResult => {
  checkRange(query);
  const business = context.chooseBusiness(query.businessNumber);

  const items = isExempt(business)
    ? []
    : evalReadinessItems.filter(
        (one) => one.date === null || one.date <= query.to
      );

  const pendingExpenses = context.pendingExpenses(
    business.number,
    query.from,
    query.to
  );

  const kinds = (kind: ReadinessItem["kind"]) =>
    items.filter((one) => one.kind === kind).length;

  const statuses = (status: ReadinessItem["status"]) =>
    items.filter((one) => one.status === status).length;

  return {
    business: view(business),
    from: query.from,
    to: query.to,
    mode: isExempt(business) ? "documents_only" : "with_banking",
    counts: {
      matched: kinds("matched"),
      documentWithoutPayment: kinds("document_without_payment"),
      paymentWithoutDocument: kinds("payment_without_document"),
    },
    byStatus: {
      ready: statuses("ready"),
      missingMapping: statuses("missing_mapping"),
      private: statuses("private"),
      unclassified: statuses("unclassified"),
    },
    items,
    itemsOmitted: 0,
    conversionUnavailable: {
      count: items.filter(
        (one) => one.currency !== ils && one.amountIls === null
      ).length,
    },
    notCounted: { pendingExpenses },
    nothingToReview: items.length === 0 && pendingExpenses.count === 0,
  };
};

/**
 * The report reads of the evals' books.
 *
 * @param context - The owner's businesses, the business choice, failures.
 * @returns Every KeepInTaxBooks read but queryExpenses.
 */
export const evalReportReads = (
  context: AgentEvalReportsContext
): Omit<KeepInTaxBooks, "queryExpenses"> => ({
  listBusinesses: () =>
    Effect.succeed({
      businesses: context.businesses.map(({ number, name }) => ({
        number,
        name,
      })),
    }),
  queryTransactions: (query) =>
    asEffect(context, "queryTransactions", query, (one) =>
      queryTransactions(context, one)
    ),
  queryIssuedDocuments: (query) =>
    asEffect(context, "queryIssuedDocuments", query, (one) =>
      queryIssuedDocuments(context, one)
    ),
  listCategories: (query) =>
    asEffect(context, "listCategories", query, (one) =>
      listCategories(context, one)
    ),
  listClients: (query) =>
    asEffect(context, "listClients", query, (one) => listClients(context, one)),
  getProfitAndLoss: (query) =>
    asEffect(context, "getProfitAndLoss", query, (one) =>
      getProfitAndLoss(context, one)
    ),
  getVatSummary: (query) =>
    asEffect(context, "getVatSummary", query, (one) =>
      getVatSummary(context, one)
    ),
  getAdvanceTaxStatus: (query) =>
    asEffect(context, "getAdvanceTaxStatus", query, (one) =>
      getAdvanceTaxStatus(context, one)
    ),
  listUpcomingReports: (query) =>
    asEffect(context, "listUpcomingReports", query, (one) =>
      listUpcomingReports(context, one)
    ),
  getReportReadiness: (query) =>
    asEffect(context, "getReportReadiness", query, (one) =>
      getReportReadiness(context, one)
    ),
});
