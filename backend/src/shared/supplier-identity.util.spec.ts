import {
  buildSupplierIdentityIndexes,
  findSupplierByIdentity,
  normalizeSupplierName,
  normalizeSupplierTaxId,
} from './supplier-identity.util';

describe('supplier identity utilities', () => {
  it('normalises supplier names without deleting word boundaries', () => {
    expect(normalizeSupplierName('  Google.Cloud   EMEA—Limited '))
      .toBe('google cloud emea limited');
    expect(normalizeSupplierName('A&B')).not.toBe(normalizeSupplierName('AB'));
  });

  it('normalises Israeli and foreign tax identifiers', () => {
    expect(normalizeSupplierTaxId(' 51-515-408-0 ')).toBe('515154080');
    expect(normalizeSupplierTaxId('ie 123-4567.ab')).toBe('IE1234567AB');
  });

  it('matches a foreign supplier by tax ID regardless of formatting', () => {
    const supplier = { supplier: 'Foreign Vendor', supplierID: 'IE-123 456-AB' };
    const indexes = buildSupplierIdentityIndexes([supplier]);

    expect(findSupplierByIdentity('ie123456ab', 'Different OCR Name', indexes)).toBe(supplier);
  });

  it('falls back to one normalised name only when the document has no tax ID', () => {
    const supplier = { supplier: 'Google Cloud EMEA Limited', supplierID: null };
    const indexes = buildSupplierIdentityIndexes([supplier]);

    expect(findSupplierByIdentity(null, ' google-cloud  emea limited ', indexes)).toBe(supplier);
    expect(findSupplierByIdentity('UNKNOWN123', 'Google Cloud EMEA Limited', indexes)).toBeUndefined();
  });

  it('does not match an ambiguous normalised name', () => {
    const indexes = buildSupplierIdentityIndexes([
      { supplier: 'Example Ltd.', supplierID: 'GB1' },
      { supplier: 'example ltd', supplierID: 'IE2' },
    ]);

    expect(findSupplierByIdentity(null, 'EXAMPLE LTD', indexes)).toBeUndefined();
  });
});
