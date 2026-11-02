import { TransactionsService } from './transactions.service';
import { Source } from './source.entity';
import { UserSourceSyncState } from './user-source-sync-state.entity';
import { FullTransactionCache } from './full-transaction-cache.entity';
describe('disconnected payment source deletion', () => {
  function setup(source: any = { id: 22, userId: 'u' }, consentId: string | null = null) {
    const manager = { findOne: jest.fn().mockResolvedValueOnce(source).mockResolvedValueOnce({ consentId }), update: jest.fn().mockResolvedValue({ affected: 2 }), delete: jest.fn().mockResolvedValue({ affected: 1 }) };
    const transaction = jest.fn().mockImplementation(fn => fn(manager));
    const service = new TransactionsService({} as any, {} as any, {} as any, {} as any, {} as any, { manager: { transaction } } as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    return { service, manager, transaction };
  }
  it('locks the exact owned source and removes metadata while retaining cached history', async () => {
    const { service, manager, transaction } = setup();
    await expect(service.deleteDisconnectedSource('u', 22)).resolves.toEqual({ deleted: true });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(manager.findOne).toHaveBeenNthCalledWith(1, Source, { where: { userId: 'u', id: 22 }, lock: { mode: 'pessimistic_write' } });
    expect(manager.findOne).toHaveBeenNthCalledWith(2, UserSourceSyncState, { where: { userId: 'u', sourceRecordId: 22 }, lock: { mode: 'pessimistic_write' } });
    expect(manager.update).toHaveBeenCalledWith(FullTransactionCache, { userId: 'u', sourceRecordId: 22 }, { sourceRecordId: null });
    expect(manager.delete.mock.calls).toEqual([[UserSourceSyncState, { userId: 'u', sourceRecordId: 22 }], [Source, { userId: 'u', id: 22 }]]);
  });
  it('rejects active consent including Direct cards without writes', async () => {
    const { service, manager } = setup({ id: 22, isDirect: true }, 'active');
    await expect(service.deleteDisconnectedSource('u', 22)).rejects.toMatchObject({ response: expect.objectContaining({ code: 'SOURCE_HAS_ACTIVE_CONSENT' }) });
    expect(manager.delete).not.toHaveBeenCalled(); expect(manager.update).not.toHaveBeenCalled();
  });
  it('rejects missing or foreign sources without writes', async () => {
    const { service, manager } = setup(null);
    await expect(service.deleteDisconnectedSource('u', 22)).rejects.toThrow('Payment source not found'); expect(manager.delete).not.toHaveBeenCalled();
  });
  it('rejects unauthenticated service calls', async () => {
    const { service, transaction } = setup(); await expect(service.deleteDisconnectedSource(undefined, 22)).rejects.toThrow(); expect(transaction).not.toHaveBeenCalled();
  });
  it('propagates write failure through the transaction and stops deleting', async () => {
    const { service, manager } = setup(); manager.update.mockRejectedValueOnce(new Error('database failure'));
    await expect(service.deleteDisconnectedSource('u', 22)).rejects.toThrow('database failure'); expect(manager.delete).not.toHaveBeenCalled();
  });
  it('lists sources without sync state', async () => {
    const { service } = setup();
    (service as any).sourceRepo.find = jest.fn().mockResolvedValue([{ id: 22, sourceName: '1234', connectionRole: 'spouse' }]);
    (service as any).userSourceSyncStateRepo.find = jest.fn().mockResolvedValue([]);
    expect(await service.getSourcesWithTypes('u')).toEqual([expect.objectContaining({ sourceRecordId: 22, hasConsent: false, connectionRole: 'spouse' })]);
  });
});
