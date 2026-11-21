import { DelegationStatus } from 'src/delegation/delegation.entity';
import {
  ApprovalStatus,
  BusinessType,
  DocumentStatusType,
  ExpenseApprovalStatus,
  ModuleName,
  OwnerType,
  TaxReportingType,
  UserRole,
  VATReportingType,
} from 'src/enum';
import {
  ReportWorkflowStatus,
  ReportWorkflowType,
} from 'src/report-workflow/report-workflow.entity';
import { AgentBooksService } from './agent-books.service';
import { AgentDomainService } from './agent-domain.service';
import type { AgentHarnessUser } from './agent-harness.service';

// AgentBooksService: the agent's other books and reports reads. Each is the
// data owner's, in one of the owner's businesses, through the services the
// app's screens use, rechecked for a revoked delegation (or admin role) when
// it starts and before it returns, and never through a path that writes.

const owner: AgentHarnessUser = {
  actorFirebaseId: 'owner-1',
  firebaseId: 'owner-1',
  businessNumber: null,
  delegationScopes: [],
  isDelegatedAccess: false,
  isAdminImpersonation: false,
};

const accountant: AgentHarnessUser = {
  ...owner,
  actorFirebaseId: 'accountant-1',
  firebaseId: 'client-1',
  isDelegatedAccess: true,
};

const admin: AgentHarnessUser = {
  ...owner,
  actorFirebaseId: 'admin-1',
  firebaseId: 'client-1',
  isAdminImpersonation: true,
};

const studio = {
  businessNumber: '111111111',
  businessName: 'סטודיו',
  businessType: BusinessType.LICENSED,
  vatReportingType: VATReportingType.DUAL_MONTH_REPORT,
  taxReportingType: TaxReportingType.MONTHLY_REPORT,
  advanceTaxPercent: 5,
  createdAt: new Date('2025-01-01T00:00:00.000Z'),
};
const workshop = {
  ...studio,
  businessNumber: '222222222',
  businessName: 'סדנה',
  businessType: BusinessType.EXEMPT,
  vatReportingType: VATReportingType.NOT_REQUIRED,
};

const cacheRow = (fields: Record<string, unknown>) => ({
  id: 1,
  userId: 'owner-1',
  businessNumber: '111111111',
  billName: 'עו"ש לאומי',
  paymentIdentifier: '1234',
  name: 'פז',
  note2: null,
  billDate: '2026-03-10',
  sum: '-100.10',
  currency: 'ILS',
  ilsAmount: null,
  category: 'רכב',
  subCategory: 'דלק',
  confirmed: false,
  ...fields,
});

const setup = (
  overrides: {
    businesses?: object[];
    delegations?: object[];
    users?: object[];
    cache?: { incomes?: object[]; expenses?: object[] };
    sync?: object | null;
    documents?: object[];
    moduleAccess?: boolean;
    expenses?: object[];
  } = {},
) => {
  const delegations = overrides.delegations ?? [
    {
      userId: 'client-1',
      agentId: 'accountant-1',
      status: DelegationStatus.ACTIVE,
    },
  ];
  const users = overrides.users ?? [
    { firebaseId: 'admin-1', role: [UserRole.ADMIN] },
  ];
  const businesses = overrides.businesses ?? [studio];

  const delegationRepository = {
    findOne: jest.fn(
      async ({ where }) =>
        delegations.find((row) =>
          Object.entries(where).every(([key, value]) => row[key] === value),
        ) ?? null,
    ),
  };
  const userRepository = {
    findOne: jest.fn(
      async ({ where }) =>
        users.find((row) => row['firebaseId'] === where.firebaseId) ?? null,
    ),
  };
  const expensesService = {
    getExpensesByUserID: jest.fn().mockResolvedValue(overrides.expenses ?? []),
  };
  const businessService = {
    getUserBusinesses: jest.fn().mockResolvedValue(businesses),
  };
  const agentDomain = new AgentDomainService(
    expensesService as never,
    businessService as never,
    delegationRepository as never,
    userRepository as never,
  );

  const deps = {
    transactionProcessing: {
      getIncomesFromCache: jest
        .fn()
        .mockResolvedValue(overrides.cache?.incomes ?? []),
      getExpensesFromCache: jest
        .fn()
        .mockResolvedValue(overrides.cache?.expenses ?? []),
    },
    userSyncState: {
      getSyncState: jest.fn().mockResolvedValue(
        overrides.sync === undefined
          ? {
              fullProcessStatus: 'completed',
              fullResultStatus: 'success',
              fullFinishedAt: new Date('2026-10-01T05:00:00Z'),
            }
          : overrides.sync,
      ),
    },
    documentsService: {
      getDocuments: jest.fn().mockResolvedValue(overrides.documents ?? []),
    },
    clientsService: { getClients: jest.fn().mockResolvedValue([]) },
    catalogService: {
      getMergedExpenseCatalog: jest.fn().mockResolvedValue([]),
    },
    catalogContext: {
      forUser: jest.fn().mockResolvedValue({ accountantIds: [] }),
    },
    reportsService: {
      createPnLReportFromJournal: jest.fn(),
      preparePnLReportFromJournal: jest.fn(),
      createVatReportFromJournal: jest.fn(),
      getAdvanceIncomeTaxReportData: jest.fn(),
      getReportSubmissionStatus: jest
        .fn()
        .mockResolvedValue({ isSubmitted: false, periodLabel: '' }),
    },
    reportReview: { getReportPreview: jest.fn() },
    reportWorkflow: {
      listStoredForClient: jest.fn().mockResolvedValue([]),
      listForClient: jest.fn(),
    },
    tasksGenerator: {
      expectedReportPeriods: jest.fn().mockReturnValue([]),
      generateForUser: jest.fn(),
    },
    billingService: {
      hasModuleAccess: jest
        .fn()
        .mockResolvedValue(overrides.moduleAccess ?? true),
    },
    sharedService: {
      expandPeriodLabelsInRange: jest.fn(
        (_type, cadence, from: Date, to: Date) => {
          const labels: string[] = [];
          for (
            let cursor = new Date(from);
            cursor <= to;
            cursor = new Date(
              Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1),
            )
          ) {
            const month = cursor.getUTCMonth() + 1;
            const year = cursor.getUTCFullYear();
            const label =
              cadence === VATReportingType.DUAL_MONTH_REPORT
                ? `${month - ((month + 1) % 2)}-${month + (month % 2)}/${year}`
                : `${month}/${year}`;
            if (!labels.includes(label)) labels.push(label);
          }
          return labels;
        },
      ),
    },
  };

  const service = new AgentBooksService(
    agentDomain,
    expensesService as never,
    deps.transactionProcessing as never,
    deps.userSyncState as never,
    deps.documentsService as never,
    deps.clientsService as never,
    deps.catalogService as never,
    deps.catalogContext as never,
    deps.reportsService as never,
    deps.reportReview as never,
    deps.reportWorkflow as never,
    deps.tasksGenerator as never,
    deps.billingService as never,
    deps.sharedService as never,
  );

  return {
    service,
    delegations,
    users,
    businessService,
    expensesService,
    ...deps,
  };
};

