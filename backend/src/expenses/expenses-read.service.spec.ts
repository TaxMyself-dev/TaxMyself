import { NotFoundException } from '@nestjs/common';
import { Expense } from './expenses.entity';
import { ExpensesService } from './expenses.service';

describe('ExpensesService read paths', () => {
  const makeService = (expenseRepo: Record<string, jest.Mock>) => new ExpensesService(
    {} as any,
    expenseRepo as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  it('does not truncate a document-date listing when pagination is omitted', async () => {
    const find = jest.fn().mockResolvedValue([]);
    const service = makeService({ find });

    await service.getExpensesByUserID(
      'user-1',
      new Date('2025-01-01T00:00:00.000Z'),
      new Date('2025-12-31T23:59:59.999Z'),
      '123456789',
    );

    expect(find).toHaveBeenCalledWith(expect.objectContaining({
      order: { date: 'DESC' },
    }));
    expect(find.mock.calls[0][0]).not.toHaveProperty('take');
    expect(find.mock.calls[0][0]).not.toHaveProperty('skip');
  });

  it('returns an asset only when it belongs to the effective user', async () => {
    const expense = { id: 42, userId: 'user-1' } as Expense;
    const findOne = jest.fn().mockResolvedValue(expense);
    const service = makeService({ findOne });

    await expect(service.getExpenseByIdForUser(42, 'user-1', '123456789')).resolves.toBe(expense);
    expect(findOne).toHaveBeenCalledWith({
      where: { id: 42, userId: 'user-1', businessNumber: '123456789' },
    });
  });

  it('does not expose an asset outside the effective user scope', async () => {
    const service = makeService({ findOne: jest.fn().mockResolvedValue(null) });

    await expect(service.getExpenseByIdForUser(42, 'user-2', '987654321'))
      .rejects.toBeInstanceOf(NotFoundException);
  });
});
