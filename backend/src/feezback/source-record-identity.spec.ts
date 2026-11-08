import { FeezbackService } from './feezback.service';
import { UserSyncStateService } from '../transactions/user-sync-state.service';
import { SourceType } from '../enum';
import { BankingBatchError } from './core/open-banking-issue';

describe('permanent source identity across currency-formatted labels', () => {
  const owner = 'owner';
  function fixture(sources: any[]) {
    const accounts = { findOne: jest.fn(async ({ where }) => sources.find(s =>
      s.userId === where.userId && (where.id ? s.id === where.id :
        s.sourceName === where.sourceName && s.sourceType === where.sourceType && s.connectionRole === where.connectionRole))) };
    const outcomes = { findOne: jest.fn().mockResolvedValue(null), insert: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({ affected: 1 }) };
    const state = new UserSyncStateService({} as any, outcomes as any, accounts as any);
    const service = new FeezbackService({} as any, { getTppId: () => 'test-tpp' } as any, {} as any, {} as any,
      {} as any, state, {} as any, {} as any, {} as any, {} as any);
    return { service, state, accounts, outcomes };
  }
  const source = (id: number, name: string, role = 'primary', type = SourceType.CREDIT_CARD) =>
    ({ id, userId: owner, sourceName: name, connectionRole: role, sourceType: type });

  it.each(['XXX', 'USD', 'EUR', 'GBP', 'JPY', 'CHF', 'ILS'])('persists full card outcomes for %s even when summary currency is absent', async currency => {
    const { service, state, accounts, outcomes } = fixture([]);
    const name = (service as any).deriveSourceName('8389', currency);
    accounts.findOne.mockResolvedValue(source(153, name));
    const response = {
      // Reproduce the original successful-card response, which omitted currency.
      cards: [{ maskedPan: 'XXXX8389', cardResourceId: 'provider-card', consentId: 'consent', transactions: [{}, {}] }],
      normalizedTransactions: [{}, {}],
      sourceResults: [{ type: 'card', sourceId: name, sourceRecordId: 153, resourceId: 'provider-card' }],
    };
    const results = (service as any).buildSourceResults(null, response);
    expect(results).toEqual([expect.objectContaining({ sourceRecordId: 153, sourceId: name, transactionCount: 2 })]);
    await state.updateSourceResults(owner, results);
    expect(accounts.findOne).toHaveBeenCalledWith({ where: { id: 153, userId: owner } });
    expect(outcomes.insert).toHaveBeenCalledWith(expect.objectContaining({ sourceRecordId: 153, sourceId: name, status: 'success', transactionCount: 2 }));
  });

  it('accepts a changed label with an owned ID and keeps the permanent source name on insertion', async () => {
    const { state, outcomes } = fixture([source(153, '8389-XXX')]);
    await state.updateSourceResults(owner, [{ type: 'card', sourceRecordId: 153, sourceId: '8389', connectionRole: 'primary', status: 'success', transactionCount: 320 }]);
    expect(outcomes.insert).toHaveBeenCalledWith(expect.objectContaining({ sourceRecordId: 153, sourceId: '8389-XXX', transactionCount: 320 }));
  });

  it('does not mix same-number ILS and USD accounts when their response labels differ', async () => {
    const { service, state, outcomes } = fixture([source(1, '1234567', 'primary', SourceType.BANK_ACCOUNT), source(2, '1234567$', 'primary', SourceType.BANK_ACCOUNT)]);
    const bank = {
      transactionsByAccount: { ils: [{}], usd: [{}] },
      accountInfoMap: { ils: { iban: 'IL1234567', currency: 'ILS', resourceId: 'ils' }, usd: { iban: 'IL1234567', currency: 'USD', resourceId: 'usd' } },
      normalizedTransactions: [{}, {}],
      sourceResults: [{ type: 'bank', sourceId: 'old-ils-label', sourceRecordId: 1, resourceId: 'ils' }, { type: 'bank', sourceId: 'old-usd-label', sourceRecordId: 2, resourceId: 'usd' }],
    };
    await state.updateSourceResults(owner, (service as any).buildSourceResults(bank, null));
    expect(outcomes.insert.mock.calls.map(([row]) => [row.sourceRecordId, row.sourceId])).toEqual([[1, '1234567'], [2, '1234567$']]);
  });

  it.each(['bank', 'card'])('retains the stable ID for failed %s fetches', async type => {
    const { service } = fixture([]);
    const metadata = { type, sourceId: 'canonical$', sourceRecordId: 7, resourceId: 'resource' };
    const response = type === 'bank'
      ? { bankErrors: [{ sourceId: 'resource', iban: 'IL1234567', message: 'unavailable' }], sourceResults: [metadata] }
      : { cardErrors: [{ cardResourceId: 'resource', maskedPan: 'XXXX8389', message: 'unavailable' }], sourceResults: [metadata] };
    const results = (service as any).buildSourceResults(type === 'bank' ? response : null, type === 'card' ? response : null);
    expect(results).toEqual([expect.objectContaining({ sourceRecordId: 7, sourceId: 'canonical$', status: 'failed' })]);
  });

  it('keeps primary and spouse results separate for identical resource IDs and numbers', () => {
    const { service } = fixture([]);
    const response = (sub: string, id: number) => ({ __sub: sub,
      cards: [{ cardResourceId: 'same-resource', maskedPan: 'XXXX8389', transactions: [] }],
      sourceResults: [{ type: 'card', resourceId: 'same-resource', sourceId: '8389$', sourceRecordId: id }] });
    const combined = (service as any).combineIdentityPulls([response('owner_sub', 1), response('owner_sub_spouse', 2)], 'card');
    expect((service as any).buildSourceResults(null, combined).map(r => [r.sourceRecordId, r.connectionRole])).toEqual([[1, 'primary'], [2, 'spouse']]);
  });

  it.each([
    { sourceRecordId: 999 },
    { sourceRecordId: 2 },
    { sourceRecordId: 3 },
    { sourceRecordId: 4 },
  ])('rejects missing, foreign-owner, wrong-role and wrong-type IDs without a name fallback: %j', async patch => {
    const foreign = { ...source(2, '8389'), userId: 'other-owner' };
    const { state, outcomes } = fixture([source(1, '8389'), foreign, source(3, '8389', 'spouse'), source(4, '8389', 'primary', SourceType.BANK_ACCOUNT)]);
    await expect(state.updateSourceResults(owner, [{ type: 'card', sourceId: '8389', connectionRole: 'primary', status: 'success', transactionCount: 1, ...patch }])).rejects.toBeInstanceOf(BankingBatchError);
    expect(outcomes.insert).not.toHaveBeenCalled();
    expect(outcomes.update).not.toHaveBeenCalled();
  });

  it.each(['pullOneSource', 'retrySource'])('routes %s by ID despite an outdated caller label', async method => {
    const { service } = fixture([]);
    (service as any).userSyncStateService.getSourceResults = jest.fn().mockResolvedValue([
      { type: 'card', sourceRecordId: 1, sourceId: '8389', connectionRole: 'primary', consentId: 'p' },
      { type: 'card', sourceRecordId: 2, sourceId: '8389$', connectionRole: 'spouse', consentId: 's' },
    ]);
    const internal = jest.spyOn(service as any, method === 'pullOneSource' ? 'pullOneSourceForIdentity' : 'retrySourceForIdentity').mockResolvedValue({ status: 'success' });
    const result = await service[method](owner, 'card', 'old-label', 2);
    expect(internal).toHaveBeenCalledWith(owner, 'card', '8389$', 'owner_sub_spouse', 2);
    expect(result).toMatchObject({ sourceRecordId: 2, connectionRole: 'spouse' });
  });

  it.each(['success', 'failed'])('admin date-range %s outcomes preserve ID and spouse role', async status => {
    const { service, state, outcomes } = fixture([source(2, '8389$', 'spouse')]);
    (service as any).feezbackApiService.withDebugTrace = async operation => ({ result: await operation(), httpCalls: [] });
    jest.spyOn(service, 'getAndSaveUserCardTransactions').mockResolvedValue({
      normalizedTransactions: [], cardErrors: [],
      sourceResults: [{ type: 'card', sourceRecordId: 2, connectionRole: 'spouse', sourceId: 'outdated-label',
        resourceId: 'usd-card', consentId: 'consent', status, transactionCount: 0 }],
    });
    jest.spyOn(service, 'persistNormalizedTransactions').mockResolvedValue({ newlySavedToCache: 0 } as any);
    const write = jest.spyOn(state, 'updateSourceResults');
    await service.adminPullTransactionsForDateRange(owner, '2026-01-01', '2026-01-31', 'booked',
      [{ type: 'card', resourceId: 'usd-card' }], true, 'owner_sub_spouse');
    expect(write).toHaveBeenCalledWith(owner, [expect.objectContaining({ sourceRecordId: 2, connectionRole: 'spouse', status })]);
    expect(outcomes.insert).toHaveBeenCalledWith(expect.objectContaining({ sourceRecordId: 2, sourceId: '8389$', status }));
  });

  it('admin source-wide failure resolves a stored USD spouse source by resource and identity', async () => {
    const { service, state, outcomes } = fixture([source(2, '8389$', 'spouse')]);
    (state as any).getSourceResults = jest.fn().mockResolvedValue([
      { type: 'card', sourceRecordId: 1, sourceId: '8389', resourceId: 'same-resource', connectionRole: 'primary', consentId: 'primary-consent' },
      { type: 'card', sourceRecordId: 2, sourceId: '8389$', resourceId: 'same-resource', connectionRole: 'spouse', consentId: 'spouse-consent' },
    ]);
    (service as any).feezbackApiService.withDebugTrace = async operation => ({ result: await operation(), httpCalls: [] });
    jest.spyOn(service, 'getAndSaveUserCardTransactions').mockRejectedValue(new Error('provider unavailable'));
    jest.spyOn(service, 'persistNormalizedTransactions').mockResolvedValue(null);
    await service.adminPullTransactionsForDateRange(owner, '2026-01-01', '2026-01-31', 'booked',
      [{ type: 'card', resourceId: 'same-resource' }], true, 'owner_sub_spouse');
    expect(outcomes.insert).toHaveBeenCalledWith(expect.objectContaining({ sourceRecordId: 2, sourceId: '8389$', consentId: 'spouse-consent', status: 'failed' }));
  });
});
