/** A completed empty extraction is not a technical failure or a non-accounting verdict. */
export function isNoInvoiceOutcome(row: {
  status: string;
  rawResponse?: string | null;
  rejectionReason?: string | null;
}): boolean {
  if (row.status === 'no_invoice_found') return true;
  // Read-only compatibility for old error rows; never reinterpret provider errors,
  // uncertain decisions, truncation or arbitrary/malformed output.
  if (row.status !== 'error' || row.rejectionReason || !row.rawResponse)
    return false;
  try {
    const raw = row.rawResponse
      .trim()
      .replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, '$1')
      .trim();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.length === 0
      : !!parsed &&
          Object.keys(parsed).length === 1 &&
          Array.isArray(parsed.invoices) &&
          parsed.invoices.length === 0;
  } catch {
    return false;
  }
}
export function replacementProcessingOutcome(
  rows: Array<{
    status: string;
    rawResponse?: string | null;
    rejectionReason?: string | null;
  }>,
): 'PENDING' | 'FAILED' | 'SUCCEEDED' | 'NO_INVOICE_FOUND' {
  if (!rows.length || rows.some((row) => row.status === 'processing'))
    return 'PENDING';
  if (rows.some((row) => row.status === 'error' && !isNoInvoiceOutcome(row)))
    return 'FAILED';
  return rows.every(isNoInvoiceOutcome) ? 'NO_INVOICE_FOUND' : 'SUCCEEDED';
}
