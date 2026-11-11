import { Injectable } from '@nestjs/common';
import { Business } from 'src/business/business.entity';
import { BillingService } from 'src/billing/services/billing.service';
import { CatalogContextService } from 'src/bookkeeping/catalog-context.service';
import { CatalogService } from 'src/bookkeeping/catalog.service';
import { ClientsService } from 'src/clients/clients.service';
import { DocumentsService } from 'src/documents/documents.service';
import {
  ApprovalStatus,
  BusinessType,
  DocumentStatusType,
  DocumentType,
  ExpenseApprovalStatus,
  isExemptBusinessType,
  ModuleName,
  OwnerType,
  TaxReportingType,
  VATReportingType,
} from 'src/enum';
import { Expense } from 'src/expenses/expenses.entity';
import { ExpensesService } from 'src/expenses/expenses.service';
import { TasksGeneratorService } from 'src/accountant-tasks/tasks-generator.service';
import {
  ReportWorkflowStatus,
  ReportWorkflowType,
} from 'src/report-workflow/report-workflow.entity';
import { ReportWorkflowService } from 'src/report-workflow/report-workflow.service';
import { ReportReviewService } from 'src/reports/report-review.service';
import { ReportsService } from 'src/reports/reports.service';
import { SharedService } from 'src/shared/shared.service';
import { TransactionProcessingService } from 'src/transactions/transaction-processing.service';
import { UserSyncStateService } from 'src/transactions/user-sync-state.service';
import { AgentDomainError, AgentDomainService } from './agent-domain.service';
import type {
  AdvanceTaxResult,
  AgentBooksDomain,
  BusinessView,
  CategoryListResult,
  CategoryQuery,
  ClientListResult,
  ClientQuery,
  CoveredRange,
  IssuedDocumentQuery,
  IssuedDocumentQueryResult,
  IssuedDocumentTotals,
  IssuedDocumentType,
  MoneyTotal,
  NotCountedExpenses,
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
} from './agent-domain.types';
import type { AgentHarnessUser } from './agent-harness.service';

// How much one answer carries; totals always cover everything matched.
const maxRows = 50;
const maxGroups = 40;
const maxNames = 30;
const maxClients = 100;
const maxSubCategories = 200;
const maxReadinessItems = 30;
const maxRangeYears = 10;

const isoDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

type OwnedBusiness = Business & { businessNumber: string };

// A day as UTC midnight (the database connection runs in UTC).
const utcDay = (value: string, field: string) => {
  const match = isoDatePattern.exec(value ?? '');
  const date = match
    ? new Date(
        Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
      )
    : null;
  if (!date || date.toISOString().slice(0, 10) !== value) {
    throw new AgentDomainError(
      'RANGE_INVALID',
      `${field} is not a date (YYYY-MM-DD): ${value}`,
    );
  }
  return date;
};

/** A range of whole days, inclusive, at most ten years. */
export const validDayRange = (query: { from: string; to: string }) => {
  const from = utcDay(query.from, 'from');
  const to = utcDay(query.to, 'to');
  if (from > to) {
    throw new AgentDomainError(
      'RANGE_INVALID',
      `from (${query.from}) is after to (${query.to})`,
    );
  }
  const latest = new Date(from);
  latest.setUTCFullYear(latest.getUTCFullYear() + maxRangeYears);
  if (to > latest) {
    throw new AgentDomainError(
      'RANGE_INVALID',
      `the range is longer than ${maxRangeYears} years`,
    );
  }
  return { from, to };
};

const dayText = (value: Date | string | null | undefined) =>
  value == null
    ? ''
    : value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10);

// DECIMAL columns arrive as text; whole agorot keep every sum exact.
export const agorot = (value: unknown) => {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
};
const shekels = (amountInAgorot: number) => amountInAgorot / 100;
// A report figure as the report service computed it, to the agora.
const money = (value: unknown) => shekels(agorot(value));

const normalized = (text: string | null | undefined) =>
  (text ?? '').trim().toLowerCase();

const everyWord = (haystack: string, search: string | undefined) =>
  !search ||
  normalized(search)
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));

const businessView = (business: {
  businessNumber: string | null;
  businessName: string | null;
}): BusinessView => ({
  number: business.businessNumber ?? '',
  name: business.businessName ?? business.businessNumber ?? '',
});

const others = (businesses: OwnedBusiness[], business: OwnedBusiness) =>
  businesses
    .filter((other) => other.businessNumber !== business.businessNumber)
    .map(businessView);

const addMoney = (total: MoneyTotal, amountInAgorot: number): MoneyTotal => ({
  count: total.count + 1,
  sum: shekels(agorot(total.sum) + amountInAgorot),
});

const emptyMoney = (): MoneyTotal => ({ count: 0, sum: 0 });

// Expenses waiting for review or a mapping: PENDING, MISSING_ACCOUNTING_MAPPING
// or no status (queryExpenses' "pending").
const isPendingExpense = (expense: Expense) =>
  expense.approvalStatus !== ExpenseApprovalStatus.APPROVED &&
  expense.approvalStatus !== ExpenseApprovalStatus.REJECTED &&
  expense.approvalStatus !== ExpenseApprovalStatus.NOT_AN_EXPENSE;

