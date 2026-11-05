import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessService } from 'src/business/business.service';
import { Delegation, DelegationStatus } from 'src/delegation/delegation.entity';
import { ExpenseApprovalStatus, UserRole } from 'src/enum';
import { Expense } from 'src/expenses/expenses.entity';
import { ExpensesService } from 'src/expenses/expenses.service';
import { User } from 'src/users/user.entity';
import type { AgentHarnessUser } from './agent-harness.service';
import {
  AgentDomain,
  ExpenseGrouping,
  ExpenseQuery,
  ExpenseQueryResult,
  ExpenseRow,
  ExpenseTotals,
} from './agent-domain.types';

// The most expense rows one answer carries; totals always cover every match.
const maxExpenseRows = 50;
// The most groups one answer lists; the rest are summed as groupsOmitted.
const maxExpenseGroups = 40;
// The most categories a result lists when nothing matched.
const maxCategoriesListed = 60;
// The most classifications a result names for its matches.
const maxClassificationsListed = 30;
const maxRangeYears = 10;

const isoDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * A failure the agent's model reads: its message starts with a CODE: that
 * backend/agent's agent-tool-error-next-step.ts gives a next step.
 */
export class AgentDomainError extends Error {
  constructor(
    readonly code: string,
    detail: string,
  ) {
    super(`${code}: ${detail}`);
    this.name = 'AgentDomainError';
  }
}

// A day as UTC midnight: the database connection runs in UTC (timezone 'Z'),
// so the expense's DATE compares with the same calendar day.
const utcDay = (value: string, field: string) => {
  const match = isoDatePattern.exec(value);
  const date = match
    ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
    : null;

  if (!date || date.toISOString().slice(0, 10) !== value) {
    throw new AgentDomainError('EXPENSE_RANGE_INVALID', `${field} is not a date (YYYY-MM-DD): ${value}`);
  }

  return date;
};

const dayText = (value: Date | string) =>
  value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);

// An amount in agorot: the columns are DECIMAL(…, 2), which TypeORM reads as
// text; summing whole agorot keeps every total exact, so groups add up to
// the totals and nothing drifts with floating point.
const agorot = (value: unknown) => {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
};

const shekels = (amountInAgorot: number) => amountInAgorot / 100;

const totalsOf = (expenses: readonly Expense[]): ExpenseTotals => {
  let sum = 0;
  let vat = 0;
  let tax = 0;

  for (const expense of expenses) {
    sum += agorot(expense.sum);
    vat += agorot(expense.totalVatPayable);
    tax += agorot(expense.totalTaxPayable);
  }

  return {
    count: expenses.length,
    sum: shekels(sum),
    vatRecognized: shekels(vat),
    taxRecognized: shekels(tax),
  };
};

const groupKey = (expense: Expense, groupBy: ExpenseGrouping) => {
  switch (groupBy) {
    case 'category':
      return expense.category || '—';
    case 'subCategory':
      return expense.subCategory || '—';
    case 'supplier':
      return expense.supplier || '—';
    case 'month':
      return dayText(expense.date).slice(0, 7);
  }
};

const normalized = (text: string | null | undefined) => (text ?? '').trim().toLowerCase();

// Every one of the user's words, in the category, sub-category, supplier or
// note ("דלק" finds the "רכב — דלק" sub-category). Every word, not any: a
// second word narrows the match and never adds unrelated expenses to the
// total ("ציוד משרדי" is not every "ציוד" plus every "משרד").
const matchesSearch = (expense: Expense, search: string) => {
  const haystack = [expense.category, expense.subCategory, expense.supplier, expense.note]
    .map(normalized)
    .join(' ');

  return normalized(search)
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
};

const matchesQuery = (expense: Expense, query: ExpenseQuery) =>
  (!query.search || matchesSearch(expense, query.search)) &&
  (!query.category || normalized(expense.category) === normalized(query.category)) &&
  (!query.subCategory || normalized(expense.subCategory) === normalized(query.subCategory)) &&
  (!query.supplier || normalized(expense.supplier).includes(normalized(query.supplier)));

const expenseRow = (expense: Expense): ExpenseRow => ({
  id: expense.id,
  date: dayText(expense.date),
  supplier: expense.supplier,
  category: expense.category,
  subCategory: expense.subCategory,
  sum: shekels(agorot(expense.sum)),
  originalCurrency: expense.originalCurrency ?? null,
  originalSum:
    expense.originalSum === null || expense.originalSum === undefined
      ? null
      : shekels(agorot(expense.originalSum)),
  note: expense.note ?? null,
});

const businessView = (business: { businessNumber: string | null; businessName: string | null }) => ({
  number: business.businessNumber ?? '',
  name: business.businessName ?? business.businessNumber ?? '',
});

// The owner's businesses the agent can query: those with a number. The
// expenses service reads every business when it gets no number, so a
// number-less business is never passed to it.
const numberedBusinesses = <B extends { businessNumber: string | null }>(businesses: B[]) =>
  businesses.filter(
    (business): business is B & { businessNumber: string } =>
      typeof business.businessNumber === 'string' && business.businessNumber.trim() !== '',
  );

