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
  // One of the owner's businesses; left out, the request's active one.
  businessNumber?: string;
  // Several of the owner's businesses, or all of them: the same query in
  // each, with a combined total (ExpensesAcrossBusinessesResult).
  businessNumbers?: string[];
  allBusinesses?: boolean;
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
  scope: 'business';
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

/** What several businesses' results add up to, summed in agorot. */
export interface ExpenseCombinedTotals {
  totals: ExpenseTotals;
  pending: ExpenseTotals;
  approvedOutsideBooks: ExpenseTotals;
  excluded: { count: number };
}

/**
 * The same query in several of the owner's businesses: each business's
 * result, and their combined totals only when every business answered.
 */
export interface ExpensesAcrossBusinessesResult {
  scope: 'businesses';
  // What was asked: 'all' the owner's businesses, or the numbers given.
  requested: 'all' | string[];
  from: string;
  to: string;
  filters: ExpenseQueryResult['filters'];
  // One result per business that answered, in the owner's order.
  businesses: ExpenseQueryResult[];
  // The businesses that did not answer, with why. A combined total without
  // them would be partial, so there is none.
  failed: { business: { number: string; name: string }; code: string; message: string }[];
  complete: boolean;
  // The sum of every business's subtotal; null unless complete.
  combined: ExpenseCombinedTotals | null;
}

export type ExpenseQueryAnswer = ExpenseQueryResult | ExpensesAcrossBusinessesResult;

// ─── Phase 3: the other books and reports reads (all read-only) ───────────

export interface BusinessView {
  number: string;
  name: string;
}

/**
 * The data owner's numbered businesses, read on the server for the
 * verified user: the directory the chat resolves a named business against.
 */
export interface BusinessDirectory {
  businesses: BusinessView[];
}

/** A count and an amount in ₪, summed in agorot. */
export interface MoneyTotal {
  count: number;
  sum: number;
}

/** What a missing piece of the books leaves out of a result. */
export interface NotCountedExpenses {
  // Expenses in the range still waiting for review or an accounting
  // mapping: not in the journal, so not in any report yet.
  pendingExpenses: MoneyTotal;
}

export const transactionGroupings = ['merchant', 'category', 'month', 'account'] as const;
export type TransactionGrouping = (typeof transactionGroupings)[number];
export const transactionDirections = ['in', 'out', 'all'] as const;
export const transactionStates = ['all', 'unclassified', 'classified', 'confirmed'] as const;

export interface TransactionQuery {
  from: string;
  to: string;
  businessNumber?: string;
  direction?: (typeof transactionDirections)[number];
  // Every word must appear in the merchant, the note, the category or the
  // sub-category.
  search?: string;
  // Part of the account's (bill's) name or the card/account identifier.
  account?: string;
  state?: (typeof transactionStates)[number];
  groupBy?: TransactionGrouping;
  includeRows?: boolean;
}

export interface TransactionRow {
  id: number;
  date: string;
  merchant: string;
  account: string | null;
  // ₪, positive money in, negative money out.
  amount: number;
  currency: string;
  originalAmount: number | null;
  category: string | null;
  subCategory: string | null;
  state: 'unclassified' | 'classified' | 'confirmed';
}

export interface TransactionGroup {
  key: string;
  count: number;
  moneyIn: number;
  moneyOut: number;
}

export interface TransactionQueryResult {
  business: BusinessView;
  otherBusinesses: BusinessView[];
  from: string;
  to: string;
  filters: {
    direction: string;
    search: string | null;
    account: string | null;
    state: string;
  };
  // The cached bank/card data the transactions page reads, and what its
  // last sync recorded, as recorded: whether a bank is connected now is
  // not read here (a sync record outlives a disconnection).
  bankData: {
    // A sync record exists; without one the page (and this read) shows no
    // transactions.
    syncRecorded: boolean;
    // empty | running | completed | failed (user_sync_state), or null.
    syncStatus: string | null;
    // none | success | partial_success | failed, or null.
    lastSyncResult: string | null;
    lastSyncFinishedAt: string | null;
    // no_access | cache_exists, or null.
    lastSyncSkipReason: string | null;
    // The last sync completed with success: only then can the cached rows be
    // read as everything the bank sent.
    lastSyncSucceeded: boolean;
  };
  // Absolute ₪ amounts.
  moneyIn: MoneyTotal;
  moneyOut: MoneyTotal;
  byState: { unclassified: number; classified: number; confirmed: number };
  groups: TransactionGroup[];
  groupsOmitted: ({ groups: number } & Omit<TransactionGroup, 'key'>) | null;
  rows: TransactionRow[];
  rowsOmitted: number;
  // Foreign-currency transactions with no ₪ amount yet: not in the totals.
  notConverted: { count: number };
  // Transactions in the range on accounts linked to no business.
  notLinkedToBusiness: { count: number };
  // When the account filter matched nothing: the business's account names
  // in the range, to read again with the one the user meant.
  accountsInRange: string[];
  // true only when the last sync completed with success, every matched row
  // has a ₪ amount and no row of the range sits on an account linked to no
  // business (it may be this business's); otherwise the totals may leave
  // something out.
  complete: boolean;
}

