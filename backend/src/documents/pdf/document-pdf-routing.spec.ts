import { DocumentsService } from '../documents.service';
import { DocumentType } from '../../enum';

describe('local PDF document routing', () => {
  let service: any;
  beforeEach(() => {
    service = Object.create(DocumentsService.prototype);
    service.documentPdfRenderer = {
      render: jest.fn().mockResolvedValue(Buffer.from('%PDF-local')),
    };
    service.fillFasterSigner = {
      sign: jest.fn().mockResolvedValue(Buffer.from('%PDF-signed')),
    };
    service.imageStorage = {
      download: jest.fn().mockResolvedValue({
        buffer: Buffer.from('logo'),
        contentType: 'image/png',
      }),
    };
    service.businessService = {
      getBusinessByNumber: jest.fn().mockResolvedValue({
        businessName: 'latest name',
        businessAddress: 'latest address',
        businessPhone: '052-1234567',
        businessEmail: 'latest@example.test',
        logoPath: 'identity-images/business/1/latest.png',
      }),
    };
    service.transformLinesToItemsTable = jest.fn().mockResolvedValue([]);
    service.transformLinesToPaymentsTable = jest.fn().mockResolvedValue([]);
    service.transformSumsToSumTable = jest.fn().mockResolvedValue([]);
    service.transformPaymentsToSumTable = jest.fn().mockResolvedValue([]);
    service.formatDateToDDMMYYYY = () => '12-10-2026';
  });
  const data = (docType = DocumentType.RECEIPT) => ({
    docData: {
      docType,
      docNumber: '123',
      recipientName: 'לקוח',
      recipientId: '213654',
      issuerName: 'current name',
      issuerBusinessNumber: '314719279',
      docSubtitle: 'קבלה עבור חשבון עסקה 112233',
      docDescription: 'הערה חופשית',
      allocationNum: null,
    },
    linesData: [],
    paymentData: [],
  });
  it.each([
    DocumentType.RECEIPT,
    DocumentType.TAX_INVOICE,
    DocumentType.TAX_INVOICE_RECEIPT,
    DocumentType.TRANSACTION_INVOICE,
    DocumentType.CREDIT_INVOICE,
    DocumentType.PRICE_QUOTE,
    DocumentType.WORK_ORDER,
  ])('renders and signs type %s', async (docType) => {
    expect(
      (await service.generatePDF(data(docType), 'createDoc')).toString(),
    ).toBe('%PDF-signed');
    expect(service.fillFasterSigner.sign).toHaveBeenCalledTimes(1);
  });
  it('previews locally without signing and resolves current issuer identity', async () => {
    await service.generatePDF(data(), 'previewDoc');
    expect(service.fillFasterSigner.sign).not.toHaveBeenCalled();
    expect(service.documentPdfRenderer.render).toHaveBeenCalledWith(
      expect.objectContaining({
        preview: true,
        issuerName: 'שם העסק: latest name',
        subtitle: 'קבלה עבור חשבון עסקה 112233',
        note: 'הערה חופשית',
        recipientTaxNumber: 'מספר עוסק: 213654',
        allocation: null,
      }),
    );
  });
  it('preserves copy label', async () => {
    await service.generatePDF(data(), 'createDoc', true);
    expect(service.documentPdfRenderer.render).toHaveBeenCalledWith(
      expect.objectContaining({
        documentType: 'העתק נאמן למקור',
        preview: false,
      }),
    );
  });
  it('rejects unsupported operations before rendering or signing', async () => {
    await expect(service.generatePDF(data(), 'unknown')).rejects.toThrow(
      'Unknown document operation',
    );
    expect(service.documentPdfRenderer.render).not.toHaveBeenCalled();
    expect(service.fillFasterSigner.sign).not.toHaveBeenCalled();
  });
  it('propagates signing failure without returning the unsigned document', async () => {
    service.fillFasterSigner.sign.mockRejectedValue(
      new Error('provider failed'),
    );
    await expect(service.generatePDF(data(), 'createDoc')).rejects.toThrow(
      'provider failed',
    );
  });
  it('uses a newly changed logo for documents awaiting PDF generation', async () => {
    const pending = data();
    await service.generatePDF(pending, 'previewDoc');
    service.businessService.getBusinessByNumber.mockResolvedValueOnce({
      businessName: 'changed name',
      logoPath: 'identity-images/business/1/replacement.png',
    });
    await service.generatePDF(pending, 'createDoc');
    expect(service.imageStorage.download).toHaveBeenLastCalledWith(
      'identity-images/business/1/replacement.png',
    );
    expect(service.documentPdfRenderer.render).toHaveBeenLastCalledWith(
      expect.objectContaining({ issuerName: 'שם העסק: changed name' }),
    );
  });
  it('omits a removed logo when preparing a pending PDF', async () => {
    service.businessService.getBusinessByNumber.mockResolvedValueOnce({
      businessName: 'latest name',
      logoPath: null,
    });
    await service.generatePDF(data(), 'previewDoc');
    expect(service.imageStorage.download).not.toHaveBeenCalled();
  });
  it('preserves explicitly supplied system billing identity', async () => {
    const billing: any = data();
    billing.docData.issuerIdentitySource = 'system';
    billing.docData.issuerName = 'system company';
    await service.generatePDF(billing, 'createDoc');
    expect(service.businessService.getBusinessByNumber).not.toHaveBeenCalled();
    expect(service.documentPdfRenderer.render).toHaveBeenCalledWith(
      expect.objectContaining({ issuerName: 'שם העסק: system company' }),
    );
  });
  it('serves an already issued billing PDF without refreshing branding or rendering', async () => {
    service.documentsRepo = {
      findOneOrFail: jest
        .fn()
        .mockResolvedValue({
          id: 1,
          file: 'stored-original.pdf',
          copyFile: 'stored-copy.pdf',
        }),
    };
    service.downloadFromFirebase = jest
      .fn()
      .mockResolvedValue(Buffer.from('existing PDF'));
    const result = await service.finalizeBillingReceipt({
      docId: 1,
      issuerName: 'changed company',
    });
    expect(result.originalBuffer.toString()).toBe('existing PDF');
    expect(service.downloadFromFirebase).toHaveBeenCalledWith(
      'stored-original.pdf',
    );
    expect(service.businessService.getBusinessByNumber).not.toHaveBeenCalled();
    expect(service.documentPdfRenderer.render).not.toHaveBeenCalled();
  });
  it('prepares branding once and overlaps original signing with copy rendering', async () => {
    let releaseOriginal: (value: Buffer) => void;
    const originalSigned = new Promise<Buffer>(resolve => { releaseOriginal = resolve; });
    service.fillFasterSigner.sign.mockImplementationOnce(() => originalSigned)
      .mockResolvedValueOnce(Buffer.from('%PDF-signed-copy'));
    service.documentPdfRenderer.render.mockImplementation(async (model) => {
      if (model.documentType === 'העתק נאמן למקור') {
        expect(service.fillFasterSigner.sign).toHaveBeenCalledTimes(1);
        releaseOriginal(Buffer.from('%PDF-signed-original'));
      }
      return Buffer.from('%PDF-rendered');
    });
    const result = await service.generatePdfPair(data());
    expect(result.original.toString()).toBe('%PDF-signed-original');
    expect(result.copy.toString()).toBe('%PDF-signed-copy');
    expect(service.imageStorage.download).toHaveBeenCalledTimes(1);
    expect(service.businessService.getBusinessByNumber).toHaveBeenCalledTimes(1);
    const models = service.documentPdfRenderer.render.mock.calls.map(([model]) => model);
    expect(models[0].documentType).toBe('מקור');
    expect(models[1].documentType).toBe('העתק נאמן למקור');
    expect(models[1].logoDataUri).toBe(models[0].logoDataUri);
    expect(models[1].items).toBe(models[0].items);
  });
  it('settles in-flight copy rendering before surfacing original signing failure', async () => {
    let releaseCopy: (value: Buffer) => void;
    const copy = new Promise<Buffer>(resolve => { releaseCopy = resolve; });
    let markStarted: () => void;
    const started = new Promise<void>(resolve => { markStarted = resolve; });
    const error = new Error('sign failed');
    service.fillFasterSigner.sign.mockRejectedValueOnce(error);
    service.documentPdfRenderer.render.mockResolvedValueOnce(Buffer.from('%PDF-original'))
      .mockImplementationOnce(() => { markStarted(); return copy; });
    const operation = service.generatePdfPair(data());
    let settled = false;
    operation.then(() => { settled = true; }, () => { settled = true; });
    await started;
    await Promise.resolve();
    expect(settled).toBe(false);
    releaseCopy(Buffer.from('%PDF-copy'));
    await expect(operation).rejects.toBe(error);
    expect(service.fillFasterSigner.sign).toHaveBeenCalledTimes(1);
  });
  it('does not sign a copy if copy rendering fails', async () => {
    service.documentPdfRenderer.render.mockResolvedValueOnce(Buffer.from('%PDF-original'))
      .mockRejectedValueOnce(new Error('copy failed'));
    await expect(service.generatePdfPair(data())).rejects.toThrow('copy failed');
    expect(service.fillFasterSigner.sign).toHaveBeenCalledTimes(1);
  });
  it('starts both uploads before either finishes and preserves original/copy paths', async () => {
    let releaseOriginal: (path: string) => void;
    const original = new Promise<string>(resolve => { releaseOriginal = resolve; });
    service.uploadToFirebase = jest.fn().mockImplementationOnce(() => original)
      .mockImplementationOnce(async () => { releaseOriginal('original-path'); return 'copy-path'; });
    await expect(service.uploadPdfPair(data(), Buffer.from('original'), Buffer.from('copy')))
      .resolves.toEqual(['original-path', 'copy-path']);
  });
  it.each([0, 1])('cleans a successful sibling upload when upload %s fails', async (failed) => {
    service.uploadToFirebase = jest.fn().mockImplementation(async (...args) => {
      if (args[5] === (failed === 0 ? 'original' : 'copy')) throw Error('upload failed');
      return 'successful-path';
    });
    service.deleteFromFirebase = jest.fn().mockResolvedValue(undefined);
    await expect(service.uploadPdfPair(data(), Buffer.from('original'), Buffer.from('copy')))
      .rejects.toThrow('upload failed');
    expect(service.deleteFromFirebase).toHaveBeenCalledWith('successful-path');
  });
  it('preserves separately displayed VAT values for licensed credit invoices', async () => {
    const credit: any = data(DocumentType.CREDIT_INVOICE);
    Object.assign(credit.docData, {
      businessType: 'LICENSED',
      sumAftDisBefVAT: 100,
      sumWithoutVat: 0,
      vatSum: 18,
    });
    service.transformSumsToSumTable.mockResolvedValue([
      { תיאור: 'סה״כ', סכום: '₪118' },
    ]);
    await service.generatePDF(credit, 'previewDoc');
    const totals = service.documentPdfRenderer.render.mock.calls[0][0].totals;
    expect(totals.map((row) => row['סכום'])).toEqual([
      '₪100.00',
      '₪18.00',
      '₪118',
    ]);
  });
  it('resolves issuer identity only in the authenticated user scope', async () => {
    service.businessService = {
      getBusinessByNumber: jest.fn().mockResolvedValue(null),
    };
    await expect(
      service.transformDocumentData(
        { docData: { issuerBusinessNumber: 'other-business' } },
        'owner',
      ),
    ).rejects.toThrow('not owned');
    expect(service.businessService.getBusinessByNumber).toHaveBeenCalledWith(
      'other-business',
      'owner',
    );
  });
});