const cadenceOf = (
  type: VATReportingType | TaxReportingType | null | undefined,
) =>
  type === VATReportingType.MONTHLY_REPORT ||
  type === TaxReportingType.MONTHLY_REPORT
    ? ('monthly' as const)
    : type === VATReportingType.DUAL_MONTH_REPORT ||
      type === TaxReportingType.DUAL_MONTH_REPORT
    ? ('bi-monthly' as const)
    : ('not_required' as const);

const documentTypeLabels: Record<string, true> = Object.fromEntries(
  Object.values(DocumentType).map((type) => [type, true]),
);

/**
 * KeepInTax's other books and reports reads for the agent's tools (Phase 3
 * of docs/plans/ai-agent-tools-plan.md): transactions, issued documents,
 * categories, clients, P&L, VAT, advance tax, upcoming reports and report
 * readiness. Each read is the data owner's, in one of the owner's businesses
 * (AgentDomainService.resolveBusiness re-checks the delegation or admin role
 * on every call), through the same services the app's screens use, and
 * changes nothing: the paths that write (the P&L's depreciation preparation,
 * the review preview's inbox/pairing/matching, report-workflow generation,
 * the inbox status's Drive folders) are not called.
 */
@Injectable()
export class AgentBooksService {
  constructor(
    private readonly agentDomain: AgentDomainService,
    private readonly expensesService: ExpensesService,
    private readonly transactionProcessing: TransactionProcessingService,
    private readonly userSyncState: UserSyncStateService,
    private readonly documentsService: DocumentsService,
    private readonly clientsService: ClientsService,
    private readonly catalogService: CatalogService,
    private readonly catalogContext: CatalogContextService,
    private readonly reportsService: ReportsService,
    private readonly reportReview: ReportReviewService,
    private readonly reportWorkflow: ReportWorkflowService,
    private readonly tasksGenerator: TasksGeneratorService,
    private readonly billingService: BillingService,
    private readonly sharedService: SharedService,
  ) {}

  /**
   * The reads bound to the verified user. Each checks the access when it
   * starts (resolveBusiness / ownerBusinesses) and once more before it
   * returns: a delegation revoked (or an admin role removed) while it read
   * fails the whole call with ACCESS_REVOKED, and nothing it read is
   * returned.
   */
  forUser(user: AgentHarnessUser): AgentBooksDomain {
    const checkedAgain =
      <Q, R>(read: (user: AgentHarnessUser, query: Q) => Promise<R>) =>
      async (query: Q): Promise<R> => {
        const result = await read.call(this, user, query);
        await this.agentDomain.assertAccessStillHolds(user);
        return result;
      };

    return {
      queryTransactions: checkedAgain(this.queryTransactions),
      queryIssuedDocuments: checkedAgain(this.queryIssuedDocuments),
      listCategories: checkedAgain(this.listCategories),
      listClients: checkedAgain(this.listClients),
      getProfitAndLoss: checkedAgain(this.getProfitAndLoss),
      getVatSummary: checkedAgain(this.getVatSummary),
      getAdvanceTaxStatus: checkedAgain(this.getAdvanceTaxStatus),
      listUpcomingReports: checkedAgain(this.listUpcomingReports),
      getReportReadiness: checkedAgain(this.getReportReadiness),
    };
  }

  // ─── Transactions: the transactions page's cache read ────────────────────

