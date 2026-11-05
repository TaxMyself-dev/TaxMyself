import { AsyncLocalStorage } from 'node:async_hooks';
import { FeezbackService } from './feezback.service';
import { BankingBatchError, bankingIssue } from './core/open-banking-issue';
import { feezbackDiagnosticContext } from './core/feezback-diagnostic-context';

describe('Consent-aware transaction synchronization', () => {
  const row = (id: number, patch: any = {}) => ({ sourceRecordId: id, type: 'card', sourceId: '8389-XXX',
    resourceId: 'resource-' + id, consentId: 'consent-' + id, connectionRole: 'primary',
    status: 'success', transactionCount: 0, ...patch });
  function fixture(initial: any[]) {
    const rows = initial;
    const service: any = Object.create(FeezbackService.prototype);
    const result = (selected: any[]) => ({ normalizedTransactions: [], __identityResults: selected.map(source =>
      ({ ...source, status: 'success', transactionCount: 0 })) });
    const sync = { getSourceResults: jest.fn(async () => rows), updateSourceResults: jest.fn(async (_id, outcomes) => {
      for (const outcome of outcomes) Object.assign(rows.find(source => source.sourceRecordId === outcome.sourceRecordId) ?? {}, outcome);
    }), getSyncState: jest.fn(async () => null), markSyncFailed: jest.fn(), markSyncSkipped: jest.fn() };
    Object.assign(service, { userSyncStateService: sync, identityScope: new AsyncLocalStorage(),
      pullRunScope: new AsyncLocalStorage(), logger: { error: jest.fn(), log: jest.fn(), warn: jest.fn() },
      userRepository: { findOne: jest.fn(async () => ({ hasOpenBanking: true })) },
      billingService: { hasModuleAccess: jest.fn(async () => true) }, userSubs: async () => ['owner_sub', 'owner_sub_spouse'],
      withConnectedUserLock: async (_id, fn) => fn(), markConnectedSyncFinished: jest.fn(),
      getAndSaveBankTransactions: jest.fn(async (_id, sub, _b, _f, _t, ids) => result(rows.filter(source =>
        source.type === 'bank' && ids.includes(source.resourceId) && (sub.endsWith('_spouse') ? source.connectionRole === 'spouse' : source.connectionRole === 'primary')))),
      getAndSaveUserCardTransactions: jest.fn(async (_id, sub, _b, _f, _t, ids) => result(rows.filter(source =>
        source.type === 'card' && ids.includes(source.resourceId) && (sub.endsWith('_spouse') ? source.connectionRole === 'spouse' : source.connectionRole === 'primary')))),
      autoRetryFailedSources: jest.fn(), processTransactionsWithDuplicateAlert: jest.fn(async (_id, tx) =>
        ({ newlySavedToCache: tx.length, alreadyExistingInCache: 0, deduplicatedCount: 0 })),
    });
    return { service, sync, rows };
  }
  const pull = (service, type = 'card', sub = 'owner_sub') => service.pullExpectedIdentitySources('owner', sub, type, '2025-11-05', '2026-11-05');
  beforeEach(() => { jest.spyOn(console, 'log').mockImplementation(() => {}); });
  afterEach(() => jest.restoreAllMocks());

  it.each(['bank', 'card'])('does not request %s when all local permissions are absent', async type => {
    const { service } = fixture([row(1, { type, consentId: null }), row(2, { type, consentId: '   ' })]);
    expect(await pull(service, type)).toMatchObject({ __identityResults: [], accountsFailed: 0, cardErrors: [] });
    expect(service.getAndSaveBankTransactions).not.toHaveBeenCalled();
    expect(service.getAndSaveUserCardTransactions).not.toHaveBeenCalled();
  });
  it('keeps a new empty connection quiet and leaves discovery to data-ready handling', async () => {
    const { service } = fixture([]);
    await service.doFullSync('owner', 'manual', 'owner', null, 'run');
    expect(service.getAndSaveBankTransactions).not.toHaveBeenCalled();
    expect(service.getAndSaveUserCardTransactions).not.toHaveBeenCalled();
    expect(service.markConnectedSyncFinished).toHaveBeenCalledWith('owner', 'completed', 'success', 0, undefined, 'run');
  });
  it.each(['login', 'manual', 'webhook'])('card-only %s sync succeeds without any bank request', async trigger => {
    const { service } = fixture([row(1), row(2, { type: 'bank', consentId: null, status: 'failed' })]);
    service.getAndSaveBankTransactions.mockRejectedValue({ status: 401, responseBody: { error: { code: 'INSUFFICIENT_CONSENT' } } });
    await service.doFullSync('owner', trigger, 'owner', null, 'run');
    expect(service.getAndSaveBankTransactions).not.toHaveBeenCalled();
    expect(service.markConnectedSyncFinished).toHaveBeenCalledWith('owner', 'completed', 'success', 0, undefined, 'run');
  });
  it('bank-only sync never requests cards', async () => {
    const { service } = fixture([row(1, { type: 'bank' })]);
    await service.doFullSync('owner', 'manual', 'owner', null, 'run');
    expect(service.getAndSaveUserCardTransactions).not.toHaveBeenCalled();
    expect(service.markConnectedSyncFinished).toHaveBeenCalledWith('owner', 'completed', 'success', 0, undefined, 'run');
  });
  it.each(['ILS', 'USD', 'EUR'])('matches %s outcomes by permanent ID, regardless of provider labels', async currency => {
    const source = row(9, { sourceId: '8389-' + currency });
    const { service } = fixture([source]);
    service.getAndSaveUserCardTransactions.mockResolvedValue({ normalizedTransactions: [],
      __identityResults: [{ ...source, sourceId: 'totally-different', status: 'success' }] });
    expect((await pull(service)).__identityResults).toEqual([expect.objectContaining({ sourceRecordId: 9, status: 'success' })]);
  });
  it('isolates primary and spouse sources even when names and resources match', async () => {
    const primary = row(1), spouse = row(2, { connectionRole: 'spouse', resourceId: primary.resourceId });
    const { service } = fixture([primary, spouse]);
    const first = await pull(service), second = await pull(service, 'card', 'owner_sub_spouse');
    expect(first.__identityResults.map(source => source.sourceRecordId)).toEqual([1]);
    expect(second.__identityResults.map(source => source.sourceRecordId)).toEqual([2]);
  });
  it.each([401, 403, 404, 500, undefined])('preserves a linked-source failure with status %s', async status => {
    const source = row(1); const { service } = fixture([source]);
    service.getAndSaveUserCardTransactions.mockRejectedValue({ status, code: 'ERR_BAD_REQUEST',
      responseBody: { error: { code: 'INSUFFICIENT_CONSENT' } } });
    const result = await pull(service);
    expect(result.__identityResults[0]).toMatchObject({ sourceRecordId: 1, status: 'failed', error: expect.stringMatching(/^OB-03\|/) });
    expect(source.consentId).toBe('consent-1');
    expect(service.logger.error.mock.calls[0][0]).toContain('INSUFFICIENT_CONSENT');
  });
  it.each(['bank', 'card'])('does not treat an empty %s list as success for an expected source', async type => {
    const { service } = fixture([row(1, { type })]);
    service[type === 'bank' ? 'getAndSaveBankTransactions' : 'getAndSaveUserCardTransactions'].mockResolvedValue({ normalizedTransactions: [], sourceResults: [] });
    const result = await pull(service, type);
    expect(result.__identityResults[0].status).toBe('failed');
    expect(service.logger.error.mock.calls[0][0]).toContain('expected_source_absent_from_response');
  });
  it('reports a missing resource without requesting every provider instrument', async () => {
    const { service } = fixture([row(1, { resourceId: null })]);
    expect((await pull(service)).__identityResults[0].status).toBe('failed');
    expect(service.getAndSaveUserCardTransactions).not.toHaveBeenCalled();
  });
  it('filters provider requests to the currently linked resource IDs', async () => {
    const { service } = fixture([row(1), row(2, { consentId: null }), row(3, { connectionRole: 'spouse' })]);
    await pull(service);
    expect(service.getAndSaveUserCardTransactions).toHaveBeenCalledWith('owner', 'owner_sub', 'booked', '2025-11-05', '2026-11-05', ['resource-1']);
  });
  it('drops an in-flight failure for a permission revoked during the call', async () => {
    const { service, rows } = fixture([row(1)]);
    service.getAndSaveUserCardTransactions.mockImplementation(async () => {
      rows[0] = { ...rows[0], consentId: null }; throw { status: 401 };
    });
    expect((await pull(service)).__identityResults).toEqual([]);
  });
  it('does not attribute the old outcome to a newly rotated consent', async () => {
    const { service, rows } = fixture([row(1)]);
    service.getAndSaveUserCardTransactions.mockImplementation(async () => {
      rows[0] = { ...rows[0], consentId: 'renewed' }; throw { status: 401 };
    });
    expect((await pull(service)).__identityResults).toEqual([]);
  });
  it('preserves success and transactions from one source when another source is missing', async () => {
    const first = row(1), second = row(2); const { service, sync } = fixture([first, second]);
    service.getAndSaveUserCardTransactions.mockResolvedValue({ normalizedTransactions: [{ sourceRecordId: 1 }],
      __identityResults: [{ ...first, status: 'success', transactionCount: 1 }] });
    await service.doFullSync('owner', 'manual', 'owner', null, 'run');
    expect(service.processTransactionsWithDuplicateAlert).toHaveBeenCalledWith('owner', [{ sourceRecordId: 1 }], 'manual full sync');
    expect(sync.updateSourceResults.mock.calls[0][1]).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceRecordId: 1, status: 'success' }), expect.objectContaining({ sourceRecordId: 2, status: 'failed' }),
    ]));
    expect(service.markConnectedSyncFinished).toHaveBeenCalledWith('owner', 'completed', 'partial_success', 1, expect.stringMatching(/^OB-03\|/), 'run');
  });
  it('never converts a save failure into a successful fetch-only outcome', async () => {
    const source = row(1); const { service } = fixture([source]);
    service.getAndSaveUserCardTransactions.mockResolvedValue({ normalizedTransactions: [{ sourceRecordId: 1 }],
      __identityResults: [{ ...source, status: 'success', transactionCount: 1 }] });
    const issue = bankingIssue(service.logger, 'transaction_save', 'owner', 'test_save_failure');
    service.processTransactionsWithDuplicateAlert.mockResolvedValue({ newlySavedToCache: 0, supportIssue: issue,
      sourceFailures: [{ sourceRecordId: 1, issue }] });
    await service.doFullSync('owner', 'manual', 'owner', null, 'run');
    expect(service.markConnectedSyncFinished).toHaveBeenCalledWith('owner', 'failed', 'failed', 0, issue.code + '|' + issue.errorId, 'run');
  });
  it('does not hide source-outcome persistence failures', async () => {
    const { service, sync } = fixture([row(1)]);
    sync.updateSourceResults.mockRejectedValue(new Error('DB offline'));
    await service.doFullSync('owner', 'manual', 'owner', null, 'run');
    expect(service.markConnectedSyncFinished.mock.calls[0][4]).toMatch(/^OB-04\|/);
  });
  it('preserves normalization failures as OB-04', async () => {
    const { service } = fixture([row(1)]);
    const issue = bankingIssue(service.logger, 'transaction_save', 'owner', 'normalization_failed');
    service.getAndSaveUserCardTransactions.mockRejectedValue(new BankingBatchError([issue]));
    const result = await pull(service);
    expect(result.processingError).toBe('OB-04|' + issue.errorId);
    expect(result.__identityResults[0].error).toBe(result.processingError);
  });
  it('keeps intentionally skipped Direct cards quiet even when no bank is linked', async () => {
    const { service } = fixture([row(1, { status: 'skipped_direct' })]);
    const result = await pull(service);
    expect(result.__identityResults[0].status).toBe('skipped_direct');
    expect(result.cardErrors).toEqual([]);
    expect(service.getAndSaveUserCardTransactions).not.toHaveBeenCalled();
  });
  it('uses ordinary Direct results when the Direct-import feature enables legacy retries', async () => {
    jest.spyOn(FeezbackService, 'isRetryablePendingStatus').mockReturnValue(true);
    const source = row(1, { status: 'skipped_direct' }); const { service } = fixture([source]);
    service.getAndSaveUserCardTransactions.mockRejectedValue({ status: 401 });
    expect((await pull(service)).__identityResults[0].status).toBe('failed');
    expect(service.getAndSaveUserCardTransactions).toHaveBeenCalledTimes(1);
  });
  it('does not skip a card now known as credit because of an old Direct status', async () => {
    const { service } = fixture([row(1, { status: 'skipped_direct', source: { isDirect: false } })]);
    expect((await pull(service)).__identityResults[0].status).toBe('success');
    expect(service.getAndSaveUserCardTransactions).toHaveBeenCalledTimes(1);
  });
  it('keeps an independently known Direct card quiet even if its old status was failed', async () => {
    const { service } = fixture([row(1, { status: 'failed', source: { isDirect: true } })]);
    expect((await pull(service)).__identityResults[0].status).toBe('skipped_direct');
    expect(service.getAndSaveUserCardTransactions).not.toHaveBeenCalled();
  });
  it('does not publish an old resource outcome after discovery replaced its resource ID', async () => {
    const { service, rows } = fixture([row(1)]);
    service.getAndSaveUserCardTransactions.mockImplementation(async () => {
      rows[0] = { ...rows[0], resourceId: 'replacement-resource' }; throw { status: 401 };
    });
    expect((await pull(service)).__identityResults).toEqual([]);
  });
  it('provides isolated run and source correlation during parallel identity requests', async () => {
    const { service } = fixture([row(1), row(2, { connectionRole: 'spouse' })]);
    const contexts: any[] = [];
    service.getAndSaveUserCardTransactions.mockImplementation(async () => {
      await Promise.resolve(); contexts.push(feezbackDiagnosticContext.getStore());
      return { normalizedTransactions: [], __identityResults: [] };
    });
    await service.pullRunScope.run('run-123', () => Promise.all([pull(service), pull(service, 'card', 'owner_sub_spouse')]));
    expect(contexts).toEqual(expect.arrayContaining([
      expect.objectContaining({ syncRunId: 'run-123', connectionRole: 'primary', sourceRecordIds: [1] }),
      expect.objectContaining({ syncRunId: 'run-123', connectionRole: 'spouse', sourceRecordIds: [2] }),
    ]));
    expect(feezbackDiagnosticContext.getStore()).toBeUndefined();
  });
});

