import { FeezbackService } from './feezback.service';
import { FeezbackWebhookService } from './webhook/feezback-webhook.service';
import { parseFeezbackUserIdentifier } from './utils/feezback-user.utils';
import { feezbackSub, subForSource } from './utils/feezback-identity';

describe('optional Feezback spouse identity', () => {
  let service: FeezbackService, users: any, api: any, state: any, source: any;
  const uid = 'uid_with_sub_inside';
  const valid = { consents: [{ resourceId: 'consent', consentStatus: 'valid', validUntil: '2099-01-01' }] };
  beforeEach(() => {
    users = { findOne: jest.fn().mockResolvedValue({ firebaseId: uid, hasOpenBanking: true, hasSpouseFeezbackIdentity: false }), update: jest.fn().mockResolvedValue({}) };
    api = { createConsentLink: jest.fn().mockResolvedValue({ link: 'https://example.test' }),
      getUserConsents: jest.fn().mockResolvedValue(valid),
      getUserAccounts: jest.fn().mockResolvedValue({ accounts: [{ resourceId: 'account', consentId: 'consent' }] }),
      getUserCards: jest.fn().mockResolvedValue({ cards: [] }) };
    state = { getSourceResults: jest.fn().mockResolvedValue([]), updateSourceResults: jest.fn().mockResolvedValue(undefined) };
    source = { query: jest.fn().mockResolvedValue(undefined) };
    service = new FeezbackService({} as any, { getTppId: () => 'tpp' } as any, api, {} as any,
      {} as any, state, users, source, {} as any, {} as any);
  });
  it.each([[false, false, false], [true, false, true], [false, true, true]])('offers selection from active=%s and historical=%s', async (active, history, expected) => {
    users.findOne.mockResolvedValue({ hasOpenBanking: active, hasSpouseFeezbackIdentity: history });
    expect(await service.getConnectionOptions(uid)).toEqual({ offerSpouse: expected });
  });
  it('reuses the exact spouse SUB and parses a UID containing _sub without truncation', () => {
    expect(feezbackSub(uid, true)).toBe(uid + '_sub_spouse');
    expect(parseFeezbackUserIdentifier(feezbackSub(uid, true) + '@tpp').firebaseId).toBe(uid);
    expect(parseFeezbackUserIdentifier(feezbackSub(uid) + '@tpp').firebaseId).toBe(uid);
    expect(subForSource(uid, 'spouse')).toBe(feezbackSub(uid, true));
  });
  it('does not persist anything when creating or retrying a spouse link', async () => {
    await service.createConsentLink(uid, true); await service.createConsentLink(uid, true);
    expect(api.createConsentLink.mock.calls).toEqual([[uid, true], [uid, true]]);
    expect(users.update).not.toHaveBeenCalled();
  });
  it('keeps primary link calls unchanged and rejects a spouse link before any connection', async () => {
    await service.createConsentLink(uid);
    expect(api.createConsentLink).toHaveBeenCalledWith(uid);
    users.findOne.mockResolvedValue({ hasOpenBanking: false, hasSpouseFeezbackIdentity: false });
    await expect(service.createConsentLink(uid, true)).rejects.toThrow();
  });
  it('persists the historical flag only after valid consent and a linked source', async () => {
    expect(await service.verifySpouseWebhookConnection(uid, feezbackSub(uid, true))).toBe(true);
    expect(users.update).toHaveBeenCalledWith({ firebaseId: uid }, { hasSpouseFeezbackIdentity: true });
    expect(api.getUserAccounts).toHaveBeenCalledWith(feezbackSub(uid, true), expect.anything());
  });
  it.each([
    { consents: [] },
    { consents: [{ resourceId: 'other', consentStatus: 'valid' }] },
    { consents: [{ resourceId: 'consent', consentStatus: 'valid', validUntil: '2020-01-01' }] },
    { consents: [{ resourceId: 'consent', consentStatus: 'revoked' }] },
  ])('never marks an unverified connection', async consents => {
    api.getUserConsents.mockResolvedValue(consents);
    expect(await service.verifySpouseWebhookConnection(uid, feezbackSub(uid, true))).toBe(false);
    expect(users.update).not.toHaveBeenCalled();
  });
  it('cannot mark primary or another user as spouse, and fails closed on provider errors', async () => {
    expect(await service.verifySpouseWebhookConnection(uid, feezbackSub(uid))).toBe(false);
    expect(await service.verifySpouseWebhookConnection(uid, feezbackSub('other', true))).toBe(false);
    api.getUserConsents.mockRejectedValue(new Error('offline'));
    await expect(service.verifySpouseWebhookConnection(uid, feezbackSub(uid, true))).rejects.toThrow('offline');
    expect(users.update).not.toHaveBeenCalled();
  });
  it('accepts a verified bank even if card discovery fails', async () => {
    api.getUserCards.mockRejectedValue(new Error('offline'));
    expect(await service.verifySpouseWebhookConnection(uid, feezbackSub(uid, true))).toBe(true);
  });
  it('keeps account numbers clean across overlapping identity scopes', async () => {
    const impl: any = service;
    const [primary, spouse] = await Promise.all([false, true].map(flag =>
      impl.identityScope.run(feezbackSub(uid, flag), async () => {
        await Promise.resolve();
        return impl.deriveSourceName('1234567', 'USD');
      })));
    expect(primary).toBe('1234567$'); expect(spouse).toBe('1234567$');
    expect(impl.deriveSourceName('1234567', 'USD')).toBe(primary);
  });
  it('aggregates connection state across identities and keeps the permanent flag after expiry', async () => {
    const impl: any = service;
    users.findOne.mockResolvedValue({ hasSpouseFeezbackIdentity: true });
    jest.spyOn(impl, 'refreshIdentitySources').mockImplementation(async (_uid: string, _event: string, sub: string) =>
      ({ connected: sub.endsWith('_spouse'), complete: true }));
    await service.refreshUserSources(uid, 'test');
    expect(users.update).toHaveBeenLastCalledWith({ firebaseId: uid }, { hasOpenBanking: true });
    impl.refreshIdentitySources.mockResolvedValue({ connected: false, complete: true });
    await service.refreshUserSources(uid, 'expired');
    expect(users.update).toHaveBeenLastCalledWith({ firebaseId: uid }, { hasOpenBanking: false });
    expect(users.update.mock.calls.some((call: any) => 'hasSpouseFeezbackIdentity' in call[1])).toBe(false);
  });
  it('preserves prior connection state if one identity cannot be verified', async () => {
    const impl: any = service;
    users.findOne.mockResolvedValue({ hasSpouseFeezbackIdentity: true });
    jest.spyOn(impl, 'refreshIdentitySources').mockImplementation(async (_uid: string, _event: string, sub: string) => {
      if (sub.endsWith('_spouse')) throw Error('offline');
      return { connected: false, complete: true };
    });
    await service.refreshUserSources(uid, 'test'); expect(users.update).not.toHaveBeenCalled();
  });
  it('routes a source retry to its own provider SUB', async () => {
    const impl: any = service;
    const retry = jest.spyOn(impl, 'retrySourceForIdentity').mockResolvedValue({ status: 'success' });
    state.getSourceResults.mockResolvedValue([{ type: 'card', sourceId: '1234', sourceRecordId: 22, connectionRole: 'spouse' }]);
    await service.retrySource(uid, 'card', '1234', 22);
    expect(retry).toHaveBeenCalledWith(uid, 'card', '1234', feezbackSub(uid, true));
  });
  it('rejects an ambiguous account number and never calls the provider', async () => {
    state.getSourceResults.mockResolvedValue([
      { type: 'card', sourceId: '1234', sourceRecordId: 11, connectionRole: 'primary' },
      { type: 'card', sourceId: '1234', sourceRecordId: 22, connectionRole: 'spouse' },
    ]);
    const retry = jest.spyOn(service as any, 'retrySourceForIdentity');
    await expect(service.retrySource(uid, 'card', '1234')).rejects.toThrow('unique sourceRecordId');
    await expect(service.retrySource(uid, 'card', '1234', 999)).rejects.toThrow('unique sourceRecordId');
    expect(retry).not.toHaveBeenCalled();
  });
  it('attaches distinct permanent sources to identical numbers in each provider response', async () => {
    source.find = jest.fn(async ({ where }) => [{ sourceName: '1234', id: where.connectionRole === 'spouse' ? 22 : 11 }]);
    const responses = await Promise.all([false, true].map(async spouse => {
      const response = { normalizedTransactions: [{ paymentIdentifier: '1234' }] };
      return (service as any).attachSourceRecords(uid, feezbackSub(uid, spouse), 'card', response);
    }));
    expect(responses.map(r => r.normalizedTransactions[0].sourceRecordId)).toEqual([11, 22]);
    expect(responses.map(r => r.normalizedTransactions[0].paymentIdentifier)).toEqual(['1234','1234']);
  });
  it('full sync combines both identities and reports partial failure without dropping healthy rows', () => {
    const impl: any = service;
    const primary = { __sub: feezbackSub(uid), normalizedTransactions: [{ externalTransactionId: 'p' }],
      transactionsByAccount: { p: [] }, accountInfoMap: { p: { iban: 'IL1234567', resourceId: 'p' } } };
    const spouse = { __sub: feezbackSub(uid, true), normalizedTransactions: [{ externalTransactionId: 's_spouse' }],
      transactionsByAccount: { s: [] }, accountInfoMap: { s: { iban: 'IL1234567', resourceId: 's' } } };
    const combined = impl.combineIdentityPulls([primary, spouse], 'bank');
    expect(combined.normalizedTransactions).toHaveLength(2);
    expect(combined.__identityResults.map((r: any) => r.sourceId)).toEqual(['1234567', '1234567']);
    const partial = impl.combineIdentityPulls([primary, null], 'bank');
    expect(impl.computePhaseStatus(partial, { normalizedTransactions: [] }).resultStatus).toBe('partial_success');
  });
  it('data-ready webhook verifies before discovery, whereas failed verification stops', async () => {
    const provider: any = { verifySpouseWebhookConnection: jest.fn().mockResolvedValue(false), refreshUserSources: jest.fn() };
    const webhook: any = new FeezbackWebhookService({} as any, provider);
    const event = { payload: { user: feezbackSub(uid, true) + '@tpp' } };
    await webhook.handleUserDataIsAvailable(event);
    expect(provider.refreshUserSources).not.toHaveBeenCalled();
    provider.verifySpouseWebhookConnection.mockResolvedValue(true);
    await webhook.handleUserDataIsAvailable(event);
    expect(provider.refreshUserSources).toHaveBeenCalledWith(uid, 'UserDataIsAvailable');
  });
  it('marks only failed-identity sources retryable, preserving direct cards', async () => {
    const impl: any = service;
    state.getSourceResults.mockResolvedValue([
      { connectionRole: 'primary', sourceId: '1234', type: 'card', status: 'success' },
      { connectionRole: 'spouse', sourceId: '1234', type: 'card', status: 'success' },
      { connectionRole: 'spouse', sourceId: '5678', type: 'card', status: 'skipped_direct' },
    ]);
    const failed = await impl.failedIdentityPull(uid, feezbackSub(uid, true), 'card', new Error('offline'));
    expect(failed.__identityResults.map((r: any) => [r.sourceId, r.status])).toEqual([
      ['1234', 'failed'], ['5678', 'skipped_direct'],
    ]);
  });

  it('routes direct account reads using owned source metadata, not a user-provided SUB', async () => {
    const impl: any = service;
    state.getSourceResults.mockResolvedValue([{ type: 'bank', connectionRole: 'spouse', sourceId: '1234567', resourceId: 'account', consentId: 'consent' }]);
    const fetch = jest.fn().mockResolvedValue({ transactions: [] });
    impl.feezbackConsentApiService.getAccountTransactionsByConsent = fetch;
    await service.getAccountTransactions(feezbackSub(uid), 'https://example.test/consents/consent/accounts/account/transactions');
    expect(fetch).toHaveBeenCalledWith(feezbackSub(uid, true), 'consent', 'account', 'booked', undefined, undefined);
  });
  it('account reads include a confirmed spouse and preserve healthy data on partial failure', async () => {
    users.findOne.mockResolvedValue({ hasSpouseFeezbackIdentity: true });
    api.getUserAccounts.mockImplementation(async (sub: string) => {
      if (sub.endsWith('_spouse')) throw new Error('offline');
      return { accounts: [{ resourceId: 'healthy' }] };
    });
    expect(await service.getUserAccounts(feezbackSub(uid))).toEqual({ accounts: [{ resourceId: 'healthy' }], partial: true });
    expect(api.getUserAccounts).toHaveBeenCalledTimes(2);
  });

  it('admin live source metadata preserves ownership even with identical resource IDs', async () => {
    users.findOne.mockResolvedValue({ hasSpouseFeezbackIdentity: true });
    state.getSourceResults.mockResolvedValue([
      { type: 'bank', resourceId: 'account', sourceRecordId: 11, connectionRole: 'primary' },
      { type: 'bank', resourceId: 'account', sourceRecordId: 22, connectionRole: 'spouse' },
    ]);
    const result = await service.adminGetAccountsAndCards(uid);
    expect(result.accounts.accounts.map(account => [account.sourceRecordId, account.connectionRole])).toEqual([[11,'primary'],[22,'spouse']]);
  });
  it('admin date-range pulls send a spouse resource only to its own identity', async () => {
    users.findOne.mockResolvedValue({ hasSpouseFeezbackIdentity: true });
    state.getSourceResults.mockResolvedValue([{ type: 'bank', connectionRole: 'spouse', sourceId: '1234567', resourceId: 'spouse-resource', consentId: 'c' }]);
    api.withDebugTrace = jest.fn(async (operation: () => Promise<any>) => ({ result: await operation(), httpCalls: [] }));
    const pull = jest.spyOn(service, 'getAndSaveBankTransactions').mockResolvedValue({
      normalizedTransactions: [], bankErrors: [], sourceResults: [{ type: 'bank', connectionRole: 'spouse', sourceId: '1234567',
        resourceId: 'spouse-resource', consentId: 'c', status: 'success', transactionCount: 0, error: null }],
    });
    const result = await service.adminPullTransactionsForDateRange(uid, '2026-01-01', '2026-01-31',
      'booked', [{ type: 'bank', resourceId: 'spouse-resource' }], false);
    expect(pull).toHaveBeenCalledTimes(1);
    expect(pull).toHaveBeenCalledWith(uid, feezbackSub(uid, true), 'booked', '2026-01-01', '2026-01-31', ['spouse-resource']);
    expect(result.sourceResults.map(source => source.sub)).toEqual([feezbackSub(uid, true)]);
    expect(state.updateSourceResults).not.toHaveBeenCalled();
  });
});
