import { NormalizedTransaction } from '../interfaces/normalized-transaction.interface';
import { dedupeProviderTransactions } from './provider-transaction-dedup.util';

const tx = (overrides: Partial<NormalizedTransaction>): NormalizedTransaction => ({
  externalTransactionId: 'tx-default',
  merchantName: 'Merchant',
  amount: -151.02,
  currency: 'ILS',
  transactionDate: new Date('2026-10-02T00:00:00.000Z'),
  paymentDate: new Date('2026-10-02T00:00:00.000Z'),
  paymentIdentifier: '0533089',
  billId: null,
  billName: null,
  businessNumber: null,
  note: 'Merchant',
  ...overrides,
});

describe('dedupeProviderTransactions', () => {
  it('collapses Feezback V2 variants by source + ASPSP id and keeps the V1-compatible id', () => {
    const result = dedupeProviderTransactions([
      tx({
        externalTransactionId: 'v2-enriched-id',
        providerOriginalId: 'BIO_369_533089_105_820',
        providerEntryReference: '13795',
      }),
      tx({
        externalTransactionId: 'v1-compatible-id',
        providerOriginalId: 'BIO_369_533089_105_820',
        providerEntryReference: '',
      }),
    ]);

    expect(result.duplicateCount).toBe(1);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].externalTransactionId).toBe('v1-compatible-id');
    expect(result.duplicateGroups).toEqual([
      expect.objectContaining({
        paymentIdentifier: '0533089',
        providerOriginalId: 'BIO_369_533089_105_820',
        keptExternalTransactionId: 'v1-compatible-id',
      }),
    ]);
  });

  it('does not merge the same ASPSP id across different payment sources', () => {
    const result = dedupeProviderTransactions([
      tx({ externalTransactionId: 'a', providerOriginalId: 'same', paymentIdentifier: '1111' }),
      tx({ externalTransactionId: 'b', providerOriginalId: 'same', paymentIdentifier: '2222' }),
    ]);

    expect(result.duplicateCount).toBe(0);
    expect(result.transactions).toHaveLength(2);
  });

  it('keeps rows without a provider original id instead of guessing from business fields', () => {
    const result = dedupeProviderTransactions([
      tx({ externalTransactionId: 'a', providerOriginalId: null }),
      tx({ externalTransactionId: 'b', providerOriginalId: null }),
    ]);

    expect(result.duplicateCount).toBe(0);
    expect(result.transactions).toHaveLength(2);
  });
});
