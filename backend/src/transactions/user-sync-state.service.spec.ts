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
    const service = new UserSyncStateService(repo as any, sourceRepo as any);
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
        { userId: USER, sourceId: '3221' },
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
        { userId: USER, sourceId: '3221' },
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
      // First call: retryable reset for everything except skipped_direct.
      expect(sourceRepo.update.mock.calls[0][1]).toEqual({
        consentId: null, status: 'not_synced', error: null,
      });
      // Second call: skipped_direct rows keep their terminal status.
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
      // Criteria must exclude skipped_direct (TypeORM Not() operator).
      expect(JSON.stringify(criteria)).toContain('skipped_direct');
    });
  });
});
