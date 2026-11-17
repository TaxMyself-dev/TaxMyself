import { GmailSyncCronService } from './gmail-sync-cron.service';

describe('Gmail nightly synchronization opt-in', () => {
  const originalEmail = process.env.COMPOSIO_EMAIL_ENABLED;
  const originalNightly = process.env.GMAIL_NIGHTLY_SYNC_ENABLED;
  const integrations = { findGmailSyncCandidates: jest.fn() };
  const sync = { runIncrementalSync: jest.fn() };
  const service = new GmailSyncCronService(integrations as any, sync as any);

  beforeEach(() => { jest.clearAllMocks(); });
  afterEach(() => {
    for (const [key, value] of [['COMPOSIO_EMAIL_ENABLED', originalEmail], ['GMAIL_NIGHTLY_SYNC_ENABLED', originalNightly]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });

  it.each([undefined, 'false', 'TRUE', '1'])('does not query or sync when nightly opt-in is %s, even if email is enabled', async value => {
    process.env.COMPOSIO_EMAIL_ENABLED = 'true';
    if (value === undefined) delete process.env.GMAIL_NIGHTLY_SYNC_ENABLED;
    else process.env.GMAIL_NIGHTLY_SYNC_ENABLED = value;
    expect(await service.processEligibleSyncs()).toEqual({ eligible: 0, succeeded: 0, skipped: 0, errors: 0 });
    expect(integrations.findGmailSyncCandidates).not.toHaveBeenCalled();
    expect(sync.runIncrementalSync).not.toHaveBeenCalled();
  });

  it('keeps the global email kill switch effective even with nightly enabled', async () => {
    process.env.COMPOSIO_EMAIL_ENABLED = 'false';
    process.env.GMAIL_NIGHTLY_SYNC_ENABLED = 'true';
    await service.processEligibleSyncs();
    expect(integrations.findGmailSyncCandidates).not.toHaveBeenCalled();
    expect(sync.runIncrementalSync).not.toHaveBeenCalled();
  });

  it('runs the existing candidate flow only when both switches are enabled', async () => {
    process.env.COMPOSIO_EMAIL_ENABLED = 'true';
    process.env.GMAIL_NIGHTLY_SYNC_ENABLED = 'true';
    const candidates = [{ id: 17 }, { id: 18 }, { id: 19 }];
    integrations.findGmailSyncCandidates.mockResolvedValue(candidates);
    sync.runIncrementalSync.mockResolvedValueOnce({ outcome: 'success' }).mockResolvedValueOnce({ outcome: 'skipped' }).mockResolvedValueOnce({ outcome: 'error' });
    expect(await service.processEligibleSyncs()).toEqual({ eligible: 3, succeeded: 1, skipped: 1, errors: 1 });
    expect(sync.runIncrementalSync).toHaveBeenCalledTimes(3);
    for (const candidate of candidates) expect(sync.runIncrementalSync).toHaveBeenCalledWith(candidate);
  });
});
