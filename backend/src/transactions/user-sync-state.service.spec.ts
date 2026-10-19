import { SourceType } from '../enum';
import { UserSyncStateService } from './user-sync-state.service';

/**
 * Focused tests for the skipped_direct (Direct/Debit card) handling in
 * user_source_sync_state: discovery must pin direct cards to the terminal
 * 'skipped_direct' status, and consent/cache resets must never flip them back
 * into a retryable-looking state.
 */
describe('UserSyncStateService — skipped_direct handling', () => {
  const USER = 'user-1';

  function makeService() {
    const repo = {
      findOne: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      upsert: jest.fn().mockResolvedValue(undefined),
      insert: jest.fn().mockResolvedValue(undefined),
    };
    const sourceRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      save: jest.fn().mockImplementation(async (x: any) => x),
      create: jest.fn().mockImplementation((x: any) => x),
      upsert: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const accountSourceRepo = { findOne: jest.fn().mockImplementation(async ({ where }) => ({ id: 11, ...where })) };
    const service = new UserSyncStateService(repo as any, sourceRepo as any, accountSourceRepo as any);
    return { service, repo, sourceRepo };
  }

  describe('upsertSourceConsents', () => {
    it('creates a NEW direct card with status skipped_direct (never not_synced)', async () => {
      const { service, sourceRepo } = makeService();
      sourceRepo.findOne.mockResolvedValue(null);

      await service.upsertSourceConsents(USER, [
        { type: 'card', sourceId: '3221', resourceId: 'card-1', consentId: 'c1', isDirect: true },
      ]);

      expect(sourceRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ sourceId: '3221', status: 'skipped_direct' }),
      );
    });

    it('creates a NEW credit card with status not_synced', async () => {
      const { service, sourceRepo } = makeService();
      sourceRepo.findOne.mockResolvedValue(null);

      await service.upsertSourceConsents(USER, [
        { type: 'card', sourceId: '9999', resourceId: 'card-2', consentId: 'c1', isDirect: false },
      ]);

      expect(sourceRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ sourceId: '9999', status: 'not_synced' }),
      );
    });

    it('pins an EXISTING row to skipped_direct when the card is determined direct', async () => {
      const { service, sourceRepo } = makeService();
      sourceRepo.findOne.mockResolvedValue({
        userId: USER, sourceId: '3221', type: 'card', status: 'not_synced', consentId: 'old', resourceId: 'card-1',
      });

      await service.upsertSourceConsents(USER, [
        { type: 'card', sourceId: '3221', resourceId: 'card-1', consentId: 'c-new', isDirect: true },
      ]);

      expect(sourceRepo.update).toHaveBeenCalledWith(
        { userId: USER, sourceRecordId: 11 },
        expect.objectContaining({ status: 'skipped_direct', transactionCount: 0, error: null }),
      );
    });

    it('flips a previously skipped_direct row back to not_synced when balances appear (credit)', async () => {
      const { service, sourceRepo } = makeService();
      sourceRepo.findOne.mockResolvedValue({
        userId: USER, sourceId: '3221', type: 'card', status: 'skipped_direct', consentId: 'c1', resourceId: 'card-1',
      });

      await service.upsertSourceConsents(USER, [
        { type: 'card', sourceId: '3221', resourceId: 'card-1', consentId: 'c1', isDirect: false },
      ]);

      expect(sourceRepo.update).toHaveBeenCalledWith(
        { userId: USER, sourceRecordId: 11 },
        expect.objectContaining({ status: 'not_synced' }),
      );
    });

    it('leaves the status of an EXISTING row untouched when isDirect is not provided (bank / no determination)', async () => {
      const { service, sourceRepo } = makeService();
      sourceRepo.findOne.mockResolvedValue({
        userId: USER, sourceId: '1234567', type: 'bank', status: 'success', consentId: 'c1', resourceId: 'acc-1',
      });

      await service.upsertSourceConsents(USER, [
        { type: 'bank', sourceId: '1234567', resourceId: 'acc-1', consentId: 'c-new' },
      ]);

      const patch = sourceRepo.update.mock.calls[0][1];
      expect(patch).not.toHaveProperty('status');
    });
  });

  describe('clearConsentOnSources', () => {
    it('resets non-direct rows to not_synced but only nulls consentId on skipped_direct rows', async () => {
      const { service, sourceRepo } = makeService();
      sourceRepo.update
        .mockResolvedValueOnce({ affected: 2 })
        .mockResolvedValueOnce({ affected: 1 });

      const cleared = await service.clearConsentOnSources(USER, 'c1');

      expect(cleared).toBe(3);
      expect(sourceRepo.update).toHaveBeenCalledTimes(2);
      expect(sourceRepo.update.mock.calls[0][1]).toEqual({
        consentId: null, status: 'not_synced', error: null,
      });
      expect(sourceRepo.update.mock.calls[1][0]).toEqual(
        expect.objectContaining({ status: 'skipped_direct' }),
      );
      expect(sourceRepo.update.mock.calls[1][1]).toEqual({ consentId: null });
    });
  });

  describe('markSyncEmpty', () => {
    it('does not reset skipped_direct rows to not_synced', async () => {
      const { service, sourceRepo } = makeService();

      await service.markSyncEmpty(USER);

      const [criteria, patch] = sourceRepo.update.mock.calls[0];
      expect(patch).toEqual({ status: 'not_synced', transactionCount: 0, error: null });
      expect(JSON.stringify(criteria)).toContain('skipped_direct');
    });
  });
});

