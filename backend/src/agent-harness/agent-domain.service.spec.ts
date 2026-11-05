import { DelegationStatus } from 'src/delegation/delegation.entity';
import { ExpenseApprovalStatus, UserRole } from 'src/enum';
import { Expense } from 'src/expenses/expenses.entity';
import { AgentDomainError, AgentDomainService } from './agent-domain.service';
import type { ExpenseQueryAnswer } from './agent-domain.types';
import type { AgentHarnessUser } from './agent-harness.service';

// One business's answer (the query named no several businesses).
const single = async (answer: Promise<ExpenseQueryAnswer>) => {
  const result = await answer;
  if (result.scope !== 'business') {
    throw new Error('expected one business');
  }
  return result;
};

const owner: AgentHarnessUser = {
  actorFirebaseId: 'owner-1',
  firebaseId: 'owner-1',
  businessNumber: null,
  delegationScopes: [],
  isDelegatedAccess: false,
  isAdminImpersonation: false,
};

const accountantForClient: AgentHarnessUser = {
  ...owner,
  actorFirebaseId: 'accountant-1',
  firebaseId: 'client-1',
  isDelegatedAccess: true,
};

const range = { from: '2026-01-01', to: '2026-12-31' };

// An approved expense booked to an account (what the reports count), unless
// the fields say otherwise.
const expense = (fields: Partial<Expense>): Expense =>
  ({
    id: 1,
    date: new Date('2026-03-10T00:00:00.000Z'),
    businessNumber: '111111111',
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
    accountIdSnapshot: 7,
    ...fields,
  }) as unknown as Expense;

const setup = (
  expenses: Expense[],
  businesses: { businessNumber: string | null; businessName: string | null }[] = [
    { businessNumber: '111111111', businessName: 'סטודיו' },
  ],
  access: { delegations?: object[]; users?: object[] } = {},
) => {
  const expensesService = { getExpensesByUserID: jest.fn().mockResolvedValue(expenses) };
  const businessService = { getUserBusinesses: jest.fn().mockResolvedValue(businesses) };
  const delegationRepository = {
    findOne: jest.fn(async ({ where }) =>
      (access.delegations ?? [
        { userId: 'client-1', agentId: 'accountant-1', status: DelegationStatus.ACTIVE },
      ]).find((row) => Object.entries(where).every(([key, value]) => row[key] === value)) ?? null,
    ),
  };
  const userRepository = {
    findOne: jest.fn(async ({ where }) =>
      (access.users ?? []).find((row) => row['firebaseId'] === where.firebaseId) ?? null,
    ),
  };
  const service = new AgentDomainService(
    expensesService as never,
    businessService as never,
    delegationRepository as never,
    userRepository as never,
  );

  return { service, expensesService, businessService, delegationRepository };
};

