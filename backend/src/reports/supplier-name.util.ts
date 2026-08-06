/**
 * Case-insensitive, whitespace-trimmed supplier-name key for name-based
 * matching when a stronger identifier (supplierId / Israeli tax ID) isn't
 * available or doesn't apply (e.g. a raw bank-transaction merchant name).
 * `toLowerCase()` is a no-op on Hebrew (no case), so this is safe for
 * Hebrew, Latin, and mixed names alike.
 *
 * Mirrors the comparison DocumentPairingService.isSameSupplier already
 * applies inline for a different purpose (invoice/receipt pairing within
 * one Drive-scan batch) — exported here so other callers (getReportPreview's
 * tx_only "ספק מוכר" fallback) don't have to re-derive the same rule.
 */
export function normalizeSupplierName(name: string | null | undefined): string {
  return (name ?? '').trim().toLowerCase();
}