const range = { from: '2026-01-01', to: '2026-12-31' };

describe('AgentBooksService access', () => {
  it('reads the data owner, never the acting accountant', async () => {
    const { service, businessService, transactionProcessing } = setup({
      businesses: [studio],
    });

    await service.forUser(accountant).queryTransactions(range);

    expect(businessService.getUserBusinesses).toHaveBeenCalledWith('client-1');
    expect(transactionProcessing.getExpensesFromCache.mock.calls[0][0]).toBe(
      'client-1',
    );
  });

  it("refuses a business that is not the owner's, and asks when several and none is active", async () => {
    const { service, transactionProcessing } = setup({
      businesses: [studio, workshop],
    });

    await expect(
      service
        .forUser(owner)
        .queryTransactions({ ...range, businessNumber: '999999999' }),
    ).rejects.toThrow(/^BUSINESS_NOT_FOUND:/);
    await expect(
      service.forUser(owner).getProfitAndLoss(range),
    ).rejects.toThrow(/^BUSINESS_REQUIRED:/);
    expect(transactionProcessing.getExpensesFromCache).not.toHaveBeenCalled();
  });

  it.each([
    ['queryTransactions', range],
    ['queryIssuedDocuments', range],
    ['listCategories', {}],
    ['listClients', {}],
    ['getProfitAndLoss', range],
    ['getVatSummary', range],
    ['getAdvanceTaxStatus', range],
    ['listUpcomingReports', {}],
    ['getReportReadiness', range],
  ])('%s reads nothing for a revoked delegation', async (method, query) => {
    const deps = setup({
      delegations: [
        {
          userId: 'client-1',
          agentId: 'accountant-1',
          status: DelegationStatus.REVOKED,
        },
      ],
    });

    await expect(
      (deps.service.forUser(accountant) as any)[method](query),
    ).rejects.toThrow(/^ACCESS_REVOKED:/);
    expect(deps.businessService.getUserBusinesses).not.toHaveBeenCalled();
  });

  it('a delegation revoked while a read runs returns nothing of what it read', async () => {
    const deps = setup();
    deps.transactionProcessing.getExpensesFromCache.mockImplementation(
      async () => {
        // Revoked between the read's start and its end.
        (deps.delegations[0] as any).status = DelegationStatus.REVOKED;
        return [cacheRow({ businessNumber: '111111111' })];
      },
    );

    await expect(
      deps.service.forUser(accountant).queryTransactions(range),
    ).rejects.toThrow(/^ACCESS_REVOKED:/);
  });

  it('an admin whose role was removed reads nothing; an admin still reads the client', async () => {
    const removed = setup({ users: [{ firebaseId: 'admin-1', role: [] }] });
    await expect(
      removed.service.forUser(admin).listClients({}),
    ).rejects.toThrow(/^ACCESS_REVOKED:/);

    const current = setup();
    await expect(
      current.service.forUser(admin).listClients({}),
    ).resolves.toMatchObject({ total: 0 });
    expect(current.clientsService.getClients).toHaveBeenCalledWith(
      'client-1',
      '111111111',
    );
  });

  it("any ACTIVE delegation reads, whatever its scopes (the guard's DOCUMENTS_READ rule)", async () => {
    const { service } = setup({
      delegations: [
        {
          userId: 'client-1',
          agentId: 'accountant-1',
          status: DelegationStatus.ACTIVE,
          scopes: ['EXPENSES_APPROVE'],
        },
      ],
    });

    await expect(
      service.forUser(accountant).listClients({}),
    ).resolves.toBeDefined();
  });

  it('issued documents need the INVOICES module, as the documents controller', async () => {
    const { service, billingService, documentsService } = setup({
      moduleAccess: false,
    });

    await expect(
      service.forUser(accountant).queryIssuedDocuments(range),
    ).rejects.toThrow(/^MODULE_NOT_INCLUDED:/);
    expect(billingService.hasModuleAccess).toHaveBeenCalledWith(
      'client-1',
      ModuleName.INVOICES,
      true,
      false,
    );
    expect(documentsService.getDocuments).not.toHaveBeenCalled();
  });

  it('rejects an invalid range before reading', async () => {
    const { service, businessService } = setup();

    await expect(
      service
        .forUser(owner)
        .queryTransactions({ from: '2026-02-30', to: '2026-03-01' }),
    ).rejects.toThrow(/^RANGE_INVALID:/);
    await expect(
      service
        .forUser(owner)
        .getVatSummary({ from: '2026-05-01', to: '2026-04-01' }),
    ).rejects.toThrow(/^RANGE_INVALID:/);
    expect(businessService.getUserBusinesses).not.toHaveBeenCalled();
  });
});

