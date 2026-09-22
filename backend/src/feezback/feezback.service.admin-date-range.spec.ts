import { FeezbackService } from './feezback.service';

describe('FeezbackService admin date-range diagnostics', () => {
  let service: FeezbackService;

  beforeEach(() => {
    service = new FeezbackService(
      {} as any,
      { getTppId: () => 'test-tpp' } as any,
      {
        withDebugTrace: async (operation: () => Promise<any>) => ({
          result: await operation(),
          httpCalls: [{
            sentAt: '2026-01-01T00:00:00.000Z',
            method: 'GET',
            url: 'https://api.feezback.example/transactions',
            attempt: 1,
            maxAttempts: 3,
            curl: "curl --request GET --header 'Authorization: <REDACTED>'",
          }],
        }),
      } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  it('returns timestamps, redacted request metadata, raw responses and save counts', async () => {
    const bankResponse = {
      normalizedTransactions: [{ externalTransactionId: 'bank-1' }],
      transactions: [{ transactionId: 'bank-1' }],
      bankErrors: [],
    };
    const cardResponse = {
      normalizedTransactions: [{ externalTransactionId: 'card-1' }],
      cards: [{ rawResponse: { booked: [{ cardTransactionId: 'card-1' }] } }],
      cardErrors: [],
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
    );

    expect(service.getAndSaveBankTransactions).toHaveBeenCalledWith(
      'firebase-user',
      'firebase-user_sub',
      'booked',
      '2026-01-01',
      '2026-01-31',
    );
    expect(service.persistNormalizedTransactions).toHaveBeenCalledWith(
      'firebase-user',
      expect.arrayContaining([
        expect.objectContaining({ externalTransactionId: 'bank-1' }),
        expect.objectContaining({ externalTransactionId: 'card-1' }),
      ]),
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
    });
    expect((result.response.bank as any).normalizedTransactions).toBeUndefined();
    expect((result.response.card as any).normalizedTransactions).toBeUndefined();
    expect(result.request.sentAt).toEqual(expect.any(String));
    expect(result.response.receivedAt).toEqual(expect.any(String));
    expect(result.response.durationMs).toEqual(expect.any(Number));
    expect(result.request.httpCalls[0].curl).toContain('Authorization: <REDACTED>');
    expect(JSON.stringify(result.request)).not.toContain('secret-token');
  });

  it('keeps the successful response and exposes Feezback error details on a partial failure', async () => {
    jest.spyOn(service, 'getAndSaveBankTransactions').mockResolvedValue({
      normalizedTransactions: [],
      transactions: [],
      bankErrors: [],
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
    );

    expect(result.status).toBe('partial');
    expect(result.response.bank).not.toBeNull();
    expect(result.response.card).toBeNull();
    expect(result.response.errors).toContainEqual(expect.objectContaining({
      operation: 'card-transactions',
      status: 503,
      responseBody: { error: 'upstream unavailable' },
    }));
  });
});
