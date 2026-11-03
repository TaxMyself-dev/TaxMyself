import { Injectable } from '@nestjs/common';
import { BusinessService } from 'src/business/business.service';
import { ExpenseApprovalStatus } from 'src/enum';
import { Expense } from 'src/expenses/expenses.entity';
import { ExpensesService } from 'src/expenses/expenses.service';
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
// The most categories a result lists when nothing matched.
const maxCategoriesListed = 60;
const maxRangeYears = 10;

const isoDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * A failure the agent's model reads: its message starts with a CODE: that
 * backend/agent's agent-tool-error-next-step.ts gives a next step.
 */
export class AgentDomainError extends Error {
  constructor(code: string, detail: string) {
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

const money = (value: unknown) => {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
};

const rounded = (amount: number) => Math.round(amount * 100) / 100;

const totalsOf = (expenses: Expense[]): ExpenseTotals => ({
  count: expenses.length,
  sum: rounded(expenses.reduce((total, expense) => total + money(expense.sum), 0)),
  vatRecognized: rounded(
    expenses.reduce((total, expense) => total + money(expense.totalVatPayable), 0),
  ),
  taxRecognized: rounded(
    expenses.reduce((total, expense) => total + money(expense.totalTaxPayable), 0),
  ),
});

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

// The user's words, any of them, in the category, sub-category, supplier or
// note ("דלק" finds the "רכב — דלק" sub-category).
const matchesSearch = (expense: Expense, search: string) => {
  const haystack = [expense.category, expense.subCategory, expense.supplier, expense.note]
    .map(normalized)
    .join(' ');

  return normalized(search)
    .split(/\s+/)
    .filter(Boolean)
    .some((word) => haystack.includes(word));
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
  sum: rounded(money(expense.sum)),
  originalCurrency: expense.originalCurrency ?? null,
  originalSum: expense.originalSum === null || expense.originalSum === undefined
    ? null
    : rounded(money(expense.originalSum)),
  note: expense.note ?? null,
});

const businessView = (business: { businessNumber: string; businessName: string | null }) => ({
  number: business.businessNumber,
  name: business.businessName ?? business.businessNumber,
});

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
  ) {}

  forUser(user: AgentHarnessUser): AgentDomain {
    return {
      queryExpenses: (query) => this.queryExpenses(user, query),
    };
  }

  async queryExpenses(user: AgentHarnessUser, query: ExpenseQuery): Promise<ExpenseQueryResult> {
    const from = utcDay(query.from, 'from');
    const to = utcDay(query.to, 'to');

    if (from > to) {
      throw new AgentDomainError('EXPENSE_RANGE_INVALID', `from (${query.from}) is after to (${query.to})`);
    }
    if (to.getUTCFullYear() - from.getUTCFullYear() > maxRangeYears) {
      throw new AgentDomainError('EXPENSE_RANGE_INVALID', `the range is longer than ${maxRangeYears} years`);
    }

    const businesses = await this.businessService.getUserBusinesses(user.firebaseId);
    const business = this.chooseBusiness(user, businesses, query.businessNumber);
    const lastMoment = new Date(to.getTime() + 24 * 60 * 60 * 1000 - 1);

    const expenses = await this.expensesService.getExpensesByUserID(
      user.firebaseId,
      from,
      lastMoment,
      business.businessNumber,
    );

    const matching = expenses.filter((expense) => matchesQuery(expense, query));
    // What the reports count; rejected rows and documents filed as not an
    // expense are neither counted nor pending.
    const approved = matching.filter(
      (expense) => expense.approvalStatus === ExpenseApprovalStatus.APPROVED,
    );
    const pending = matching.filter(
      (expense) =>
        expense.approvalStatus === null ||
        expense.approvalStatus === ExpenseApprovalStatus.PENDING ||
        expense.approvalStatus === ExpenseApprovalStatus.MISSING_ACCOUNTING_MAPPING,
    );

    const groups = query.groupBy
      ? this.groupTotals(approved, query.groupBy)
      : [];

    const rows = query.includeRows
      ? [...approved]
          .sort((a, b) => dayText(b.date).localeCompare(dayText(a.date)) || b.id - a.id)
          .slice(0, maxExpenseRows)
          .map(expenseRow)
      : [];

    const categoriesInRange =
      matching.length === 0
        ? [
            ...new Set(
              expenses.flatMap((expense) => [expense.category, expense.subCategory].filter(Boolean)),
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
      totals: totalsOf(approved),
      groups,
      rows,
      pending: totalsOf(pending),
      categoriesInRange,
    };
  }

  // The business asked for, the request's current one (the app's business
  // header), or the owner's only one — always one of the owner's.
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
      throw new AgentDomainError('BUSINESS_NOT_FOUND', 'the user has no business yet');
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

    return [...byKey.entries()]
      .map(([key, grouped]) => ({ key, ...totalsOf(grouped) }))
      .sort((a, b) =>
        groupBy === 'month' ? a.key.localeCompare(b.key) : b.sum - a.sum,
      );
  }
}
