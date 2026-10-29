import { FeezbackCacheCleanupService, DisconnectionCacheProof } from './feezback-cache-cleanup.service';
import { FullTransactionCache } from '../transactions/full-transaction-cache.entity';
import { UserTransactionCacheState } from '../transactions/user-transaction-cache-state.entity';
import { UserSyncState } from '../transactions/user-sync-state.entity';
import { Source } from '../transactions/source.entity';
import { User } from '../users/user.entity';

describe('verified disconnection transient cache cleanup', () => {
  let service: FeezbackCacheCleanupService, dataSource: any, manager: any, db: any, durable: any;
  let proof: DisconnectionCacheProof, failAt: string | undefined, userExists: boolean;
  const copy = (value: any) => JSON.parse(JSON.stringify(value));
  const consent = (id: string, ids: Array<number | null>, status = 'valid'): any => ({ consentId: id,
    connectionRole: 'primary', status, sources: ids.map(sourceRecordId => ({ sourceRecordId, sourceName: 'masked', sourceType: 'BANK_ACCOUNT' })) });
  beforeEach(() => {
    failAt = undefined; userExists = true;
    durable = {
      sources: [11, 12, 13].map(id => ({ id, userId: 'owner', connectionRole: 'primary', sourceName: '1234567', billId: 500 + id }))
        .concat([{ id: 21, userId: 'owner', connectionRole: 'spouse', sourceName: '1234567', billId: 521 }, { id: 99, userId: 'other', connectionRole: 'primary', sourceName: '1234567', billId: 599 }]),
      slim: [{ userId: 'owner', externalTransactionId: 'confirmed', category: 'preserved', confirmed: true }],
      expenses: [{ id: 77, userId: 'owner', sum: 123 }], rules: [{ userId: 'owner', id: 9 }],
    };
    db = { user: { firebaseId: 'owner', hasOpenBanking: true, hasSpouseFeezbackIdentity: true, fName: 'retained' }, cache: [11, 12, 13, 21, null].map(sourceRecordId => ({ userId: 'owner', sourceRecordId, confirmed: true, expenseId: 77 }))
      .concat([{ userId: 'other', sourceRecordId: 11, confirmed: false, expenseId: null }]),
      freshness: [{ userId: 'owner' }, { userId: 'other' }],
      sync: { userId: 'owner', fullProcessStatus: 'completed', fullResultStatus: 'success', fullRowsWritten: 5,
        fullStartedAt: 'old', fullFinishedAt: 'old', lastSourcesRefreshAt: 'old', lastConsentInitiatedAt: 'pending' },
    };
    proof = { complete: true, errors: [], consents: [], sources: durable.sources.filter(s => s.userId === 'owner').map(source => ({
      sourceRecordId: source.id, connectionRole: source.connectionRole, consentId: 'old',
    })) };
    dataSource = { transaction: jest.fn(async operation => {
      const working = copy(db);
      const userRepo = { findOne: jest.fn().mockImplementation(async () => userExists ? working.user : null) };
      const sourceRepo = { find: jest.fn(async () => durable.sources.filter(source => source.userId === 'owner')) };
      manager = {
        getRepository: jest.fn(entity => { if (entity === User) return userRepo; if (entity === Source) return sourceRepo; throw Error('Unexpected repository'); }),
        delete: jest.fn(async (entity, criteria) => {
          if (entity === UserTransactionCacheState && failAt === 'freshness') throw Error('freshness failed');
          const key = entity === FullTransactionCache ? 'cache' : entity === UserTransactionCacheState ? 'freshness' : null;
          if (!key) throw Error('Attempted durable delete');
          const before = working[key].length;
          working[key] = working[key].filter(row => !(row.userId === criteria.userId &&
            (!criteria.sourceRecordId || criteria.sourceRecordId.value.includes(row.sourceRecordId))));
          return { affected: before - working[key].length };
        }),
        update: jest.fn(async (entity, criteria, patch) => {
          if (entity === User && criteria.firebaseId === 'owner') { Object.assign(working.user, patch); return; }
          if (entity !== UserSyncState || criteria.userId !== 'owner') throw Error('Attempted durable update');
          if (failAt === 'sync') throw Error('sync failed');
          Object.assign(working.sync, patch);
        }),
        userRepo,
      };
      const result = await operation(manager);
      db = working; // Commit; a rejection leaves all tables unchanged.
      return result;
    }) };
    service = new FeezbackCacheCleanupService(dataSource);
  });
  it('clears only full tenant transient cache including null/orphans, preserving expenses, slim, rules and source links', async () => {
    const retained = copy(durable);
    await expect(service.cleanup('owner', proof)).resolves.toEqual({ deleted: 5, full: true });
    expect(db.cache).toEqual([{ userId: 'other', sourceRecordId: 11, confirmed: false, expenseId: null }]);
    expect(db.freshness).toEqual([{ userId: 'other' }]);
    expect(db.sync).toMatchObject({ fullProcessStatus: 'empty', fullResultStatus: 'none', fullRowsWritten: 0,
      fullStartedAt: null, fullFinishedAt: null, lastSourcesRefreshAt: null, lastConsentInitiatedAt: 'pending' });
    expect(durable).toEqual(retained);
    expect(db.user).toEqual({ firebaseId: 'owner', hasOpenBanking: false, hasSpouseFeezbackIdentity: true, fName: 'retained' });
    expect(manager.update).toHaveBeenCalledWith(User, { firebaseId: 'owner' }, { hasOpenBanking: false });
    expect(manager.update.mock.invocationCallOrder[0]).toBeLessThan(manager.delete.mock.invocationCallOrder[0]);
    expect(manager.userRepo.findOne).toHaveBeenCalledWith({ where: { firebaseId: 'owner' }, lock: { mode: 'pessimistic_write' } });
    expect(manager.userRepo.findOne.mock.invocationCallOrder[0]).toBeLessThan(manager.delete.mock.invocationCallOrder[0]);
    expect(manager.delete.mock.calls.map(call => call[0])).toEqual([FullTransactionCache, UserTransactionCacheState]);
  });
  it('removes only confirmed primary sources when spouse reads are uncertain, leaving orphan and spouse cache', async () => {
    proof.complete = false; proof.errors = [{ connectionRole: 'spouse', code: 'consents_unavailable' }];
    expect(durable.sources.find(source => source.id === 11).sourceName).toBe(durable.sources.find(source => source.id === 21).sourceName);
    await expect(service.cleanup('owner', proof)).resolves.toEqual({ deleted: 3, full: false });
    expect(db.cache.filter(row => row.userId === 'owner').map(row => row.sourceRecordId)).toEqual([21, null]);
    expect(manager.update).not.toHaveBeenCalled();
    expect(db.sync.fullProcessStatus).toBe('completed');
  });
  it.each(['valid', 'received', 'suspendedByASPSP', 'futureStatus'])('protects a shared source covered by any remaining %s permission', async status => {
    proof.complete = false; proof.errors = [{ connectionRole: 'spouse', code: 'consents_unavailable' }];
    proof.consents = [consent('remaining', [11], status)];
    proof.sources.find(source => source.sourceRecordId === 13)!.consentId = null;
    await expect(service.cleanup('owner', proof)).resolves.toEqual({ deleted: 1, full: false });
    expect(db.cache.some(row => row.userId === 'owner' && row.sourceRecordId === 11)).toBe(true);
    expect(db.cache.some(row => row.userId === 'owner' && row.sourceRecordId === 12)).toBe(false);
    expect(db.cache.some(row => row.userId === 'owner' && row.sourceRecordId === 13)).toBe(true);
  });
  it.each([{ ids: [] }, { ids: [null] }])('preserves a role with unresolved remaining permission mapping $ids', async ({ ids }) => {
    proof.complete = false; proof.errors = [{ connectionRole: 'spouse', code: 'cards_unavailable' }];
    proof.consents = [consent('pending', ids, 'received')];
    const before = copy(db);
    await expect(service.cleanup('owner', proof)).resolves.toEqual({ deleted: 0, full: false });
    expect(db).toEqual(before); expect(dataSource.transaction).not.toHaveBeenCalled();
  });
  it('never deletes a source whose recorded permission still remains even if listing has another instrument', async () => {
    proof.complete = false; proof.errors = [{ connectionRole: 'spouse', code: 'cards_unavailable' }];
    proof.consents = [consent('old', [11])];
    await expect(service.cleanup('owner', proof)).resolves.toEqual({ deleted: 0, full: false });
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });
  it('checks actual tenant ownership and role before source-scoped deletion', async () => {
    proof.complete = false; proof.errors = [{ connectionRole: 'spouse', code: 'cards_unavailable' }];
    proof.sources = [{ sourceRecordId: 99, connectionRole: 'primary', consentId: 'gone' },
      { sourceRecordId: 21, connectionRole: 'primary', consentId: 'gone' }];
    await expect(service.cleanup('owner', proof)).resolves.toEqual({ deleted: 0, full: false });
    expect(manager.delete).not.toHaveBeenCalled();
  });
  it.each(['freshness', 'sync'])('rolls back cache and freshness together when %s fails', async stage => {
    failAt = stage;
    const before = copy(db), retained = copy(durable);
    await expect(service.cleanup('owner', proof)).rejects.toThrow('failed');
    expect(db).toEqual(before); expect(durable).toEqual(retained);
  });
  it('does not delete anything if the locked tenant no longer exists', async () => {
    userExists = false;
    await expect(service.cleanup('owner', proof)).rejects.toThrow('User not found');
    expect(manager.delete).not.toHaveBeenCalled();
  });
});
