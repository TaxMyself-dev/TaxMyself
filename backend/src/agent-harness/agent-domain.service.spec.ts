import { ExpenseApprovalStatus } from 'src/enum';
import { Expense } from 'src/expenses/expenses.entity';
import { AgentDomainService } from './agent-domain.service';
import type { AgentHarnessUser } from './agent-harness.service';

const owner: AgentHarnessUser = {
  actorFirebaseId: 'owner-1',
  firebaseId: 'owner-1',
  businessNumber: null,
  delegationScopes: [],
  isDelegatedAccess: false,
  isAdminImpersonation: false,
};

const expense = (fields: Partial<Expense>): Expense =>
  ({
    id: 1,
    date: new Date('2026-03-10T00:00:00.000Z'),
    supplier: 'פז',
    category: 'רכב',
    subCategory: 'דלק',
    sum: '100.00',
    totalVatPayable: '10.00',
    totalTaxPayable: '45.00',
    note: null,
    originalCurrency: null,
    originalSum: null,
    approvalStatus: ExpenseApprovalStatus.APPROVED,
    ...fields,
  }) as unknown as Expense;

const setup = (
  expenses: Expense[],
  businesses = [{ businessNumber: '111111111', businessName: 'סטודיו' }],
) => {
  const expensesService = { getExpensesByUserID: jest.fn().mockResolvedValue(expenses) };
  const businessService = { getUserBusinesses: jest.fn().mockResolvedValue(businesses) };
  const service = new AgentDomainService(expensesService as never, businessService as never);

  return { service, expensesService, businessService };
};

