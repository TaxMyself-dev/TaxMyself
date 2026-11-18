export type EmailAiDecision = 'accounting' | 'not_accounting' | 'uncertain';

/** Strict classification envelope. Never treat malformed/truncated AI as rejection. */
export function parseEmailAiOutcome(raw: string): { decision: EmailAiDecision; invoices: any[] | null } {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.invoices)) throw new Error('Invalid envelope');
    if (parsed.decision === 'not_accounting' && parsed.invoices.length === 0) return { decision: 'not_accounting', invoices: [] };
    if (parsed.decision === 'accounting' && parsed.invoices.length > 0 && parsed.invoices.length <= 100
      && parsed.invoices.every((invoice: any) => invoice && ['invoice', 'receipt', 'tax_invoice_receipt', 'credit_invoice', 'form_106', 'tax_form', 'contract'].includes(invoice.document_type)
        && (invoice.amount == null || (typeof invoice.amount === 'number' && Number.isFinite(invoice.amount))))) {
      return { decision: 'accounting', invoices: parsed.invoices };
    }
  } catch { /* unresolved; retain the original file and diagnostic record */ }
  return { decision: 'uncertain', invoices: null };
}
