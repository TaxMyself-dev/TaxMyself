import { GMAIL_DOCUMENT_TYPES } from './gmail-document-policy';
import { parseEmailAiOutcome } from './email-ai-outcome';
import { deriveDocumentKind } from './document-kind.util';
import { ExtractedDocumentType } from './extracted-document.entity';
import { DocumentKind } from '../enum';
describe('six-type Gmail contract (offline)', () => {
  it.each(GMAIL_DOCUMENT_TYPES)(
    'retains %s with missing optional data',
    (document_type) => {
      const result = parseEmailAiOutcome(
        JSON.stringify({
          decision: 'accounting',
          invoices: [
            { document_type, amount: null, date: null, invoice_number: null },
          ],
        }),
        true,
      );
      expect(result.decision).toBe('accounting');
      expect(result.invoices).toHaveLength(1);
    },
  );
  it.each(['insurance_policy', 'license_fee'])(
    'routes %s to existing approval without journal creation',
    (type) => {
      expect(deriveDocumentKind(type as ExtractedDocumentType)).toBe(
        DocumentKind.EXPENSE_INVOICE,
      );
    },
  );
  it.each([
    { invoices: [] },
    { decision: 'accounting', invoices: [] },
    { decision: 'uncertain', invoices: [] },
    { decision: 'not_accounting', invoices: [{ document_type: 'invoice' }] },
    { decision: 'accounting', invoices: [{ document_type: 'contract' }] },
    {
      decision: 'accounting',
      invoices: [{ document_type: 'invoice', amount: 'invented' }],
    },
  ])(
    'never permits deletion for an unresolved or contradictory envelope',
    (value) => {
      expect(parseEmailAiOutcome(JSON.stringify(value), true).decision).toBe(
        'uncertain',
      );
    },
  );
  it('requires an explicit valid negative', () => {
    expect(
      parseEmailAiOutcome('{"decision":"not_accounting","invoices":[]}', true),
    ).toEqual({ decision: 'not_accounting', invoices: [] });
  });
  it('preserves legacy other-channel types', () => {
    expect(
      parseEmailAiOutcome(
        '{"decision":"accounting","invoices":[{"document_type":"tax_form"}]}',
      ).decision,
    ).toBe('accounting');
  });
});
