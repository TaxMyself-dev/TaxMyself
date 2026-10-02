import { IsNull } from 'typeorm';
import { ArchiveItemStatus, ExpenseReportScope, RecordSource } from '../enum';
import { DocumentsService } from '../documents/documents.service';
import { Expense } from '../expenses/expenses.entity';
import { ReportReviewService } from '../reports/report-review.service';
import { SlimTransaction } from './slim-transaction.entity';
import { TransactionProcessingService } from './transaction-processing.service';

const CACHE_ROW = {
  externalTransactionId: 'tx-1',
  userId: 'owner-1',
  billId: 9,
  businessNumber: '515151515',
  merchantName: 'Fuel Station',
  transactionDate: new Date('2026-09-15'),
  amount: -120.5,
  currency: 'USD',
  ilsAmount: 452.25,
};

describe('pending classified transaction archive', () => {
  it('copies durable display fields into slim_transactions during manual classification', async () => {
    const upsertSlimTransactions = jest.fn().mockResolvedValue(undefined);
    const cacheRepo = {
      findOne: jest.fn().mockResolvedValue(CACHE_ROW),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const fakeThis = {
      cacheRepo,
      slimRepo: { findOne: jest.fn().mockResolvedValue(null) },
      resolveStampPeriod: jest.fn().mockResolvedValue('9-10/2026'),
      upsertSlimTransactions,
      slimArchiveSnapshot: (TransactionProcessingService.prototype as any).slimArchiveSnapshot,
    };

    await TransactionProcessingService.prototype.classifyManually.call(
      fakeThis as any,
      'owner-1',
      {
        externalTransactionId: 'tx-1',
        category: 'Vehicle',
        subCategory: 'Fuel',
        vatPercent: 66,
        taxPercent: 45,
        reductionPercent: 0,
        isEquipment: false,
        isRecognized: true,
        reportScope: ExpenseReportScope.PNL,
      },
    );

    expect(upsertSlimTransactions).toHaveBeenCalledWith([
      expect.objectContaining({
        merchantNameSnapshot: 'Fuel Station',
        transactionDateSnapshot: CACHE_ROW.transactionDate,
        amountSnapshot: -120.5,
        currencySnapshot: 'USD',
        ilsAmountSnapshot: 452.25,
        confirmed: false,
      }),
    ]);
  });

  it('projects unmatched recognized slim rows as pending TRANSACTION archive items', async () => {
    const queryBuilder: any = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    const slimRepo = {
      find: jest.fn().mockResolvedValue([{
        id: 71,
        externalTransactionId: 'tx-1',
        merchantNameSnapshot: 'Fuel Station',
        transactionDateSnapshot: new Date('2026-09-15'),
        amountSnapshot: -120.5,
        currencySnapshot: 'USD',
        ilsAmountSnapshot: 452.25,
        vatReportingDate: '9-10/2026',
        annualReportingYear: 2026,
        createdAt: new Date('2026-10-01'),
      }]),
    };
    const fakeThis = {
      userRepo: { findOne: jest.fn().mockResolvedValue({ index: 4 }) },
      businessRepo: { findOne: jest.fn().mockResolvedValue({ id: 5 }) },
      sharedService: { isRepresentedByAccountant: jest.fn().mockResolvedValue(false) },
      extractedDocRepo: { createQueryBuilder: jest.fn().mockReturnValue(queryBuilder) },
      expenseRepo: { find: jest.fn().mockResolvedValue([]) },
      slimTransactionRepo: slimRepo,
      assertBusinessOwnership: (DocumentsService.prototype as any).assertBusinessOwnership,
    };

    const result = await DocumentsService.prototype.getArchivedForUser.call(
      fakeThis as any,
      'owner-1',
      '515151515',
      false,
    );

    expect(slimRepo.find).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: 'owner-1',
        businessNumber: '515151515',
        isRecognized: true,
        confirmed: false,
        matchedDocumentId: IsNull(),
      }),
    }));
    expect(result).toEqual([
      expect.objectContaining({
        id: 71,
        itemType: 'TRANSACTION',
        name: 'Fuel Station',
        source: RecordSource.OPEN_BANKING,
        status: ArchiveItemStatus.PENDING,
        canResolve: true,
        amount: 452.25,
        originalAmount: 120.5,
        currency: 'USD',
      }),
    ]);

    fakeThis.sharedService.isRepresentedByAccountant.mockResolvedValue(true);
    const representedResult = await DocumentsService.prototype.getArchivedForUser.call(
      fakeThis as any,
      'owner-1',
      '515151515',
      false,
    );
    expect(representedResult[0]).toEqual(expect.objectContaining({
      itemType: 'TRANSACTION',
      canResolve: false,
      canManageExpenses: false,
    }));
  });

  it('approves from the durable slim snapshot after the full cache was cleared', async () => {
    const slim = {
      id: 71,
      externalTransactionId: 'tx-1',
      userId: 'owner-1',
      billId: 9,
      businessNumber: '515151515',
      confirmed: false,
      merchantNameSnapshot: 'Fuel Station',
      transactionDateSnapshot: new Date('2026-09-15'),
      amountSnapshot: -120.5,
      currencySnapshot: 'USD',
      ilsAmountSnapshot: 452.25,
    };
    const fakeThis = {
      slimRepo: { findOne: jest.fn().mockResolvedValue(slim) },
      cacheRepo: { findOne: jest.fn().mockResolvedValue(null) },
    };

    const pair = await (ReportReviewService.prototype as any).loadTxPair.call(
      fakeThis,
      'owner-1',
      '515151515',
      71,
      true,
    );

    expect(pair.cache).toEqual(expect.objectContaining({
      merchantName: 'Fuel Station',
      transactionDate: slim.transactionDateSnapshot,
      amount: -120.5,
      currency: 'USD',
      ilsAmount: 452.25,
    }));
  });

  it('preserves the slim reporting period when archive approval creates the expense', async () => {
    const slim = {
      id: 71,
      externalTransactionId: 'tx-1',
      category: 'Vehicle',
      subCategory: 'Fuel',
      vatPercent: 66,
      taxPercent: 45,
      reductionPercent: 0,
      vatReportingDate: '9-10/2026',
    };
    const cache = { ...CACHE_ROW, currency: 'ILS', ilsAmount: null };
    const expenseUpdate = jest.fn().mockResolvedValue({ affected: 1 });
    const slimUpdate = jest.fn().mockResolvedValue({ affected: 1 });
    const manager = {
      getRepository: jest.fn((entity) => {
        if (entity === Expense) return { update: expenseUpdate };
        if (entity === SlimTransaction) return { update: slimUpdate };
        throw new Error('Unexpected repository');
      }),
    };
    const fakeThis = {
      loadTxPair: jest.fn().mockResolvedValue({ slim, cache }),
      absIls: (ReportReviewService.prototype as any).absIls,
      dataSource: { transaction: jest.fn(async (run) => run(manager)) },
      expensesService: { addExpense: jest.fn().mockResolvedValue({ id: 88 }) },
      businessRepo: { findOne: jest.fn().mockResolvedValue({}) },
      sharedService: { buildReportPeriodLabel: jest.fn().mockReturnValue('11-12/2026') },
      logger: { log: jest.fn() },
    };

    await ReportReviewService.prototype.approveTxNoDoc.call(
      fakeThis as any,
      'owner-1',
      '515151515',
      71,
    );

    expect(expenseUpdate).toHaveBeenCalledWith(
      { id: 88 },
      { vatReportingDate: '9-10/2026' },
    );
    expect(slimUpdate).toHaveBeenCalledWith(
      { id: 71 },
      { confirmed: true, vatReportingDate: '9-10/2026' },
    );
  });
});
