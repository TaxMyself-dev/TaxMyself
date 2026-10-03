import { FeezbackService } from './feezback.service';

describe('FeezbackService admin date-range diagnostics', () => {
  let service: FeezbackService;
  let userSyncStateService: { updateSourceResults: jest.Mock };
  let apiService: { withDebugTrace: jest.Mock; getUserAccounts: jest.Mock };
  let consentApiService: {
    getAccountTransactionsByConsent: jest.Mock;
    getCardTransactions: jest.Mock;
  };
  let summaryLog: jest.Mock;

  beforeEach(() => {
    userSyncStateService = {
      updateSourceResults: jest.fn().mockResolvedValue(undefined),
    };
    apiService = {
      withDebugTrace: jest.fn(async (operation: () => Promise<any>) => ({
        result: await operation(),
        httpCalls: [
          {
            sentAt: '2026-01-01T00:00:00.000Z',
            method: 'GET',
            url: 'https://api.feezback.example/accounts/bank-resource/transactions',
            attempt: 1,
            maxAttempts: 3,
            curl: "curl --request GET --url 'bank-resource' --header 'Authorization: <REDACTED>'",
          },
          {
            sentAt: '2026-01-01T00:00:01.000Z',
            method: 'GET',
            url: 'https://api.feezback.example/cards/card-resource/transactions',
            attempt: 1,
            maxAttempts: 3,
            curl: "curl --request GET --url 'card-resource' --header 'Authorization: <REDACTED>'",
          },
        ],
      })),
      getUserAccounts: jest.fn(),
    };
    consentApiService = {
      getAccountTransactionsByConsent: jest.fn(),
      getCardTransactions: jest.fn(),
    };
    service = new FeezbackService(
      {} as any,
      { getTppId: () => 'test-tpp' } as any,
      apiService as any,
      consentApiService as any,
      {} as any,
      userSyncStateService as any,
      {} as any,
      {} as any,
      {} as any,
    );
    summaryLog = jest.fn();
    (service as any).logger = { log: summaryLog, warn: jest.fn() };
  });

  it('returns timestamps, redacted request metadata, raw responses and save counts', async () => {
    const bankResponse = {
      normalizedTransactions: [{ externalTransactionId: 'bank-1' }],
      transactions: [{ transactionId: 'bank-1' }],
      bankErrors: [],
      sourceResults: [{
        type: 'bank', sourceId: 'bank-1', displayName: 'Bank', resourceId: 'bank-resource',
        consentId: 'bank-consent', status: 'success', transactionCount: 1, response: {}, error: null,
      }],
    };
    const cardResponse = {
      normalizedTransactions: [{ externalTransactionId: 'card-1' }],
      cards: [{ rawResponse: { booked: [{ cardTransactionId: 'card-1' }] } }],
      cardErrors: [],
      sourceResults: [{
        type: 'card', sourceId: '1234', displayName: 'Card', resourceId: 'card-resource',
        consentId: 'card-consent', status: 'success', transactionCount: 1, response: {}, error: null,
      }],
    };
    jest.spyOn(service, 'getAndSaveBankTransactions').mockResolvedValue(bankResponse);
    jest.spyOn(service, 'getAndSaveUserCardTransactions').mockResolvedValue(cardResponse);
    jest.spyOn(service, 'persistNormalizedTransactions').mockResolvedValue({
      newlySavedToCache: 1,
      alreadyExistingInCache: 1,
    });

    const result = await service.adminPullTransactionsForDateRange(
      'firebase-user',
      '2026-01-01',
      '2026-01-31',
      'booked',
      [
        { type: 'bank', resourceId: 'bank-resource' },
        { type: 'card', resourceId: 'card-resource' },
      ],
    );

    expect(service.getAndSaveBankTransactions).toHaveBeenCalledWith(
      'firebase-user',
      'firebase-user_sub',
      'booked',
      '2026-01-01',
      '2026-01-31',
      ['bank-resource'],
    );
    expect(service.persistNormalizedTransactions).toHaveBeenCalledWith(
      'firebase-user',
      expect.arrayContaining([
        expect.objectContaining({ externalTransactionId: 'bank-1' }),
        expect.objectContaining({ externalTransactionId: 'card-1' }),
      ]),
    );
    expect(service.getAndSaveUserCardTransactions).toHaveBeenCalledWith(
      'firebase-user',
      'firebase-user_sub',
      'booked',
      '2026-01-01',
      '2026-01-31',
      ['card-resource'],
    );
    expect(result).toMatchObject({
      status: 'success',
      totalTransactions: 2,
      databaseSaveResult: { saved: 1, skipped: 1 },
      response: {
        bank: expect.objectContaining({ transactions: bankResponse.transactions }),
        card: expect.objectContaining({ cards: cardResponse.cards }),
        errors: [],
      },
      sourceResults: expect.arrayContaining([
        expect.objectContaining({ type: 'bank', resourceId: 'bank-resource', sub: 'firebase-user_sub' }),
        expect.objectContaining({ type: 'card', resourceId: 'card-resource', sub: 'firebase-user_sub' }),
      ]),
    });
    expect((result.response.bank as any).normalizedTransactions).toBeUndefined();
    expect((result.response.card as any).normalizedTransactions).toBeUndefined();
    expect(result.request.sentAt).toEqual(expect.any(String));
    expect(result.diagnosticId).toEqual(expect.any(String));
    expect(result.request.sub).toBe('firebase-user_sub');
    expect(result.request.userIdentifier).toBe('firebase-user_sub@test-tpp');
    expect(result.response.receivedAt).toEqual(expect.any(String));
    expect(result.response.durationMs).toEqual(expect.any(Number));
    expect(result.request.httpCalls[0].curl).toContain('Authorization: <REDACTED>');
    expect(result.sourceResults.find(source => source.type === 'bank')?.httpCalls).toHaveLength(1);
    expect(result.sourceResults.find(source => source.type === 'card')?.httpCalls).toHaveLength(1);
    expect(userSyncStateService.updateSourceResults).toHaveBeenCalledWith(
      'firebase-user',
      expect.arrayContaining([
        expect.objectContaining({ type: 'bank', sourceId: 'bank-1', status: 'success', consentId: 'bank-consent' }),
        expect.objectContaining({ type: 'card', sourceId: '1234', status: 'success', consentId: 'card-consent' }),
      ]),
    );
    expect(JSON.stringify(result.request)).not.toContain('secret-token');
    expect(summaryLog).toHaveBeenCalledWith(expect.stringContaining('[Feezback pull summary] status=success'));
    expect(summaryLog).toHaveBeenCalledWith(expect.stringContaining('Bank account bank-1 | success | transactions=1'));
    expect(summaryLog).toHaveBeenCalledWith(expect.stringContaining('Credit card 1234 | success | transactions=1'));
  });

  it('pulls bank transactions through the explicit V2 consent endpoint', async () => {
    apiService.getUserAccounts.mockResolvedValue({
      accounts: [{
        resourceId: 'bank-resource',
        consentId: 'bank-consent',
        iban: 'IL00000001234567',
        currency: 'ILS',
        consentStatus: 'valid',
        _links: { transactions: { href: '/tpp/v1/legacy-link-that-must-not-be-used' } },
      }],
    });
    consentApiService.getAccountTransactionsByConsent.mockResolvedValue({ transactions: { booked: [] } });
    jest.spyOn(service as any, 'upsertSources').mockResolvedValue(undefined);

    await service.getAndSaveBankTransactions(
      'firebase-user',
      'firebase-user_sub',
      'booked',
      '2026-01-01',
      '2026-01-31',
      ['bank-resource'],
    );

    expect(consentApiService.getAccountTransactionsByConsent).toHaveBeenCalledWith(
      'firebase-user_sub',
      'bank-consent',
      'bank-resource',
      'booked',
      '2026-01-01',
      '2026-01-31',
    );
  });

  it('upgrades legacy account transaction links to the explicit V2 method', async () => {
    consentApiService.getAccountTransactionsByConsent.mockResolvedValue({ booked: [] });

    await service.getAccountTransactions(
      'firebase-user_sub',
      '/tpp/v1/users/user/consents/bank-consent/accounts/bank-resource/transactions',
      'booked',
      '2026-01-01',
      '2026-01-31',
    );

    expect(consentApiService.getAccountTransactionsByConsent).toHaveBeenCalledWith(
      'firebase-user_sub',
      'bank-consent',
      'bank-resource',
      'booked',
      '2026-01-01',
      '2026-01-31',
    );
  });

  it('flags identical provider data with distinct transaction IDs as a suspected duplicate', async () => {
    const normalized = (externalTransactionId: string) => ({
      externalTransactionId,
      merchantName: 'Cardcom Ltd',
      amount: -59,
      currency: 'ILS',
      transactionDate: new Date('2026-07-01T00:00:00.000Z'),
      paymentDate: null,
      paymentIdentifier: '4547',
      billId: null,
      billName: null,
      businessNumber: null,
      note: '{"dealDescription":"same"}',
    });
    const rows = [normalized('provider-a'), normalized('provider-b')];
    jest.spyOn(service, 'getAndSaveBankTransactions').mockResolvedValue({
      normalizedTransactions: [], bankErrors: [], sourceResults: [],
    });
    jest.spyOn(service, 'getAndSaveUserCardTransactions').mockResolvedValue({
      normalizedTransactions: rows,
      cardErrors: [],
      sourceResults: [{
        type: 'card', sourceId: '4547', displayName: 'Card', resourceId: 'card-resource',
        consentId: 'card-consent', status: 'success', transactionCount: 2,
        extractedTransactions: [], normalizedTransactions: rows, response: {}, error: null,
      }],
    });
    jest.spyOn(service, 'persistNormalizedTransactions').mockResolvedValue({
      newlySavedToCache: 2,
      alreadyExistingInCache: 0,
    });

    const result = await service.adminPullTransactionsForDateRange(
      'firebase-user', '2026-07-01', '2026-07-01', 'booked',
      [{ type: 'card', resourceId: 'card-resource' }],
    );

    expect(result.suspectedDuplicates).toEqual([
      expect.objectContaining({
        sourceType: 'card',
        sourceId: '4547',
        externalTransactionIds: ['provider-a', 'provider-b'],
      }),
    ]);
  });

  it('supports a diagnostic-only pull without persisting transactions or source status', async () => {
    jest.spyOn(service, 'getAndSaveBankTransactions').mockResolvedValue({
      normalizedTransactions: [], bankErrors: [], sourceResults: [{
        type: 'bank', sourceId: 'bank-1', displayName: 'Bank', resourceId: 'bank-resource',
        consentId: 'bank-consent', status: 'success', transactionCount: 0,
        extractedTransactions: [], normalizedTransactions: [], response: {}, error: null,
      }],
    });
    jest.spyOn(service, 'getAndSaveUserCardTransactions').mockResolvedValue({
      normalizedTransactions: [], cardErrors: [], sourceResults: [],
    });
    const persistSpy = jest.spyOn(service, 'persistNormalizedTransactions');

    const result = await service.adminPullTransactionsForDateRange(
      'firebase-user', '2026-07-01', '2026-07-01', 'booked',
      [{ type: 'bank', resourceId: 'bank-resource' }], false,
    );

    expect(result.persistenceMode).toBe('diagnostic');
    expect(result.databaseSaveResult).toBeNull();
    expect(persistSpy).not.toHaveBeenCalled();
    expect(userSyncStateService.updateSourceResults).not.toHaveBeenCalled();
  });

  it('keeps the successful response and exposes Feezback error details on a partial failure', async () => {
    jest.spyOn(service, 'getAndSaveBankTransactions').mockResolvedValue({
      normalizedTransactions: [],
      transactions: [],
      bankErrors: [],
      sourceResults: [{
        type: 'bank', sourceId: 'bank-1', displayName: 'Bank', resourceId: 'bank-resource',
        consentId: 'bank-consent', status: 'success', transactionCount: 0, response: {}, error: null,
      }],
    });
    jest.spyOn(service, 'getAndSaveUserCardTransactions').mockRejectedValue({
      name: 'FeezbackHttpError',
      message: 'Service unavailable',
      status: 503,
      code: 'ERR_BAD_RESPONSE',
      method: 'GET',
      url: 'https://api.feezback.example/cards/transactions',
      responseBody: { error: 'upstream unavailable' },
    });
    jest.spyOn(service, 'persistNormalizedTransactions').mockResolvedValue(null);

    const result = await service.adminPullTransactionsForDateRange(
      'firebase-user',
      '2026-02-01',
      '2026-02-28',
      'booked',
      [
        { type: 'bank', resourceId: 'bank-resource' },
        { type: 'card', resourceId: 'card-resource' },
      ],
    );

    expect(result.status).toBe('partial');
    expect(result.response.bank).not.toBeNull();
    expect(result.response.card).toBeNull();
    expect(result.response.errors).toContainEqual(expect.objectContaining({
      operation: 'card-transactions',
      status: 503,
      responseBody: { error: 'upstream unavailable' },
    }));
    expect(userSyncStateService.updateSourceResults).toHaveBeenCalledWith(
      'firebase-user',
      expect.arrayContaining([
        expect.objectContaining({ type: 'card', resourceId: 'card-resource', status: 'failed' }),
      ]),
    );
  });
});
