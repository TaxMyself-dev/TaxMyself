import { NotFoundException } from '@nestjs/common';
import { ExpensesService } from './expenses.service';

describe('ExpensesService.getSourceDocumentForExpense', () => {
  function subject(expense: any, document: any) {
    const expenseRepo = {
      findOne: jest.fn().mockResolvedValue(expense),
    };
    const extractedDocRepo = {
      findOne: jest.fn().mockResolvedValue(document),
    };
    const fakeThis = { expense_repo: expenseRepo, extractedDocRepo };

    return {
      expenseRepo,
      extractedDocRepo,
      run: (expenseId = 17, userId = 'client-1') =>
        ExpensesService.prototype.getSourceDocumentForExpense.call(
          fakeThis as any,
          expenseId,
          userId,
        ),
    };
  }

  it('resolves the Drive source through the expense provenance link', async () => {
    const test = subject(
      {
        id: 17,
        userId: 'client-1',
        businessNumber: '123456789',
        sourceDocumentId: 42,
      },
      {
        id: 42,
        businessNumber: '123456789',
        driveFileId: 'drive-file-1',
        driveFileName: 'receipt.pdf',
      },
    );

    await expect(test.run()).resolves.toEqual({
      driveFileId: 'drive-file-1',
      driveFileName: 'receipt.pdf',
    });
    expect(test.expenseRepo.findOne).toHaveBeenCalledWith({
      where: { id: 17, userId: 'client-1' },
    });
    expect(test.extractedDocRepo.findOne).toHaveBeenCalledWith({
      where: { id: 42, businessNumber: '123456789' },
    });
  });

  it('does not expose a source document through an expense the caller does not own', async () => {
    const test = subject(null, null);

    await expect(test.run()).rejects.toBeInstanceOf(NotFoundException);
    expect(test.extractedDocRepo.findOne).not.toHaveBeenCalled();
  });

  it('reports a manual expense without source provenance as file-less', async () => {
    const test = subject(
      {
        id: 17,
        userId: 'client-1',
        businessNumber: '123456789',
        sourceDocumentId: null,
      },
      null,
    );

    await expect(test.run()).rejects.toBeInstanceOf(NotFoundException);
    expect(test.extractedDocRepo.findOne).not.toHaveBeenCalled();
  });
});