// How the expenses service's approval statuses count (master plan D5/D6):
// - counted: APPROVED and booked to an account, as journaled for the reports;
// - outside the books: APPROVED with no account (a private expense, D5);
// - pending: waiting for review or for an accounting mapping;
// - excluded: rejected, or filed as not an expense.
type ExpenseStanding = 'counted' | 'outsideBooks' | 'pending' | 'excluded';

const standingOf = (expense: Expense): ExpenseStanding => {
  switch (expense.approvalStatus) {
    case ExpenseApprovalStatus.APPROVED:
      return expense.accountIdSnapshot === null || expense.accountIdSnapshot === undefined
        ? 'outsideBooks'
        : 'counted';
    case ExpenseApprovalStatus.REJECTED:
    case ExpenseApprovalStatus.NOT_AN_EXPENSE:
      return 'excluded';
    default:
      return 'pending';
  }
};

const pendingStatusOf = (expense: Expense) =>
  expense.approvalStatus === ExpenseApprovalStatus.MISSING_ACCOUNTING_MAPPING
    ? 'MISSING_ACCOUNTING_MAPPING'
    : expense.approvalStatus === ExpenseApprovalStatus.PENDING
      ? 'PENDING'
      : 'NO_STATUS';

const classificationOf = (expense: Expense) =>
  [expense.category, expense.subCategory].filter(Boolean).join(' / ') || '—';

/**
 * KeepInTax's domain for the agent's tools (backend/agent keepintax-ports.ts),
 * bound per request to the user FirebaseAuthGuard verified: every read is the
 * data owner's (`firebaseId`, the client when an accountant acts for one)
 * through the same services the app's pages use, and a business is used only
 * when it is one of the owner's.
 */
