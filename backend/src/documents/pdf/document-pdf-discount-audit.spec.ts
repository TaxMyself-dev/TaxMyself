import { DocumentsService } from '../documents.service';
import { BusinessType, DocumentType, isExemptBusinessType } from '../../enum';

// Regression coverage for discount detail and mixed-VAT reconciliation.
const types = [DocumentType.RECEIPT, DocumentType.TAX_INVOICE, DocumentType.TAX_INVOICE_RECEIPT,
  DocumentType.TRANSACTION_INVOICE, DocumentType.CREDIT_INVOICE, DocumentType.PRICE_QUOTE, DocumentType.WORK_ORDER];
const businesses = Object.values(BusinessType);
const vatSummaryTypes = types.filter(type => ![DocumentType.RECEIPT, DocumentType.CREDIT_INVOICE].includes(type as any));
const licensed = businesses.filter(type => !isExemptBusinessType(type));
const exempt = businesses.filter(type => isExemptBusinessType(type));
const amount = (rows: any[], label: string) => rows.find(row => row['תיאור'] === label)?.['סכום'];

describe('PDF discount display', () => {
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
    it(`${business}/${type}/discount=${discount}: shows discount detail without changing input amounts`, async () => {
      const data = fixture(business, type, discount);
      const before = JSON.stringify(data);
      const rows = await service.transformSumsToSumTable(data.docData);
      expect(amount(rows, 'סה"כ:')).toBe(`₪${(data.docData.sumAftDisWithVAT).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
      const showsDiscount = discount > 0;
      expect(amount(rows, 'הנחה:')).toBe(showsDiscount ? '₪100.00' : undefined);
      expect(amount(rows, 'סה"כ לפני הנחה:')).toBe(showsDiscount ? '₪1,000.00' : undefined);
      expect(JSON.stringify(data)).toBe(before);
    });
  }
  for (const business of licensed) for (const type of vatSummaryTypes) {
    it(`${business}/${type}: mixed VAT summary separates taxable and untaxed amounts`, async () => {
      const doc = {...fixture(business, type, 100).docData, sumBefDisBefVat: 1300,
        sumWithoutVat: 300, sumAftDisBefVAT: 1200, vatSum: 162, sumAftDisWithVAT: 1362};
      const rows = await service.transformSumsToSumTable(doc);
      expect(amount(rows, 'סה"כ חייב במע"מ:')).toBe('₪900.00');
      expect(amount(rows, 'סה"כ ללא מע"מ:')).toBe('₪300.00');
      expect(amount(rows, 'סה"כ:')).toBe('₪1,362.00');
      expect(900 + 162 + 300).toBe(doc.sumAftDisWithVAT);
    });
  }
  for (const business of licensed) {
    it(`${business}/credit: PDF model includes the untaxed portion`, async () => {
      const data = fixture(business, DocumentType.CREDIT_INVOICE, 100);
      Object.assign(data.docData, {sumBefDisBefVat: 1300, sumWithoutVat: 300,
        sumAftDisBefVAT: 1200, vatSum: 162, sumAftDisWithVAT: 1362});
      (data as any).linesData = [
        {description: 'taxable', vatOpts: 2, unitQuantity: 1, sumBefVatPerUnit: 900,
          disBefVatPerLine: 0, sumAftDisBefVatPerLine: 900},
        {description: 'untaxed', vatOpts: 3, unitQuantity: 1, sumBefVatPerUnit: 400,
          disBefVatPerLine: 100, sumAftDisBefVatPerLine: 300},
      ];
      const model = await service.preparePdfModel(data, true, false);
      expect(amount(model.totals, 'סה״כ חייב במע״מ:')).toBe('₪900.00');
      expect(amount(model.totals, 'מע״מ:')).toBe('₪162.00');
      expect(amount(model.totals, 'סה״כ ללא מע״מ:')).toBe('₪300.00');
      expect(model.totals).toHaveLength(6);
      expect(amount(model.totals, 'סה"כ:')).toBe('₪1,362.00');
      expect(amount(model.totals, 'הנחה:')).toBe('₪100.00');
    });
  }
  it('fresh preview derives the after-discount untaxed amount from string VAT line options', async () => {
    const data = fixture(BusinessType.LICENSED, DocumentType.TAX_INVOICE, 100);
    Object.assign(data.docData, {sumBefDisBefVat: 1300, sumWithoutVat: 400,
      sumAftDisBefVAT: 1200, vatSum: 162, sumAftDisWithVAT: 1362});
    (data as any).linesData = [
      {description: 'taxable', vatOpts: 'EXCLUDE', unitQuantity: 1, sumBefVatPerUnit: 900,
        disBefVatPerLine: 0, sumAftDisBefVatPerLine: 900},
      {description: 'untaxed', vatOpts: 'WITHOUT', unitQuantity: 1, sumBefVatPerUnit: 400,
        disBefVatPerLine: 100, sumAftDisBefVatPerLine: 300},
    ];
    const model = await service.preparePdfModel(data, true, false);
    expect(amount(model.totals, 'סה"כ חייב במע"מ:')).toBe('₪900.00');
    expect(amount(model.totals, 'סה"כ ללא מע"מ:')).toBe('₪300.00');
    expect(amount(model.totals, 'סה"כ:')).toBe('₪1,362.00');
  });
  for (const business of exempt) {
    it(`${business}: uses the stored pre-discount field`, async () => {
      const doc = {...fixture(business, DocumentType.RECEIPT, 100).docData, sumWithoutVat: 900};
      const rows = await service.transformSumsToSumTable(doc);
      expect(doc.sumBefDisBefVat).toBe(1000);
      expect(amount(rows, 'סה"כ לפני הנחה:')).toBe('₪1,000.00');
    });
  }
  it('item display shows the available line discount and the after-discount total', async () => {
    const line = {description: 'synthetic item', unitQuantity: 2, sumBefVatPerUnit: 500,
      disBefVatPerLine: 100, sumAftDisBefVatPerLine: 900};
    const rows = await service.transformLinesToItemsTable([line]);
    expect(rows[0]['סה"כ']).toBe('₪900.00');
    expect(rows[0]['הנחה']).toBe('₪100.00');
    expect(Object.keys(rows[0])).toEqual(['סה"כ', 'הנחה', 'מחיר', 'כמות', 'פירוט']);
    expect(line.sumAftDisBefVatPerLine).toBe(900);
  });
  it('original and copy share the same complete summary', async () => {
    await service.generatePdfPair(fixture(BusinessType.LICENSED, DocumentType.RECEIPT, 100));
    const [original, copy] = service.documentPdfRenderer.render.mock.calls.map(([model]) => model);
    expect(original.totals).toBe(copy.totals);
    expect(original.totals).toHaveLength(3);
    expect(amount(original.totals, 'סה"כ לפני הנחה:')).toBe('₪1,000.00');
    expect(amount(original.totals, 'הנחה:')).toBe('₪100.00');
    expect(amount(original.totals, 'סה"כ:')).toBe('₪1,062.00');
  });
});
