import { FeezbackService } from './feezback.service';

describe('Disconnected sources are not transaction work', () => {
  afterEach(() => jest.restoreAllMocks());
  function fixture(rows: any[]) {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    const service: any = Object.create(FeezbackService.prototype);
    const sync = { getSourceResults: jest.fn().mockResolvedValue(rows),
      markSyncRunning: jest.fn().mockResolvedValue({ acquired: true, runId: 'new-run' }),
      markSyncSkipped: jest.fn(), markSyncFailed: jest.fn() };
    Object.assign(service, { userSyncStateService: sync,
      logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
      userRepository: { findOne: jest.fn().mockResolvedValue({ hasOpenBanking: true }) },
      billingService: { hasModuleAccess: jest.fn().mockResolvedValue(true) },
      withConnectedUserLock: async (_uid, action) => action(),
      markConnectedSyncFinished: jest.fn(), retrySource: jest.fn(async (_uid, _type, id) =>
        ({ ...rows.find(row => row.sourceId === id), status: 'success', transactionCount: 1 })),
    });
    return { service, sync };
  }
  const active = { type: 'bank', sourceId: '9581', sourceRecordId: 1, consentId: 'valid', resourceId: 'r', status: 'success' };
  const detached = { type: 'card', sourceId: '9081', sourceRecordId: 2, consentId: null, resourceId: null, status: 'failed' };

  it.each(['failed', 'not_synced'])('login excludes disconnected %s rows but retries linked sources', async status => {
    const pending = { ...active, status: 'failed' };
    const { service } = fixture([pending, { ...detached, status }]);
    const retry = jest.spyOn(service, 'retryFailedSources').mockResolvedValue(undefined);
    await service.doFullSync('owner', 'login', 'owner', { fullProcessStatus: 'completed' });
    expect(retry).toHaveBeenCalledWith('owner', [pending], 'owner');
  });
  it('does not retry or create a new error when only disconnected sources are pending', async () => {
    const { service, sync } = fixture([active, detached]);
    const retry = jest.spyOn(service, 'retryFailedSources').mockResolvedValue(undefined);
    await service.doFullSync('owner', 'login', 'owner', { fullProcessStatus: 'completed', fullResultStatus: 'success' });
    expect(retry).not.toHaveBeenCalled(); expect(service.retrySource).not.toHaveBeenCalled();
    expect(sync.markSyncSkipped).toHaveBeenCalled();
  });
  it('reproduces the reported false OB-03 and clears only its disconnected run outcomes', async () => {
    const { service } = fixture([{ ...active, resultRunId: 'older-good' }, { ...detached, resultRunId: 'bad-run' }]);
    await service.doFullSync('owner', 'login', 'owner', { fullProcessStatus: 'completed', fullResultStatus: 'partial_success',
      fullRunId: 'bad-run', fullFailureReason: 'OB-03|8fe5afdc-7143-4290-b881-0f438107f23e' }, 'new-run');
    expect(service.retrySource).not.toHaveBeenCalled();
    expect(service.markConnectedSyncFinished).toHaveBeenCalledWith('owner', 'completed', 'success', 0, undefined, 'new-run');
  });
  it.each(['OB-04|save-failure', 'OB-03|unattributed'])('does not erase unrelated or unproven failure %s', async reason => {
    const { service, sync } = fixture([active, detached]);
    await service.doFullSync('owner', 'login', 'owner', { fullProcessStatus: 'completed', fullResultStatus: 'partial_success',
      fullRunId: 'unknown-run', fullFailureReason: reason });
    expect(service.markConnectedSyncFinished).not.toHaveBeenCalled();
    expect(sync.markSyncSkipped).toHaveBeenCalledWith('owner', 'cache_exists', expect.objectContaining({ fullFailureReason: reason }));
  });
  it('retry batch omits disconnected failures from requests and aggregate error counts', async () => {
    const { service } = fixture([active, detached]);
    await service.retryFailedSources('owner', [{ ...active, status: 'failed' }, detached], 'owner');
    expect(service.retrySource).toHaveBeenCalledTimes(1);
    expect(service.retrySource.mock.calls[0][2]).toBe('9581');
    expect(service.markConnectedSyncFinished).toHaveBeenCalledWith('owner', 'completed', 'success', 0, undefined, 'new-run');
  });
  it('retains an active authorization failure rather than treating it as disconnected', async () => {
    const { service } = fixture([active, { ...detached, consentId: 'active-consent', resourceId: 'r', error: 'provider|403' }]);
    await service.retryFailedSources('owner', [], 'owner');
    expect(service.markConnectedSyncFinished).toHaveBeenCalledWith('owner', 'completed', 'partial_success', 0, expect.stringMatching(/^OB-03\|/), 'new-run');
  });
  it('ignores a source revoked while its selected retry was in flight', async () => {
    const selected = { ...detached, consentId: 'valid-at-selection', resourceId: 'r' };
    const { service } = fixture([active, selected]);
    service.retrySource.mockImplementation(async () => {
      selected.consentId = null; selected.resourceId = null;
      return { ...selected, status: 'failed' };
    });
    await service.retryFailedSources('owner', [selected], 'owner');
    expect(service.markConnectedSyncFinished).toHaveBeenCalledWith('owner', 'completed', 'success', 0, undefined, 'new-run');
  });
  it('does not conceal a missing resource under an existing consent', async () => {
    const { service } = fixture([]); delete service.retrySource;
    service.findSyncSource = jest.fn().mockResolvedValue({ ...detached, consentId: 'valid' });
    service.identityScope = { run: (_sub, action) => action() };
    service.pullRunScope = { getStore: () => undefined, run: (_run, action) => action() };
    service.retrySourceForIdentity = jest.fn().mockResolvedValue({ ...detached, error: 'missing resource', transactionCount: 0 });
    const result = await service.retrySource('owner', 'card', '9081', 2);
    expect(service.retrySourceForIdentity).toHaveBeenCalled();
    expect(result.status).toBe('failed'); expect(result.supportError.code).toBe('OB-03');
  });
  it('auto retry ignores disconnected entries without sleeping or calling a provider', async () => {
    const { service } = fixture([detached]); service.sleep = jest.fn();
    await service.autoRetryFailedSources('owner', [detached], 'owner');
    expect(service.sleep).not.toHaveBeenCalled(); expect(service.retrySource).not.toHaveBeenCalled();
  });
  for (const method of ['retrySource', 'pullOneSource']) {
    it.each(['bank', 'card'])(method + ' refuses disconnected %s before entering any provider path', async type => {
      const { service, sync } = fixture([]);
      delete service.retrySource;
      service.findSyncSource = jest.fn().mockResolvedValue({ ...detached, type });
      service.retrySourceForIdentity = jest.fn(); service.pullOneSourceForIdentity = jest.fn();
      const result = await service[method]('owner', type, '9081', 2);
      expect(result).toMatchObject({ status: 'not_synced', transactionCount: 0 });
      expect(result.error).toBeUndefined(); expect(result.supportError).toBeUndefined();
      expect(service.retrySourceForIdentity).not.toHaveBeenCalled(); expect(service.pullOneSourceForIdentity).not.toHaveBeenCalled();
      expect(sync.markSyncRunning).not.toHaveBeenCalled();
    });
  }
});