describe('AgentBooksService.queryTransactions', () => {
  it("sums one business's transactions exactly in agorot, apart from unlinked and unconverted ones", async () => {
    const { service, transactionProcessing } = setup({
      cache: {
        incomes: [
          cacheRow({ id: 10, sum: '1000.10', name: 'לקוח א', category: null }),
          cacheRow({ id: 11, sum: '0.20', name: 'ריבית', category: null }),
        ],
        expenses: [
          cacheRow({ id: 1, sum: '-100.10' }),
          cacheRow({ id: 2, sum: '-0.20', confirmed: true }),
          cacheRow({ id: 3, sum: '-50', businessNumber: '999999999' }),
          cacheRow({ id: 4, sum: '-70', businessNumber: null }),
          cacheRow({ id: 5, sum: '-20', currency: 'USD', ilsAmount: null }),
          cacheRow({ id: 6, sum: '-10', currency: 'USD', ilsAmount: '36.55' }),
        ],
      },
    });

    const result = await service
      .forUser(owner)
      .queryTransactions({ ...range, includeRows: true, groupBy: 'month' });

    const [, from, to] =
      transactionProcessing.getExpensesFromCache.mock.calls[0];
    expect(from.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(to.toISOString()).toBe('2026-12-31T00:00:00.000Z');
    expect(result.moneyIn).toEqual({ count: 2, sum: 1000.3 });
    expect(result.moneyOut).toEqual({ count: 3, sum: 136.85 });
    expect(result.notConverted).toEqual({ count: 1 });
    expect(result.notLinkedToBusiness).toEqual({ count: 1 });
    expect(result.byState).toEqual({
      unclassified: 2,
      classified: 2,
      confirmed: 1,
    });
    expect(result.rows.find((row) => row.id === 6)).toMatchObject({
      amount: -36.55,
      currency: 'USD',
      originalAmount: 10,
    });
    expect(result.complete).toBe(false);
    expect(result.groups).toEqual([
      { key: '2026-03', count: 5, moneyIn: 1000.3, moneyOut: 136.85 },
    ]);
  });

  it('filters by direction, every search word, account and state', async () => {
    const { service, transactionProcessing } = setup({
      cache: {
        expenses: [
          cacheRow({ id: 1, name: 'פז אילת', sum: '-10' }),
          cacheRow({
            id: 2,
            name: 'פז',
            note2: 'שטיפה',
            sum: '-20',
            billName: 'כרטיס ויזה',
            paymentIdentifier: '9999',
          }),
          cacheRow({ id: 3, name: 'סונול', category: null, sum: '-30' }),
        ],
      },
    });

    const fuel = await service
      .forUser(owner)
      .queryTransactions({ ...range, direction: 'out', search: 'פז אילת' });
    expect(fuel.moneyOut).toEqual({ count: 1, sum: 10 });
    expect(transactionProcessing.getIncomesFromCache).not.toHaveBeenCalled();

    const card = await service
      .forUser(owner)
      .queryTransactions({ ...range, account: 'ויזה' });
    expect(card.moneyOut).toEqual({ count: 1, sum: 20 });

    const unclassified = await service
      .forUser(owner)
      .queryTransactions({ ...range, state: 'unclassified' });
    expect(unclassified.moneyOut).toEqual({ count: 1, sum: 30 });
  });

  it.each([
    [null, { syncRecorded: false, lastSyncSucceeded: false }],
    [
      { fullProcessStatus: 'failed', fullResultStatus: 'failed' },
      { syncRecorded: true, syncStatus: 'failed', lastSyncSucceeded: false },
    ],
    [
      { fullProcessStatus: 'completed', fullResultStatus: 'partial_success' },
      { lastSyncResult: 'partial_success', lastSyncSucceeded: false },
    ],
    [
      { fullProcessStatus: 'running', fullResultStatus: 'none' },
      { syncStatus: 'running', lastSyncSucceeded: false },
    ],
    [
      { fullProcessStatus: 'empty', fullResultStatus: 'none' },
      { syncStatus: 'empty', lastSyncSucceeded: false },
    ],
  ])(
    'reports the cached data as recorded, never complete after %j',
    async (sync, expected) => {
      const { service, transactionProcessing } = setup({
        sync,
        cache: { expenses: [cacheRow({})] },
      });

      const result = await service.forUser(owner).queryTransactions(range);

      expect(result.bankData).toMatchObject(expected);
      expect(result.complete).toBe(false);
      expect(result.bankData).not.toHaveProperty('connected');
      if (sync === null) {
        // As the page: no sync record, no transactions.
        expect(
          transactionProcessing.getExpensesFromCache,
        ).not.toHaveBeenCalled();
        expect(result.moneyOut.count).toBe(0);
      }
    },
  );

  it('an account filter that matches nothing lists the account names of the range, to read again', async () => {
    const { service } = setup({
      cache: {
        expenses: [
          cacheRow({
            id: 1,
            billName: 'כרטיס ויזה 4580',
            paymentIdentifier: '4580',
          }),
          cacheRow({ id: 2, billName: 'עו"ש לאומי' }),
          cacheRow({
            id: 3,
            billName: 'חשבון אחר',
            businessNumber: '999999999',
          }),
        ],
      },
    });

    const latin = await service
      .forUser(owner)
      .queryTransactions({ ...range, account: 'Visa' });
    const hebrew = await service
      .forUser(owner)
      .queryTransactions({ ...range, account: 'ויזה' });

    expect(latin.moneyOut.count).toBe(0);
    expect(latin.accountsInRange).toEqual(['כרטיס ויזה 4580', 'עו"ש לאומי']);
    expect(hebrew.moneyOut.count).toBe(1);
    expect(hebrew.accountsInRange).toEqual([]);
  });

  it('a successful sync is still incomplete when rows on accounts linked to no business were left out', async () => {
    const { service } = setup({
      cache: {
        expenses: [
          cacheRow({ id: 1 }),
          cacheRow({ id: 2, sum: '-70', businessNumber: null }),
        ],
      },
    });

    const result = await service.forUser(owner).queryTransactions(range);

    expect(result.bankData.lastSyncSucceeded).toBe(true);
    expect(result.notConverted).toEqual({ count: 0 });
    expect(result.notLinkedToBusiness).toEqual({ count: 1 });
    expect(result.moneyOut).toEqual({ count: 1, sum: 100.1 });
    expect(result.complete).toBe(false);
  });

  it('is complete only after a successful completed sync with every row in ₪', async () => {
    const { service } = setup({ cache: { expenses: [cacheRow({})] } });

    const result = await service.forUser(owner).queryTransactions(range);

    expect(result.bankData.lastSyncSucceeded).toBe(true);
    expect(result.complete).toBe(true);
  });
});

describe('AgentBooksService.queryIssuedDocuments', () => {
  const doc = (fields: Record<string, unknown>) => ({
    id: 1,
    issuerBusinessNumber: '111111111',
    docType: 'TAX_INVOICE_RECEIPT',
    docNumber: '1001',
    docDate: '2026-02-01',
    recipientName: 'חברת אלפא בע"מ',
    recipientId: '515151515',
    sumAftDisWithVAT: '1180.10',
    sumAftDisBefVAT: '1000.08',
    vatSum: '180.02',
    isCancelled: false,
    docStatus: DocumentStatusType.CLOSE,
    currency: 'ILS',
    amountForeign: null,
    ...fields,
  });

  it('totals per document type only issued documents, cancelled and drafts apart', async () => {
    const { service, documentsService } = setup({
      documents: [
        doc({ id: 1 }),
        doc({
          id: 2,
          sumAftDisWithVAT: '0.20',
          sumAftDisBefVAT: '0.17',
          vatSum: '0.03',
        }),
        doc({
          id: 3,
          docType: 'CREDIT_INVOICE',
          sumAftDisWithVAT: '118',
          sumAftDisBefVAT: '100',
          vatSum: '18',
        }),
        doc({ id: 4, isCancelled: true }),
        doc({ id: 5, docStatus: DocumentStatusType.DRAFT }),
        doc({ id: 6, docStatus: DocumentStatusType.PENDING_ALLOCATION }),
        doc({ id: 7, issuerBusinessNumber: '999999999' }),
      ],
    });

    const result = await service
      .forUser(owner)
      .queryIssuedDocuments({ ...range, includeRows: true });

    expect(documentsService.getDocuments).toHaveBeenCalledWith(
      '111111111',
      'owner-1',
      '2026-01-01',
      '2026-12-31',
      undefined,
    );
    expect(result.byType).toEqual([
      {
        docType: 'CREDIT_INVOICE',
        currency: 'ILS',
        count: 1,
        totalWithVat: 118,
        totalBeforeVat: 100,
        vat: 18,
      },
      {
        docType: 'TAX_INVOICE_RECEIPT',
        currency: 'ILS',
        count: 2,
        totalWithVat: 1180.3,
        totalBeforeVat: 1000.25,
        vat: 180.05,
      },
    ]);
    expect(result.cancelled).toEqual({ count: 1 });
    expect(result.notIssued).toEqual({ count: 2 });
    expect(result.rows).toHaveLength(3);
  });

  it('keeps documents issued in USD and EUR apart from shekels: totals per type and currency, never converted or mixed', async () => {
    const { service } = setup({
      documents: [
        doc({
          id: 1,
          sumAftDisWithVAT: '1180',
          sumAftDisBefVAT: '1000',
          vatSum: '180',
        }),
        doc({
          id: 2,
          currency: 'USD',
          sumAftDisWithVAT: '1000',
          sumAftDisBefVAT: '1000',
          vatSum: '0',
          amountForeign: null,
        }),
        doc({
          id: 3,
          currency: 'usd',
          sumAftDisWithVAT: '250.5',
          sumAftDisBefVAT: '250.5',
          vatSum: '0',
        }),
        doc({
          id: 4,
          currency: 'EUR',
          sumAftDisWithVAT: '2000',
          sumAftDisBefVAT: '2000',
          vatSum: '0',
        }),
        doc({
          id: 5,
          currency: null,
          sumAftDisWithVAT: '118',
          sumAftDisBefVAT: '100',
          vatSum: '18',
        }),
      ],
    });

    const result = await service
      .forUser(owner)
      .queryIssuedDocuments({ ...range, includeRows: true, groupBy: 'client' });

    expect(result.byType).toEqual([
      {
        docType: 'TAX_INVOICE_RECEIPT',
        currency: 'EUR',
        count: 1,
        totalWithVat: 2000,
        totalBeforeVat: 2000,
        vat: 0,
      },
      {
        docType: 'TAX_INVOICE_RECEIPT',
        currency: 'ILS',
        count: 2,
        totalWithVat: 1298,
        totalBeforeVat: 1100,
        vat: 198,
      },
      {
        docType: 'TAX_INVOICE_RECEIPT',
        currency: 'USD',
        count: 2,
        totalWithVat: 1250.5,
        totalBeforeVat: 1250.5,
        vat: 0,
      },
    ]);
    expect(result.rows.find((row) => row.totalWithVat === 2000)).toMatchObject({
      currency: 'EUR',
      foreignAmount: null,
    });
    expect(result.rows.filter((row) => row.currency === 'USD')).toHaveLength(2);
    // How many match, of every currency: a count, never an amount.
    expect(result.count).toBe(5);
    expect(result.groups[0].byType.map((one) => one.currency)).toEqual([
      'EUR',
      'ILS',
      'USD',
    ]);
  });

  it("finds a client by name or tax ID, and lists the range's clients when none matched", async () => {
    const { service } = setup({
      documents: [
        doc({ id: 1 }),
        doc({ id: 2, recipientName: 'בטא', recipientId: '1' }),
      ],
    });

    const byName = await service
      .forUser(owner)
      .queryIssuedDocuments({ ...range, client: 'אלפא' });
    expect(byName.matchedClients).toEqual(['חברת אלפא בע"מ']);
    const byId = await service
      .forUser(owner)
      .queryIssuedDocuments({ ...range, client: '515151515' });
    expect(byId.byType[0].count).toBe(1);
    const none = await service
      .forUser(owner)
      .queryIssuedDocuments({ ...range, client: 'גמא' });
    expect(none.byType).toEqual([]);
    expect(none.clientsInRange).toEqual(['בטא', 'חברת אלפא בע"מ']);
  });
});

describe('AgentBooksService.listCategories and listClients', () => {
  it('lists the merged catalog with whose each row is and whether it is mapped', async () => {
    const { service, catalogContext, catalogService } = setup();
    catalogService.getMergedExpenseCatalog.mockResolvedValue([
      {
        name: 'דלק',
        category: { name: 'רכב' },
        ownerType: OwnerType.SYSTEM,
        isPrivate: false,
        accountId: 1,
        approvalStatus: ApprovalStatus.APPROVED,
        account: {
          name: 'דלק',
          vatPercent: '66.67',
          taxPercent: '45',
          section: { name: 'רכב ותחבורה' },
        },
      },
      {
        name: 'עיצוב',
        category: { name: 'שיווק' },
        ownerType: OwnerType.CLIENT,
        isPrivate: false,
        accountId: null,
        approvalStatus: ApprovalStatus.MISSING_ACCOUNTING_MAPPING,
        account: null,
      },
      {
        name: 'מזון',
        category: { name: 'פרטי' },
        ownerType: OwnerType.ACCOUNTANT,
        isPrivate: true,
        accountId: null,
        approvalStatus: ApprovalStatus.APPROVED,
        account: null,
      },
    ]);

    const result = await service.forUser(accountant).listCategories({});

    expect(catalogContext.forUser).toHaveBeenCalledWith(
      'client-1',
      '111111111',
    );
    expect(result.categories).toEqual([
      {
        name: 'פרטי',
        subCategories: [
          expect.objectContaining({
            name: 'מזון',
            owner: 'accountant',
            status: 'private',
          }),
        ],
      },
      {
        name: 'רכב',
        subCategories: [
          expect.objectContaining({
            owner: 'system',
            status: 'ready',
            sectionName: 'רכב ותחבורה',
            vatPercent: 66.67,
            taxPercent: 45,
          }),
        ],
      },
      {
        name: 'שיווק',
        subCategories: [
          expect.objectContaining({ owner: 'own', status: 'missing_mapping' }),
        ],
      },
    ]);

    const fuel = await service
      .forUser(accountant)
      .listCategories({ search: 'רכב דלק' });
    expect(fuel.subCategoryCount).toBe(1);
  });

  it("lists the business's own clients, by search", async () => {
    const { service, clientsService } = setup();
    clientsService.getClients.mockResolvedValue([
      {
        name: 'אלפא',
        id: '515151515',
        phone: null,
        email: 'a@x.co',
        address: null,
        businessNumber: '111111111',
      },
      {
        name: 'בטא',
        id: null,
        phone: '0501234567',
        email: null,
        address: 'חיפה',
        businessNumber: '111111111',
      },
      {
        name: 'אחר',
        id: null,
        phone: null,
        email: null,
        address: null,
        businessNumber: '999999999',
      },
    ]);

    const all = await service.forUser(owner).listClients({});
    expect(all.total).toBe(2);
    const one = await service
      .forUser(owner)
      .listClients({ search: '515151515' });
    expect(one.clients).toEqual([
      {
        name: 'אלפא',
        taxId: '515151515',
        phone: null,
        email: 'a@x.co',
        address: null,
      },
    ]);
  });
});

describe('AgentBooksService reports', () => {
  it('S20 (2026-11-15): the P&L of the business named, never the page header; with neither, BUSINESS_REQUIRED', async () => {
    const { service, reportsService } = setup({
      businesses: [studio, workshop],
    });
    reportsService.createPnLReportFromJournal.mockResolvedValue({
      income: 1500,
      expenses: [{ sectionName: 'רכב ותחבורה', total: 318.6 }],
      netProfitBeforeTax: 1181.4,
    });
    // The header another screen left behind: the first business.
    const withHeader = service.forUser({ ...owner, businessNumber: '111111111' });

    const named = await withHeader.getProfitAndLoss({
      ...range,
      businessNumber: '222222222',
    });
    expect(named.business).toEqual({ number: '222222222', name: 'סדנה' });
    expect(reportsService.createPnLReportFromJournal.mock.calls[0][1]).toBe(
      '222222222',
    );

    // The header alone is not a choice: the chat asks which business.
    await expect(withHeader.getProfitAndLoss(range)).rejects.toThrow(
      /^BUSINESS_REQUIRED:/,
    );
    await expect(
      service.forUser(owner).getProfitAndLoss(range),
    ).rejects.toThrow(/^BUSINESS_REQUIRED:/);
    expect(reportsService.createPnLReportFromJournal).toHaveBeenCalledTimes(1);
  });

  it('P&L comes from the read-only journal builder, never the depreciation-booking prepare step', async () => {
    const { service, reportsService } = setup({
      expenses: [
        {
          businessNumber: '111111111',
          sum: '99.90',
          approvalStatus: ExpenseApprovalStatus.PENDING,
        },
        { businessNumber: '111111111', sum: '0.20', approvalStatus: null },
        {
          businessNumber: '111111111',
          sum: '500',
          approvalStatus: ExpenseApprovalStatus.APPROVED,
        },
        {
          businessNumber: '111111111',
          sum: '10',
          approvalStatus: ExpenseApprovalStatus.REJECTED,
        },
      ],
    });
    reportsService.createPnLReportFromJournal.mockResolvedValue({
      income: 10000.1,
      expenses: [
        { sectionName: 'רכב ותחבורה', total: 0.1 + 0.2 },
        { sectionName: 'משרד', total: 1500 },
      ],
      netProfitBeforeTax: 8499.8,
    });

    const result = await service
      .forUser(owner)
      .getProfitAndLoss({ from: '2026-01-01', to: '2026-06-30' });

    expect(reportsService.preparePnLReportFromJournal).not.toHaveBeenCalled();
    const [, , from, to] =
      reportsService.createPnLReportFromJournal.mock.calls[0];
    expect([from.toISOString(), to.toISOString()]).toEqual([
      '2026-01-01T00:00:00.000Z',
      '2026-06-30T00:00:00.000Z',
    ]);
    expect(result).toMatchObject({
      income: 10000.1,
      expensesBySection: [
        { section: 'משרד', amount: 1500 },
        { section: 'רכב ותחבורה', amount: 0.3 },
      ],
      totalExpenses: 1500.3,
      netProfitBeforeTax: 8499.8,
      notCounted: {
        pendingExpenses: { count: 2, sum: 100.1 },
        depreciationMayBeMissing: true,
      },
    });
  });

  it('VAT: a bi-monthly business is read by whole two-month periods, across a year boundary', async () => {
    const { service, reportsService } = setup();
    reportsService.createVatReportFromJournal.mockResolvedValue({
      vatableTurnover: 10000,
      nonVatableTurnover: 0,
      vatRefundOnAssets: 0,
      vatRefundOnExpenses: 250.55,
      vatPayment: 1549.45,
      vatRate: 0.18,
      expenses: [{}, {}],
    });

    const january = await service
      .forUser(owner)
      .getVatSummary({ from: '2026-01-01', to: '2026-01-31' });
    let [, , from, to] =
      reportsService.createVatReportFromJournal.mock.calls[0];
    expect([from.toISOString(), to.toISOString()]).toEqual([
      '2026-01-01T00:00:00.000Z',
      '2026-02-28T00:00:00.000Z',
    ]);
    expect(january.range).toEqual({
      requested: { from: '2026-01-01', to: '2026-01-31' },
      from: '2026-01-01',
      to: '2026-02-28',
      rangeExpanded: true,
      periods: ['1-2/2026'],
    });
    expect(january).toMatchObject({
      applies: true,
      cadence: 'bi-monthly',
      vatRatePercent: 18,
      vatToPay: 1549.45,
      markedReported: false,
    });

    const yearEnd = await service
      .forUser(owner)
      .getVatSummary({ from: '2025-12-15', to: '2026-01-10' });
    [, , from, to] = reportsService.createVatReportFromJournal.mock.calls[1];
    expect([from.toISOString(), to.toISOString()]).toEqual([
      '2025-11-01T00:00:00.000Z',
      '2026-02-28T00:00:00.000Z',
    ]);
    expect(yearEnd.range?.periods).toEqual(['11-12/2025', '1-2/2026']);
    // Two periods: no single "marked reported" answer.
    expect(yearEnd.markedReported).toBeNull();
  });

  it('VAT: a monthly business by whole months; an exempt business gets no VAT figures', async () => {
    const { service, reportsService } = setup({
      businesses: [
        { ...studio, vatReportingType: VATReportingType.MONTHLY_REPORT },
        workshop,
      ],
    });
    reportsService.createVatReportFromJournal.mockResolvedValue({
      vatableTurnover: 0,
      nonVatableTurnover: 0,
      vatRefundOnAssets: 0,
      vatRefundOnExpenses: 0,
      vatPayment: 0,
      vatRate: 0.18,
      expenses: [],
    });

    const march = await service.forUser(owner).getVatSummary({
      from: '2026-03-01',
      to: '2026-03-31',
      businessNumber: '111111111',
    });
    expect(march.range).toMatchObject({
      from: '2026-03-01',
      to: '2026-03-31',
      rangeExpanded: false,
      periods: ['3/2026'],
    });

    const exempt = await service
      .forUser(owner)
      .getVatSummary({ ...range, businessNumber: '222222222' });
    expect(exempt).toMatchObject({
      applies: false,
      reason: 'EXEMPT_BUSINESS',
      vatToPay: null,
    });
    expect(reportsService.createVatReportFromJournal).toHaveBeenCalledTimes(1);
  });

  it("advance tax: the report's figures for whole periods, the percent and what is not tracked", async () => {
    const { service, reportsService } = setup();
    reportsService.getAdvanceIncomeTaxReportData.mockResolvedValue({
      totalIncome: 20000.5,
      advanceTaxPercent: 5,
      totalAdvanceTax: 1000,
      taxWithholdingAtSource: 200.1,
      totalToPay: 799.9,
    });

    const result = await service
      .forUser(owner)
      .getAdvanceTaxStatus({ from: '2026-03-01', to: '2026-03-31' });

    expect(result).toMatchObject({
      businessKind: 'licensed',
      advanceTaxCadence: 'monthly',
      range: { from: '2026-03-01', to: '2026-04-30', rangeExpanded: true },
      totalIncome: 20000.5,
      advanceTaxPercentSet: true,
      toPay: 799.9,
      notTracked: ['national_insurance_advances'],
    });
  });

  it('upcoming reports: computed periods with stored states, never the generator that writes', async () => {
    const { service, tasksGenerator, reportWorkflow, reportsService } = setup();
    const period = (
      type: ReportWorkflowType,
      start: string,
      end: string,
      due: string,
      label: string,
    ) => ({
      type,
      periodStart: new Date(`${start}T00:00:00Z`),
      periodEnd: new Date(`${end}T00:00:00Z`),
      dueDate: new Date(`${due}T00:00:00Z`),
      label,
    });
    const now = new Date();
    const year = now.getUTCFullYear();
    tasksGenerator.expectedReportPeriods.mockReturnValue([
      period(
        ReportWorkflowType.VAT_REPORT,
        `${year - 1}-01-01`,
        `${year - 1}-02-28`,
        `${year - 1}-03-15`,
        `1-2/${year - 1}`,
      ),
      period(
        ReportWorkflowType.VAT_REPORT,
        `${year - 1}-03-01`,
        `${year - 1}-04-30`,
        `${year - 1}-05-15`,
        `3-4/${year - 1}`,
      ),
      period(
        ReportWorkflowType.VAT_REPORT,
        `${year - 1}-05-01`,
        `${year - 1}-06-30`,
        `${year - 1}-07-15`,
        `5-6/${year - 1}`,
      ),
      period(
        ReportWorkflowType.ADVANCE_TAX,
        `${year + 1}-01-01`,
        `${year + 1}-01-31`,
        `${year + 1}-02-15`,
        `1/${year + 1}`,
      ),
    ]);
    reportWorkflow.listStoredForClient.mockResolvedValue([
      {
        type: ReportWorkflowType.VAT_REPORT,
        periodStart: `${year - 1}-01-01`,
        periodEnd: `${year - 1}-02-28`,
        status: ReportWorkflowStatus.REPORTED,
        dismissedAt: null,
      },
    ]);
    reportsService.getReportSubmissionStatus.mockImplementation(
      async (_o, _b, start: Date) => ({
        isSubmitted: start.getUTCMonth() === 2,
        periodLabel: '',
      }),
    );

    const result = await service.forUser(owner).listUpcomingReports({});

    expect(tasksGenerator.generateForUser).not.toHaveBeenCalled();
    expect(reportWorkflow.listForClient).not.toHaveBeenCalled();
    expect(result.reportedOmitted).toBe(2);
    expect(result.businesses[0].obligations).toEqual([
      expect.objectContaining({
        type: 'VAT',
        period: `5-6/${year - 1}`,
        state: 'overdue',
        statusSource: 'none',
      }),
      expect.objectContaining({ type: 'ADVANCE_TAX', state: 'open' }),
    ]);

    const withReported = await service
      .forUser(owner)
      .listUpcomingReports({ includeReported: true });
    expect(
      withReported.businesses[0].obligations.map((one) => one.statusSource),
    ).toEqual(['workflow', 'submission_mark', 'none', 'none']);
  });

  it('upcoming reports name the only business as active, never the page header; the list keeps every business', async () => {
    const two = setup({ businesses: [studio, workshop] });

    // 2026-11-15: the businessnumber header another screen left behind is
    // not the chat's business (the agent fills in the conversation's own).
    const active = await two.service
      .forUser({ ...owner, businessNumber: '222222222' })
      .listUpcomingReports({});
    expect(active.activeBusiness).toBeNull();
    expect(active.businesses.map((one) => one.business.number)).toEqual([
      '111111111',
      '222222222',
    ]);

    const none = await two.service.forUser(owner).listUpcomingReports({});
    expect(none.activeBusiness).toBeNull();
    expect(none.businesses).toHaveLength(2);

    // A number that is not one of the owner's is never taken as active.
    const foreign = await two.service
      .forUser({ ...owner, businessNumber: '999999999' })
      .listUpcomingReports({});
    expect(foreign.activeBusiness).toBeNull();

    const only = setup({ businesses: [studio] });
    const sole = await only.service.forUser(owner).listUpcomingReports({});
    expect(sole.activeBusiness).toEqual({
      number: '111111111',
      name: 'סטודיו',
    });
  });

  it('readiness reads the review rows without writing, and never calls a foreign amount ₪', async () => {
    const { service, reportReview } = setup({
      expenses: [
        {
          businessNumber: '111111111',
          sum: '40',
          approvalStatus: ExpenseApprovalStatus.PENDING,
        },
      ],
    });
    reportReview.getReportPreview.mockResolvedValue({
      mode: 'with_banking',
      counts: { matched: 1, docOnly: 2, txOnly: 4 },
      rows: [
        {
          type: 'matched',
          document: {
            date: '2026-01-05',
            supplier: 'פז',
            amount: 100.1,
            currency: 'ILS',
            ilsAmount: null,
          },
          transaction: {},
          classification: { status: 'READY' },
        },
        {
          type: 'doc_only',
          document: {
            date: '2026-01-06',
            supplier: 'Adobe',
            amount: 20,
            currency: 'USD',
            ilsAmount: null,
          },
          classification: { status: 'MISSING_MAPPING' },
        },
        {
          type: 'doc_only',
          document: {
            date: '2026-01-07',
            supplier: 'Figma',
            amount: 15,
            currency: 'USD',
            ilsAmount: 54.75,
          },
          classification: { status: 'UNCLASSIFIED' },
        },
        // Foreign, no ₪ amount stamped: the summary's amount is the dollars.
        {
          type: 'tx_only',
          transaction: {
            date: '2026-01-08',
            merchantName: 'AWS',
            amount: 12,
            originalAmount: 12,
            originalCurrency: 'USD',
            ilsConversionRecorded: false,
          },
          classification: { status: 'PRIVATE' },
        },
        {
          type: 'tx_only',
          transaction: {
            date: '2026-01-09',
            merchantName: 'סונול',
            amount: 77.7,
            originalAmount: null,
            originalCurrency: null,
            ilsConversionRecorded: true,
          },
          classification: { status: 'READY' },
        },
        // A valid conversion that happens to be 1:1 is still a ₪ figure.
        {
          type: 'tx_only',
          transaction: {
            date: '2026-01-10',
            merchantName: 'Stripe',
            amount: 30,
            originalAmount: 30,
            originalCurrency: 'EUR',
            ilsConversionRecorded: true,
          },
          classification: { status: 'READY' },
        },
        // No provenance at all: a foreign amount is never taken as ₪.
        {
          type: 'tx_only',
          transaction: {
            date: '2026-01-11',
            merchantName: 'Zoom',
            amount: 50.5,
            originalAmount: 14,
            originalCurrency: 'USD',
          },
          classification: { status: 'READY' },
        },
      ],
    });

    const result = await service
      .forUser(owner)
      .getReportReadiness({ from: '2026-01-01', to: '2026-02-28' });

    expect(reportReview.getReportPreview).toHaveBeenCalledWith(
      'owner-1',
      '111111111',
      expect.any(Object),
      { readOnly: true },
    );
    expect(
      result.items.map(({ amountIls, currency, originalAmount }) => [
        amountIls,
        currency,
        originalAmount,
      ]),
    ).toEqual([
      [100.1, 'ILS', null],
      [null, 'USD', 20],
      [54.75, 'USD', 15],
      [null, 'USD', 12],
      [77.7, 'ILS', null],
      [30, 'EUR', 30],
      [null, 'USD', 14],
    ]);
    expect(result.conversionUnavailable).toEqual({ count: 3 });
    expect(result.counts).toEqual({
      matched: 1,
      documentWithoutPayment: 2,
      paymentWithoutDocument: 4,
    });
    expect(result.byStatus).toEqual({
      ready: 4,
      missingMapping: 1,
      private: 1,
      unclassified: 1,
    });
    expect(result.notCounted.pendingExpenses).toEqual({ count: 1, sum: 40 });
    expect(result.nothingToReview).toBe(false);
  });
});