export const issuedDocumentTypes = [
  'GENERAL',
  'RECEIPT',
  'TAX_INVOICE',
  'TAX_INVOICE_RECEIPT',
  'TRANSACTION_INVOICE',
  'CREDIT_INVOICE',
  'PRICE_QUOTE',
  'WORK_ORDER',
  'JOURNAL_ENTRY',
] as const;
export type IssuedDocumentType = (typeof issuedDocumentTypes)[number];
export const issuedDocumentGroupings = ['client', 'month'] as const;

export interface IssuedDocumentQuery {
  from: string;
  to: string;
  businessNumber?: string;
  docType?: IssuedDocumentType;
  // Part of the client's name, or their exact ID/VAT number.
  client?: string;
  groupBy?: (typeof issuedDocumentGroupings)[number];
  includeRows?: boolean;
}

/**
 * Issued documents of one type in one currency, their totals in that
 * currency as issued: a document's totals are stored in the currency it was
 * issued in, with no conversion to ₪, so totals are never added across
 * currencies.
 */
export interface IssuedDocumentTotals {
  docType: IssuedDocumentType;
  currency: string;
  count: number;
  totalWithVat: number;
  totalBeforeVat: number;
  vat: number;
}

export interface IssuedDocumentRow {
  docType: IssuedDocumentType;
  docNumber: string;
  date: string;
  client: string;
  clientId: string | null;
  // In the document's own currency (currency), as issued.
  totalWithVat: number;
  currency: string;
  // The stored amountForeign as it is (often empty); never a conversion.
  foreignAmount: number | null;
}

export interface IssuedDocumentQueryResult {
  business: BusinessView;
  otherBusinesses: BusinessView[];
  from: string;
  to: string;
  filters: { docType: string | null; client: string | null };
  // How many issued documents match, of every type and currency (a count,
  // never an amount).
  count: number;
  // Issued (not cancelled, not a draft) documents, per type and currency:
  // never one total across types (a credit invoice reduces, a quote is no
  // income) or across currencies.
  byType: IssuedDocumentTotals[];
  groups: { key: string; byType: IssuedDocumentTotals[] }[];
  groupsOmitted: number;
  rows: IssuedDocumentRow[];
  rowsOmitted: number;
  matchedClients: string[];
  // When the client filter matched nothing: the clients documents were
  // issued to in the range.
  clientsInRange: string[];
  cancelled: { count: number };
  notIssued: { count: number };
}

export interface CategoryQuery {
  businessNumber?: string;
  search?: string;
}

export interface CategoryListResult {
  business: BusinessView;
  categories: {
    name: string;
    subCategories: {
      name: string;
      // Whose row it is: the app's, the accountant's, or the business's own.
      owner: 'system' | 'accountant' | 'own';
      private: boolean;
      // ready: booked to an account; missing_mapping: waits for the
      // accountant to map it; private: never in the business's books.
      status: 'ready' | 'missing_mapping' | 'private';
      accountName: string | null;
      sectionName: string | null;
      vatPercent: number | null;
      taxPercent: number | null;
    }[];
  }[];
  subCategoryCount: number;
  omitted: number;
}

export interface ClientQuery {
  businessNumber?: string;
  search?: string;
}

export interface ClientListResult {
  business: BusinessView;
  clients: {
    name: string;
    taxId: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
  }[];
  total: number;
  omitted: number;
}

export interface ReportRangeQuery {
  from: string;
  to: string;
  businessNumber?: string;
}

/** The range a report actually covers: whole reporting periods. */
export interface CoveredRange {
  requested: { from: string; to: string };
  from: string;
  to: string;
  // true when the requested range was widened to whole periods (a
  // bi-monthly VAT business is reported per two months).
  rangeExpanded: boolean;
  periods: string[];
}

export interface ProfitAndLossResult {
  business: BusinessView;
  from: string;
  to: string;
  // Income booked in the journal, before VAT.
  income: number;
  // Expenses as recognized for income tax, per accounting section.
  expensesBySection: { section: string; amount: number }[];
  totalExpenses: number;
  netProfitBeforeTax: number;
  notCounted: NotCountedExpenses & {
    // The P&L screen books a year's depreciation when it opens; this read
    // books nothing, so depreciation not yet booked is missing here.
    depreciationMayBeMissing: true;
  };
}