  /**
   * Bank and card transactions of one business for a range, as the
   * transactions page reads them (TransactionProcessingService's cache read,
   * after the same sync-state check; cash-flow-excluded rows left out, as
   * the page does). Not the legacy transactions table.
   */
  async queryTransactions(
    user: AgentHarnessUser,
    query: TransactionQuery,
  ): Promise<TransactionQueryResult> {
    const range = validDayRange(query);
    const { business, businesses } = await this.agentDomain.resolveBusiness(
      user,
      query.businessNumber,
    );
    const owner = user.firebaseId;
    const direction = query.direction ?? 'all';
    const state = query.state ?? 'all';

    const sync = await this.userSyncState.getSyncState(owner);
    const filters = {
      direction,
      search: query.search ?? null,
      account: query.account ?? null,
      state,
    };
    const base = {
      business: businessView(business),
      otherBusinesses: others(businesses, business),
      from: query.from,
      to: query.to,
      filters,
      // As recorded: a sync record outlives a disconnection, and its status
      // may be empty, running, failed or partial; none of it is read as
      // "connected" or "complete".
      bankData: {
        syncRecorded: !!sync,
        syncStatus: sync?.fullProcessStatus ?? null,
        lastSyncResult: sync?.fullResultStatus ?? null,
        lastSyncFinishedAt: sync?.fullFinishedAt
          ? new Date(sync.fullFinishedAt).toISOString()
          : null,
        lastSyncSkipReason: sync?.fullSkipReason ?? null,
        lastSyncSucceeded:
          sync?.fullProcessStatus === 'completed' &&
          sync?.fullResultStatus === 'success',
      },
    };

    // The page shows nothing without a sync state; so does the agent.
    const rows = sync
      ? [
          ...(direction === 'out'
            ? []
            : await this.transactionProcessing.getIncomesFromCache(
                owner,
                range.from,
                range.to,
                null,
                null,
                null,
              )),
          ...(direction === 'in'
            ? []
            : await this.transactionProcessing.getExpensesFromCache(
                owner,
                range.from,
                range.to,
                null,
                null,
                null,
              )),
        ]
      : [];

    let notLinked = 0;
    let notConverted = 0;
    const matched: TransactionRow[] = [];
    const amounts = new Map<TransactionRow, number>();

    // The business's account names in the range, for an account filter that
    // matched nothing ("Visa" for "כרטיס ויזה 4580").
    const accountsSeen = new Set<string>();

    for (const raw of rows as Record<string, any>[]) {
      if (raw.userId !== undefined && raw.userId !== owner) continue;
      if (raw.businessNumber == null || raw.businessNumber === '') {
        notLinked += 1;
        continue;
      }
      if (raw.businessNumber !== business.businessNumber) continue;
      const accountName = raw.billName ?? raw.paymentIdentifier;
      if (accountName) accountsSeen.add(String(accountName));

      const rowState: TransactionRow['state'] = raw.confirmed
        ? 'confirmed'
        : raw.category
        ? 'classified'
        : 'unclassified';
      if (state !== 'all' && rowState !== state) continue;

      const haystack = [raw.name, raw.note2, raw.category, raw.subCategory]
        .map(normalized)
        .join(' ');
      if (!everyWord(haystack, query.search)) continue;
      if (
        query.account &&
        !normalized(raw.billName).includes(normalized(query.account)) &&
        !normalized(raw.paymentIdentifier).includes(normalized(query.account))
      ) {
        continue;
      }

      const currency = raw.currency ?? 'ILS';
      const signed = Number(raw.sum) < 0 ? -1 : 1;
      const ils =
        currency === 'ILS'
          ? Math.abs(agorot(raw.sum))
          : raw.ilsAmount == null
          ? null
          : Math.abs(agorot(raw.ilsAmount));
      if (ils === null) {
        notConverted += 1;
        continue;
      }

      const row: TransactionRow = {
        id: Number(raw.id),
        date: dayText(raw.billDate),
        merchant: raw.name ?? '',
        account: raw.billName ?? raw.paymentIdentifier ?? null,
        amount: shekels(signed * ils),
        currency,
        originalAmount:
          currency === 'ILS' ? null : shekels(Math.abs(agorot(raw.sum))),
        category: raw.category ?? null,
        subCategory: raw.subCategory ?? null,
        state: rowState,
      };
      matched.push(row);
      amounts.set(row, signed * ils);
    }

    let moneyIn = emptyMoney();
    let moneyOut = emptyMoney();
    const byState = { unclassified: 0, classified: 0, confirmed: 0 };
    for (const row of matched) {
      const amount = amounts.get(row) ?? 0;
      if (amount >= 0) moneyIn = addMoney(moneyIn, amount);
      else moneyOut = addMoney(moneyOut, -amount);
      byState[row.state] += 1;
    }

    const { groups, groupsOmitted } = query.groupBy
      ? this.transactionGroups(matched, amounts, query.groupBy)
      : { groups: [], groupsOmitted: null };

    const newestFirst = [...matched].sort(
      (a, b) => b.date.localeCompare(a.date) || b.id - a.id,
    );
    const listed = query.includeRows ? newestFirst.slice(0, maxRows) : [];

    return {
      ...base,
      moneyIn,
      moneyOut,
      byState,
      groups,
      groupsOmitted,
      rows: listed,
      rowsOmitted: query.includeRows ? matched.length - listed.length : 0,
      notConverted: { count: notConverted },
      notLinkedToBusiness: { count: notLinked },
      accountsInRange:
        query.account && matched.length === 0 && notConverted === 0
          ? [...accountsSeen].sort().slice(0, maxNames)
          : [],
      // Rows on accounts linked to no business may belong to this one: left
      // out, they make the totals incomplete too.
      complete:
        base.bankData.lastSyncSucceeded &&
        notConverted === 0 &&
        notLinked === 0,
    };
  }

  private transactionGroups(
    rows: TransactionRow[],
    amounts: Map<TransactionRow, number>,
    groupBy: NonNullable<TransactionQuery['groupBy']>,
  ) {
    const keyOf = (row: TransactionRow) =>
      groupBy === 'merchant'
        ? row.merchant || '—'
        : groupBy === 'category'
        ? row.category || 'לא מסווג'
        : groupBy === 'account'
        ? row.account || '—'
        : row.date.slice(0, 7);
    const byKey = new Map<
      string,
      { count: number; inA: number; outA: number }
    >();
    for (const row of rows) {
      const key = keyOf(row);
      const group = byKey.get(key) ?? { count: 0, inA: 0, outA: 0 };
      const amount = amounts.get(row) ?? 0;
      group.count += 1;
      if (amount >= 0) group.inA += amount;
      else group.outA += -amount;
      byKey.set(key, group);
    }
    const all = [...byKey.entries()].sort(
      ([ka, a], [kb, b]) =>
        b.inA + b.outA - (a.inA + a.outA) || ka.localeCompare(kb),
    );
    const listed = all.slice(0, maxGroups);
    const omitted = all.slice(maxGroups);
    const ordered =
      groupBy === 'month'
        ? [...listed].sort(([a], [b]) => a.localeCompare(b))
        : listed;
    const groups: TransactionGroup[] = ordered.map(([key, g]) => ({
      key,
      count: g.count,
      moneyIn: shekels(g.inA),
      moneyOut: shekels(g.outA),
    }));
    return {
      groups,
      groupsOmitted:
        omitted.length === 0
          ? null
          : {
              groups: omitted.length,
              count: omitted.reduce((n, [, g]) => n + g.count, 0),
              moneyIn: shekels(omitted.reduce((n, [, g]) => n + g.inA, 0)),
              moneyOut: shekels(omitted.reduce((n, [, g]) => n + g.outA, 0)),
            },
    };
  }