describe('AgentDomainService.queryExpenses', () => {
  it('reads the data owner, never the acting accountant', async () => {
    const { service, expensesService, businessService } = setup([]);
    const accountant = { ...owner, actorFirebaseId: 'accountant-1', firebaseId: 'client-1', isDelegatedAccess: true };

    await service.forUser(accountant).queryExpenses({ from: '2026-01-01', to: '2026-12-31' });

    expect(businessService.getUserBusinesses).toHaveBeenCalledWith('client-1');
    expect(expensesService.getExpensesByUserID.mock.calls[0][0]).toBe('client-1');
  });

  it('reads the whole range as UTC days (the connection runs in UTC)', async () => {
    const { service, expensesService } = setup([]);

    await service.queryExpenses(owner, { from: '2026-01-01', to: '2026-12-31' });

    const [, from, to, businessNumber] = expensesService.getExpensesByUserID.mock.calls[0];
    expect(from.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(to.toISOString()).toBe('2026-12-31T23:59:59.999Z');
    expect(businessNumber).toBe('111111111');
  });

  it('counts approved expenses only, and reports what waits for review', async () => {
    const { service } = setup([
      expense({ id: 1, sum: '100.50' as never }),
      expense({ id: 2, sum: '200' as never }),
      expense({ id: 3, approvalStatus: ExpenseApprovalStatus.PENDING }),
      expense({ id: 4, approvalStatus: null }),
      expense({ id: 5, approvalStatus: ExpenseApprovalStatus.REJECTED }),
      expense({ id: 6, approvalStatus: ExpenseApprovalStatus.NOT_AN_EXPENSE }),
    ]);

    const result = await service.queryExpenses(owner, { from: '2026-01-01', to: '2026-12-31' });

    expect(result.totals).toEqual({ count: 2, sum: 300.5, vatRecognized: 20, taxRecognized: 90 });
    expect(result.pending.count).toBe(2);
    expect(result.rows).toEqual([]);
  });

  it('finds the user\'s words in the category, sub-category, supplier or note', async () => {
    const { service } = setup([
      expense({ id: 1, subCategory: 'דלק' }),
      expense({ id: 2, category: 'תקשורת', subCategory: 'טלפון נייד', supplier: 'פלאפון' }),
      expense({ id: 3, category: 'משרד', subCategory: 'ציוד', supplier: 'אופיס דיפו', note: 'מחסנית דלק למדפסת' }),
    ]);

    const fuel = await service.queryExpenses(owner, { from: '2026-01-01', to: '2026-12-31', search: 'דלק' });
    const phone = await service.queryExpenses(owner, { from: '2026-01-01', to: '2026-12-31', search: 'פלאפון' });

    expect(fuel.totals.count).toBe(2);
    expect(phone.totals.count).toBe(1);
  });

  it('lists the range\'s categories when nothing matched', async () => {
    const { service } = setup([
      expense({ category: 'רכב', subCategory: 'דלק' }),
      expense({ category: 'תקשורת', subCategory: 'טלפון נייד' }),
    ]);

    const result = await service.queryExpenses(owner, { from: '2026-01-01', to: '2026-12-31', search: 'חשמל' });

    expect(result.totals.count).toBe(0);
    expect(result.categoriesInRange).toEqual(['דלק', 'טלפון נייד', 'רכב', 'תקשורת']);
  });

  it('groups totals, largest first, and months in order', async () => {
    const { service } = setup([
      expense({ id: 1, supplier: 'פז', sum: '50' as never, date: new Date('2026-02-01T00:00:00Z') }),
      expense({ id: 2, supplier: 'דלק', sum: '300' as never, date: new Date('2026-01-15T00:00:00Z') }),
      expense({ id: 3, supplier: 'פז', sum: '70' as never, date: new Date('2026-01-20T00:00:00Z') }),
    ]);

    const bySupplier = await service.queryExpenses(owner, { from: '2026-01-01', to: '2026-12-31', groupBy: 'supplier' });
    const byMonth = await service.queryExpenses(owner, { from: '2026-01-01', to: '2026-12-31', groupBy: 'month' });

    expect(bySupplier.groups.map((group) => [group.key, group.sum])).toEqual([['דלק', 300], ['פז', 120]]);
    expect(byMonth.groups.map((group) => [group.key, group.count])).toEqual([['2026-01', 2], ['2026-02', 1]]);
  });

  it('returns at most 50 rows, newest first, while the totals cover every match', async () => {
    const many = Array.from({ length: 60 }, (_, index) =>
      expense({ id: index + 1, date: new Date(Date.UTC(2026, 0, 1 + index)) }),
    );
    const { service } = setup(many);

    const result = await service.queryExpenses(owner, { from: '2026-01-01', to: '2026-12-31', includeRows: true });

    expect(result.totals.count).toBe(60);
    expect(result.rows).toHaveLength(50);
    expect(result.rows[0]).toMatchObject({ id: 60, date: '2026-03-01', sum: 100 });
  });

  it('uses only one of the owner\'s businesses', async () => {
    const businesses = [
      { businessNumber: '111111111', businessName: 'סטודיו' },
      { businessNumber: '222222222', businessName: null },
    ];

    await expect(
      setup([], businesses).service.queryExpenses(owner, { from: '2026-01-01', to: '2026-12-31' }),
    ).rejects.toThrow(/^BUSINESS_REQUIRED: the user has 2 businesses: 111111111 \(סטודיו\), 222222222/);

    await expect(
      setup([], businesses).service.queryExpenses(
        { ...owner, businessNumber: '999999999' },
        { from: '2026-01-01', to: '2026-12-31' },
      ),
    ).rejects.toThrow(/^BUSINESS_NOT_FOUND: /);

    const header = setup([], businesses);
    const result = await header.service.queryExpenses(
      { ...owner, businessNumber: '222222222' },
      { from: '2026-01-01', to: '2026-12-31' },
    );
    expect(result.business).toEqual({ number: '222222222', name: '222222222' });
    expect(result.otherBusinesses).toEqual([{ number: '111111111', name: 'סטודיו' }]);
  });

  it('refuses a range that is not one', async () => {
    const { service, expensesService } = setup([]);

    await expect(service.queryExpenses(owner, { from: '2026-12-31', to: '2026-01-01' })).rejects.toThrow(
      /^EXPENSE_RANGE_INVALID: /,
    );
    await expect(service.queryExpenses(owner, { from: '2026-02-30', to: '2026-03-01' })).rejects.toThrow(
      /^EXPENSE_RANGE_INVALID: from is not a date/,
    );
    await expect(service.queryExpenses(owner, { from: '2001-01-01', to: '2026-01-01' })).rejects.toThrow(
      /^EXPENSE_RANGE_INVALID: /,
    );
    expect(expensesService.getExpensesByUserID).not.toHaveBeenCalled();
  });
});
