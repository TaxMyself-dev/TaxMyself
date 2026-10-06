import { FeezbackConsentApiService } from './feezback-consent-api.service';

describe('FeezbackConsentApiService V2 transaction pagination', () => {
  let httpClient: { get: jest.Mock };
  let service: FeezbackConsentApiService;

  beforeEach(() => {
    httpClient = { get: jest.fn() };
    service = new FeezbackConsentApiService(
      httpClient as any,
      {
        getTppId: () => 'test-tpp',
        getTppApiUrl: () => 'https://prod-tpp.feezback.test',
      } as any,
    );
  });

  const bankTransactions = (start: number, count: number) =>
    Array.from({ length: count }, (_, index) => ({ transactionId: `bank-${start + index}` }));

  const cardTransactions = (start: number, count: number) =>
    Array.from({ length: count }, (_, index) => ({ cardTransactionId: `card-${start + index}` }));

  it('requests zero-based 1000-row bank pages and combines every page', async () => {
    httpClient.get
      .mockResolvedValueOnce({ transactions: { booked: bankTransactions(0, 1000) } })
      .mockResolvedValueOnce({
        transactions: {
          booked: [
            { transactionId: 'bank-999' },
            ...bankTransactions(1000, 2),
          ],
        },
      });

    const result = await service.getAccountTransactionsByConsent(
      'user_sub', 'consent-1', 'account-1', 'booked', '2025-01-01', '2026-01-01',
    );

    expect(result.transactions.booked).toHaveLength(1002);
    expect(result.pagination).toEqual({
      pageSize: 1000,
      pagesFetched: 2,
      totalTransactions: 1002,
    });
    expect(httpClient.get).toHaveBeenCalledTimes(2);

    const firstUrl = new URL(httpClient.get.mock.calls[0][0]);
    const secondUrl = new URL(httpClient.get.mock.calls[1][0]);
    expect(firstUrl.pathname).toContain('/tpp/v2/');
    expect(firstUrl.searchParams.get('page')).toBe('0');
    expect(firstUrl.searchParams.get('pageSize')).toBe('1000');
    expect(secondUrl.searchParams.get('page')).toBe('1');
  });

  it('makes a final empty card request when the result is an exact page multiple', async () => {
    httpClient.get
      .mockResolvedValueOnce({ transactions: { booked: cardTransactions(0, 1000) } })
      .mockResolvedValueOnce({ transactions: { booked: [] } });

    const result = await service.getCardTransactions(
      'user_sub', 'consent-1', 'card-1', 'booked', '2025-01-01', '2026-01-01',
    );

    expect(result.transactions.booked).toHaveLength(1000);
    expect(result.pagination.pagesFetched).toBe(2);
    expect(httpClient.get).toHaveBeenCalledTimes(2);
  });

  it('rejects the whole source when a later page fails', async () => {
    httpClient.get
      .mockResolvedValueOnce({ transactions: { booked: bankTransactions(0, 1000) } })
      .mockRejectedValueOnce(Object.assign(new Error('page 1 unavailable'), { status: 503 }));

    await expect(service.getAccountTransactionsByConsent(
      'user_sub', 'consent-1', 'account-1', 'booked', '2025-01-01', '2026-01-01',
    )).rejects.toThrow('page 1 unavailable');
  });

  it('preserves booked and pending buckets across pages', async () => {
    httpClient.get
      .mockResolvedValueOnce({
        transactions: {
          booked: bankTransactions(0, 600),
          pending: bankTransactions(600, 400),
        },
      })
      .mockResolvedValueOnce({
        transactions: {
          booked: bankTransactions(1000, 1),
          pending: bankTransactions(1001, 1),
        },
      });

    const result = await service.getAccountTransactionsByConsent(
      'user_sub', 'consent-1', 'account-1', 'both', '2025-01-01', '2026-01-01',
    );

    expect(result.transactions.booked).toHaveLength(601);
    expect(result.transactions.pending).toHaveLength(401);
  });
});