  // ─── Issued documents ─────────────────────────────────────────────────────

  /**
   * Documents the business issued (invoices, receipts, credit notes…) in a
   * range of document dates, through DocumentsService.getDocuments (its own
   * ownership check), after the INVOICES module check the documents
   * controller's SubscriptionGuard makes.
   */
  async queryIssuedDocuments(
    user: AgentHarnessUser,
    query: IssuedDocumentQuery,
  ): Promise<IssuedDocumentQueryResult> {
    validDayRange(query);
    const { business, businesses } = await this.agentDomain.resolveBusiness(
      user,
      query.businessNumber,
    );
    await this.assertModule(user, ModuleName.INVOICES);

    const documents = await this.documentsService.getDocuments(
      business.businessNumber,
      user.firebaseId,
      query.from,
      query.to,
      query.docType as DocumentType | undefined,
    );

    const inBusiness = documents.filter(
      (doc) => doc.issuerBusinessNumber === business.businessNumber,
    );
    const cancelled = inBusiness.filter(
      (doc) =>
        doc.isCancelled || doc.docStatus === DocumentStatusType.CANCELLED,
    );
    const notIssued = inBusiness.filter(
      (doc) =>
        !cancelled.includes(doc) &&
        (doc.docStatus === DocumentStatusType.DRAFT ||
          doc.docStatus === DocumentStatusType.PENDING_ALLOCATION),
    );
    const issued = inBusiness.filter(
      (doc) => !cancelled.includes(doc) && !notIssued.includes(doc),
    );

    const clientMatches = (doc: (typeof issued)[number]) =>
      !query.client ||
      normalized(doc.recipientName).includes(normalized(query.client)) ||
      normalized(doc.recipientId) === normalized(query.client);
    const matching = issued.filter(clientMatches);

    // A document's totals are stored in the currency it was issued in
    // (DocumentsService keeps the selected currency and its raw totals, with
    // no conversion to ₪), so totals are kept per type AND currency and
    // never added across currencies.
    const currencyOf = (doc: (typeof issued)[number]) =>
      (doc.currency || 'ILS').toString().toUpperCase();
    const totalsByType = (docs: typeof issued): IssuedDocumentTotals[] => {
      const byType = new Map<
        string,
        {
          docType: string;
          currency: string;
          count: number;
          withVat: number;
          beforeVat: number;
          vat: number;
        }
      >();
      for (const doc of docs) {
        const currency = currencyOf(doc);
        const key = `${doc.docType}|${currency}`;
        const totals = byType.get(key) ?? {
          docType: doc.docType,
          currency,
          count: 0,
          withVat: 0,
          beforeVat: 0,
          vat: 0,
        };
        totals.count += 1;
        totals.withVat += agorot(doc.sumAftDisWithVAT);
        totals.beforeVat += agorot(doc.sumAftDisBefVAT);
        totals.vat += agorot(doc.vatSum);
        byType.set(key, totals);
      }
      return [...byType.values()]
        .sort(
          (a, b) =>
            a.docType.localeCompare(b.docType) ||
            a.currency.localeCompare(b.currency),
        )
        .map((t) => ({
          docType: (documentTypeLabels[t.docType]
            ? t.docType
            : 'GENERAL') as IssuedDocumentType,
          currency: t.currency,
          count: t.count,
          totalWithVat: shekels(t.withVat),
          totalBeforeVat: shekels(t.beforeVat),
          vat: shekels(t.vat),
        }));
    };

    let groups: IssuedDocumentQueryResult['groups'] = [];
    let groupsOmitted = 0;
    if (query.groupBy) {
      const byKey = new Map<string, typeof issued>();
      for (const doc of matching) {
        const key =
          query.groupBy === 'client'
            ? doc.recipientName || '—'
            : dayText(doc.docDate).slice(0, 7);
        byKey.set(key, [...(byKey.get(key) ?? []), doc]);
      }
      const all = [...byKey.entries()].map(([key, docs]) => ({
        key,
        count: docs.length,
        byType: totalsByType(docs),
      }));
      // Clients by how many documents (amounts in different currencies are
      // not comparable), months in order.
      const ordered =
        query.groupBy === 'month'
          ? all.sort((a, b) => a.key.localeCompare(b.key))
          : all.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
      groups = ordered
        .slice(0, maxGroups)
        .map(({ key, byType }) => ({ key, byType }));
      groupsOmitted = Math.max(0, ordered.length - maxGroups);
    }

    const newestFirst = [...matching].sort(
      (a, b) =>
        dayText(b.docDate).localeCompare(dayText(a.docDate)) || b.id - a.id,
    );
    const rows = query.includeRows
      ? newestFirst.slice(0, maxRows).map((doc) => ({
          docType: doc.docType as IssuedDocumentType,
          docNumber: String(doc.docNumber ?? ''),
          date: dayText(doc.docDate),
          client: doc.recipientName ?? '',
          clientId: doc.recipientId ?? null,
          totalWithVat: money(doc.sumAftDisWithVAT),
          currency: currencyOf(doc),
          foreignAmount:
            doc.amountForeign == null ? null : money(doc.amountForeign),
        }))
      : [];

    const names = (docs: typeof issued) =>
      [...new Set(docs.map((doc) => doc.recipientName).filter(Boolean))]
        .sort()
        .slice(0, maxNames);

    return {
      business: businessView(business),
      otherBusinesses: others(businesses, business),
      from: query.from,
      to: query.to,
      filters: { docType: query.docType ?? null, client: query.client ?? null },
      count: matching.length,
      byType: totalsByType(matching),
      groups,
      groupsOmitted,
      rows,
      rowsOmitted: query.includeRows ? matching.length - rows.length : 0,
      matchedClients: names(matching),
      clientsInRange:
        query.client && matching.length === 0 ? names(issued) : [],
      cancelled: { count: cancelled.filter(clientMatches).length },
      notIssued: { count: notIssued.filter(clientMatches).length },
    };
  }

