/**
 * Unit tests: Expense ↔ JournalEntry linking
 *
 * Covers:
 *  - addExpense creates a journal entry and saves journalEntryNumber
 *  - addExpense rolls back the expense when journal entry creation fails
 *  - updateExpense always triggers syncExpenseJournalEntry
 *  - syncExpenseJournalEntry uses entryNumber when available (path 1)
 *  - syncExpenseJournalEntry falls back to referenceType+id (path 2 – backward compat)
 *  - syncExpenseJournalEntry creates a new entry when none exists (path 3)
 *  - no duplicate journal entry on update
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';

import { ExpensesService } from './expenses.service';
import { Expense } from './expenses.entity';
import { Supplier } from './suppliers.entity';
import { DefaultCategory } from './default-categories.entity';
import { DefaultSubCategory } from './default-sub-categories.entity';
import { UserCategory } from './user-categories.entity';
import { UserSubCategory } from './user-sub-categories.entity';
import { BookkeepingService } from '../bookkeeping/bookkeeping.service';
import { CatalogService } from '../bookkeeping/catalog.service';
import { SharedService } from '../shared/shared.service';
import { FxRateService } from '../shared/fx-rate.service';
import { User } from '../users/user.entity';
import { Business } from '../business/business.entity';
import { ClassifiedTransactions } from '../transactions/classified-transactions.entity';
import { ExtractedDocument } from '../documents/extracted-document.entity';
import { ReportWorkflow } from '../report-workflow/report-workflow.entity';
import { JournalReferenceType, BusinessType, VATReportingType, ExpenseReportScope, ApprovalStatus } from '../enum';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return Object.assign(new Expense(), {
    id: 1,
    supplier: 'Test Supplier',
    supplierID: '123456789',
    category: 'הוצאות',
    subCategory: 'דלק',
    sum: 100,
    taxPercentSnapshot: 100,
    vatPercentSnapshot: 100,
    date: new Date('2024-01-15') as any,
    businessNumber: '999999999',
    userId: 'firebase-uid-1',
    loadingDate: new Date(),
    isEquipmentSnapshot: false,
    reductionPercentSnapshot: 0,
    totalVatPayable: 17.09,
    totalTaxPayable: 82.91,
    vatReportingDate: '1/2024' as any,
    reportScope: ExpenseReportScope.PNL,
    pnlCategory: null,
    journalEntryNumber: null,
    ...overrides,
  } as Expense);
}

function makeRepo<T>(partial: Partial<Repository<T>> = {}): jest.Mocked<Repository<T>> {
  return {
    findOne: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    save: jest.fn(),
    update: jest.fn().mockResolvedValue(undefined),
    create: jest.fn((dto) => dto),
    remove: jest.fn(),
    delete: jest.fn(),
    createQueryBuilder: jest.fn(),
    findOneBy: jest.fn(),
    findBy: jest.fn().mockResolvedValue([]),
    ...partial,
  } as any;
}

// ─── test suite ──────────────────────────────────────────────────────────────

describe('ExpensesService — journal entry linking', () => {
  let service: ExpensesService;
  let expenseRepo: jest.Mocked<Repository<Expense>>;
  let bookkeepingService: jest.Mocked<BookkeepingService>;
  let dataSource: jest.Mocked<DataSource>;
  let mockManager: jest.Mocked<EntityManager>;

  beforeEach(async () => {
    expenseRepo = makeRepo<Expense>({
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    });

    bookkeepingService = {
      createJournalEntry: jest.fn().mockResolvedValue({ entryNumber: 10000001, id: 99 }),
      replaceJournalEntryLines: jest.fn().mockResolvedValue(true),
      updateJournalEntryFull: jest.fn().mockResolvedValue(true),
      findJournalEntryNumber: jest.fn().mockResolvedValue(null),
    } as any;

    // Phase 4.1: addExpense/updateExpense resolve the full classification
    // (subCategoryId or name pair) through CatalogService — the mock returns a
    // fully-mapped APPROVED sub_category on the '5100' card so the journal-line
    // assertions stay on the same account code the old mocks drove.
    const resolvedSubCategory = {
      subCategory: {
        id: 42,
        name: 'דלק',
        isPrivate: false,
        approvalStatus: ApprovalStatus.APPROVED,
        reportScope: ExpenseReportScope.PNL,
        category: { name: 'הוצאות' },
      },
      account: { id: 7, code: '5100', name: 'דלק' },
      section: { id: 3, code: '200', name: 'הוצאות רכב' },
      code6111: null,
      vatPercent: 100,
      taxPercent: 100,
      isEquipment: false,
      reductionPercent: 0,
      recognitionType: null,
    };
    const catalogService: Partial<CatalogService> = {
      resolveAccountCode: jest.fn().mockResolvedValue('5100'),
      resolveByName: jest.fn().mockResolvedValue(resolvedSubCategory as any),
      resolveSubCategory: jest.fn().mockResolvedValue(resolvedSubCategory as any),
    };

    mockManager = {
      getRepository: jest.fn().mockReturnValue(expenseRepo),
    } as any;

    dataSource = {
      transaction: jest.fn().mockImplementation(
        (cb: (m: EntityManager) => Promise<any>) => cb(mockManager),
      ),
    } as any;

    const sharedService: Partial<SharedService> = {
      getVatRateByYear: jest.fn().mockReturnValue(0.18),
      buildReportPeriodLabel: jest.fn().mockReturnValue('1/2024'),
      normalizeToMySqlDate: jest.fn().mockReturnValue('2024-01-15'),
      expandPeriodLabelsInRange: jest.fn().mockReturnValue(['1/2024']),
    };

    const fxRateService: Partial<FxRateService> = {
      getRate: jest.fn().mockResolvedValue(null),
    };

    const businessRepo = makeRepo<Business>();
    businessRepo.findOne.mockResolvedValue({
      businessNumber: '999999999',
      firebaseId: 'firebase-uid-1',
      businessType: BusinessType.LICENSED,
      vatReportingType: VATReportingType.MONTHLY_REPORT,
    } as any);

    const defaultSubCategoryRepo = makeRepo<DefaultSubCategory>({
      findOne: jest.fn().mockResolvedValue({
        accountCode: '5100',
        isEquipment: false,
        reportScope: ExpenseReportScope.PNL,
        subCategoryName: 'דלק',
        categoryName: 'הוצאות',
      }),
    });

    const userSubCategoryRepo = makeRepo<UserSubCategory>({
      findOne: jest.fn().mockResolvedValue(null),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpensesService,
        { provide: getRepositoryToken(Expense), useValue: expenseRepo },
        { provide: getRepositoryToken(User), useValue: makeRepo<User>() },
        { provide: getRepositoryToken(DefaultCategory), useValue: makeRepo<DefaultCategory>({ findOne: jest.fn().mockResolvedValue(null) }) },
        { provide: getRepositoryToken(DefaultSubCategory), useValue: defaultSubCategoryRepo },
        { provide: getRepositoryToken(UserCategory), useValue: makeRepo<UserCategory>({ findOne: jest.fn().mockResolvedValue(null) }) },
        { provide: getRepositoryToken(UserSubCategory), useValue: userSubCategoryRepo },
        { provide: getRepositoryToken(Supplier), useValue: makeRepo<Supplier>() },
        { provide: getRepositoryToken(Business), useValue: businessRepo },
        { provide: getRepositoryToken(ClassifiedTransactions), useValue: makeRepo<ClassifiedTransactions>() },
        { provide: getRepositoryToken(ExtractedDocument), useValue: makeRepo<ExtractedDocument>() },
        { provide: getRepositoryToken(ReportWorkflow), useValue: makeRepo<ReportWorkflow>({ find: jest.fn().mockResolvedValue([]) }) },
        { provide: SharedService, useValue: sharedService },
        { provide: FxRateService, useValue: fxRateService },
        { provide: DataSource, useValue: dataSource },
        { provide: BookkeepingService, useValue: bookkeepingService },
        { provide: CatalogService, useValue: catalogService },
      ],
    }).compile();

    service = module.get<ExpensesService>(ExpensesService);
  });

  // ── addExpense ─────────────────────────────────────────────────────────────

  describe('addExpense', () => {
    const dto = {
      supplier: 'Test Supplier',
      supplierID: '123456789',
      category: 'הוצאות',
      subCategory: 'דלק',
      sum: 100,
      taxPercent: 100,
      vatPercent: 100,
      date: new Date('2024-01-15') as any,
      reductionPercent: 0,
    } as any;

    it('creates a journal entry and saves journalEntryNumber on the expense', async () => {
      const savedExpense = makeExpense({ id: 5 });
      expenseRepo.save.mockResolvedValue(savedExpense);
      expenseRepo.find.mockResolvedValue([]);
      bookkeepingService.createJournalEntry.mockResolvedValue({ entryNumber: 10000042, id: 42 });

      await service.addExpense(dto, 'firebase-uid-1', '999999999');

      expect(bookkeepingService.createJournalEntry).toHaveBeenCalledTimes(1);
      const [input] = bookkeepingService.createJournalEntry.mock.calls[0];
      expect(input.referenceType).toBe(JournalReferenceType.EXPENSE);

      // journalEntryNumber must be saved back to the expense row.
      const updateCalls = expenseRepo.update.mock.calls;
      const journalNumberUpdate = updateCalls.find(
        ([_id, patch]) => (patch as any).journalEntryNumber === 10000042,
      );
      expect(journalNumberUpdate).toBeDefined();
    });

    it('rolls back when journal entry creation fails (transaction rejects)', async () => {
      expenseRepo.find.mockResolvedValue([]);
      expenseRepo.save.mockResolvedValue(makeExpense({ id: 6 }));
      bookkeepingService.createJournalEntry.mockRejectedValue(new Error('account not found'));

      // Simulate a real transaction: the callback throws, dataSource.transaction rejects.
      (dataSource.transaction as jest.Mock).mockImplementation(
        async (cb: (m: EntityManager) => Promise<any>) => {
          return cb(mockManager); // propagates the inner throw
        },
      );

      await expect(
        service.addExpense(dto, 'firebase-uid-1', '999999999'),
      ).rejects.toThrow('account not found');
    });
  });

  // ── syncExpenseJournalEntry ────────────────────────────────────────────────

  describe('syncExpenseJournalEntry', () => {
    it('path 1: updates header + lines by journalEntryNumber when set', async () => {
      const expense = makeExpense({ journalEntryNumber: 10000001 });
      bookkeepingService.updateJournalEntryFull.mockResolvedValue(true);

      await service.syncExpenseJournalEntry(expense);

      expect(bookkeepingService.updateJournalEntryFull).toHaveBeenCalledWith(
        10000001,
        expense.businessNumber,
        expect.objectContaining({ referenceType: JournalReferenceType.EXPENSE }),
      );
      expect(bookkeepingService.createJournalEntry).not.toHaveBeenCalled();
    });

    it('path 2 (backward compat): finds by reference when journalEntryNumber is null, saves it back', async () => {
      const expense = makeExpense({ journalEntryNumber: null });
      bookkeepingService.findJournalEntryNumber.mockResolvedValue(10000001);
      bookkeepingService.updateJournalEntryFull.mockResolvedValue(true);

      await service.syncExpenseJournalEntry(expense);

      expect(bookkeepingService.findJournalEntryNumber).toHaveBeenCalledWith(
        JournalReferenceType.EXPENSE,
        expense.id,
        expense.businessNumber,
      );
      expect(bookkeepingService.updateJournalEntryFull).toHaveBeenCalledWith(
        10000001,
        expense.businessNumber,
        expect.anything(),
      );
      expect(expenseRepo.update).toHaveBeenCalledWith(
        expense.id,
        expect.objectContaining({ journalEntryNumber: 10000001 }),
      );
      expect(expense.journalEntryNumber).toBe(10000001);
    });

    it('path 3: creates a new journal entry when no existing entry is found', async () => {
      const expense = makeExpense({ journalEntryNumber: null });
      bookkeepingService.findJournalEntryNumber.mockResolvedValue(null);
      bookkeepingService.createJournalEntry.mockResolvedValue({ entryNumber: 10000099, id: 99 });

      await service.syncExpenseJournalEntry(expense);

      expect(bookkeepingService.createJournalEntry).toHaveBeenCalledTimes(1);
    });

    it('does not create a second entry when one already exists (no duplicate)', async () => {
      const expense = makeExpense({ journalEntryNumber: 10000001 });
      bookkeepingService.updateJournalEntryFull.mockResolvedValue(true);

      await service.syncExpenseJournalEntry(expense);

      expect(bookkeepingService.createJournalEntry).not.toHaveBeenCalled();
    });

    it('updates the journal entry header with the new supplier name', async () => {
      const expense = makeExpense({ journalEntryNumber: 10000001, supplier: 'New Supplier' });
      bookkeepingService.updateJournalEntryFull.mockResolvedValue(true);

      await service.syncExpenseJournalEntry(expense);

      const [, , input] = bookkeepingService.updateJournalEntryFull.mock.calls[0];
      expect(input.counterPartyName).toBe('New Supplier');
    });

    it('updates documentTotal in the journal header when sum changes', async () => {
      const expense = makeExpense({ journalEntryNumber: 10000001, sum: 250 });
      bookkeepingService.updateJournalEntryFull.mockResolvedValue(true);

      await service.syncExpenseJournalEntry(expense);

      const [, , input] = bookkeepingService.updateJournalEntryFull.mock.calls[0];
      expect(input.documentTotal).toBe(250);
    });
  });

  // ── updateExpense ──────────────────────────────────────────────────────────

  describe('updateExpense', () => {
    it('always syncs the journal entry regardless of which field changed', async () => {
      const expense = makeExpense({ journalEntryNumber: 10000001 });
      expenseRepo.findOne.mockResolvedValue(expense);
      expenseRepo.save.mockResolvedValue({ ...expense, sum: 200 } as any);
      bookkeepingService.updateJournalEntryFull.mockResolvedValue(true);

      await service.updateExpense(
        1,
        'firebase-uid-1',
        { sum: 200, taxSumRec: 200, vatSumRec: 0 } as any,
      );

      expect(bookkeepingService.updateJournalEntryFull).toHaveBeenCalledTimes(1);
    });

    it('syncs after supplier name change', async () => {
      const expense = makeExpense({ journalEntryNumber: 10000001 });
      expenseRepo.findOne.mockResolvedValue(expense);
      expenseRepo.save.mockResolvedValue({ ...expense, supplier: 'New Supplier' } as any);
      bookkeepingService.updateJournalEntryFull.mockResolvedValue(true);

      await service.updateExpense(
        1,
        'firebase-uid-1',
        { supplier: 'New Supplier', taxSumRec: 100, vatSumRec: 17 } as any,
      );

      expect(bookkeepingService.updateJournalEntryFull).toHaveBeenCalledWith(
        10000001,
        expense.businessNumber,
        expect.objectContaining({ counterPartyName: 'New Supplier' }),
      );
    });

    it('syncs after vatPercent change (affects VAT line split)', async () => {
      const expense = makeExpense({ journalEntryNumber: 10000001, vatPercentSnapshot: 100 });
      expenseRepo.findOne.mockResolvedValue(expense);
      expenseRepo.save.mockResolvedValue({ ...expense, vatPercentSnapshot: 66 } as any);
      bookkeepingService.updateJournalEntryFull.mockResolvedValue(true);

      await service.updateExpense(
        1,
        'firebase-uid-1',
        { vatPercent: 66, taxSumRec: 100, vatSumRec: 17 } as any,
      );

      expect(bookkeepingService.updateJournalEntryFull).toHaveBeenCalledTimes(1);
    });

    it('throws NotFoundException when expense does not exist', async () => {
      expenseRepo.findOne.mockResolvedValue(null);
      await expect(
        service.updateExpense(999, 'firebase-uid-1', {} as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── buildExpenseJournalLines ───────────────────────────────────────────────

  describe('buildExpenseJournalLines', () => {
    function callBuild(expense: Expense) {
      return (service as any).buildExpenseJournalLines(expense);
    }

    it('splits into 3 lines when there is deductible VAT: expense (net) / VAT input (2410) / bank (1100, gross)', async () => {
      const expense = makeExpense({ sum: 100, totalVatPayable: 17.09, totalTaxPayable: 82.91 });
      const lines = await callBuild(expense);

      expect(lines).toHaveLength(3);
      expect(lines[0]).toEqual(
        expect.objectContaining({
          accountCode: '5100',
          debit: 82.91,
          amountBeforeVat: 82.91,
          vatAmount: 0,
          subCategoryName: 'דלק',
        }),
      );
      expect(lines[1]).toEqual(
        expect.objectContaining({ accountCode: '2410', debit: 17.09, vatAmount: 17.09, subCategoryName: null }),
      );
      expect(lines[2]).toEqual(
        expect.objectContaining({ accountCode: '1100', credit: 100, subCategoryName: null }),
      );
    });

    it('produces 2 lines (no VAT line) when totalVatPayable is 0', async () => {
      const expense = makeExpense({ sum: 100, totalVatPayable: 0, totalTaxPayable: 100 });
      const lines = await callBuild(expense);

      expect(lines).toHaveLength(2);
      expect(lines[0]).toEqual(expect.objectContaining({ accountCode: '5100', debit: 100, vatAmount: 0 }));
      expect(lines[1]).toEqual(expect.objectContaining({ accountCode: '1100', credit: 100 }));
    });

    it('rounds net = total - vatInput to 2 decimals', async () => {
      const expense = makeExpense({ sum: 100.005 as any, totalVatPayable: 17.001, totalTaxPayable: 83 });
      const lines = await callBuild(expense);
      // 100.005 - 17.001 = 83.004 → toFixed(2) → 83.00
      expect(lines[0].amountBeforeVat).toBeCloseTo(83.0, 2);
    });

    it('forwards isEquipment, taxPercent, vatPercent, amountForTax onto the expense line', async () => {
      const expense = makeExpense({
        sum: 100,
        totalVatPayable: 17.09,
        totalTaxPayable: 82.91,
        isEquipmentSnapshot: true,
        taxPercentSnapshot: 50,
        vatPercentSnapshot: 100,
      });
      const lines = await callBuild(expense);
      expect(lines[0]).toEqual(
        expect.objectContaining({ isEquipment: true, taxPercent: 50, vatPercent: 100, amountForTax: 82.91 }),
      );
    });
  });

  // ── createExpenseJournalEntry — error swallowing ───────────────────────────

  describe('createExpenseJournalEntry — error swallowing', () => {
    it('returns the entryNumber and persists journalEntryNumber on success', async () => {
      const expense = makeExpense();
      bookkeepingService.createJournalEntry.mockResolvedValueOnce({ entryNumber: 10000005, id: 42 });

      const result = await service.createExpenseJournalEntry(expense);

      expect(result).toBe(10000005);
      expect(expense.journalEntryNumber).toBe(10000005);
      expect(expenseRepo.update).toHaveBeenCalledWith(expense.id, { journalEntryNumber: 10000005 });
    });

    it('swallows the error and returns null when createJournalEntry rejects (does NOT throw)', async () => {
      const expense = makeExpense();
      bookkeepingService.createJournalEntry.mockRejectedValueOnce(new Error('account code not found'));
      const loggerWarnSpy = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => {});

      await expect(service.createExpenseJournalEntry(expense)).resolves.toBeNull();
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining(`failed for expense ${expense.id}`),
      );
      expect(expenseRepo.update).not.toHaveBeenCalled();
    });

    it('uses the manager-scoped repository when a manager is provided', async () => {
      const expense = makeExpense();
      bookkeepingService.createJournalEntry.mockResolvedValueOnce({ entryNumber: 10000006, id: 43 });
      const txExpenseRepo = makeRepo<Expense>();
      (mockManager.getRepository as jest.Mock).mockReturnValueOnce(txExpenseRepo);

      await service.createExpenseJournalEntry(expense, mockManager);

      expect(mockManager.getRepository).toHaveBeenCalled();
      expect(txExpenseRepo.update).toHaveBeenCalledWith(expense.id, { journalEntryNumber: 10000006 });
      expect(expenseRepo.update).not.toHaveBeenCalled();
    });
  });
});