describe('consent-aware sync through real fetch and normalization paths', () => {
  afterEach(() => jest.restoreAllMocks());
  function actual(type: 'bank' | 'card', currency: string, role: 'primary' | 'spouse') {
    const api: any = { getUserAccounts: jest.fn(), getUserCards: jest.fn() };
    const consent: any = { getAccountTransactionsByConsent: jest.fn(), getCardTransactions: jest.fn() };
    const sources: any = { find: jest.fn(), query: jest.fn(async () => []) };
    const sync: any = { getSourceResults: jest.fn() };
    const service: any = new FeezbackService({} as any, { getTppId: () => 'test' } as any, api, consent,
      {} as any, sync, {} as any, sources, {} as any, {} as any);
    const name = service.deriveSourceName(type === 'bank' ? '1234567' : '8389', currency);
    const source = { id: 17, userId: 'owner', sourceName: name, connectionRole: role,
      sourceType: type === 'bank' ? 'BANK_ACCOUNT' : 'CREDIT_CARD', isDirect: false };
    const state = { sourceRecordId: 17, type, sourceId: name, connectionRole: role,
      consentId: 'consent', resourceId: 'provider-resource', status: 'not_synced', source };
    sources.find.mockResolvedValue([source]); sync.getSourceResults.mockResolvedValue([state]);
    api.getUserAccounts.mockResolvedValue({ accounts: [{ iban: 'IL1234567', name: 'account',
      resourceId: state.resourceId, consentId: state.consentId, currency, consentStatus: 'valid' }] });
    api.getUserCards.mockResolvedValue({ cards: [{ maskedPan: 'XXXX8389', resourceId: state.resourceId,
      consentId: state.consentId, currency, balances: [{ amount: '10' }] }] });
    const tx = type === 'bank' ? { transactionId: 'bank-tx', bookingDate: '2026-11-01',
      transactionAmount: { amount: '-50', currency }, remittanceInformationUnstructured: 'test' }
      : { cardTransactionId: 'card-tx', transactionDate: '2026-11-01',
        transactionAmount: { amount: '50', currency }, cardAcceptorName: 'shop' };
    consent.getAccountTransactionsByConsent.mockResolvedValue({ transactions: { booked: [tx] } });
    consent.getCardTransactions.mockResolvedValue({ transactions: { booked: [tx] } });
    return { service, api, consent, state };
  }
  beforeEach(() => { jest.spyOn(console, 'log').mockImplementation(() => {}); });
  it.each([
    ['bank', 'ILS', 'primary'], ['bank', 'USD', 'primary'], ['bank', 'EUR', 'spouse'],
    ['card', 'ILS', 'primary'], ['card', 'USD', 'primary'], ['card', 'EUR', 'spouse'],
  ])('fetches and attributes a %s %s %s source by stable ID', async (type, currency, role) => {
    const { service, consent } = actual(type as any, currency, role as any);
    const sub = role === 'spouse' ? 'owner_sub_spouse' : 'owner_sub';
    const result = await service.pullExpectedIdentitySources('owner', sub, type, '2025-11-05', '2026-11-05');
    expect(result.__identityResults).toEqual([expect.objectContaining({ sourceRecordId: 17,
      connectionRole: role, status: 'success', transactionCount: 1 })]);
    expect(result.normalizedTransactions).toEqual([expect.objectContaining({ sourceRecordId: 17, currency })]);
    expect(consent[type === 'bank' ? 'getAccountTransactionsByConsent' : 'getCardTransactions'])
      .toHaveBeenCalledWith(sub, 'consent', 'provider-resource', 'booked', '2025-11-05', '2026-11-05');
  });
  it.each(['bank', 'card'])('keeps zero %s transactions successful', async type => {
    const { service, consent } = actual(type as any, 'USD', 'primary');
    consent[type === 'bank' ? 'getAccountTransactionsByConsent' : 'getCardTransactions']
      .mockResolvedValue({ transactions: { booked: [] } });
    const result = await service.pullExpectedIdentitySources('owner', 'owner_sub', type, '2025-11-05', '2026-11-05');
    expect(result.__identityResults[0]).toMatchObject({ sourceRecordId: 17, status: 'success', transactionCount: 0 });
  });
});
