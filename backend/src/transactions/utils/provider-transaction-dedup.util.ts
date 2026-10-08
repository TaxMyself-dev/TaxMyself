import { NormalizedTransaction } from '../interfaces/normalized-transaction.interface';

export interface ProviderTransactionDedupResult {
  transactions: NormalizedTransaction[];
  duplicateCount: number;
  duplicateGroups: ProviderTransactionDuplicateGroup[];
}

export interface ProviderTransactionDuplicateGroup {
  paymentIdentifier: string;
  providerOriginalId: string;
  keptExternalTransactionId: string;
  transactions: NormalizedTransaction[];
}

/**
 * Collapses duplicate representations of one physical provider transaction.
 *
 * Feezback V2 may return the same bank transaction twice with different
 * transactionIds: both rows share the same ASPSP original ID and source, while
 * one carries an entryReference and the other does not. Feezback V1 returns the
 * no-entryReference variant, so preferring it preserves the external ID already
 * stored by deployments that are upgraded from V1 to V2.
 *
 * We deliberately require both providerOriginalId and paymentIdentifier. An
 * ASPSP ID is only guaranteed unique inside its payment source; without the
 * source we keep both rows rather than risk merging legitimate transactions.
 */
export function dedupeProviderTransactions(
  input: NormalizedTransaction[],
): ProviderTransactionDedupResult {
  const output: NormalizedTransaction[] = [];
  const indexByProviderKey = new Map<string, number>();
  const transactionsByProviderKey = new Map<string, NormalizedTransaction[]>();
  let duplicateCount = 0;

  for (const transaction of input) {
    const providerOriginalId = transaction.providerOriginalId?.trim();
    const paymentIdentifier = transaction.paymentIdentifier?.trim();
    if (!providerOriginalId || !paymentIdentifier) {
      output.push(transaction);
      continue;
    }

    const key = `${paymentIdentifier}|${providerOriginalId}`;
    const members = transactionsByProviderKey.get(key);
    if (members) {
      members.push(transaction);
    } else {
      transactionsByProviderKey.set(key, [transaction]);
    }
    const existingIndex = indexByProviderKey.get(key);
    if (existingIndex === undefined) {
      indexByProviderKey.set(key, output.length);
      output.push(transaction);
      continue;
    }

    duplicateCount++;
    const existing = output[existingIndex];
    if (isPreferredCanonical(transaction, existing)) {
      output[existingIndex] = transaction;
    }
  }

  const duplicateGroups = Array.from(transactionsByProviderKey.entries())
    .filter(([, transactions]) => transactions.length > 1)
    .map(([key, transactions]) => {
      const outputIndex = indexByProviderKey.get(key);
      const kept = outputIndex === undefined ? transactions[0] : output[outputIndex];
      return {
        paymentIdentifier: transactions[0].paymentIdentifier!.trim(),
        providerOriginalId: transactions[0].providerOriginalId!.trim(),
        keptExternalTransactionId: kept.externalTransactionId,
        transactions,
      };
    });

  return { transactions: output, duplicateCount, duplicateGroups };
}

function isPreferredCanonical(
  candidate: NormalizedTransaction,
  existing: NormalizedTransaction,
): boolean {
  const candidateHasEntryReference = !!candidate.providerEntryReference?.trim();
  const existingHasEntryReference = !!existing.providerEntryReference?.trim();

  if (candidateHasEntryReference !== existingHasEntryReference) {
    return !candidateHasEntryReference;
  }

  // Deterministic fallback when the provider returns two equally shaped rows.
  return candidate.externalTransactionId.localeCompare(existing.externalTransactionId) < 0;
}
