import { DocumentsService } from '../documents.service';
import { BusinessType, DocumentType, isExemptBusinessType } from '../../enum';

// Characterization audit of current display defects; deliberately no calculation fixes.
const types = [DocumentType.RECEIPT, DocumentType.TAX_INVOICE, DocumentType.TAX_INVOICE_RECEIPT,
  DocumentType.TRANSACTION_INVOICE, DocumentType.CREDIT_INVOICE, DocumentType.PRICE_QUOTE, DocumentType.WORK_ORDER];
const businesses = Object.values(BusinessType);
const vatSummaryTypes = types.filter(type => ![DocumentType.RECEIPT, DocumentType.CREDIT_INVOICE].includes(type as any));
const licensed = businesses.filter(type => !isExemptBusinessType(type));
const exempt = businesses.filter(type => isExemptBusinessType(type));
const amount = (rows: any[], label: string) => rows.find(row => row['תיאור'] === label)?.['סכום'];

describe('current PDF discount display audit', () => {
  let service: any;
  beforeEach(() => {
    service = Object.create(DocumentsService.prototype);
    service.businessService = {getBusinessByNumber: jest.fn().mockResolvedValue({businessName: 'synthetic business'})};
    service.documentPdfRenderer = {render: jest.fn().mockResolvedValue(Buffer.from('%PDF-synthetic'))};
    service.fillFasterSigner = {sign: jest.fn().mockResolvedValue(Buffer.from('%PDF-signed-synthetic'))};
  });
  const fixture = (businessType: BusinessType, docType: DocumentType, discount: number) => ({
    docData: {businessType, docType, docNumber: '1', issuerBusinessNumber: 'synthetic', docDate: '2026-10-18',
      sumBefDisBefVat: 1000, disSum: discount, sumWithoutVat: isExemptBusinessType(businessType) ? 1000 : 0,
      sumAftDisBefVAT: 1000 - discount, vatSum: isExemptBusinessType(businessType) ? 0 : 162,
      sumAftDisWithVAT: 1000 - discount + (isExemptBusinessType(businessType) ? 0 : 162)},
    linesData: [], paymentData: [],
  });
  for (const business of businesses) for (const type of types) for (const discount of [0, 100]) {
    it(`${business}/${type}/discount=${discount}: current summary and unchanged input amounts`, async () => {
      const data = fixture(business, type, discount);
      const before = JSON.stringify(data);
      const rows = await service.transformSumsToSumTable(data.docData);
      expect(amount(rows, 'סה"כ:')).toBe(`₪${(data.docData.sumAftDisWithVAT).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
      const showsDiscount = isExemptBusinessType(business) && discount > 0;
      expect(amount(rows, 'הנחה:')).toBe(showsDiscount ? '₪100.00' : undefined);
      expect(amount(rows, 'סה"כ לפני הנחה:')).toBe(showsDiscount ? '₪1,000.00' : undefined);
      expect(JSON.stringify(data)).toBe(before);
    });
  }
  for (const business of licensed) for (const type of vatSummaryTypes) {
    it(`${business}/${type}: mixed VAT summary labels total net as taxable and repeats untaxed portion`, async () => {
      const doc = {...fixture(business, type, 100).docData, sumBefDisBefVat: 1300,
        sumWithoutVat: 300, sumAftDisBefVAT: 1200, vatSum: 162, sumAftDisWithVAT: 1362};
      const rows = await service.transformSumsToSumTable(doc);
      expect(amount(rows, 'סה"כ חייב במע"מ:')).toBe('₪1,200.00');
      expect(amount(rows, 'סה"כ ללא מע"מ:')).toBe('₪300.00');
      expect(amount(rows, 'סה"כ:')).toBe('₪1,362.00');
      // 1200 + 162 + 300 does not reconcile with displayed final 1362.
      expect(1200 + 162 + 300).not.toBe(doc.sumAftDisWithVAT);
    });
  }
  for (const business of licensed) {
    it(`${business}/credit: PDF model adds taxable/VAT rows but omits the untaxed portion`, async () => {
      const data = fixture(business, DocumentType.CREDIT_INVOICE, 100);
      Object.assign(data.docData, {sumBefDisBefVat: 1300, sumWithoutVat: 300,
        sumAftDisBefVAT: 1200, vatSum: 162, sumAftDisWithVAT: 1362});
      const model = await service.preparePdfModel(data, true, false);
      expect(amount(model.totals, 'סה״כ חייב במע״מ:')).toBe('₪900.00');
      expect(amount(model.totals, 'מע״מ:')).toBe('₪162.00');
      expect(model.totals).toHaveLength(3);
      expect(amount(model.totals, 'סה"כ:')).toBe('₪1,362.00');
      expect(amount(model.totals, 'הנחה:')).toBeUndefined();
    });
  }
  for (const business of exempt) {
    it(`${business}: uses sumWithoutVat rather than stored pre-discount field`, async () => {
      const doc = {...fixture(business, DocumentType.RECEIPT, 100).docData, sumWithoutVat: 900};
      const rows = await service.transformSumsToSumTable(doc);
      expect(doc.sumBefDisBefVat).toBe(1000);
      expect(amount(rows, 'סה"כ לפני הנחה:')).toBe('₪900.00');
    });
  }
  it('item display ignores the available line discount and uses pre-discount extended price', async () => {
    const line = {description: 'synthetic item', unitQuantity: 2, sumBefVatPerUnit: 500,
      disBefVatPerLine: 100, sumAftDisBefVatPerLine: 900};
    const rows = await service.transformLinesToItemsTable([line]);
    expect(rows[0]['סה"כ']).toBe('₪1,000.00');
    expect(Object.keys(rows[0])).toEqual(['סה"כ', 'מחיר', 'כמות', 'פירוט']);
    expect(line.sumAftDisBefVatPerLine).toBe(900);
  });
  it('original and copy share the same incomplete summary rather than differing by render path', async () => {
    await service.generatePdfPair(fixture(BusinessType.LICENSED, DocumentType.RECEIPT, 100));
    const [original, copy] = service.documentPdfRenderer.render.mock.calls.map(([model]) => model);
    expect(original.totals).toBe(copy.totals);
    expect(original.totals).toHaveLength(1);
    expect(amount(original.totals, 'סה"כ:')).toBe('₪1,062.00');
  });
});
