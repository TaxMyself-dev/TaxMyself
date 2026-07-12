/**
 * Unit tests: Phase 4.1 — expense creation/approval on the new catalog model.
 *
 * Covers:
 *  - addExpense writes subCategoryId + accounting snapshots + description +
 *    approvalStatus (APPROVED) on a mapped classification
 *  - MISSING_ACCOUNTING_MAPPING → expense saved, NO journal entry, no 60000
 *  - isPrivate → APPROVED, never journaled
 *  - unresolvable classification → 400 (the silent 60000 fallback is dead)
 *  - manager param joins the caller's transaction (no nested transaction)
 *  - D10 period lock (423): isReported flag, REPORTED-workflow label match,
 *    and the null-vatReportingDate branch applying ONLY to journaled rows
 *  - D10 stickiness: reclassifyExpenseFromNames skips overridden expenses
 *  - updateExpense: journaled expense reclassified to an unmappable target → 400;
 *    completing a mapping journals + approves
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { BadRequestException, HttpException } from '@nestjs/common';

import { ExpensesService } from './expenses.service';
import { Expense } from './expenses.entity';
import { Supplier } from './suppliers.entity';
import { BookkeepingService } from '../bookkeeping/bookkeeping.service';
import { CatalogService } from '../bookkeeping/catalog.service';
import { SharedService } from '../shared/shared.service';
import { FxRateService } from '../shared/fx-rate.service';
import { User } from '../users/user.entity';
import { Business } from '../business/business.entity';
import { ClassifiedTransactions } from '../transactions/classified-transactions.entity';
import { ExtractedDocument } from '../documents/extracted-document.entity';
import { ReportWorkflow, ReportWorkflowStatus, ReportWorkflowType } from '../report-workflow/report-workflow.entity';
import {
  ApprovalStatus,
  BusinessType,
  ExpenseApprovalStatus,
  ExpenseReportScope,
  VATReportingType,
} from '../enum';

// ─── fixtures ────────────────────────────────────────────────────────────────

function makeResolved(overrides: any = {}) {
  return {
    subCategory: {
      id: 42,
      name: 'דלק',
      isPrivate: false,
      approvalStatus: ApprovalStatus.APPROVED,
      reportScope: ExpenseReportScope.PNL,
      category: { name: 'הוצאות רכב' },
      ...(overrides.subCategory ?? {}),
    },
    account: overrides.hasOwnProperty('account')
      ? overrides.account
      : { id: 7, code: '61000', name: 'דלק' },
    section: overrides.hasOwnProperty('section')
      ? overrides.section
      : { id: 3, code: '200', name: 'הוצאות רכב' },
    code6111: overrides.code6111 ?? '1310',
    vatPercent: overrides.vatPercent ?? 66,
    taxPercent: overrides.taxPercent ?? 45,
    isEquipment: overrides.isEquipment ?? false,
    reductionPercent: overrides.reductionPercent ?? 0,
    recognitionType: null,
  };
}

function makeDto(overrides: any = {}) {
  return {
    supplier: 'פז',
    supplierID: '520000123',
    category: 'הוצאות רכב',
    subCategory: 'דלק',
    sum: 118,
    taxPercent: 45,
    vatPercent: 66,
    date: new Date('2024-03-10') as any,
    reductionPercent: 0,
    ...overrides,
  } as any;
}

function makeRepo<T>(partial: Partial<Repository<T>> = {}): jest.Mocked<Repository<T>> {
  return {
    findOne: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    save: jest.fn().mockImplementation(async (e: any) => e),
    update: jest.fn().mockResolvedValue(undefined),
    create: jest.fn((dto) => Object.assign(new Object(), dto)),
    remove: jest.fn(),
    delete: jest.fn(),
    createQueryBuilder: jest.fn(),
    findOneBy: jest.fn(),
    findBy: jest.fn().mockResolvedValue([]),
    ...partial,
  } as any;
}

// ─── suite ───────────────────────────────────────────────────────────────────

describe('ExpensesService — Phase 4.1 classification', () => {
  let service: ExpensesService;
  let expenseRepo: jest.Mocked<Repository<Expense>>;
  let workflowRepo: jest.Mocked<Repository<ReportWorkflow>>;
  let businessRepo: jest.Mocked<Repository<Business>>;
  let bookkeepingService: any;
  let catalogService: any;
  let dataSource: any;
  let mockManager: jest.Mocked<EntityManager>;

  beforeEach(async () => {
    expenseRepo = makeRepo<Expense>({
      // create() must behave like TypeORM's: copy the DTO onto a new entity.
      create: jest.fn((dto: any) => Object.assign(new Expense(), dto)) as any,
      save: jest.fn().mockImplementation(async (e: any) => ({ id: 5, ...e })),
    });
    workflowRepo = makeRepo<ReportWorkflow>();
    businessRepo = makeRepo<Business>({
      findOne: jest.fn().mockResolvedValue({
        businessNumber: '999999999',
        firebaseId: 'uid-1',
        businessType: BusinessType.LICENSED,
        vatReportingType: VATReportingType.MONTHLY_REPORT,
      } as any),
    });

    bookkeepingService = {
      createJournalEntry: jest.fn().mockResolvedValue({ entryNumber: 10000001, id: 99 }),
      replaceJournalEntryLines: jest.fn().mockResolvedValue(true),
      updateJournalEntryFull: jest.fn().mockResolvedValue(true),
      findJournalEntryNumber: jest.fn().mockResolvedValue(null),
      deleteJournalEntry: jest.fn().mockResolvedValue(true),
    };

    catalogService = {
      resolveByName: jest.fn().mockResolvedValue(makeResolved()),
      resolveSubCategory: jest.fn().mockResolvedValue(makeResolved()),
    };

    mockManager = {
      getRepository: jest.fn().mockImplementation((entity: any) => {
        if (entity === Expense) return expenseRepo;
        if (entity === Business) return businessRepo;
        return makeRepo();
      }),
    } as any;

    dataSource = {
      transaction: jest.fn().mockImplementation((cb: (m: EntityManager) => Promise<any>) => cb(mockManager)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpensesService,
        { provide: getRepositoryToken(Expense), useValue: expenseRepo },
        { provide: getRepositoryToken(User), useValue: makeRepo<User>() },
        { provide: getRepositoryToken(Supplier), useValue: makeRepo<Supplier>() },
        { provide: getRepositoryToken(Business), useValue: businessRepo },
        { provide: getRepositoryToken(ClassifiedTransactions), useValue: makeRepo<ClassifiedTransactions>() },
        { provide: getRepositoryToken(ExtractedDocument), useValue: makeRepo<ExtractedDocument>() },
        { provide: getRepositoryToken(ReportWorkflow), useValue: workflowRepo },
        {
          provide: SharedService,
          useValue: {
            getVatRateByYear: jest.fn().mockReturnValue(0.18),
            buildReportPeriodLabel: jest.fn().mockReturnValue('3/2024'),
            normalizeToMySqlDate: jest.fn().mockReturnValue('2024-03-10'),
            expandPeriodLabelsInRange: jest.fn().mockReturnValue(['1/2024', '2/2024']),
          },
        },
        { provide: FxRateService, useValue: { getRate: jest.fn().mockResolvedValue(null) } },
        { provide: DataSource, useValue: dataSource },
        { provide: BookkeepingService, useValue: bookkeepingService },
        { provide: CatalogService, useValue: catalogService },
      ],
    }).compile();

    service = module.get<ExpensesService>(ExpensesService);
  });

  // ── addExpense: snapshots + approval ───────────────────────────────────────

  it('addExpense writes FK, snapshots, description and APPROVED on a mapped classification', async () => {
    const result = await service.addExpense(makeDto(), 'uid-1', '999999999');

    expect(result.subCategoryId).toBe(42);
    expect(result.accountIdSnapshot).toBe(7);
    expect(result.accountCodeSnapshot).toBe('61000');
    expect(result.accountNameSnapshot).toBe('דלק');
    expect(result.sectionIdSnapshot).toBe(3);
    expect(result.sectionCodeSnapshot).toBe('200');
    expect(result.code6111Snapshot).toBe('1310');
    expect(result.description).toBe('הוצאות רכב/דלק');
    expect(result.approvalStatus).toBe(ExpenseApprovalStatus.APPROVED);
    expect(result.approvedByUserId).toBe('uid-1');
    expect(result.approvedAt).toBeInstanceOf(Date);
    expect(bookkeepingService.createJournalEntry).toHaveBeenCalledTimes(1);
    // DTO percents win as one-off snapshot overrides.
    expect(result.vatPercentSnapshot).toBe(66);
    expect(result.taxPercentSnapshot).toBe(45);
  });

  it('addExpense prefers subCategoryId over the name pair (tenant-scope-checked)', async () => {
    await service.addExpense(makeDto({ subCategoryId: 42 }), 'uid-1', '999999999');
    expect(catalogService.resolveSubCategory).toHaveBeenCalledWith(42, { businessNumber: '999999999' });
    expect(catalogService.resolveByName).not.toHaveBeenCalled();
  });

  it('addExpense uses the card law when the DTO omits percents', async () => {
    const dto = makeDto();
    delete dto.vatPercent;
    delete dto.taxPercent;
    const result = await service.addExpense(dto, 'uid-1', '999999999');
    expect(result.vatPercentSnapshot).toBe(66);
    expect(result.taxPercentSnapshot).toBe(45);
  });

  // ── MISSING / private / unresolvable ───────────────────────────────────────

  it('MISSING_ACCOUNTING_MAPPING: saved without journal, no 60000 anywhere', async () => {
    catalogService.resolveByName.mockResolvedValue(
      makeResolved({ account: null, section: null, code6111: null, subCategory: { approvalStatus: ApprovalStatus.MISSING_ACCOUNTING_MAPPING } }),
    );

    const result = await service.addExpense(makeDto(), 'uid-1', '999999999');

    expect(result.approvalStatus).toBe(ExpenseApprovalStatus.MISSING_ACCOUNTING_MAPPING);
    expect(result.accountCodeSnapshot).toBeNull();
    expect(result.journalEntryNumber ?? null).toBeNull();
    expect(bookkeepingService.createJournalEntry).not.toHaveBeenCalled();
  });

  it('isPrivate: APPROVED but never journaled', async () => {
    catalogService.resolveByName.mockResolvedValue(
      makeResolved({ account: null, section: null, code6111: null, subCategory: { isPrivate: true } }),
    );

    const result = await service.addExpense(makeDto(), 'uid-1', '999999999');

    expect(result.approvalStatus).toBe(ExpenseApprovalStatus.APPROVED);
    expect(bookkeepingService.createJournalEntry).not.toHaveBeenCalled();
  });

  it('unresolvable classification → 400 (silent 60000 fallback is dead)', async () => {
    catalogService.resolveByName.mockResolvedValue(null);
    await expect(service.addExpense(makeDto(), 'uid-1', '999999999')).rejects.toThrow(BadRequestException);
    expect(expenseRepo.save).not.toHaveBeenCalled();
    expect(bookkeepingService.createJournalEntry).not.toHaveBeenCalled();
  });

  // ── transaction joining ────────────────────────────────────────────────────

  it('manager param joins the caller transaction — no nested dataSource.transaction', async () => {
    await service.addExpense(makeDto(), 'uid-1', '999999999', true, mockManager);
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(bookkeepingService.createJournalEntry).toHaveBeenCalledWith(expect.anything(), mockManager);
  });

  it('without manager, addExpense opens its own transaction', async () => {
    await service.addExpense(makeDto(), 'uid-1', '999999999');
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  });

  // ── D10 period lock ────────────────────────────────────────────────────────

  function makeLockedWorkflow(): ReportWorkflow {
    return {
      id: 1,
      businessNumber: '999999999',
      type: ReportWorkflowType.VAT_REPORT,
      status: ReportWorkflowStatus.REPORTED,
      periodStart: new Date('2024-01-01'),
      periodEnd: new Date('2024-02-29'),
    } as any;
  }

  it('assertExpensePeriodUnlocked: isReported → 423', async () => {
    const expense = { id: 1, isReported: true, businessNumber: '999999999', vatReportingDate: '1/2024' } as any;
    await expect(service.assertExpensePeriodUnlocked(expense)).rejects.toMatchObject({
      status: 423,
      response: expect.objectContaining({ type: 'expense_period_locked' }),
    });
  });

  it('assertExpensePeriodUnlocked: vatReportingDate inside a REPORTED workflow → 423', async () => {
    workflowRepo.find.mockResolvedValue([makeLockedWorkflow()]);
    const expense = { id: 1, isReported: null, businessNumber: '999999999', vatReportingDate: '1/2024' } as any;
    await expect(service.assertExpensePeriodUnlocked(expense)).rejects.toThrow(HttpException);
  });

  it('null vatReportingDate + date in period: locks JOURNALED rows only', async () => {
    workflowRepo.find.mockResolvedValue([makeLockedWorkflow()]);

    const journaled = {
      id: 1, isReported: null, businessNumber: '999999999',
      vatReportingDate: null, date: new Date('2024-01-15'), journalEntryNumber: 10000001,
    } as any;
    await expect(service.assertExpensePeriodUnlocked(journaled)).rejects.toThrow(HttpException);

    // Exempt-dealer expense with no VAT linkage and no journal — stays editable.
    const unjournaled = { ...journaled, journalEntryNumber: null } as any;
    await expect(service.assertExpensePeriodUnlocked(unjournaled)).resolves.toBeUndefined();
  });

  it('open period passes', async () => {
    workflowRepo.find.mockResolvedValue([makeLockedWorkflow()]);
    const expense = { id: 1, isReported: null, businessNumber: '999999999', vatReportingDate: '5/2024' } as any;
    await expect(service.assertExpensePeriodUnlocked(expense)).resolves.toBeUndefined();
  });

  // ── D10 stickiness ─────────────────────────────────────────────────────────

  it('reclassifyExpenseFromNames skips expenses with a manual override', async () => {
    const expense = { id: 9, classificationOverrideByUserId: 'accountant-1' } as any;
    const result = await service.reclassifyExpenseFromNames(expense, { category: 'א', subCategory: 'ב' });
    expect(result).toBe(expense);
    expect(catalogService.resolveByName).not.toHaveBeenCalled();
    expect(expenseRepo.save).not.toHaveBeenCalled();
  });

  it('reclassifyExpenseFromNames re-resolves + re-journals a non-overridden expense', async () => {
    const expense = {
      id: 9, classificationOverrideByUserId: null, isReported: null,
      businessNumber: '999999999', userId: 'uid-1', vatReportingDate: '5/2024',
      date: new Date('2024-05-02'), journalEntryNumber: 10000001, sum: 118,
      category: 'ישן', subCategory: 'ישן',
    } as any;
    const result = await service.reclassifyExpenseFromNames(expense, {
      category: 'הוצאות רכב', subCategory: 'דלק', vatPercent: 66, taxPercent: 45, sum: 200,
    });
    expect(result.subCategoryId).toBe(42);
    expect(result.accountCodeSnapshot).toBe('61000');
    expect(result.sum).toBe(200);
    expect(bookkeepingService.updateJournalEntryFull).toHaveBeenCalled();
  });

  // ── updateExpense transitions ──────────────────────────────────────────────

  it('updateExpense: journaled expense → unmappable target rejected with 400', async () => {
    expenseRepo.findOne.mockResolvedValue({
      id: 3, userId: 'uid-1', businessNumber: '999999999', isReported: null,
      journalEntryNumber: 10000001, category: 'הוצאות רכב', subCategory: 'דלק',
      date: new Date('2024-03-10'), sum: 118,
    } as any);
    catalogService.resolveByName.mockResolvedValue(
      makeResolved({ account: null, subCategory: { isPrivate: true } }),
    );

    await expect(
      service.updateExpense(3, 'uid-1', { subCategory: 'פרטי' } as any),
    ).rejects.toThrow(BadRequestException);
    expect(expenseRepo.save).not.toHaveBeenCalled();
  });

  // ── Phase 4.2: reclassify / override-mapping endpoints ─────────────────────

  function makeJournaledExpense(overrides: any = {}) {
    return {
      id: 20, userId: 'uid-1', businessNumber: '999999999', isReported: null,
      journalEntryNumber: 10000001, category: 'ישן', subCategory: 'ישן',
      date: new Date('2024-05-02'), sum: 118, vatReportingDate: '5/2024',
      supplier: 'פז', expenseNumber: null, description: 'ישן/ישן',
      ...overrides,
    } as any;
  }

  it('reclassifyExpense: rewrites snapshots + journal, stamps the ACTOR id, card law only', async () => {
    expenseRepo.findOne.mockResolvedValue(makeJournaledExpense());

    const result = await service.reclassifyExpense(20, 'uid-1', 'accountant-uid', 42);

    expect(result.subCategoryId).toBe(42);
    expect(result.accountCodeSnapshot).toBe('61000');
    // Card law, NOT any request percents (none are accepted).
    expect(result.vatPercentSnapshot).toBe(66);
    expect(result.taxPercentSnapshot).toBe(45);
    expect(result.classificationOverrideByUserId).toBe('accountant-uid');
    expect(result.classificationOverrideAt).toBeInstanceOf(Date);
    expect(result.description).toBe('הוצאות רכב/דלק');
    expect(bookkeepingService.updateJournalEntryFull).toHaveBeenCalledWith(
      10000001, '999999999', expect.anything(), mockManager,
    );
  });

  it('reclassifyExpense: locked period → 423', async () => {
    expenseRepo.findOne.mockResolvedValue(makeJournaledExpense({ isReported: true }));
    await expect(service.reclassifyExpense(20, 'uid-1', 'uid-1', 42)).rejects.toMatchObject({ status: 423 });
  });

  it('reclassifyExpense: journaled → unmappable target rejected with 400', async () => {
    expenseRepo.findOne.mockResolvedValue(makeJournaledExpense());
    catalogService.resolveSubCategory.mockResolvedValue(
      makeResolved({ account: null, subCategory: { approvalStatus: ApprovalStatus.MISSING_ACCOUNTING_MAPPING } }),
    );
    await expect(service.reclassifyExpense(20, 'uid-1', 'uid-1', 42)).rejects.toThrow(BadRequestException);
    expect(expenseRepo.save).not.toHaveBeenCalled();
  });

  it('overrideExpenseMapping by accountId: keeps subCategoryId, moves the mapping, stamps override', async () => {
    expenseRepo.findOne.mockResolvedValue(makeJournaledExpense({ subCategoryId: 42 }));
    catalogService.findAccountByIdInScope = jest.fn().mockResolvedValue({
      id: 11, code: '80010', name: 'כרטיס מותאם', sectionId: 4,
      section: { id: 4, code: '300', name: 'חתך אחר' }, code6111: '2222',
      vatPercent: 100, taxPercent: 100, reductionPercent: 0, isEquipment: false,
    });

    const result = await service.overrideExpenseMapping(20, 'uid-1', 'accountant-uid', { accountId: 11 });

    expect(result.subCategoryId).toBe(42); // client language untouched
    expect(result.accountCodeSnapshot).toBe('80010');
    expect(result.sectionCodeSnapshot).toBe('300');
    expect(result.code6111Snapshot).toBe('2222');
    expect(result.classificationOverrideByUserId).toBe('accountant-uid');
    expect(bookkeepingService.updateJournalEntryFull).toHaveBeenCalled();
  });

  it('overrideExpenseMapping by accountCode uses the precedence lookup', async () => {
    expenseRepo.findOne.mockResolvedValue(makeJournaledExpense());
    catalogService.findAccountByCodeInScope = jest.fn().mockResolvedValue({
      id: 12, code: '80020', name: 'קוד', sectionId: null, section: null, code6111: null,
      vatPercent: 0, taxPercent: 100, reductionPercent: 0, isEquipment: false,
    });

    const result = await service.overrideExpenseMapping(20, 'uid-1', 'uid-1', { accountCode: '80020' });
    expect(catalogService.findAccountByCodeInScope).toHaveBeenCalledWith('80020', { businessNumber: '999999999' });
    expect(result.accountCodeSnapshot).toBe('80020');
  });

  it('overrideExpenseMapping: exactly one of accountId/accountCode required', async () => {
    await expect(service.overrideExpenseMapping(20, 'uid-1', 'uid-1', {})).rejects.toThrow(BadRequestException);
    await expect(
      service.overrideExpenseMapping(20, 'uid-1', 'uid-1', { accountId: 1, accountCode: '80010' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('updateExpense: completing a mapping approves + creates the journal entry', async () => {
    const missing = {
      id: 4, userId: 'uid-1', businessNumber: '999999999', isReported: null,
      journalEntryNumber: null, category: 'הוצאות רכב', subCategory: 'דלק',
      approvalStatus: ExpenseApprovalStatus.MISSING_ACCOUNTING_MAPPING,
      accountCodeSnapshot: null, date: new Date('2024-03-10'), sum: 118,
    } as any;
    expenseRepo.findOne.mockResolvedValue(missing);
    expenseRepo.save.mockImplementation(async (e: any) => e);
    bookkeepingService.findJournalEntryNumber.mockResolvedValue(null);

    const result = await service.updateExpense(4, 'uid-1', { subCategoryId: 42 } as any);

    expect(result.approvalStatus).toBe(ExpenseApprovalStatus.APPROVED);
    expect(result.accountCodeSnapshot).toBe('61000');
    expect(bookkeepingService.createJournalEntry).toHaveBeenCalledTimes(1);
  });

  // ── deleteExpense (Phase 4.3b) ─────────────────────────────────────────────

  it('deleteExpense removes the journal entry AND the expense in one transaction', async () => {
    const expense = {
      id: 30, userId: 'uid-1', businessNumber: '999999999', isReported: null,
      vatReportingDate: '5/2024', journalEntryNumber: 10000007,
    } as any;
    expenseRepo.findOne.mockResolvedValue(expense);
    bookkeepingService.deleteJournalEntry.mockResolvedValue(true);

    await service.deleteExpense(30, 'uid-1');

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(bookkeepingService.deleteJournalEntry).toHaveBeenCalledWith(10000007, '999999999', mockManager);
    expect(expenseRepo.remove).toHaveBeenCalledWith(expense);
  });

  it('deleteExpense falls back to the reference lookup for legacy rows without journalEntryNumber', async () => {
    const expense = {
      id: 31, userId: 'uid-1', businessNumber: '999999999', isReported: null,
      vatReportingDate: '5/2024', journalEntryNumber: null, expenseNumber: 31,
    } as any;
    expenseRepo.findOne.mockResolvedValue(expense);
    bookkeepingService.findJournalEntryNumber.mockResolvedValue(10000042);
    bookkeepingService.deleteJournalEntry.mockResolvedValue(true);

    await service.deleteExpense(31, 'uid-1');

    expect(bookkeepingService.findJournalEntryNumber).toHaveBeenCalledWith('EXPENSE', 31, '999999999');
    expect(bookkeepingService.deleteJournalEntry).toHaveBeenCalledWith(10000042, '999999999', mockManager);
    expect(expenseRepo.remove).toHaveBeenCalledWith(expense);
  });

  it('deleteExpense on an unjournaled expense deletes the row without touching the ledger', async () => {
    const expense = {
      id: 32, userId: 'uid-1', businessNumber: '999999999', isReported: null,
      vatReportingDate: '5/2024', journalEntryNumber: null, expenseNumber: null,
    } as any;
    expenseRepo.findOne.mockResolvedValue(expense);
    bookkeepingService.findJournalEntryNumber.mockResolvedValue(null);

    await service.deleteExpense(32, 'uid-1');

    expect(bookkeepingService.deleteJournalEntry).not.toHaveBeenCalled();
    expect(expenseRepo.remove).toHaveBeenCalledWith(expense);
  });

  it('deleteExpense: D10 period lock applies to deletes → 423, nothing deleted', async () => {
    const expense = {
      id: 33, userId: 'uid-1', businessNumber: '999999999', isReported: true,
      vatReportingDate: '1/2024', journalEntryNumber: 10000008,
    } as any;
    expenseRepo.findOne.mockResolvedValue(expense);

    await expect(service.deleteExpense(33, 'uid-1')).rejects.toMatchObject({
      status: 423,
      response: expect.objectContaining({ type: 'expense_period_locked' }),
    });
    expect(bookkeepingService.deleteJournalEntry).not.toHaveBeenCalled();
    expect(expenseRepo.remove).not.toHaveBeenCalled();
  });

  it('deleteExpense: foreign expense rejected', async () => {
    expenseRepo.findOne.mockResolvedValue({ id: 34, userId: 'someone-else' } as any);
    await expect(service.deleteExpense(34, 'uid-1')).rejects.toThrow('You do not have permission');
    expect(expenseRepo.remove).not.toHaveBeenCalled();
  });
});