describe('AgentDomainService.queryExpenses', () => {
  it('reads the data owner, never the acting accountant', async () => {
    const { service, expensesService, businessService } = setup([]);

    await service.forUser(accountantForClient).queryExpenses(range);

    expect(businessService.getUserBusinesses).toHaveBeenCalledWith('client-1');
    expect(expensesService.getExpensesByUserID.mock.calls[0][0]).toBe('client-1');
  });

  it('reads the whole range as UTC days (the connection runs in UTC), for one business only', async () => {
    const { service, expensesService } = setup([]);

    await service.queryExpenses(owner, range);

    const [, from, to, businessNumber] = expensesService.getExpensesByUserID.mock.calls[0];
    expect(from.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(to.toISOString()).toBe('2026-12-31T23:59:59.999Z');
    expect(businessNumber).toBe('111111111');
  });

  it('counts approved expenses booked to an account; pending, private and rejected ones apart', async () => {
    const { service } = setup([
      expense({ id: 1, sum: '100.50' as never }),
      expense({ id: 2, sum: '200' as never }),
      expense({ id: 3, approvalStatus: ExpenseApprovalStatus.PENDING, accountIdSnapshot: null }),
      expense({ id: 4, approvalStatus: null, accountIdSnapshot: null }),
      expense({ id: 5, approvalStatus: ExpenseApprovalStatus.MISSING_ACCOUNTING_MAPPING, accountIdSnapshot: null }),
      expense({ id: 6, approvalStatus: ExpenseApprovalStatus.REJECTED }),
      expense({ id: 7, approvalStatus: ExpenseApprovalStatus.NOT_AN_EXPENSE }),
      // D5: a private expense is approved but never booked or reported.
      expense({ id: 8, sum: '40' as never, accountIdSnapshot: null }),
    ]);

    const result = await single(service.queryExpenses(owner, range));

    expect(result.totals).toEqual({ count: 2, sum: 300.5, vatRecognized: 20, taxRecognized: 90 });
    expect(result.pending.count).toBe(3);
    expect(result.pendingByStatus).toEqual({ PENDING: 1, MISSING_ACCOUNTING_MAPPING: 1, NO_STATUS: 1 });
    expect(result.approvedOutsideBooks).toMatchObject({ count: 1, sum: 40 });
    expect(result.excluded).toEqual({ count: 2 });
    expect(result.rows).toEqual([]);
    expect(result.rowsOmitted).toBe(0);
  });

  it('never adds a row of another business to the totals', async () => {
    const { service } = setup([
      expense({ id: 1 }),
      expense({ id: 2, businessNumber: '999999999', sum: '5000' as never }),
    ]);

    const result = await single(service.queryExpenses(owner, range));

    expect(result.totals).toMatchObject({ count: 1, sum: 100 });
  });

  it('sums in agorot: totals are exact and groups add up to them', async () => {
    // 0.1 + 0.2 in floating point is 0.30000000000000004.
    const { service } = setup([
      expense({ id: 1, supplier: 'א', sum: '0.10' as never, totalVatPayable: '0.01' as never }),
      expense({ id: 2, supplier: 'ב', sum: '0.20' as never, totalVatPayable: '0.02' as never }),
      expense({ id: 3, supplier: 'ב', sum: '1234567.89' as never, totalVatPayable: '0.03' as never }),
    ]);

    const result = await single(service.queryExpenses(owner, { ...range, groupBy: 'supplier' }));

    expect(result.totals.sum).toBe(1234568.19);
    expect(result.totals.vatRecognized).toBe(0.06);
    const groupsInAgorot = result.groups.reduce((total, group) => total + Math.round(group.sum * 100), 0);
    expect(groupsInAgorot).toBe(Math.round(result.totals.sum * 100));
  });

  it("finds every one of the user's words in the category, sub-category, supplier or note", async () => {
    const { service } = setup([
      expense({ id: 1, subCategory: 'דלק' }),
      expense({ id: 2, category: 'תקשורת', subCategory: 'טלפון נייד', supplier: 'פלאפון' }),
      expense({ id: 3, category: 'משרד', subCategory: 'ציוד', supplier: 'אופיס דיפו', note: 'מחסנית דלק למדפסת' }),
      expense({ id: 4, category: 'משרד', subCategory: 'שכירות', supplier: 'בעל הבית' }),
    ]);

    const fuel = await single(service.queryExpenses(owner, { ...range, search: 'דלק' }));
    const phone = await single(service.queryExpenses(owner, { ...range, search: 'פלאפון' }));
    // Two words narrow the match; they never add every "משרד" expense.
    const officeEquipment = await single(service.queryExpenses(owner, { ...range, search: 'ציוד משרד' }));

    expect(fuel.totals.count).toBe(2);
    expect(fuel.matchedClassifications).toEqual(['משרד / ציוד', 'רכב / דלק']);
    expect(fuel.filters).toEqual({ search: 'דלק', category: null, subCategory: null, supplier: null });
    expect(phone.totals.count).toBe(1);
    expect(officeEquipment.totals.count).toBe(1);
  });

  it("lists the range's categories when nothing matched", async () => {
    const { service } = setup([
      expense({ category: 'רכב', subCategory: 'דלק' }),
      expense({ category: 'תקשורת', subCategory: 'טלפון נייד' }),
    ]);

    const result = await single(service.queryExpenses(owner, { ...range, search: 'חשמל' }));

    expect(result.totals.count).toBe(0);
    expect(result.matchedClassifications).toEqual([]);
    expect(result.categoriesInRange).toEqual(['דלק', 'טלפון נייד', 'רכב', 'תקשורת']);
  });

  it('groups totals, largest first, and months in order', async () => {
    const { service } = setup([
      expense({ id: 1, supplier: 'פז', sum: '50' as never, date: new Date('2026-02-01T00:00:00Z') }),
      expense({ id: 2, supplier: 'דלק', sum: '300' as never, date: new Date('2026-01-15T00:00:00Z') }),
      expense({ id: 3, supplier: 'פז', sum: '70' as never, date: new Date('2026-01-20T00:00:00Z') }),
    ]);

    const bySupplier = await single(service.queryExpenses(owner, { ...range, groupBy: 'supplier' }));
    const byMonth = await single(service.queryExpenses(owner, { ...range, groupBy: 'month' }));

    expect(bySupplier.groups.map((group) => [group.key, group.sum])).toEqual([['דלק', 300], ['פז', 120]]);
    expect(bySupplier.groupsOmitted).toBeNull();
    expect(byMonth.groups.map((group) => [group.key, group.count])).toEqual([['2026-01', 2], ['2026-02', 1]]);
  });

  it('sums the groups past the limit together, so nothing is left out of the total', async () => {
    const many = Array.from({ length: 45 }, (_, index) =>
      expense({ id: index + 1, supplier: `ספק ${index + 1}`, sum: String(index + 1) as never }),
    );
    const { service } = setup(many);

    const result = await single(service.queryExpenses(owner, { ...range, groupBy: 'supplier' }));

    expect(result.groups).toHaveLength(40);
    expect(result.groups[0]).toMatchObject({ key: 'ספק 45', sum: 45 });
    // The five smallest: 1 + 2 + 3 + 4 + 5.
    expect(result.groupsOmitted).toMatchObject({ groups: 5, count: 5, sum: 15 });
    const listed = result.groups.reduce((total, group) => total + group.sum, 0);
    expect(listed + (result.groupsOmitted?.sum ?? 0)).toBe(result.totals.sum);
  });

  it('returns at most 50 rows, newest first, says how many it left out, while the totals cover every match', async () => {
    const many = Array.from({ length: 60 }, (_, index) =>
      expense({ id: index + 1, date: new Date(Date.UTC(2026, 0, 1 + index)) }),
    );
    const { service } = setup(many);

    const result = await single(service.queryExpenses(owner, { ...range, includeRows: true }));

    expect(result.totals.count).toBe(60);
    expect(result.rows).toHaveLength(50);
    expect(result.rowsOmitted).toBe(10);
    expect(result.rows[0]).toMatchObject({ id: 60, date: '2026-03-01', sum: 100 });
  });

  it("uses only one of the owner's numbered businesses", async () => {
    const businesses = [
      { businessNumber: '111111111', businessName: 'סטודיו' },
      { businessNumber: '222222222', businessName: null },
      // Never queried: the expenses service would read every business.
      { businessNumber: null, businessName: 'טיוטה' },
    ];

    await expect(setup([], businesses).service.queryExpenses(owner, range)).rejects.toThrow(
      /^BUSINESS_REQUIRED: the user has 2 businesses: 111111111 \(סטודיו\), 222222222/,
    );

    await expect(
      setup([], businesses).service.queryExpenses({ ...owner, businessNumber: '999999999' }, range),
    ).rejects.toThrow(/^BUSINESS_NOT_FOUND: /);

    // Another client's business, asked for by number.
    await expect(
      setup([], businesses).service.queryExpenses(owner, { ...range, businessNumber: '333333333' }),
    ).rejects.toThrow(/^BUSINESS_NOT_FOUND: /);

    const header = setup([], businesses);
    const result = await single(header.service.queryExpenses({ ...owner, businessNumber: '222222222' }, range));
    expect(result.business).toEqual({ number: '222222222', name: '222222222' });
    expect(result.otherBusinesses).toEqual([{ number: '111111111', name: 'סטודיו' }]);

    const onlyDraft = setup([], [{ businessNumber: null, businessName: 'טיוטה' }]);
    await expect(onlyDraft.service.queryExpenses(owner, range)).rejects.toThrow(/^BUSINESS_NOT_FOUND: /);
    expect(onlyDraft.expensesService.getExpensesByUserID).not.toHaveBeenCalled();
  });

  it('refuses a range that is not one', async () => {
    const { service, expensesService } = setup([]);

    await expect(service.queryExpenses(owner, { from: '2026-12-31', to: '2026-01-01' })).rejects.toThrow(
      /^EXPENSE_RANGE_INVALID: /,
    );
    await expect(service.queryExpenses(owner, { from: '2026-02-30', to: '2026-03-01' })).rejects.toThrow(
      /^EXPENSE_RANGE_INVALID: from is not a date/,
    );
    await expect(service.queryExpenses(owner, { from: '2016-01-01', to: '2026-01-02' })).rejects.toThrow(
      /^EXPENSE_RANGE_INVALID: the range is longer than 10 years/,
    );
    expect(expensesService.getExpensesByUserID).not.toHaveBeenCalled();

    // Exactly ten years, and a single day, are ranges.
    await service.queryExpenses(owner, { from: '2016-01-01', to: '2026-01-01' });
    await service.queryExpenses(owner, { from: '2026-02-28', to: '2026-02-28' });
    expect(expensesService.getExpensesByUserID).toHaveBeenCalledTimes(2);
  });

  it('stops an answer already running once the delegation is revoked', async () => {
    const revoked = setup([expense({})], undefined, {
      delegations: [{ userId: 'client-1', agentId: 'accountant-1', status: DelegationStatus.REVOKED }],
    });

    await expect(revoked.service.forUser(accountantForClient).queryExpenses(range)).rejects.toThrow(
      /^ACCESS_REVOKED: /,
    );
    expect(revoked.expensesService.getExpensesByUserID).not.toHaveBeenCalled();

    const active = setup([expense({})]);
    await expect(active.service.forUser(accountantForClient).queryExpenses(range)).resolves.toBeDefined();
  });

  it('stops an admin who is no longer one', async () => {
    const admin = { ...accountantForClient, actorFirebaseId: 'admin-1', isDelegatedAccess: false, isAdminImpersonation: true };

    const demoted = setup([], undefined, { users: [{ firebaseId: 'admin-1', role: [UserRole.REGULAR] }] });
    await expect(demoted.service.queryExpenses(admin, range)).rejects.toThrow(/^ACCESS_REVOKED: /);

    const still = setup([], undefined, { users: [{ firebaseId: 'admin-1', role: [UserRole.ADMIN] }] });
    await expect(still.service.queryExpenses(admin, range)).resolves.toBeDefined();
  });
});

describe('AgentDomainService.requestBusiness', () => {
  const businesses = [
    { businessNumber: '111111111', businessName: 'סטודיו' },
    { businessNumber: null, businessName: 'טיוטה' },
  ];

  it("accepts only one of the owner's numbered businesses from the header", async () => {
    const { service } = setup([], businesses);

    await expect(service.requestBusiness('owner-1', '111111111')).resolves.toBe('111111111');
    await expect(service.requestBusiness('owner-1', '222222222')).rejects.toThrow(/^AGENT_BUSINESS_FORBIDDEN: /);
  });

  it("without a header, the owner's only numbered business, else none", async () => {
    await expect(setup([], businesses).service.requestBusiness('owner-1', undefined)).resolves.toBe('111111111');
    await expect(
      setup([], [...businesses, { businessNumber: '222222222', businessName: null }]).service.requestBusiness(
        'owner-1',
        '',
      ),
    ).resolves.toBeNull();
  });
});

describe('AgentDomainService.queryExpenses across businesses', () => {
  const studio = { businessNumber: '111111111', businessName: 'סטודיו' };
  const workshop = { businessNumber: '222222222', businessName: 'סדנה' };
  const draft = { businessNumber: null, businessName: 'טיוטה' };

  // Each business's expenses, or the error its read fails with.
  const setupBusinesses = (
    byBusiness: Record<string, Expense[] | Error>,
    access: { delegations?: object[] } = {},
  ) => {
    const built = setup([], [studio, workshop, draft], access);
    built.expensesService.getExpensesByUserID.mockImplementation(
      async (_owner: string, _from: Date, _to: Date, businessNumber: string) => {
        const answer = byBusiness[businessNumber] ?? [];
        if (answer instanceof Error) {
          throw answer;
        }
        return answer;
      },
    );
    return built;
  };

  const several = async (answer: Promise<ExpenseQueryAnswer>) => {
    const result = await answer;
    if (result.scope !== 'businesses') {
      throw new Error('expected several businesses');
    }
    return result;
  };

  const inStudio = (fields: Partial<Expense>) => expense({ businessNumber: '111111111', ...fields });
  const inWorkshop = (fields: Partial<Expense>) => expense({ businessNumber: '222222222', ...fields });

  it('gives each business its subtotal and an exact combined total, in agorot', async () => {
    const { service } = setupBusinesses({
      '111111111': [
        inStudio({ id: 1, sum: '0.10' as never, totalVatPayable: '0.01' as never }),
        inStudio({ id: 2, sum: '1234.56' as never, totalVatPayable: '100.05' as never }),
      ],
      '222222222': [inWorkshop({ id: 3, sum: '0.20' as never, totalVatPayable: '0.02' as never })],
    });

    const result = await several(
      service.queryExpenses(
        { ...owner, businessNumber: '111111111' },
        { ...range, businessNumbers: ['111111111', '222222222'] },
      ),
    );

    expect(result.businesses.map((one) => [one.business.number, one.totals.sum])).toEqual([
      ['111111111', 1234.66],
      ['222222222', 0.2],
    ]);
    expect(result.complete).toBe(true);
    expect(result.failed).toEqual([]);
    // 1234.66 + 0.20 in floating point is 1234.8600000000001.
    expect(result.combined?.totals).toEqual({ count: 3, sum: 1234.86, vatRecognized: 100.08, taxRecognized: 135 });
  });

  it("'all my businesses' queries every numbered business with the same period and filters", async () => {
    const { service, expensesService } = setupBusinesses({
      '111111111': [inStudio({ id: 1, sum: '300' as never })],
      '222222222': [inWorkshop({ id: 2, sum: '200' as never })],
    });

    const all = await several(service.queryExpenses(owner, { ...range, search: 'דלק', allBusinesses: true }));

    expect(all.requested).toBe('all');
    expect(all.businesses.map((one) => one.business.number)).toEqual(['111111111', '222222222']);
    expect(all.combined?.totals.sum).toBe(500);
    // The number-less business is never read; both reads cover the same days.
    const calls = expensesService.getExpensesByUserID.mock.calls;
    expect(calls.map((call) => call[3])).toEqual(['111111111', '222222222']);
    expect(new Set(calls.map((call) => `${call[1].toISOString()}..${call[2].toISOString()}`)).size).toBe(1);
    expect(all.businesses.every((one) => one.filters.search === 'דלק')).toBe(true);
    expect(all.filters.search).toBe('דלק');
  });

  it('reports no matching expenses in one or both businesses as zero, not as missing', async () => {
    const { service } = setupBusinesses({
      '111111111': [inStudio({ id: 1, category: 'רכב', subCategory: 'דלק', sum: '120' as never })],
      '222222222': [inWorkshop({ id: 2, category: 'משרד', subCategory: 'ציוד', supplier: 'אופיס' })],
    });

    const one = await several(service.queryExpenses(owner, { ...range, search: 'דלק', allBusinesses: true }));
    expect(one.businesses.map((result) => result.totals.count)).toEqual([1, 0]);
    expect(one.combined?.totals).toMatchObject({ count: 1, sum: 120 });
    expect(one.businesses[1].categoriesInRange).toEqual(['משרד', 'ציוד']);

    const none = await several(service.queryExpenses(owner, { ...range, search: 'חשמל', allBusinesses: true }));
    expect(none.complete).toBe(true);
    expect(none.combined?.totals).toEqual({ count: 0, sum: 0, vatRecognized: 0, taxRecognized: 0 });
  });

  it('keeps pending, private and rejected records apart in each business and in the combined total', async () => {
    const { service } = setupBusinesses({
      '111111111': [
        inStudio({ id: 1, sum: '100' as never }),
        inStudio({ id: 2, sum: '50' as never, approvalStatus: ExpenseApprovalStatus.PENDING, accountIdSnapshot: null }),
        inStudio({ id: 3, sum: '30' as never, accountIdSnapshot: null }),
      ],
      '222222222': [
        inWorkshop({ id: 4, sum: '200' as never }),
        inWorkshop({
          id: 5,
          sum: '7' as never,
          approvalStatus: ExpenseApprovalStatus.MISSING_ACCOUNTING_MAPPING,
          accountIdSnapshot: null,
        }),
        inWorkshop({ id: 6, approvalStatus: ExpenseApprovalStatus.REJECTED }),
        inWorkshop({ id: 7, approvalStatus: ExpenseApprovalStatus.NOT_AN_EXPENSE }),
      ],
    });

    const result = await several(service.queryExpenses(owner, { ...range, allBusinesses: true }));

    expect(result.combined).toEqual({
      totals: expect.objectContaining({ count: 2, sum: 300 }),
      pending: expect.objectContaining({ count: 2, sum: 57 }),
      approvedOutsideBooks: expect.objectContaining({ count: 1, sum: 30 }),
      excluded: { count: 2 },
    });
    expect(result.businesses[1].pendingByStatus).toEqual({ PENDING: 0, MISSING_ACCOUNTING_MAPPING: 1, NO_STATUS: 0 });
  });

  it('never presents a partial sum as the combined total when a business fails', async () => {
    const { service } = setupBusinesses({
      '111111111': [inStudio({ id: 1, sum: '100' as never })],
      '222222222': new Error('connect ECONNREFUSED'),
    });

    const result = await several(service.queryExpenses(owner, { ...range, allBusinesses: true }));

    expect(result.complete).toBe(false);
    expect(result.combined).toBeNull();
    expect(result.businesses.map((one) => [one.business.number, one.totals.sum])).toEqual([['111111111', 100]]);
    expect(result.failed).toEqual([
      { business: { number: '222222222', name: 'סדנה' }, code: 'BOOKS_UNAVAILABLE', message: 'connect ECONNREFUSED' },
    ]);
  });

  it('refuses a foreign business number outright, reading nothing', async () => {
    const { service, expensesService } = setupBusinesses({});

    await expect(
      service.queryExpenses(owner, { ...range, businessNumbers: ['111111111', '999999999'] }),
    ).rejects.toThrow(/^BUSINESS_NOT_FOUND: not the user's businesses: 999999999/);
    expect(expensesService.getExpensesByUserID).not.toHaveBeenCalled();
  });

  it('refuses a mixed scope', async () => {
    const { service } = setupBusinesses({});

    await expect(
      service.queryExpenses(owner, { ...range, businessNumber: '111111111', allBusinesses: true }),
    ).rejects.toThrow(/^EXPENSE_SCOPE_INVALID: /);
    await expect(
      service.queryExpenses(owner, { ...range, businessNumbers: ['111111111'], allBusinesses: true }),
    ).rejects.toThrow(/^EXPENSE_SCOPE_INVALID: /);
  });

  it('without a scope, reads the active business; switching it mid-conversation moves the default', async () => {
    const { service } = setupBusinesses({
      '111111111': [inStudio({ id: 1, sum: '100' as never })],
      '222222222': [inWorkshop({ id: 2, sum: '200' as never })],
    });

    const first = await single(service.queryExpenses({ ...owner, businessNumber: '111111111' }, range));
    const afterSwitch = await single(service.queryExpenses({ ...owner, businessNumber: '222222222' }, range));

    expect([first.business.number, first.totals.sum]).toEqual(['111111111', 100]);
    expect([afterSwitch.business.number, afterSwitch.totals.sum]).toEqual(['222222222', 200]);
    // With several businesses and none active, the tool asks which one.
    await expect(service.queryExpenses(owner, range)).rejects.toThrow(/^BUSINESS_REQUIRED: /);
  });

  it('stops the whole query, with no partial result, when the delegation is revoked midway', async () => {
    const { service, expensesService } = setupBusinesses({
      '111111111': [inStudio({ id: 1 })],
      '222222222': [inWorkshop({ id: 2 })],
    });
    // Active at the start and for the first business, revoked before the
    // second.
    jest
      .spyOn(service, 'assertAccessStillHolds')
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValue(new AgentDomainError('ACCESS_REVOKED', 'revoked'));

    await expect(
      service.queryExpenses(accountantForClient, { ...range, allBusinesses: true }),
    ).rejects.toThrow(/^ACCESS_REVOKED: /);
    // The first business was read; nothing of it is returned.
    expect(expensesService.getExpensesByUserID).toHaveBeenCalledTimes(1);
  });
});