describe('UserSyncStateService terminal state cleanup', () => {
  function makeService() {
    const repo = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      findOne: jest.fn().mockResolvedValue({ fullProcessStatus: 'empty' }),
      upsert: jest.fn().mockResolvedValue(undefined),
    };
    return {
      repo,
      service: new UserSyncStateService(repo as any, {} as any, {} as any),
    };
  }

  it('clears stale failure and skip fields after a successful sync', async () => {
    const { service, repo } = makeService();
    await service.markSyncFinished('user-1', 'completed', 'success', 42);

    expect(repo.update).toHaveBeenCalledWith(
      { userId: 'user-1' },
      expect.objectContaining({
        fullProcessStatus: 'completed',
        fullResultStatus: 'success',
        fullRowsWritten: 42,
        fullSkipReason: null,
        fullFailureReason: null,
      }),
    );
  });

  it('promotes a persisted partial admin pull while retaining its current warning', async () => {
    const { service, repo } = makeService();
    await service.markCacheReadyAfterSourcePull(
      'user-1', 'partial_success', 17, 'card:0447 unavailable',
    );

    expect(repo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        fullProcessStatus: 'completed',
        fullResultStatus: 'partial_success',
        fullRowsWritten: 17,
        fullSkipReason: null,
        fullFailureReason: 'card:0447 unavailable',
      }),
      ['userId'],
    );
  });
  it('scopes terminal consent cleanup to the selected identity', async () => {
    const USER = 'user-1';
    const sourceRepo = { update: jest.fn().mockResolvedValue({ affected: 1 }) };
    const accountSourceRepo = { find: jest.fn().mockImplementation(async ({ where }) => [{ id: where.connectionRole === 'spouse' ? 22 : 11 }]) };
    const service = new UserSyncStateService({} as any, sourceRepo as any, accountSourceRepo as any);
    await service.clearConsentOnSources(USER, 'consent', true);
    const spouseWhere = sourceRepo.update.mock.calls[0][0];
    expect(spouseWhere.sourceRecordId.type).toBe('in');
    expect(spouseWhere.sourceRecordId.value).toEqual([22]);
    sourceRepo.update.mockClear();
    await service.clearConsentOnSources(USER, 'consent', false);
    expect(sourceRepo.update.mock.calls[0][0].sourceRecordId.value).toEqual([11]);
  });

});

describe('permanent source identity', () => {
  it('keeps identical account numbers separate by role and source PK', async () => {
    const sourceRepo = { findOne: jest.fn().mockResolvedValue(null), create: jest.fn(x => x), save: jest.fn() };
    const accounts = { findOne: jest.fn(async ({ where }) => ({ ...where, id: where.connectionRole === 'spouse' ? 22 : 11 })) };
    const service = new UserSyncStateService({} as any, sourceRepo as any, accounts as any);
    await service.upsertSourceConsents('u', [
      { type: 'card', sourceId: '1234', connectionRole: 'primary', consentId: 'p', resourceId: 'p' },
      { type: 'card', sourceId: '1234', connectionRole: 'spouse', consentId: 's', resourceId: 's' },
    ]);
    expect(sourceRepo.save.mock.calls.map(([row]) => [row.sourceId, row.sourceRecordId, row.consentId])).toEqual([['1234',11,'p'],['1234',22,'s']]);
  });
  it('rejects a source owned by another user before writing sync state', async () => {
    const sync = { findOne: jest.fn(), upsert: jest.fn() };
    const accounts = { findOne: jest.fn().mockResolvedValue({ id: 22, userId: 'other', sourceName: '1234', sourceType: SourceType.CREDIT_CARD, connectionRole: 'spouse' }) };
    const service = new UserSyncStateService({} as any, sync as any, accounts as any);
    await expect(service.upsertSourceConsents('u', [{ type: 'card', sourceId: '1234', sourceRecordId: 22 }])).rejects.toThrow();
    expect(accounts.findOne).toHaveBeenCalledWith({ where: { id: 22, userId: 'u' } });
    expect(sync.findOne).not.toHaveBeenCalled();
  });
});

describe('simulated source foreign keys', () => {
  it('creates the permanent source before recording simulated discovery', async () => {
    const accounts = { upsert: jest.fn() };
    const service = new UserSyncStateService({} as any, {} as any, accounts as any);
    const update = jest.spyOn(service, 'updateSourceResults').mockResolvedValue(undefined);
    const incoming: any[] = [{ type: 'card', sourceId: '1234', status: 'success', transactionCount: 0 }];
    await service.updateSimulatedSourceResults('u', incoming);
    expect(accounts.upsert).toHaveBeenCalledWith([{ userId: 'u', sourceName: '1234', sourceType: SourceType.CREDIT_CARD, connectionRole: 'primary' }], ['userId','sourceType','sourceName','connectionRole']);
    expect(accounts.upsert.mock.invocationCallOrder[0]).toBeLessThan(update.mock.invocationCallOrder[0]);
    expect(update).toHaveBeenCalledWith('u', incoming);
  });
});
