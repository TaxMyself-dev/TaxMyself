import { TransactionProcessingService } from './transaction-processing.service';
import { FullTransactionCache } from './full-transaction-cache.entity';
import { UserTransactionCacheState } from './user-transaction-cache-state.entity';
import { UserSyncState } from './user-sync-state.entity';
import { User } from '../users/user.entity';
import { ClassificationType } from './enums/classification-type.enum';
import { ExpenseReportScope } from '../enum';

const uid = 'owner';
function builder() {
  const qb: any = {};
  for (const name of ['select', 'addSelect', 'where', 'andWhere', 'insert', 'into', 'values', 'orUpdate', 'orIgnore', 'updateEntity', 'update', 'set']) qb[name] = jest.fn().mockReturnValue(qb);
  qb.getCount = jest.fn().mockResolvedValue(0);
  qb.execute = jest.fn().mockResolvedValue({ affected: 1 });
  return qb;
}

describe('disconnected open banking keeps durable classifications', () => {
  it.each([false, true])('rebuilds an empty cache from retained one-time classification (confirmed=%s) and mapped permanent source', async confirmed => {
    const slim: any = { id: 9, userId: uid, externalTransactionId: 'stable-provider-tx', billId: 10,
      classificationType: ClassificationType.ONE_TIME, category: 'Chosen category', subCategory: 'Chosen subcategory',
      vatPercent: 66, taxPercent: 45, reductionPercent: 0, isEquipment: false, isRecognized: true,
      reportScope: ExpenseReportScope.PNL, confirmed, vatReportingDate: '9-10/2026', businessNumber: 'business-override',
      isLocked: confirmed, merchantNameSnapshot: 'Merchant', transactionDateSnapshot: new Date('2026-10-01'), amountSnapshot: -100 };
    const before = { ...slim };
    const query = builder();
    const slimRepo: any = { find: jest.fn().mockResolvedValue([slim]), update: jest.fn(), createQueryBuilder: jest.fn() };
    const cache: any = { find: jest.fn().mockResolvedValue([]), createQueryBuilder: jest.fn().mockReturnValue(query) };
    const rules: any = { find: jest.fn().mockResolvedValue([{ id: 5, merchantName: 'Merchant', category: 'Must not overwrite' }]) };
    const sourceRepo: any = { find: jest.fn().mockResolvedValue([
      { id: 7, sourceName: '1234', bill: { id: 10, billName: 'Preserved account', businessNumber: 'default-business' } },
      { id: 8, sourceName: '1234', bill: { id: 11, billName: 'Spouse account', businessNumber: 'other-business' } },
    ]) };
    const expenseRepo: any = { delete: jest.fn(), save: jest.fn(), update: jest.fn() };
    const processor = new TransactionProcessingService(slimRepo, cache, { upsert: jest.fn() } as any,
      rules, sourceRepo, {} as any, {} as any, expenseRepo, {} as any, {} as any, {} as any, {} as any, {} as any);
    const matchRule = jest.spyOn(processor as any, 'matchRule');
    const result = await processor.process(uid, [{ externalTransactionId: 'stable-provider-tx', paymentIdentifier: '1234', sourceRecordId: 7,
      merchantName: 'Merchant', amount: -100, currency: 'ILS', transactionDate: new Date('2026-10-01'),
      paymentDate: new Date('2026-10-01'), billId: null, billName: null, businessNumber: null } as any]);
    const cacheRows = query.values.mock.calls[0][0];
    expect(cacheRows).toEqual([expect.objectContaining({ sourceRecordId: 7, billId: 10, billName: 'Preserved account',
      category: slim.category, subCategory: slim.subCategory, vatPercent: 66, taxPercent: 45, confirmed,
      vatReportingDate: slim.vatReportingDate, businessNumber: 'business-override', classificationType: ClassificationType.ONE_TIME })]);
    expect(slim).toEqual(before);
    expect(matchRule).not.toHaveBeenCalled();
    expect(slimRepo.createQueryBuilder).not.toHaveBeenCalled();
    expect(slimRepo.update).not.toHaveBeenCalled();
    expect(expenseRepo.delete).not.toHaveBeenCalled();
    expect(expenseRepo.update).not.toHaveBeenCalled();
    expect(result.savedToSlim).toBe(0);
    expect(result.ruleMatched).toBe(0);
  });

  it('nightly cleanup deletes transient cache tables only, preserving source/rule/slim/expense data', async () => {
    const query = builder();
    const manager = {
      createQueryBuilder: jest.fn((entity: any) => {
        const qb = builder();
        qb.getRawMany = jest.fn().mockResolvedValue(entity === UserSyncState ? [{ userId: uid }] : [{ firebaseId: uid, email: 'ordinary@example.test' }]);
        return entity === undefined ? query : qb;
      }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const processor = new TransactionProcessingService({} as any, {} as any, {} as any, {} as any,
      {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
      { transaction: jest.fn(async action => action(manager)) } as any, {} as any);
    await processor.handleDailyCacheCleanup();
    expect(manager.createQueryBuilder).toHaveBeenCalledWith(UserSyncState, 'uss');
    expect(manager.createQueryBuilder).toHaveBeenCalledWith(User, 'u');
    expect(manager.delete.mock.calls.map(call => call[0])).toEqual([FullTransactionCache, UserTransactionCacheState]);
    expect(query.set).toHaveBeenCalledWith(expect.objectContaining({ fullProcessStatus: 'empty', fullRowsWritten: 0 }));
  });
});
