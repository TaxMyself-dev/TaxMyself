import { DocumentsService } from './documents.service';
import { BusinessType, DocumentType } from '../enum';

describe('one billing invoice with several service periods', () => {
  function make() {
    const fake: any = {
      formatDateDotDDMMYYYY: (date: Date) => date.toISOString().slice(0,10),
      getCurrentIndexes: jest.fn().mockResolvedValue({ docIndex: 1001, isInitial: false }),
      createDoc: jest.fn().mockResolvedValue({ id: 500, docNumber: '1001', generalDocIndex: '10' }),
    };
    const periods = ['09','10','11'].map(month => ({ planName: 'Basic',
      periodStart: new Date(`2026-${month}-15`), periodEnd: new Date(`2026-${Number(month)+1}-15`),
      amountBeforeVatAgorot: 10000, vatAmountAgorot: 1800, amountIncludingVatAgorot: 11800 }));
    const input: any = { systemUserId: 'issuer', issuerBusinessNumber: '123', issuerBusinessType: BusinessType.EXEMPT,
      recipientName: 'Customer', recipientEmail: null, amountBeforeVatAgorot: 30000,
      vatAmountAgorot: 5400, amountIncludingVatAgorot: 35400,
      planName: 'Basic', periodStart: periods[0].periodStart, periodEnd: periods[2].periodEnd,
      docDate: new Date('2026-11-20'), billingAttemptId: 21, periods };
    return { fake, input };
  }
  it('uses one existing document transaction, three period lines and one card payment', async () => {
    const { fake, input } = make();
    await DocumentsService.prototype.createBillingSystemReceipt.call(fake, input);
    expect(fake.createDoc).toHaveBeenCalledTimes(1);
    const request = fake.createDoc.mock.calls[0][0];
    expect(request.docData.docType).toBe(DocumentType.TAX_INVOICE_RECEIPT);
    expect(request.docData.billingAttemptId).toBe(21);
    expect(request.docData.sumAftDisWithVAT).toBe(354);
    expect(request.linesData).toHaveLength(3);
    expect(request.linesData.map((line: any) => line.lineNumber)).toEqual(['1','2','3']);
    expect(request.linesData[1].description).toContain('2026-10-15');
    expect(request.linesData.reduce((sum: number, line: any) => sum+line.sumAftDisBefVatPerLine+line.vatPerLine,0)).toBe(354);
    expect(request.paymentData).toHaveLength(1);
    expect(request.paymentData[0].paymentAmount).toBe(354);
  });
  it('refuses mismatched line totals before persisting any invoice or journal', async () => {
    const { fake, input } = make(); input.periods[1].amountIncludingVatAgorot = 100;
    await expect(DocumentsService.prototype.createBillingSystemReceipt.call(fake, input)).rejects.toThrow('totals');
    expect(fake.createDoc).not.toHaveBeenCalled();
  });
});
