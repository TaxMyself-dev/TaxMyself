/**
 * Unit tests: D7 description chain (buildExpenseDescription) — Phase 4.6
 * test-suite extension. The util is the single source of truth for
 * expense.description / journal_entry.description:
 *   1. category+subCategory → "category/subCategory"
 *   2. recognized doc type → type label (+ supplier/number detail)
 *   3. otherwise → "מסמך לא מזוהה"
 */
import { buildExpenseDescription } from './expense-description.util';
import { ExtractedDocumentType } from '../documents/extracted-document.entity';

describe('buildExpenseDescription — D7 chain', () => {
  it('branch 1: classification pair wins over everything', () => {
    expect(
      buildExpenseDescription(
        { category: 'רכב ותחבורה', subCategory: 'דלק' },
        { documentType: ExtractedDocumentType.INVOICE, supplier: 'פז' },
      ),
    ).toBe('רכב ותחבורה/דלק');
  });

  it('branch 1 requires BOTH names — a lone category falls through', () => {
    expect(
      buildExpenseDescription(
        { category: 'רכב ותחבורה', subCategory: null },
        { documentType: ExtractedDocumentType.FORM_106 },
      ),
    ).toBe('טופס 106');
  });

  it('trims whitespace-only names before deciding', () => {
    expect(buildExpenseDescription({ category: '  ', subCategory: 'דלק' })).toBe('מסמך לא מזוהה');
  });

  it('branch 2: recognized doc type label, with supplier detail when present', () => {
    expect(
      buildExpenseDescription({}, { documentType: ExtractedDocumentType.RECEIPT, supplier: 'סופר פארם' }),
    ).toBe('קבלה - סופר פארם');
  });

  it('branch 2: falls back to invoiceNumber detail when supplier is missing', () => {
    expect(
      buildExpenseDescription({}, { documentType: ExtractedDocumentType.TAX_INVOICE_RECEIPT, invoiceNumber: '1042' }),
    ).toBe('חשבונית מס קבלה - 1042');
  });

  it('branch 2: bare type label when no detail exists', () => {
    expect(buildExpenseDescription({}, { documentType: ExtractedDocumentType.CREDIT_INVOICE })).toBe('חשבונית זיכוי');
  });

  it('branch 3: nothing recognized → מסמך לא מזוהה', () => {
    expect(buildExpenseDescription({})).toBe('מסמך לא מזוהה');
    expect(buildExpenseDescription({}, null)).toBe('מסמך לא מזוהה');
    expect(buildExpenseDescription({}, { documentType: null })).toBe('מסמך לא מזוהה');
  });
});
