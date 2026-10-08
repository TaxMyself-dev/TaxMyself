export interface NormalizedTransaction {
  externalTransactionId: string;
  /**
   * Stable transaction identifier supplied by the underlying bank/ASPSP.
   * Ingestion-only metadata: it is intentionally not persisted in the cache.
   * Feezback V2 can emit two transactionIds for one ASPSP transaction.
   */
  providerOriginalId?: string | null;
  /** Used only to choose the V1-compatible canonical row during provider dedup. */
  providerEntryReference?: string | null;
  /**
   * ISO timestamp captured immediately after the Feezback HTTP response resolves.
   * Ingestion-only metadata used in duplicate alerts; it is not persisted.
   */
  providerResponseReceivedAt?: string | null;
  merchantName: string;
  amount: number;
  currency: string | null;
  transactionDate: Date;
  paymentDate: Date | null;
  paymentIdentifier: string | null;
  billId: number | null;
  billName: string | null;
  businessNumber: string | null;
  note: string | null;
}
