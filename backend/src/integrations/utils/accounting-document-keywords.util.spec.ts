import {
  matchesAccountingDocumentKeyword,
  normalizeForKeywordMatch,
} from './accounting-document-keywords.util';

describe('accounting-document keyword matching', () => {
  describe('normalization', () => {
    it('folds case, hyphens, slashes, underscores, quotes and repeated whitespace', () => {
      expect(normalizeForKeywordMatch('Tax-Invoice').spaced).toBe(
        'tax invoice',
      );
      expect(normalizeForKeywordMatch('TAX_INVOICE').spaced).toBe(
        'tax invoice',
      );
      expect(normalizeForKeywordMatch('  Tax   Invoice \n #12 ').spaced).toBe(
        'tax invoice 12',
      );
      expect(normalizeForKeywordMatch('חשבונית מס/קבלה').spaced).toBe(
        'חשבונית מס קבלה',
      );
      expect(normalizeForKeywordMatch('חשבונית-מס').spaced).toBe('חשבונית מס');
      expect(normalizeForKeywordMatch('חשבונית "מס"').spaced).toBe(
        'חשבונית מס',
      );
    });

    it('exposes a space-free form for glued spellings', () => {
      expect(normalizeForKeywordMatch('Tax Invoice').compact).toBe(
        'taxinvoice',
      );
    });
  });

  describe('punctuation and spacing variants of the same term', () => {
    const variants = [
      'חשבונית מס/קבלה',
      'חשבונית מס-קבלה',
      'חשבונית  מס   קבלה',
      'חשבונית_מס_קבלה',
      'חשבונית\nמס\nקבלה',
      'חשבונית מס / קבלה',
    ];
    it.each(variants)('matches "%s"', (variant) => {
      expect(matchesAccountingDocumentKeyword(variant)).toBe(true);
    });

    const englishVariants = [
      'tax invoice',
      'Tax-Invoice',
      'TAX_INVOICE',
      'tax  invoice',
      'tax/invoice',
      'taxinvoice.pdf',
    ];
    it.each(englishVariants)('matches "%s"', (variant) => {
      expect(matchesAccountingDocumentKeyword(variant)).toBe(true);
    });
  });

  describe('accepted document names', () => {
    const accepted = [
      'חשבונית',
      'חשבוניות',
      'החשבונית שלך מצורפת',
      'והקבלה על התשלום',
      'קבלה 4432',
      'תעודת זיכוי',
      'דרישת תשלום',
      'חשבונית עסקה',
      'Invoice 2026-07',
      'invoices-july.pdf',
      'Please find the receipt attached',
      'receipts.pdf',
      'credit note #55',
      'Credit-Invoice.PDF',
      'kabala_2026.pdf',
    ];
    it.each(accepted)('accepts "%s"', (text) => {
      expect(matchesAccountingDocumentKeyword(text)).toBe(true);
    });
  });

  describe('weak generic words never match on their own', () => {
    const rejected = [
      'payment',
      'total',
      'amount',
      'document',
      'file',
      'payment total amount due',
      'Your payment was received — total 1,250',
      'מסמך',
      'קובץ',
      'תשלום',
      'סכום',
      'סכום התשלום הכולל',
      'מסמך מצורף לתשלום',
    ];
    it.each(rejected)('rejects "%s"', (text) => {
      expect(matchesAccountingDocumentKeyword(text)).toBe(false);
    });
  });

  describe('boundaries', () => {
    it('does not match a keyword hiding inside an unrelated English word', () => {
      expect(matchesAccountingDocumentKeyword('invoiced')).toBe(false);
      expect(matchesAccountingDocumentKeyword('prereceipt')).toBe(false);
      expect(matchesAccountingDocumentKeyword('receipting')).toBe(false);
    });

    it('does not match a Hebrew keyword hiding inside an unrelated Hebrew word', () => {
      // "התקבלה" ("was received") ends with "קבלה" but is not a receipt.
      expect(matchesAccountingDocumentKeyword('ההזמנה התקבלה בהצלחה')).toBe(
        false,
      );
    });

    it('still matches Hebrew keywords carrying their usual one-letter prefixes', () => {
      expect(matchesAccountingDocumentKeyword('בחשבונית')).toBe(true);
      expect(matchesAccountingDocumentKeyword('לקבלה')).toBe(true);
      expect(matchesAccountingDocumentKeyword('והחשבונית')).toBe(true);
    });

    it('ignores empty and missing input', () => {
      expect(matchesAccountingDocumentKeyword('')).toBe(false);
      expect(matchesAccountingDocumentKeyword(null)).toBe(false);
      expect(matchesAccountingDocumentKeyword(undefined)).toBe(false);
      expect(matchesAccountingDocumentKeyword('   ')).toBe(false);
    });
  });
});
