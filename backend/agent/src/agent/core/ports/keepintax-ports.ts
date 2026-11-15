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
  // Several of the owner's businesses, or all of them: the same query in
  // each, with a combined total (ExpensesAcrossBusinessesResult).
  readonly businessNumbers?: readonly string[];
  readonly allBusinesses?: boolean;
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

/** What queryExpenses answers for one business. */
export interface ExpenseQueryResult {
  readonly scope: "business";
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

/** What several businesses' results add up to, summed in agorot. */
export interface ExpenseCombinedTotals {
  readonly totals: ExpenseTotals;
  readonly pending: ExpenseTotals;
  readonly approvedOutsideBooks: ExpenseTotals;
  readonly excluded: { readonly count: number };
}

/**
 * The same query in several of the owner's businesses: each business's
 * result, and their combined totals only when every business answered.
 */
export interface ExpensesAcrossBusinessesResult {
  readonly scope: "businesses";
  // What was asked: "all" the owner's businesses, or the numbers given.
  readonly requested: "all" | readonly string[];
  readonly from: string;
  readonly to: string;
  readonly filters: ExpenseQueryResult["filters"];
  // One result per business that answered.
  readonly businesses: readonly ExpenseQueryResult[];
  // The businesses that did not answer, and why.
  readonly failed: readonly {
    readonly business: { readonly number: string; readonly name: string };
    readonly code: string;
    readonly message: string;
  }[];
  readonly complete: boolean;
  // Every business's subtotal added up; null unless complete, so a partial
  // sum is never read as the whole.
  readonly combined: ExpenseCombinedTotals | null;
}

/** What queryExpenses answers: one business, or several. */
export type ExpenseQueryAnswer =
  | ExpenseQueryResult
  | ExpensesAcrossBusinessesResult;

// ─── Phase 3: the other books and reports reads ───────────────────────────
// Mirrors backend/src/agent-harness/agent-domain.types.ts; change both
// together. Every amount is ₪ summed in agorot (exact) unless it says
// otherwise, and every read changes nothing.

/** One of the data owner's businesses. */
export interface BusinessView {
  readonly number: string;
  readonly name: string;
}

/** A count and an amount in ₪. */
export interface MoneyTotal {
  readonly count: number;
  readonly sum: number;
}

/** Expenses of the range still waiting for review or a mapping: in no report yet. */
export interface NotCountedExpenses {
  readonly pendingExpenses: MoneyTotal;
}

export const transactionGroupings = [
  "merchant",
  "category",
  "month",
  "account",
] as const;

export const transactionDirections = ["in", "out", "all"] as const;

export const transactionStates = [
  "all",
  "unclassified",
  "classified",
  "confirmed",
] as const;

/** One query of bank and card transactions. */
export interface TransactionQuery {
  readonly from: string;
  readonly to: string;
  readonly businessNumber?: string;
  readonly direction?: (typeof transactionDirections)[number];
  readonly search?: string;
  readonly account?: string;
  readonly state?: (typeof transactionStates)[number];
  readonly groupBy?: (typeof transactionGroupings)[number];
  readonly includeRows?: boolean;
}

/** One bank or card transaction as the transactions page shows it. */
export interface TransactionRow {
  readonly id: number;
  readonly date: string;
  readonly merchant: string;
  readonly account: string | null;
  // ₪: positive money in, negative money out.
  readonly amount: number;
  readonly currency: string;
  readonly originalAmount: number | null;
  readonly category: string | null;
  readonly subCategory: string | null;
  readonly state: "unclassified" | "classified" | "confirmed";
}

/** Transactions totalled by merchant, category, account or month. */
export interface TransactionGroup {
  readonly key: string;
  readonly count: number;
  readonly moneyIn: number;
  readonly moneyOut: number;
}

/** What queryTransactions answers for one business. */
export interface TransactionQueryResult {
  readonly business: BusinessView;
  readonly otherBusinesses: readonly BusinessView[];
  readonly from: string;
  readonly to: string;
  readonly filters: {
    readonly direction: string;
    readonly search: string | null;
    readonly account: string | null;
    readonly state: string;
  };
  // The cached data and its last sync, as recorded; a current bank
  // connection is not read.
  readonly bankData: {
    readonly syncRecorded: boolean;
    readonly syncStatus: string | null;
    readonly lastSyncResult: string | null;
    readonly lastSyncFinishedAt: string | null;
    readonly lastSyncSkipReason: string | null;
    readonly lastSyncSucceeded: boolean;
  };
  readonly moneyIn: MoneyTotal;
  readonly moneyOut: MoneyTotal;
  readonly byState: {
    readonly unclassified: number;
    readonly classified: number;
    readonly confirmed: number;
  };
  readonly groups: readonly TransactionGroup[];
  readonly groupsOmitted:
    | ({ readonly groups: number } & Omit<TransactionGroup, "key">)
    | null;
  readonly rows: readonly TransactionRow[];
  readonly rowsOmitted: number;
  readonly notConverted: { readonly count: number };
  readonly notLinkedToBusiness: { readonly count: number };
  // When the account filter matched nothing: the account names of the
  // range, to read again with the one the user meant.
  readonly accountsInRange: readonly string[];
  readonly complete: boolean;
}

export const issuedDocumentTypes = [
  "GENERAL",
  "RECEIPT",
  "TAX_INVOICE",
  "TAX_INVOICE_RECEIPT",
  "TRANSACTION_INVOICE",
  "CREDIT_INVOICE",
  "PRICE_QUOTE",
  "WORK_ORDER",
  "JOURNAL_ENTRY",
] as const;

/** A kind of document a business issues. */
export type IssuedDocumentType = (typeof issuedDocumentTypes)[number];

export const issuedDocumentGroupings = ["client", "month"] as const;

/** One query of the documents a business issued. */
export interface IssuedDocumentQuery {
  readonly from: string;
  readonly to: string;
  readonly businessNumber?: string;
  readonly docType?: IssuedDocumentType;
  readonly client?: string;
  readonly groupBy?: (typeof issuedDocumentGroupings)[number];
  readonly includeRows?: boolean;
}

/**
 * Issued documents of one type in one currency, totalled in that currency as
 * issued (documents are stored in their own currency, not converted to ₪).
 */
export interface IssuedDocumentTotals {
  readonly docType: IssuedDocumentType;
  readonly currency: string;
  readonly count: number;
  readonly totalWithVat: number;
  readonly totalBeforeVat: number;
  readonly vat: number;
}

/** One issued document. */
export interface IssuedDocumentRow {
  readonly docType: IssuedDocumentType;
  readonly docNumber: string;
  readonly date: string;
  readonly client: string;
  readonly clientId: string | null;
  // In the document's own currency.
  readonly totalWithVat: number;
  readonly currency: string;
  // The stored foreign amount as it is (often empty); never a conversion.
  readonly foreignAmount: number | null;
}

/** What queryIssuedDocuments answers for one business. */
export interface IssuedDocumentQueryResult {
  readonly business: BusinessView;
  readonly otherBusinesses: readonly BusinessView[];
  readonly from: string;
  readonly to: string;
  readonly filters: {
    readonly docType: string | null;
    readonly client: string | null;
  };
  // How many issued documents match, of every type and currency: a count,
  // never an amount.
  readonly count: number;
  // Issued documents per type and currency; never one total across types or
  // currencies.
  readonly byType: readonly IssuedDocumentTotals[];
  readonly groups: readonly {
    readonly key: string;
    readonly byType: readonly IssuedDocumentTotals[];
  }[];
  readonly groupsOmitted: number;
  readonly rows: readonly IssuedDocumentRow[];
  readonly rowsOmitted: number;
  readonly matchedClients: readonly string[];
  readonly clientsInRange: readonly string[];
  readonly cancelled: { readonly count: number };
  readonly notIssued: { readonly count: number };
}

/** One read of a business's expense categories. */
export interface CategoryQuery {
  readonly businessNumber?: string;
  readonly search?: string;
}

/** The categories a business classifies with, each with its standing. */
export interface CategoryListResult {
  readonly business: BusinessView;
  readonly categories: readonly {
    readonly name: string;
    readonly subCategories: readonly {
      readonly name: string;
      readonly owner: "system" | "accountant" | "own";
      readonly private: boolean;
      readonly status: "ready" | "missing_mapping" | "private";
      readonly accountName: string | null;
      readonly sectionName: string | null;
      readonly vatPercent: number | null;
      readonly taxPercent: number | null;
    }[];
  }[];
  readonly subCategoryCount: number;
  readonly omitted: number;
}

/** One read of a business's own customers. */
export interface ClientQuery {
  readonly businessNumber?: string;
  readonly search?: string;
}

/** A business's own customers. */
export interface ClientListResult {
  readonly business: BusinessView;
  readonly clients: readonly {
    readonly name: string;
    readonly taxId: string | null;
    readonly phone: string | null;
    readonly email: string | null;
    readonly address: string | null;
  }[];
  readonly total: number;
  readonly omitted: number;
}

/** A report read: a range of days in one business. */
export interface ReportRangeQuery {
  readonly from: string;
  readonly to: string;
  readonly businessNumber?: string;
}

/** The whole reporting periods a report read covers. */
export interface CoveredRange {
  readonly requested: { readonly from: string; readonly to: string };
  readonly from: string;
  readonly to: string;
  readonly rangeExpanded: boolean;
  readonly periods: readonly string[];
}

/** The P&L of one business for a range, from its journal. */
export interface ProfitAndLossResult {
  readonly business: BusinessView;
  readonly from: string;
  readonly to: string;
  readonly income: number;
  readonly expensesBySection: readonly {
    readonly section: string;
    readonly amount: number;
  }[];
  readonly totalExpenses: number;
  readonly netProfitBeforeTax: number;
  readonly notCounted: NotCountedExpenses & {
    readonly depreciationMayBeMissing: true;
  };
}

/** The VAT report's figures for whole VAT periods, or none when it does not apply. */
export interface VatSummaryResult {
  readonly business: BusinessView;
  readonly applies: boolean;
  readonly reason: "EXEMPT_BUSINESS" | "VAT_NOT_REQUIRED" | null;
  readonly cadence: "monthly" | "bi-monthly" | null;
  readonly range: CoveredRange | null;
  readonly vatRatePercent: number | null;
  readonly salesSubjectToVat: number | null;
  readonly exemptSales: number | null;
  readonly inputVatOnExpenses: number | null;
  readonly inputVatOnAssets: number | null;
  readonly vatToPay: number | null;
  readonly inputVatLines: number | null;
  readonly markedReported: boolean | null;
  readonly notCounted: NotCountedExpenses | null;
}

/** How often a business reports VAT or income-tax advances. */
export const reportingCadences = [
  "monthly",
  "bi-monthly",
  "not_required",
] as const;

/** One of reportingCadences. */
export type ReportingCadence = (typeof reportingCadences)[number];

/** The income-tax advance figures for whole periods. */
export interface AdvanceTaxResult {
  readonly business: BusinessView;
  readonly businessKind: "exempt" | "licensed";
  // null: the business has no advance cadence set.
  readonly advanceTaxCadence: ReportingCadence | null;
  readonly range: CoveredRange;
  readonly totalIncome: number;
  readonly advanceTaxPercent: number;
  readonly advanceTaxPercentSet: boolean;
  readonly advanceTax: number;
  readonly withholdingAtSource: number;
  readonly toPay: number;
  readonly notTracked: readonly string[];
}

/** One read of the reports coming up. */
export interface UpcomingReportsQuery {
  readonly businessNumber?: string;
  readonly includeReported?: boolean;
}

/**
 * Where a report period stands: open (not ended), due, overdue (past its
 * due date and not marked as reported in KeepInTax), reported, dismissed.
 */
export const reportObligationStates = [
  "open",
  "due",
  "overdue",
  "reported",
  "dismissed",
] as const;

/** One report period of a business, with its due date and state. */
export interface ReportObligation {
  readonly type: "VAT" | "ADVANCE_TAX";
  readonly period: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly dueDate: string;
  readonly state: (typeof reportObligationStates)[number];
  readonly statusSource: "workflow" | "submission_mark" | "none";
  readonly workflowStatus: string | null;
}

/** The report periods of the owner's businesses (or one). */
export interface UpcomingReportsResult {
  readonly today: string;
  // The business a question naming none is about: the conversation's own
  // business (agent-conversation-business.ts), else the owner's only one,
  // else null (never the page's businessnumber header).
  readonly activeBusiness: BusinessView | null;
  readonly businesses: readonly {
    readonly business: BusinessView;
    readonly vatCadence: ReportingCadence;
    readonly advanceTaxCadence: ReportingCadence;
    readonly obligations: readonly ReportObligation[];
  }[];
  readonly reportedOmitted: number;
}

/**
 * A review row's classification: ready (booked to an account), waiting for
 * an accounting mapping, private, or unclassified.
 */
export const readinessStatuses = [
  "ready",
  "missing_mapping",
  "private",
  "unclassified",
] as const;

/** One row the review screen would list before a report. */
export interface ReadinessItem {
  readonly kind:
    | "matched"
    | "document_without_payment"
    | "payment_without_document";
  readonly date: string | null;
  readonly name: string | null;
  // ₪; null when unknown or foreign with no ₪ conversion recorded.
  readonly amountIls: number | null;
  readonly currency: string;
  readonly originalAmount: number | null;
  readonly status: (typeof readinessStatuses)[number];
}

/** What still needs review in one business before a report. */
export interface ReportReadinessResult {
  readonly business: BusinessView;
  readonly from: string;
  readonly to: string;
  readonly mode: "with_banking" | "documents_only";
  readonly counts: {
    readonly matched: number;
    readonly documentWithoutPayment: number;
    readonly paymentWithoutDocument: number;
  };
  readonly byStatus: {
    readonly ready: number;
    readonly missingMapping: number;
    readonly private: number;
    readonly unclassified: number;
  };
  readonly items: readonly ReadinessItem[];
  readonly itemsOmitted: number;
  readonly conversionUnavailable: { readonly count: number };
  readonly notCounted: NotCountedExpenses;
  readonly nothingToReview: boolean;
}

/**
 * The data owner's numbered businesses, read on the server for the verified
 * user (2026-11-15, business selection): the directory a business the user
 * names is resolved against, before any read.
 */
export interface BusinessDirectory {
  readonly businesses: readonly BusinessView[];
}

/** One read of the books: an Effect failing with a coded Error. */
type BooksRead<Q, R> = (query: Q) => Effect.Effect<R, Error>;

/**
 * The user's books and reports, read-only: expenses, transactions, issued
 * documents, categories, clients, the P&L, VAT, advance tax, the reports
 * coming up and what still needs review before one.
 */
export interface KeepInTaxBooks {
  queryExpenses: (
    query: ExpenseQuery
  ) => Effect.Effect<ExpenseQueryAnswer, Error>;
  queryTransactions: BooksRead<TransactionQuery, TransactionQueryResult>;
  queryIssuedDocuments: BooksRead<
    IssuedDocumentQuery,
    IssuedDocumentQueryResult
  >;
  listCategories: BooksRead<CategoryQuery, CategoryListResult>;
  listClients: BooksRead<ClientQuery, ClientListResult>;
  getProfitAndLoss: BooksRead<ReportRangeQuery, ProfitAndLossResult>;
  getVatSummary: BooksRead<ReportRangeQuery, VatSummaryResult>;
  getAdvanceTaxStatus: BooksRead<ReportRangeQuery, AdvanceTaxResult>;
  listUpcomingReports: BooksRead<UpcomingReportsQuery, UpcomingReportsResult>;
  getReportReadiness: BooksRead<ReportRangeQuery, ReportReadinessResult>;
  // Not a tool: the server reads it before the model's first step.
  listBusinesses: BooksRead<void, BusinessDirectory>;
}

/** The names of the books' reads (every KeepInTaxBooks method). */
export const keepInTaxBooksReads = [
  "queryExpenses",
  "queryTransactions",
  "queryIssuedDocuments",
  "listCategories",
  "listClients",
  "getProfitAndLoss",
  "getVatSummary",
  "getAdvanceTaxStatus",
  "listUpcomingReports",
  "getReportReadiness",
] as const satisfies readonly (keyof KeepInTaxBooks)[];
