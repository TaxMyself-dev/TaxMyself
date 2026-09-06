export interface SupplierIdentityLike {
  supplier?: string | null;
  supplierID?: string | null;
}

/** Stable comparison key that keeps words significant while normalising
 * Unicode presentation, casing, punctuation and repeated whitespace. */
export function normalizeSupplierName(name: string | null | undefined): string {
  return (name ?? '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

/** Canonical form for Israeli and foreign tax IDs. Letters (including a
 * printed country prefix) and digits are preserved; formatting is removed. */
export function normalizeSupplierTaxId(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}

function buildUniqueIndex<T>(values: readonly T[], keyOf: (value: T) => string): Map<string, T> {
  const result = new Map<string, T>();
  const ambiguous = new Set<string>();

  for (const value of values) {
    const key = keyOf(value);
    if (!key || ambiguous.has(key)) continue;
    if (result.has(key)) {
      result.delete(key);
      ambiguous.add(key);
    } else {
      result.set(key, value);
    }
  }

  return result;
}

/** Duplicate normalised names/IDs are omitted so they cannot trigger an
 * automatic classification. */
export function buildSupplierIdentityIndexes<T extends SupplierIdentityLike>(
  suppliers: readonly T[],
): { byTaxId: Map<string, T>; byName: Map<string, T> } {
  return {
    byTaxId: buildUniqueIndex(suppliers, s => normalizeSupplierTaxId(s.supplierID)),
    byName: buildUniqueIndex(suppliers, s => normalizeSupplierName(s.supplier)),
  };
}

/** Tax ID is authoritative when supplied. Name fallback is used only when
 * the source has no tax ID at all. */
export function findSupplierByIdentity<T extends SupplierIdentityLike>(
  supplierId: string | null | undefined,
  supplierName: string | null | undefined,
  indexes: { byTaxId: Map<string, T>; byName: Map<string, T> },
): T | undefined {
  const taxIdKey = normalizeSupplierTaxId(supplierId);
  if (taxIdKey) return indexes.byTaxId.get(taxIdKey);
  return indexes.byName.get(normalizeSupplierName(supplierName));
}
