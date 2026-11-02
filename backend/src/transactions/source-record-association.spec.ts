import { TransactionsService } from './transactions.service';
import { SourceType } from '../enum';
describe('bill association by permanent source', () => {
  function setup(rows: any[]) {
    const bill = { id: 7, userId: 'u', billName: 'Business', businessNumber: '123' };
    const sources = { find: jest.fn().mockResolvedValue(rows), save: jest.fn() };
    const cache = { update: jest.fn() };
    const service = new TransactionsService({} as any, {} as any, {} as any, {} as any,
      { findOne: jest.fn().mockResolvedValue(bill) } as any, sources as any, {} as any,
      {} as any, cache as any, {} as any, {} as any, {} as any);
    return { service, sources, cache };
  }
  it('backfills only the chosen source even when the spouse has the same number', async () => {
    const { service, sources, cache } = setup([{ id: 22, userId: 'u', sourceName: '1234', sourceType: SourceType.CREDIT_CARD, connectionRole: 'spouse' }]);
    await service.addSourceToBill(7, '1234', SourceType.CREDIT_CARD, 'u', 22);
    expect(sources.find).toHaveBeenCalledWith({ where: { userId: 'u', id: 22, sourceName: '1234' } });
    expect(cache.update).toHaveBeenCalledWith({ userId: 'u', sourceRecordId: 22 }, { billId: 7, billName: 'Business', businessNumber: '123' });
  });
  it('rejects ambiguous legacy requests without changing associations', async () => {
    const { service, sources, cache } = setup([{ id: 11 }, { id: 22 }]);
    await expect(service.addSourceToBill(7, '1234', SourceType.CREDIT_CARD, 'u')).rejects.toThrow('unique sourceRecordId');
    expect(sources.save).not.toHaveBeenCalled(); expect(cache.update).not.toHaveBeenCalled();
  });
});
