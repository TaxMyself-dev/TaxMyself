import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BusinessType, DocumentType, DocumentStatusType } from '../enum';
import { DocDataDto, TransferDetailsDto } from './dtos/doc-data.dto';
import { DocumentsService } from './documents.service';
import { normalizeTransferDetails } from './transfer-details';
import { buildDocumentHtml } from './pdf/document-pdf.template';

const details = { bank: 'בנק לדוגמה', branch: '001', accountNumber: '00012345', beneficiary: 'ישראל ישראלי' };
describe('document bank transfer instructions', () => {
  it.each([DocumentType.TRANSACTION_INVOICE, DocumentType.TAX_INVOICE])('preserves strings and trims type %s', type => {
    expect(normalizeTransferDetails(type, { ...details, bank: ' בנק לדוגמה ' })).toEqual(details);
  });
  it.each([undefined, null])('leaves legacy documents without instructions (%s)', value => {
    expect(normalizeTransferDetails(DocumentType.RECEIPT, value)).toBeNull();
  });
  it.each([DocumentType.RECEIPT, DocumentType.TAX_INVOICE_RECEIPT, DocumentType.CREDIT_INVOICE,
    DocumentType.PRICE_QUOTE, DocumentType.WORK_ORDER])('rejects instructions on unsupported type %s', type => {
    expect(() => normalizeTransferDetails(type, details)).toThrow();
  });
  it.each([{}, [], 'bank', { ...details, branch: 1 }, { ...details, bank: ' ' },
    { ...details, beneficiary: 'x'.repeat(101) }])('rejects incomplete or malformed data %j', value => {
    expect(() => normalizeTransferDetails(DocumentType.TAX_INVOICE, value)).toThrow();
  });
  it('validates nested DTO fields and retains them through whitelisting', async () => {
    const dto = plainToInstance(DocDataDto, { transferDetails: details });
    await validate(dto, { whitelist: true });
    expect(dto.transferDetails).toEqual(details);
    expect(await validate(plainToInstance(TransferDetailsDto, { ...details, branch: ' ' }))).not.toHaveLength(0);
    expect(await validate(plainToInstance(TransferDetailsDto, { ...details, accountNumber: 'x'.repeat(41) }))).not.toHaveLength(0);
  });

  let service: any;
  beforeEach(() => {
    service = Object.create(DocumentsService.prototype);
    service.businessService = { getBusinessByNumber: jest.fn().mockResolvedValue({ businessType: BusinessType.LICENSED }) };
  });
  it('transforms, persists, and restores the snapshot without creating payment rows', async () => {
    const transformed = await service.transformDocumentData({docData: {
      docType: DocumentType.TAX_INVOICE, issuerBusinessNumber: '123456789', generalDocIndex: '1', docNumber: '1',
      businessType: BusinessType.LICENSED, docDate: '2026-11-24',
      totalVatApplicable: 100, totalWithoutVat: 0, totalDiscount: 0, totalVat: 18, transferDetails: details,
    }, linesData: [], paymentData: []}, 'owner');
    expect(transformed.docData.transferDetails).toEqual(details);
    expect(transformed.paymentData).toEqual([]);
    service.documentsRepo = {save: jest.fn(async value => ({id: 1, ...value})), findOne: jest.fn()};
    const saved = await service.saveDocInfo('owner', transformed.docData);
    expect(saved.transferDetails).toEqual(details);
    service.documentsRepo.findOne.mockResolvedValue(saved);
    service.docLinesRepo = {find: jest.fn().mockResolvedValue([])};
    service.docPaymentsRepo = {find: jest.fn().mockResolvedValue([])};
    const restored = await service.loadDraft('owner', '123456789', DocumentType.TAX_INVOICE);
    expect(restored.docData.transferDetails).toEqual(details);
    expect(service.businessService.getBusinessByNumber).toHaveBeenCalledWith('123456789', 'owner');
  });
  it('uses stored bank instructions for original and copy when finalizing allocation', async () => {
    const repo = {save: jest.fn().mockResolvedValue(undefined), update: jest.fn()};
    const runner = {manager: {getRepository: () => repo}, connect: jest.fn(), startTransaction: jest.fn(),
      commitTransaction: jest.fn(), rollbackTransaction: jest.fn(), release: jest.fn()};
    service.documentsRepo = {findOne: jest.fn().mockResolvedValue({
      id: 1, issuerBusinessNumber: '123456789', docType: DocumentType.TAX_INVOICE, docNumber: '1',
      generalDocIndex: '1', docDate: '2026-11-24', docStatus: DocumentStatusType.PENDING_ALLOCATION,
      allocationNum: null, journalEntryId: 1, transferDetails: details,
    })};
    service.shaamAllocationAttemptRepo = {findOne: jest.fn().mockResolvedValue(null)};
    service.docLinesRepo = service.docPaymentsRepo = {find: jest.fn().mockResolvedValue([])};
    service.dataSource = {createQueryRunner: () => runner};
    service.generatePDF = jest.fn().mockResolvedValue(Buffer.from('signed'));
    service.uploadToFirebase = jest.fn().mockResolvedValueOnce('original').mockResolvedValueOnce('copy');
    service.deleteFromFirebase = jest.fn();
    await service.finalizeAllocation('owner', {issuerBusinessNumber: '123456789', docType: DocumentType.TAX_INVOICE,
      docNumber: '1', allocationNum: '123456789'});
    expect(service.generatePDF).toHaveBeenCalledTimes(2);
    for (const [input] of service.generatePDF.mock.calls) expect(input.docData.transferDetails).toEqual(details);
    expect(runner.commitTransaction).toHaveBeenCalledTimes(1);
  });
  it.each([true, false])('renders escaped instructions in preview=%s and copies from the document snapshot', async preview => {
    service.documentPdfRenderer = {render: jest.fn().mockResolvedValue(Buffer.from('%PDF'))};
    service.fillFasterSigner = {sign: jest.fn().mockResolvedValue(Buffer.from('%PDF signed'))};
    for (const method of ['transformLinesToItemsTable', 'transformLinesToPaymentsTable', 'transformSumsToSumTable', 'transformPaymentsToSumTable']) {
      service[method] = jest.fn().mockResolvedValue([]);
    }
    const input = {docData: {docType: DocumentType.TAX_INVOICE, docNumber: '1', issuerBusinessNumber: '123456789',
      docDate: '2026-11-24', transferDetails: {...details, beneficiary: '<script>bad</script>'}}, linesData: [], paymentData: []};
    for (const copy of [false, true]) {
      await service.generatePDF(input, preview ? 'previewDoc' : 'createDoc', copy);
      const model = service.documentPdfRenderer.render.mock.calls.at(-1)[0];
      expect(model.transferDetails.accountNumber).toBe('00012345');
      const html = buildDocumentHtml(model, '');
      expect(html).toContain('פרטי חשבון להעברת תשלום');
      expect(html).toContain('<bdi dir="ltr">001</bdi>');
      expect(html).toContain('&lt;script&gt;bad&lt;/script&gt;');
      expect(html).not.toContain('<script>');
      expect(html).not.toContain('<section class="payments">');
    }
  });
});