@Injectable()
export class AgentDomainService {
  constructor(
    private readonly expensesService: ExpensesService,
    private readonly businessService: BusinessService,
    @InjectRepository(Delegation)
    private readonly delegationRepository: Repository<Delegation>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  forUser(user: AgentHarnessUser): AgentDomain {
    return {
      queryExpenses: (query) => this.queryExpenses(user, query),
    };
  }

  /**
   * The business an agent request acts in, from the app's businessnumber
   * header, which FirebaseAuthGuard passes on unchecked: it must be one of
   * the data owner's numbered businesses. Without one, the owner's only
   * numbered business, or null when they have none or several (the tools
   * then ask which one).
   *
   * @throws AgentDomainError AGENT_BUSINESS_FORBIDDEN for any other number.
   */
  async requestBusiness(ownerFirebaseId: string, header: string | null | undefined): Promise<string | null> {
    const businesses = numberedBusinesses(await this.businessService.getUserBusinesses(ownerFirebaseId));
    const wanted = header?.trim();

    if (wanted) {
      if (!businesses.some((business) => business.businessNumber === wanted)) {
        throw new AgentDomainError('AGENT_BUSINESS_FORBIDDEN', 'the business is not one of the data owner\'s');
      }
      return wanted;
    }

    return businesses.length === 1 ? businesses[0].businessNumber : null;
  }

  /**
   * Whether the request's access still holds now, not only when its request
   * started: an answer runs for minutes, and a tool call during it must not
   * read a client whose delegation was revoked, or as an admin who no longer
   * is one, since. The guard checked the same when the request arrived.
   *
   * @throws AgentDomainError ACCESS_REVOKED when it no longer holds.
   */
  async assertAccessStillHolds(user: AgentHarnessUser): Promise<void> {
    if (user.isAdminImpersonation) {
      const actor = await this.userRepository.findOne({ where: { firebaseId: user.actorFirebaseId } });
      if (!actor?.role?.includes(UserRole.ADMIN)) {
        throw new AgentDomainError('ACCESS_REVOKED', 'the acting user is no longer an admin');
      }
      return;
    }

    if (user.actorFirebaseId === user.firebaseId) {
      return;
    }

    const delegation = await this.delegationRepository.findOne({
      where: {
        userId: user.firebaseId,
        agentId: user.actorFirebaseId,
        status: DelegationStatus.ACTIVE,
      },
    });

    if (!delegation) {
      throw new AgentDomainError('ACCESS_REVOKED', 'the access to this client\'s data was revoked');
    }
  }

  async queryExpenses(user: AgentHarnessUser, query: ExpenseQuery): Promise<ExpenseQueryResult> {
    const from = utcDay(query.from, 'from');
    const to = utcDay(query.to, 'to');

    if (from > to) {
      throw new AgentDomainError('EXPENSE_RANGE_INVALID', `from (${query.from}) is after to (${query.to})`);
    }

    const latest = new Date(from);
    latest.setUTCFullYear(latest.getUTCFullYear() + maxRangeYears);
    if (to > latest) {
      throw new AgentDomainError('EXPENSE_RANGE_INVALID', `the range is longer than ${maxRangeYears} years`);
    }

    await this.assertAccessStillHolds(user);

    const businesses = numberedBusinesses(await this.businessService.getUserBusinesses(user.firebaseId));
    const business = this.chooseBusiness(user, businesses, query.businessNumber);
    const lastMoment = new Date(to.getTime() + 24 * 60 * 60 * 1000 - 1);

    const expenses = await this.expensesService.getExpensesByUserID(
      user.firebaseId,
      from,
      lastMoment,
      business.businessNumber,
    );

    // The service filters by the business; a row from another one would be
    // a broken invariant, never something to add to this business's totals.
    const inBusiness = expenses.filter((expense) => expense.businessNumber === business.businessNumber);
    const matching = inBusiness.filter((expense) => matchesQuery(expense, query));
    const byStanding = (standing: ExpenseStanding) =>
      matching.filter((expense) => standingOf(expense) === standing);

    const counted = byStanding('counted');
    const pending = byStanding('pending');

    const pendingByStatus = { PENDING: 0, MISSING_ACCOUNTING_MAPPING: 0, NO_STATUS: 0 };
    for (const expense of pending) {
      pendingByStatus[pendingStatusOf(expense)] += 1;
    }

    const { groups, groupsOmitted } = query.groupBy
      ? this.groupTotals(counted, query.groupBy)
      : { groups: [], groupsOmitted: null };

    const newestFirst = [...counted].sort(
      (a, b) => dayText(b.date).localeCompare(dayText(a.date)) || b.id - a.id,
    );
    const rows = query.includeRows ? newestFirst.slice(0, maxExpenseRows).map(expenseRow) : [];

    const categoriesInRange =
      matching.length === 0
        ? [
            ...new Set(
              inBusiness.flatMap((expense) => [expense.category, expense.subCategory].filter(Boolean)),
            ),
          ]
            .sort()
            .slice(0, maxCategoriesListed)
        : [];

    return {
      business: businessView(business),
      otherBusinesses: businesses
        .filter((other) => other.businessNumber !== business.businessNumber)
        .map(businessView),
      from: query.from,
      to: query.to,
      filters: {
        search: query.search ?? null,
        category: query.category ?? null,
        subCategory: query.subCategory ?? null,
        supplier: query.supplier ?? null,
      },
      totals: totalsOf(counted),
      groups,
      groupsOmitted,
      rows,
      rowsOmitted: query.includeRows ? counted.length - rows.length : 0,
      matchedClassifications: [...new Set(matching.map(classificationOf))]
        .sort()
        .slice(0, maxClassificationsListed),
      pending: totalsOf(pending),
      pendingByStatus,
      approvedOutsideBooks: totalsOf(byStanding('outsideBooks')),
      excluded: { count: byStanding('excluded').length },
      categoriesInRange,
    };
  }

  // The business asked for, the request's current one (verified by the
  // controller), or the owner's only one — always one of the owner's.
  private chooseBusiness<B extends { businessNumber: string; businessName: string | null }>(
    user: AgentHarnessUser,
    businesses: B[],
    asked: string | undefined,
  ): B {
    const wanted = asked ?? user.businessNumber ?? undefined;

    if (wanted !== undefined) {
      const found = businesses.find((business) => business.businessNumber === wanted);
      if (!found) {
        throw new AgentDomainError('BUSINESS_NOT_FOUND', `business ${wanted} is not one of the user's businesses`);
      }
      return found;
    }

    if (businesses.length === 1) {
      return businesses[0];
    }
    if (businesses.length === 0) {
      throw new AgentDomainError('BUSINESS_NOT_FOUND', 'the user has no business with a number yet');
    }

    throw new AgentDomainError(
      'BUSINESS_REQUIRED',
      `the user has ${businesses.length} businesses: ${businesses
        .map((business) => `${business.businessNumber} (${business.businessName ?? 'no name'})`)
        .join(', ')}`,
    );
  }

  private groupTotals(expenses: Expense[], groupBy: ExpenseGrouping) {
    const byKey = new Map<string, Expense[]>();

    for (const expense of expenses) {
      const key = groupKey(expense, groupBy);
      byKey.set(key, [...(byKey.get(key) ?? []), expense]);
    }

    const all = [...byKey.entries()].map(([key, grouped]) => ({ key, grouped, totals: totalsOf(grouped) }));

    // The largest groups (by amount) are listed; months are listed in order.
    const largestFirst = [...all].sort((a, b) => b.totals.sum - a.totals.sum || a.key.localeCompare(b.key));
    const listed = largestFirst.slice(0, maxExpenseGroups);
    const omitted = largestFirst.slice(maxExpenseGroups);

    const ordered = groupBy === 'month' ? [...listed].sort((a, b) => a.key.localeCompare(b.key)) : listed;

    return {
      groups: ordered.map(({ key, totals }) => ({ key, ...totals })),
      groupsOmitted:
        omitted.length === 0
          ? null
          : { groups: omitted.length, ...totalsOf(omitted.flatMap(({ grouped }) => grouped)) },
    };
  }
}