  // ─── Categories and clients ───────────────────────────────────────────────

  /**
   * The expense categories the business classifies with: the merged
   * catalog (the business's own rows over its accountant's over the app's,
   * CatalogService.getMergedExpenseCatalog in a delegation-aware context),
   * as GET bookkeeping/expense-catalog serves it, private rows included.
   */
  async listCategories(
    user: AgentHarnessUser,
    query: CategoryQuery,
  ): Promise<CategoryListResult> {
    const { business } = await this.agentDomain.resolveBusiness(
      user,
      query.businessNumber,
    );
    const context = await this.catalogContext.forUser(
      user.firebaseId,
      business.businessNumber,
    );
    const rows = await this.catalogService.getMergedExpenseCatalog(context);

    const matching = rows
      .filter((row) =>
        everyWord(
          normalized(`${row.category?.name ?? ''} ${row.name}`),
          query.search,
        ),
      )
      .sort(
        (a, b) =>
          (a.category?.name ?? '').localeCompare(b.category?.name ?? '') ||
          a.name.localeCompare(b.name),
      );
    const listed = matching.slice(0, maxSubCategories);

    const byCategory = new Map<
      string,
      CategoryListResult['categories'][number]['subCategories']
    >();
    for (const row of listed) {
      const name = row.category?.name ?? '—';
      const status = row.isPrivate
        ? ('private' as const)
        : row.accountId != null &&
          row.approvalStatus === ApprovalStatus.APPROVED
        ? ('ready' as const)
        : ('missing_mapping' as const);
      byCategory.set(name, [
        ...(byCategory.get(name) ?? []),
        {
          name: row.name,
          owner:
            row.ownerType === OwnerType.CLIENT
              ? 'own'
              : row.ownerType === OwnerType.ACCOUNTANT
              ? 'accountant'
              : 'system',
          private: !!row.isPrivate,
          status,
          accountName: row.account?.name ?? null,
          sectionName: row.account?.section?.name ?? null,
          vatPercent:
            row.account?.vatPercent == null
              ? null
              : Number(row.account.vatPercent),
          taxPercent:
            row.account?.taxPercent == null
              ? null
              : Number(row.account.taxPercent),
        },
      ]);
    }

    return {
      business: businessView(business),
      categories: [...byCategory.entries()].map(([name, subCategories]) => ({
        name,
        subCategories,
      })),
      subCategoryCount: matching.length,
      omitted: matching.length - listed.length,
    };
  }

  /** The business's own customers (ClientsService.getClients). */
  async listClients(
    user: AgentHarnessUser,
    query: ClientQuery,
  ): Promise<ClientListResult> {
    const { business } = await this.agentDomain.resolveBusiness(
      user,
      query.businessNumber,
    );
    const clients = (
      await this.clientsService.getClients(
        user.firebaseId,
        business.businessNumber,
      )
    ).filter((client) => client.businessNumber === business.businessNumber);
    const matching = clients
      .filter(
        (client) =>
          !query.search ||
          everyWord(
            normalized(`${client.name} ${client.email ?? ''}`),
            query.search,
          ) ||
          normalized(client.id) === normalized(query.search),
      )
      .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
    const listed = matching.slice(0, maxClients);

    return {
      business: businessView(business),
      clients: listed.map((client) => ({
        name: client.name,
        taxId: client.id ?? null,
        phone: client.phone ?? null,
        email: client.email ?? null,
        address: client.address ?? null,
      })),
      total: matching.length,
      omitted: matching.length - listed.length,
    };
  }