export interface VatSummaryResult {
  business: BusinessView;
  // false for a business that files no VAT report (exempt, or not
  // required); then there are no figures.
  applies: boolean;
  reason: 'EXEMPT_BUSINESS' | 'VAT_NOT_REQUIRED' | null;
  cadence: 'monthly' | 'bi-monthly' | null;
  range: CoveredRange | null;
  vatRatePercent: number | null;
  salesSubjectToVat: number | null;
  exemptSales: number | null;
  inputVatOnExpenses: number | null;
  inputVatOnAssets: number | null;
  // Positive: to pay; negative: a refund.
  vatToPay: number | null;
  inputVatLines: number | null;
  // Only for a range of exactly one period: whether it was marked as
  // reported in KeepInTax. null otherwise.
  markedReported: boolean | null;
  notCounted: NotCountedExpenses | null;
}

export interface AdvanceTaxResult {
  business: BusinessView;
  businessKind: 'exempt' | 'licensed';
  advanceTaxCadence: 'monthly' | 'bi-monthly' | 'not_required' | null;
  range: CoveredRange;
  // Income of the range, before VAT.
  totalIncome: number;
  advanceTaxPercent: number;
  advanceTaxPercentSet: boolean;
  advanceTax: number;
  withholdingAtSource: number;
  toPay: number;
  // What KeepInTax does not hold.
  notTracked: string[];
}

export interface UpcomingReportsQuery {
  businessNumber?: string;
  includeReported?: boolean;
}

export interface ReportObligation {
  type: 'VAT' | 'ADVANCE_TAX';
  period: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  // open: the period has not ended; due: ended, not past its due date;
  // overdue: past its due date and not marked reported; reported.
  state: 'open' | 'due' | 'overdue' | 'reported' | 'dismissed';
  // Where the state comes from: the report-workflow row, the self-service
  // "marked as reported" lock, or nothing recorded in KeepInTax.
  statusSource: 'workflow' | 'submission_mark' | 'none';
  workflowStatus: string | null;
}

export interface UpcomingReportsResult {
  today: string;
  // The request's active business (verified as the owner's), else the
  // owner's only one, else null: the default of the other reads, which a
  // question naming no business is about.
  activeBusiness: BusinessView | null;
  businesses: {
    business: BusinessView;
    vatCadence: 'monthly' | 'bi-monthly' | 'not_required';
    advanceTaxCadence: 'monthly' | 'bi-monthly' | 'not_required';
    obligations: ReportObligation[];
  }[];
  reportedOmitted: number;
}

export interface ReadinessItem {
  kind: 'matched' | 'document_without_payment' | 'payment_without_document';
  date: string | null;
  name: string | null;
  // ₪; null when the amount is unknown, or in a foreign currency with no ₪
  // conversion recorded (then originalAmount and currency say what it is).
  amountIls: number | null;
  currency: string;
  originalAmount: number | null;
  status: 'ready' | 'missing_mapping' | 'private' | 'unclassified';
}

export interface ReportReadinessResult {
  business: BusinessView;
  from: string;
  to: string;
  // with_banking: documents and bank/card payments are reconciled;
  // documents_only: no bank connection, payments are not checked.
  mode: 'with_banking' | 'documents_only';
  counts: { matched: number; documentWithoutPayment: number; paymentWithoutDocument: number };
  byStatus: { ready: number; missingMapping: number; private: number; unclassified: number };
  items: ReadinessItem[];
  itemsOmitted: number;
  // Rows in a foreign currency with no ₪ conversion recorded.
  conversionUnavailable: { count: number };
  notCounted: NotCountedExpenses;
  // Nothing left to review in the books as they stand.
  nothingToReview: boolean;
}

/** The domain one agent request may use, bound to its verified user. */
export interface AgentDomain {
  queryExpenses: (query: ExpenseQuery) => Promise<ExpenseQueryAnswer>;
  queryTransactions: (query: TransactionQuery) => Promise<TransactionQueryResult>;
  queryIssuedDocuments: (query: IssuedDocumentQuery) => Promise<IssuedDocumentQueryResult>;
  listCategories: (query: CategoryQuery) => Promise<CategoryListResult>;
  listClients: (query: ClientQuery) => Promise<ClientListResult>;
  getProfitAndLoss: (query: ReportRangeQuery) => Promise<ProfitAndLossResult>;
  getVatSummary: (query: ReportRangeQuery) => Promise<VatSummaryResult>;
  getAdvanceTaxStatus: (query: ReportRangeQuery) => Promise<AdvanceTaxResult>;
  listUpcomingReports: (query: UpcomingReportsQuery) => Promise<UpcomingReportsResult>;
  getReportReadiness: (query: ReportRangeQuery) => Promise<ReportReadinessResult>;
  listBusinesses: () => Promise<BusinessDirectory>;
}

/** queryExpenses alone (AgentDomainService); the rest is AgentBooksService. */
export type AgentExpensesDomain = Pick<AgentDomain, 'queryExpenses' | 'listBusinesses'>;
export type AgentBooksDomain = Omit<AgentDomain, 'queryExpenses' | 'listBusinesses'>;
