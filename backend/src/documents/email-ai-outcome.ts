import { GMAIL_DOCUMENT_TYPES } from './gmail-document-policy';
export type EmailAiDecision = 'accounting' | 'not_accounting' | 'uncertain';

/** Strict classification envelope. Never treat malformed/truncated AI as rejection. */
export function parseEmailAiOutcome(
  raw: string,
  sixTypes = false,
): { decision: EmailAiDecision; invoices: any[] | null } {
  try {
    const body = sixTypes
      ? raw
          .trim()
          .replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, '$1')
          .trim()
      : raw;
    const parsed = JSON.parse(body);
    if (
      sixTypes &&
      (!parsed ||
        Object.keys(parsed).some(
          (key) => !['decision', 'invoices'].includes(key),
        ))
    )
      throw new Error('Unexpected envelope field');
    if (!parsed || !Array.isArray(parsed.invoices))
      throw new Error('Invalid envelope');
    if (parsed.decision === 'not_accounting' && parsed.invoices.length === 0)
      return { decision: 'not_accounting', invoices: [] };
    if (
      parsed.decision === 'accounting' &&
      parsed.invoices.length > 0 &&
      parsed.invoices.length <= 100 &&
      parsed.invoices.every(
        (invoice: any) =>
          invoice &&
          (sixTypes
            ? [...GMAIL_DOCUMENT_TYPES]
            : [
                'invoice',
                'receipt',
                'tax_invoice_receipt',
                'credit_invoice',
                'form_106',
                'tax_form',
                'contract',
              ]
          ).includes(invoice.document_type) &&
          (invoice.amount == null ||
            (typeof invoice.amount === 'number' &&
              Number.isFinite(invoice.amount))),
      )
    ) {
      return { decision: 'accounting', invoices: parsed.invoices };
    }
  } catch {
    /* unresolved; retain the original file and diagnostic record */
  }
  return { decision: 'uncertain', invoices: null };
}
