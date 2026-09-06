import { ReportReviewService } from './report-review.service';
import { buildSupplierIdentityIndexes } from '../shared/supplier-identity.util';

function document(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    driveFileId: 'drive-1',
    driveFileName: 'invoice.pdf',
    supplier: 'Google Cloud EMEA Limited',
    supplierId: null,
    date: '2026-04-30',
    invoiceNumber: '5559931688',
    allocationNumber: null,
    amount: '16.80',
    category: 'פנאי וחופשות',
    subCategory: 'שירותי סטרימינג',
    vatPercent: 0,
    taxPercent: 0,
    isEquipment: false,
    uploadDate: null,
    documentType: 'invoice',
    documentKind: 'EXPENSE_INVOICE',
    currency: 'USD',
    ilsAmount: '62.00',
    ...overrides,
  } as any;
}

describe('ReportReviewService saved foreign-supplier resolution', () => {
  const summarize = (doc: any, suppliers: any[]) =>
    (ReportReviewService.prototype as any).toDocSummary.call(
      {},
      doc,
      buildSupplierIdentityIndexes(suppliers),
    );

  it('uses the saved classification for a unique name match without a tax ID', () => {
    const result = summarize(document(), [{
      supplier: ' google-cloud EMEA limited ',
      supplierID: null,
      category: 'עסק',
      subCategory: 'תוכנות',
      vatPercent: 100,
      taxPercent: 100,
      isEquipment: false,
    }]);

    expect(result).toEqual(expect.objectContaining({
      matchedSupplierKnown: true,
      category: 'עסק',
      subCategory: 'תוכנות',
      vatPercent: 100,
      taxPercent: 100,
    }));
  });

  it('uses a formatted foreign tax ID as the authoritative match', () => {
    const result = summarize(document({ supplierId: 'ie-123 456-ab' }), [{
      supplier: 'Google Cloud EMEA Limited',
      supplierID: 'IE123456AB',
      category: 'עסק',
      subCategory: 'תוכנות',
      vatPercent: 100,
      taxPercent: 100,
      isEquipment: false,
    }]);

    expect(result.matchedSupplierKnown).toBe(true);
    expect(result.subCategory).toBe('תוכנות');
  });

  it('does not fall back to the name when a nonmatching tax ID was extracted', () => {
    const result = summarize(document({ supplierId: 'DIFFERENT123' }), [{
      supplier: 'Google Cloud EMEA Limited',
      supplierID: 'IE123456AB',
      category: 'עסק',
      subCategory: 'תוכנות',
    }]);

    expect(result.matchedSupplierKnown).toBe(false);
    expect(result.subCategory).toBe('שירותי סטרימינג');
  });
});