  // ─── Reports ──────────────────────────────────────────────────────────────

  /**
   * The P&L for a range, from the journal (createPnLReportFromJournal, the
   * read-only builder; the screen's prepare step that books depreciation is
   * not run).
   */
  async getProfitAndLoss(
    user: AgentHarnessUser,
    query: ReportRangeQuery,
  ): Promise<ProfitAndLossResult> {
    const range = validDayRange(query);
    const { business } = await this.agentDomain.resolveBusiness(
      user,
      query.businessNumber,
    );
    const report = await this.reportsService.createPnLReportFromJournal(
      user.firebaseId,
      business.businessNumber,
      range.from,
      range.to,
    );
    const sections = report.expenses.map((expense) => ({
      section: expense.sectionName,
      amount: money(expense.total),
    }));

    return {
      business: businessView(business),
      from: query.from,
      to: query.to,
      income: money(report.income),
      expensesBySection: sections.sort(
        (a, b) => b.amount - a.amount || a.section.localeCompare(b.section),
      ),
      totalExpenses: shekels(
        sections.reduce((sum, section) => sum + agorot(section.amount), 0),
      ),
      netProfitBeforeTax: money(report.netProfitBeforeTax),
      notCounted: {
        ...(await this.pendingExpenses(user, business, range)),
        depreciationMayBeMissing: true,
      },
    };
  }

