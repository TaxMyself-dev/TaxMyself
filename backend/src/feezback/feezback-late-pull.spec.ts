import { FeezbackService } from './feezback.service';
import { connectionOperation } from './consent/connection-operation';

describe('Feezback late-pull persistence boundary', () => {
  let service: any, user: any, processing: any, sync: any, lock: any;
  beforeEach(() => {
    user = { hasOpenBanking: true };
    processing = { process: jest.fn(async (_uid, transactions) => ({ newlySavedToCache: transactions.length })) };
    sync = {
      getSourceResults: jest.fn().mockResolvedValue([{ sourceRecordId: 11, consentId: 'c1' }, { sourceRecordId: 12, consentId: 'c2' }]),
      markCacheReadyAfterSourcePull: jest.fn().mockResolvedValue(undefined),
      markSyncFinished: jest.fn().mockResolvedValue(undefined),
    };
    lock = jest.fn(async () => user);
    service = Object.create(FeezbackService.prototype);
    Object.assign(service, { processingService: processing, userSyncStateService: sync,
      sourceRepository: { find: jest.fn().mockResolvedValue([{ id: 11 }, { id: 12 }]),
        manager: { transaction: jest.fn(async callback => callback({ getRepository: () => ({ findOne: lock }) })) } },
      notifyProviderDuplicates: jest.fn().mockResolvedValue(undefined),
    });
  });

  it('rejects a late batch and completion after full disconnect, even with stale pointers', async () => {
    let release!: () => void;
    let entered!: () => void;
    const ready = new Promise<void>(resolve => entered = resolve);
    const barrier = new Promise<void>(resolve => release = resolve);
    const cleanup = connectionOperation('owner', async () => { entered(); await barrier; user.hasOpenBanking = false; });
    await ready;
    const late = service.persistNormalizedTransactions('owner', [{ sourceRecordId: 11 }]);
    const finish = service.markConnectedSyncFinished('owner', 'completed', 'success', 1);
    const promote = service.markConnectedCacheReady('owner');
    release();
    await Promise.all([cleanup, late, finish, promote]);
    expect(processing.process).toHaveBeenCalledWith('owner', []);
    expect(sync.markSyncFinished).not.toHaveBeenCalled();
    expect(sync.markCacheReadyAfterSourcePull).not.toHaveBeenCalled();
    expect(lock).toHaveBeenCalledWith(expect.objectContaining({ lock: { mode: 'pessimistic_write' } }));
  });

  it('drops cleared, unowned and ambiguous legacy sources while allowing unrelated active sources', async () => {
    sync.getSourceResults.mockResolvedValue([{ sourceRecordId: 11, consentId: null }, { sourceRecordId: 12, consentId: 'c2' }, { sourceRecordId: 99, consentId: 'foreign' }]);
    await service.persistNormalizedTransactions('owner', [{ sourceRecordId: 11 }, { sourceRecordId: 12 }, { sourceRecordId: 99 }, { paymentIdentifier: '1234' }]);
    expect(processing.process).toHaveBeenCalledWith('owner', [{ sourceRecordId: 12 }]);
  });

  it('allows reconnected retained source IDs through the normal classification pipeline', async () => {
    user.hasOpenBanking = false;
    await service.persistNormalizedTransactions('owner', [{ sourceRecordId: 11 }]);
    user.hasOpenBanking = true;
    sync.getSourceResults.mockResolvedValue([{ sourceRecordId: 11, consentId: 'new-consent' }]);
    const transaction = { sourceRecordId: 11, externalTransactionId: 'original-id' };
    await service.persistNormalizedTransactions('owner', [transaction]);
    expect(processing.process).toHaveBeenLastCalledWith('owner', [transaction]);
  });
});
