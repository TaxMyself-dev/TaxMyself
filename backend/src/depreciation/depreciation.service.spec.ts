import { AssetDepreciationPosting } from './asset-depreciation-posting.entity';
import { DepreciationService } from './depreciation.service';
import { Expense } from '../expenses/expenses.entity';
import { ExpenseApprovalStatus } from '../enum';

describe('DepreciationService', () => {
  it('uses a query-builder upsert with entity updates disabled before locking the posting', async () => {
    const expense = {
      id: 17,
      userId: 'user-1',
      businessNumber: '123456789',
      date: new Date('2025-01-01'),
      activationDate: new Date('2025-01-01'),
      sum: 1200,
      isEquipmentSnapshot: true,
      reductionPercentSnapshot: 33.33,
      accountCodeSnapshot: '61310',
      accountNameSnapshot: 'מחשבים',
      approvalStatus: ExpenseApprovalStatus.APPROVED,
      subCategory: 'ציוד מחשוב',
      supplier: 'ספק',
    } as Expense;
    const posting = {
      id: 44,
      expenseId: expense.id,
      taxYear: 2025,
      sourceAccountCode: expense.accountCodeSnapshot,
      journalEntryNumber: 91,
    } as AssetDepreciationPosting;

    const execute = jest.fn().mockResolvedValue({});
    const updateEntity = jest.fn().mockReturnValue({ execute });
    const orUpdate = jest.fn().mockReturnValue({ updateEntity });
    const values = jest.fn().mockReturnValue({ orUpdate });
    const into = jest.fn().mockReturnValue({ values });
    const insert = jest.fn().mockReturnValue({ into });
    const createQueryBuilder = jest.fn().mockReturnValue({ insert });
    const expenseRepo = {
      find: jest.fn().mockResolvedValue([expense]),
      update: jest.fn(),
    };
    const postingRepo = {
      createQueryBuilder,
      findOne: jest.fn().mockResolvedValue(posting),
      update: jest.fn(),
    };
    const manager = {
      getRepository: jest.fn((entity) => entity === Expense ? expenseRepo : postingRepo),
    };
    const dataSource = {
      transaction: jest.fn(async (run) => run(manager)),
    };
    const bookkeepingService = {
      updateJournalEntryFull: jest.fn().mockResolvedValue(true),
      createJournalEntry: jest.fn(),
    };
    const service = new DepreciationService(
      dataSource as any,
      bookkeepingService as any,
      {} as any,
      {} as any,
    );

    await service.ensureForReport(
      expense.userId,
      expense.businessNumber,
      new Date('2025-12-31T00:00:00.000Z'),
    );

    expect(createQueryBuilder).toHaveBeenCalledTimes(1);
    expect(into).toHaveBeenCalledWith(AssetDepreciationPosting);
    expect(orUpdate).toHaveBeenCalledWith(
      expect.arrayContaining(['amount', 'sourceAccountCode']),
      ['expenseId', 'taxYear'],
    );
    expect(updateEntity).toHaveBeenCalledWith(false);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(postingRepo.findOne).toHaveBeenCalledWith({
      where: { expenseId: expense.id, taxYear: 2025 },
      lock: { mode: 'pessimistic_write' },
    });
    expect(bookkeepingService.updateJournalEntryFull).toHaveBeenCalledWith(
      posting.journalEntryNumber,
      expense.businessNumber,
      expect.objectContaining({ referenceId: posting.id }),
      manager,
    );
    expect(bookkeepingService.createJournalEntry).not.toHaveBeenCalled();
  });
});