  /**
   * The VAT report's figures for whole VAT periods
   * (createVatReportFromJournal): the range widens to the periods it
   * touches, as the report counts by period (a bi-monthly business by two
   * months). A business that files no VAT report gets no figures.
   */
  async getVatSummary(
    user: AgentHarnessUser,
    query: ReportRangeQuery,
  ): Promise<VatSummaryResult> {
    const requested = validDayRange(query);
    const { business } = await this.agentDomain.resolveBusiness(
      user,
      query.businessNumber,
    );
    const notApplicable = (
      reason: VatSummaryResult['reason'],
    ): VatSummaryResult => ({
      business: businessView(business),
      applies: false,
      reason,
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

    if (isExemptBusinessType(business.businessType))
      return notApplicable('EXEMPT_BUSINESS');
    const cadence = cadenceOf(business.vatReportingType);
    if (cadence === 'not_required') return notApplicable('VAT_NOT_REQUIRED');

    const covered = this.coveredRange(business, query, requested);
    const report = await this.reportsService.createVatReportFromJournal(
      user.firebaseId,
      business.businessNumber,
      covered.fromDate,
      covered.toDate,
    );
    const markedReported =
      covered.range.periods.length === 1
        ? (
            await this.reportsService.getReportSubmissionStatus(
              user.firebaseId,
              business.businessNumber,
              covered.fromDate,
            )
          ).isSubmitted
        : null;

    return {
      business: businessView(business),
      applies: true,
      reason: null,
      cadence,
      range: covered.range,
      vatRatePercent: Math.round(Number(report.vatRate) * 10000) / 100,
      salesSubjectToVat: money(report.vatableTurnover),
      exemptSales: money(report.nonVatableTurnover),
      inputVatOnExpenses: money(report.vatRefundOnExpenses),
      inputVatOnAssets: money(report.vatRefundOnAssets),
      vatToPay: money(report.vatPayment),
      inputVatLines: report.expenses.length,
      markedReported,
      notCounted: await this.pendingExpenses(user, business, {
        from: covered.fromDate,
        to: covered.toDate,
      }),
    };
  }

  /**
   * The advance income-tax figures (getAdvanceIncomeTaxReportData) for the
   * same whole periods the report counts its income by.
   */
  async getAdvanceTaxStatus(
    user: AgentHarnessUser,
    query: ReportRangeQuery,
  ): Promise<AdvanceTaxResult> {
    const requested = validDayRange(query);
    const { business } = await this.agentDomain.resolveBusiness(
      user,
      query.businessNumber,
    );
    const covered = this.coveredRange(business, query, requested);
    const report = await this.reportsService.getAdvanceIncomeTaxReportData(
      user.firebaseId,
      business.businessNumber,
      covered.fromDate,
      covered.toDate,
    );

    return {
      business: businessView(business),
      businessKind: isExemptBusinessType(business.businessType)
        ? 'exempt'
        : 'licensed',
      advanceTaxCadence: business.taxReportingType
        ? cadenceOf(business.taxReportingType)
        : null,
      range: covered.range,
      totalIncome: money(report.totalIncome),
      advanceTaxPercent: Number(report.advanceTaxPercent) || 0,
      advanceTaxPercentSet:
        business.advanceTaxPercent != null &&
        Number(business.advanceTaxPercent) > 0,
      advanceTax: money(report.totalAdvanceTax),
      withholdingAtSource: money(report.taxWithholdingAtSource),
      toPay: money(report.totalToPay),
      notTracked: ['national_insurance_advances'],
    };
  }

  /**
   * The VAT and advance-tax reports of the owner's businesses (or one):
   * the periods the report generator tracks, computed without inserting,
   * each with its state from the stored report workflow, else from the
   * self-service "marked as reported" lock (VAT), else nothing recorded.
   */
  async listUpcomingReports(
    user: AgentHarnessUser,
    query: UpcomingReportsQuery,
  ): Promise<UpcomingReportsResult> {
    const all = await this.agentDomain.ownerBusinesses(user);
    // The other reads' default: the request's active business when it is
    // one of the owner's (the controller verified it), else the owner's only
    // one, else none. The list below still covers every business.
    const activeNumber =
      user.businessNumber ?? (all.length === 1 ? all[0].businessNumber : null);
    const active =
      all.find((business) => business.businessNumber === activeNumber) ?? null;
    let targets = all;
    if (query.businessNumber !== undefined) {
      const { business } = await this.agentDomain.resolveBusiness(
        user,
        query.businessNumber,
      );
      targets = [business];
    }
    if (targets.length === 0) {
      throw new AgentDomainError(
        'BUSINESS_NOT_FOUND',
        'the user has no business with a number yet',
      );
    }

    const now = new Date();
    const today = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const todayText = dayText(today);
    let reportedOmitted = 0;
    const results: UpcomingReportsResult['businesses'] = [];

    for (const business of targets) {
      // Checked again for each business: the answer may run long.
      await this.agentDomain.assertAccessStillHolds(user);
      const stored = await this.reportWorkflow.listStoredForClient(
        user.firebaseId,
        business.businessNumber,
      );
      const obligations: ReportObligation[] = [];

      for (const period of this.tasksGenerator.expectedReportPeriods(
        business,
        today,
      )) {
        const start = dayText(period.periodStart);
        const end = dayText(period.periodEnd);
        const workflow = stored.find(
          (row) =>
            row.type === period.type &&
            dayText(row.periodStart) === start &&
            dayText(row.periodEnd) === end,
        );
        let reported = false;
        let statusSource: ReportObligation['statusSource'] = 'none';
        if (workflow) {
          statusSource = 'workflow';
          reported = workflow.status === ReportWorkflowStatus.REPORTED;
        } else if (
          period.type === ReportWorkflowType.VAT_REPORT &&
          end < todayText
        ) {
          const mark = await this.reportsService.getReportSubmissionStatus(
            user.firebaseId,
            business.businessNumber,
            period.periodStart,
          );
          if (mark.isSubmitted) {
            reported = true;
            statusSource = 'submission_mark';
          }
        }
        const due = dayText(period.dueDate);
        const state: ReportObligation['state'] = workflow?.dismissedAt
          ? 'dismissed'
          : reported
          ? 'reported'
          : end >= todayText
          ? 'open'
          : due >= todayText
          ? 'due'
          : 'overdue';
        if (
          (state === 'reported' || state === 'dismissed') &&
          query.includeReported !== true
        ) {
          reportedOmitted += 1;
          continue;
        }
        obligations.push({
          type:
            period.type === ReportWorkflowType.VAT_REPORT
              ? 'VAT'
              : 'ADVANCE_TAX',
          period: period.label,
          periodStart: start,
          periodEnd: end,
          dueDate: due,
          state,
          statusSource,
          workflowStatus: workflow?.status ?? null,
        });
      }

      results.push({
        business: businessView(business),
        vatCadence: cadenceOf(business.vatReportingType),
        advanceTaxCadence: cadenceOf(business.taxReportingType),
        obligations: obligations.sort(
          (a, b) =>
            a.dueDate.localeCompare(b.dueDate) || a.type.localeCompare(b.type),
        ),
      });
    }

    return {
      today: todayText,
      activeBusiness: active ? businessView(active) : null,
      businesses: results,
      reportedOmitted,
    };
  }

  /**
   * What still needs review before a report, as the review screen would
   * list it (ReportReviewService.getReportPreview with readOnly: no inbox
   * processing, pairing or matching run), plus expenses still pending.
   */
  async getReportReadiness(
    user: AgentHarnessUser,
    query: ReportRangeQuery,
  ): Promise<ReportReadinessResult> {
    const range = validDayRange(query);
    const { business } = await this.agentDomain.resolveBusiness(
      user,
      query.businessNumber,
    );
    const preview = await this.reportReview.getReportPreview(
      user.firebaseId,
      business.businessNumber,
      range,
      { readOnly: true },
    );

    const statusOf = (status: string): ReadinessItem['status'] =>
      status === 'READY'
        ? 'ready'
        : status === 'MISSING_MAPPING'
        ? 'missing_mapping'
        : status === 'PRIVATE'
        ? 'private'
        : 'unclassified';
    const byStatus = {
      ready: 0,
      missingMapping: 0,
      private: 0,
      unclassified: 0,
    };
    let conversionUnavailable = 0;
    const items: ReadinessItem[] = preview.rows.map((row) => {
      const status = statusOf(row.classification?.status ?? 'UNCLASSIFIED');
      byStatus[status === 'missing_mapping' ? 'missingMapping' : status] += 1;
      if (row.type === 'tx_only') {
        const tx = row.transaction;
        const foreign = !!tx.originalCurrency && tx.originalCurrency !== 'ILS';
        // The review summary's amount falls back to the foreign amount when
        // the cache row has no stamped ilsAmount; ilsConversionRecorded says
        // which. Without it (absent), a foreign amount is never taken as ₪.
        const unconverted = foreign && tx.ilsConversionRecorded !== true;
        if (unconverted) conversionUnavailable += 1;
        return {
          kind: 'payment_without_document',
          date: tx.date ?? null,
          name: tx.merchantName ?? null,
          amountIls: unconverted || tx.amount == null ? null : money(tx.amount),
          currency: (foreign && tx.originalCurrency) || 'ILS',
          originalAmount:
            foreign && tx.originalAmount != null
              ? money(tx.originalAmount)
              : null,
          status,
        };
      }
      const doc = row.document;
      const currency = doc.currency || 'ILS';
      const foreign = currency !== 'ILS';
      // A foreign document's amount is in its own currency: only its stamped
      // ilsAmount is a ₪ figure.
      const amountIls = foreign
        ? doc.ilsAmount == null
          ? null
          : money(doc.ilsAmount)
        : doc.amount == null
        ? null
        : money(doc.amount);
      if (foreign && doc.ilsAmount == null) conversionUnavailable += 1;
      return {
        kind: row.type === 'matched' ? 'matched' : 'document_without_payment',
        date: doc.date ?? null,
        name: doc.supplier ?? null,
        amountIls,
        currency,
        originalAmount:
          foreign && doc.amount != null ? money(doc.amount) : null,
        status,
      };
    });
    const listed = items.slice(0, maxReadinessItems);
    const notCounted = await this.pendingExpenses(user, business, range);

    return {
      business: businessView(business),
      from: query.from,
      to: query.to,
      mode: preview.mode,
      counts: {
        matched: preview.counts.matched,
        documentWithoutPayment: preview.counts.docOnly,
        paymentWithoutDocument: preview.counts.txOnly,
      },
      byStatus,
      items: listed,
      itemsOmitted: items.length - listed.length,
      conversionUnavailable: { count: conversionUnavailable },
      notCounted,
      nothingToReview:
        items.length === 0 && notCounted.pendingExpenses.count === 0,
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /** The module the matching controller's SubscriptionGuard requires. */
  private async assertModule(user: AgentHarnessUser, module: ModuleName) {
    const allowed = await this.billingService.hasModuleAccess(
      user.firebaseId,
      module,
      user.isDelegatedAccess,
      user.isAdminImpersonation,
    );
    if (!allowed) {
      throw new AgentDomainError(
        'MODULE_NOT_INCLUDED',
        `the subscription does not include ${module}`,
      );
    }
  }

  // Expenses of the range waiting for review or a mapping (not journaled,
  // so in no report yet), read as queryExpenses reads them.
  private async pendingExpenses(
    user: AgentHarnessUser,
    business: OwnedBusiness,
    range: { from: Date; to: Date },
  ): Promise<NotCountedExpenses> {
    const lastMoment = new Date(range.to.getTime() + 24 * 60 * 60 * 1000 - 1);
    const expenses = await this.expensesService.getExpensesByUserID(
      user.firebaseId,
      range.from,
      lastMoment,
      business.businessNumber,
    );
    let pending = emptyMoney();
    for (const expense of expenses) {
      if (
        expense.businessNumber === business.businessNumber &&
        isPendingExpense(expense)
      ) {
        pending = addMoney(pending, agorot(expense.sum));
      }
    }
    return { pendingExpenses: pending };
  }

  /**
   * The whole reporting periods a range touches, as the VAT and advance-tax
   * reports count them (SharedService.expandPeriodLabelsInRange): whole
   * months, or month pairs for a bi-monthly VAT business.
   */
  coveredRange(
    business: Pick<Business, 'businessType' | 'vatReportingType'>,
    query: { from: string; to: string },
    requested: { from: Date; to: Date },
  ): { range: CoveredRange; fromDate: Date; toDate: Date } {
    const pairs =
      !isExemptBusinessType(business.businessType) &&
      business.vatReportingType === VATReportingType.DUAL_MONTH_REPORT;
    const startMonth = requested.from.getUTCMonth();
    const firstMonth = pairs ? startMonth - (startMonth % 2) : startMonth;
    const endMonth = requested.to.getUTCMonth();
    const lastMonth = pairs ? endMonth + ((endMonth + 1) % 2) : endMonth;
    const fromDate = new Date(
      Date.UTC(requested.from.getUTCFullYear(), firstMonth, 1),
    );
    const toDate = new Date(
      Date.UTC(requested.to.getUTCFullYear(), lastMonth + 1, 0),
    );
    const periods = this.sharedService.expandPeriodLabelsInRange(
      business.businessType ?? BusinessType.LICENSED,
      business.vatReportingType ?? VATReportingType.NOT_REQUIRED,
      fromDate,
      toDate,
    );

    return {
      fromDate,
      toDate,
      range: {
        requested: { from: query.from, to: query.to },
        from: dayText(fromDate),
        to: dayText(toDate),
        rangeExpanded:
          dayText(fromDate) !== query.from || dayText(toDate) !== query.to,
        periods: periods.map(String),
      },
    };
  }
}
