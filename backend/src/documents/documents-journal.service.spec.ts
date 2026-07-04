/**
 * Unit tests: Document → JournalEntry line mapping (documents.service.ts)
 *
 * buildDocumentJournalLines() — module-level exported pure function,
 * shared by both createDoc() and finalizeAllocation().
 *
 * Bug fix verified: previously, in the isCreditNote branch, the code checked
 * data.docData.docType === DocumentType.TAX_INVOICE_RECEIPT — but docType in
 * that branch is always CREDIT_INVOICE, so counterCode was always '1200',
 * even when the credited document was a TAX_INVOICE_RECEIPT (closed against
 * the bank, 1100). The fix uses parentDocType instead:
 *   const counterCode = parentDocType === DocumentType.TAX_INVOICE_RECEIPT ? '1100' : '1200';
 */
import { DocumentType } from '../enum';
import { buildDocumentJournalLines } from './documents.service';

describe('buildDocumentJournalLines', () => {

  describe('TAX_INVOICE', () => {
    it('debits the customer (1200) for the full amount, credits revenue (4000) net, credits VAT (2400)', () => {
      const result = buildDocumentJournalLines({
        docType: DocumentType.TAX_INVOICE,
        net: 100,
        vat: 17,
        full: 117,
        isLicensed: true,
      });

      expect(result!.counterAccountCode).toBe('1200');
      expect(result!.journalLines).toEqual([
        expect.objectContaining({ accountCode: '1200', debit: 117 }),
        expect.objectContaining({ accountCode: '4000', credit: 100, amountBeforeVat: 100, taxPercent: 100, vatPercent: 100, amountForTax: 100 }),
        expect.objectContaining({ accountCode: '2400', credit: 17, vatAmount: 17, vatPercent: 100 }),
      ]);
    });

    it('omits the VAT line entirely when vat = 0', () => {
      const result = buildDocumentJournalLines({
        docType: DocumentType.TAX_INVOICE,
        net: 100,
        vat: 0,
        full: 100,
        isLicensed: true,
      });

      expect(result!.journalLines).toHaveLength(2);
      expect(result!.journalLines.some((l: any) => l.accountCode === '2400')).toBe(false);
    });
  });

  describe('TAX_INVOICE_RECEIPT', () => {
    it('debits the bank (1100) instead of the customer account', () => {
      const result = buildDocumentJournalLines({
        docType: DocumentType.TAX_INVOICE_RECEIPT,
        net: 100,
        vat: 17,
        full: 117,
        isLicensed: true,
      });

      expect(result!.counterAccountCode).toBe('1100');
      expect(result!.journalLines[0]).toEqual(
        expect.objectContaining({ accountCode: '1100', debit: 117 }),
      );
    });

    it('omits the VAT line entirely when vat = 0', () => {
      const result = buildDocumentJournalLines({
        docType: DocumentType.TAX_INVOICE_RECEIPT,
        net: 100,
        vat: 0,
        full: 100,
        isLicensed: true,
      });
      expect(result!.journalLines).toHaveLength(2);
    });
  });

  describe('RECEIPT — עסק מורשה (licensed)', () => {
    it('closes the customer account against the bank, with no counterAccountCode', () => {
      const result = buildDocumentJournalLines({
        docType: DocumentType.RECEIPT,
        net: 100,
        vat: 17,
        full: 117,
        isLicensed: true,
      });

      expect(result!.counterAccountCode).toBeNull();
      expect(result!.journalLines).toEqual([
        expect.objectContaining({ accountCode: '1100', debit: 117 }),
        expect.objectContaining({ accountCode: '1200', credit: 117 }),
      ]);
    });
  });

  describe('RECEIPT — עסק פטור (exempt)', () => {
    it('recognizes cash-basis revenue directly, without a VAT line', () => {
      const result = buildDocumentJournalLines({
        docType: DocumentType.RECEIPT,
        net: 100,
        vat: 0,
        full: 100,
        isLicensed: false,
      });

      expect(result!.counterAccountCode).toBe('1100');
      expect(result!.journalLines).toEqual([
        expect.objectContaining({ accountCode: '1100', debit: 100 }),
        expect.objectContaining({ accountCode: '4000', credit: 100, amountBeforeVat: 100, taxPercent: 100 }),
      ]);
    });
  });

  describe('CREDIT_INVOICE', () => {
    it('reverses the original entry: credits the counter account, debits revenue and VAT', () => {
      const result = buildDocumentJournalLines({
        docType: DocumentType.CREDIT_INVOICE,
        parentDocType: DocumentType.TAX_INVOICE,
        net: 100,
        vat: 17,
        full: 117,
        isLicensed: true,
      });

      expect(result!.journalLines).toEqual([
        expect.objectContaining({ accountCode: '1200', credit: 117 }),
        expect.objectContaining({ accountCode: '4000', debit: 100, amountBeforeVat: 100, taxPercent: 100, vatPercent: 100, amountForTax: 100 }),
        expect.objectContaining({ accountCode: '2400', debit: 17, vatAmount: 17, vatPercent: 100 }),
      ]);
    });

    it('omits the VAT line when vat = 0', () => {
      const result = buildDocumentJournalLines({
        docType: DocumentType.CREDIT_INVOICE,
        parentDocType: DocumentType.TAX_INVOICE,
        net: 100,
        vat: 0,
        full: 100,
        isLicensed: true,
      });
      expect(result!.journalLines).toHaveLength(2);
    });

    // ── bug-fix coverage ──────────────────────────────────────────────────────

    it('[bug fix] credits the bank (1100) when the credited document was a TAX_INVOICE_RECEIPT', () => {
      const result = buildDocumentJournalLines({
        docType: DocumentType.CREDIT_INVOICE,
        parentDocType: DocumentType.TAX_INVOICE_RECEIPT,
        net: 100,
        vat: 17,
        full: 117,
        isLicensed: true,
      });

      expect(result!.journalLines[0]).toEqual(
        expect.objectContaining({ accountCode: '1100', credit: 117 }),
      );
    });

    it('[bug fix] credits the customer account (1200) when the credited document was a plain TAX_INVOICE', () => {
      const result = buildDocumentJournalLines({
        docType: DocumentType.CREDIT_INVOICE,
        parentDocType: DocumentType.TAX_INVOICE,
        net: 100,
        vat: 17,
        full: 117,
        isLicensed: true,
      });

      expect(result!.journalLines[0]).toEqual(
        expect.objectContaining({ accountCode: '1200', credit: 117 }),
      );
    });

    it('defaults to the customer account (1200) when parentDocType is not provided', () => {
      const result = buildDocumentJournalLines({
        docType: DocumentType.CREDIT_INVOICE,
        net: 100,
        vat: 17,
        full: 117,
        isLicensed: true,
      });

      expect(result!.journalLines[0]).toEqual(
        expect.objectContaining({ accountCode: '1200', credit: 117 }),
      );
    });
  });

  describe('unsupported document types', () => {
    it('returns null for a docType not in docTypesWithJournalEntry (e.g. DELIVERY_NOTE)', () => {
      const result = buildDocumentJournalLines({
        docType: 'DELIVERY_NOTE' as DocumentType,
        net: 100,
        vat: 17,
        full: 117,
        isLicensed: true,
      });
      expect(result).toBeNull();
    });
  });
});
