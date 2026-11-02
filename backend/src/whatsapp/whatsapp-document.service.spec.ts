import { DocumentImportSource } from '../document-import/enums/document-import.enums';
import { WhatsappDevelopmentConfig } from './whatsapp-development.config';
import { WhatsappRoutingService } from './whatsapp-routing.service';
import {
  MAX_WHATSAPP_DOCUMENT_BYTES,
  SimulatedDocumentMessage,
  WhatsappDocumentService,
} from './whatsapp-document.service';

describe('WhatsApp development document intake', () => {
  const original = { ...process.env };
  let importer: { importDocument: jest.Mock };
  let service: WhatsappDocumentService;
  const message = (
    override: Partial<SimulatedDocumentMessage> = {},
  ): SimulatedDocumentMessage => ({
    messageId: 'message-1',
    from: '972500000001',
    filename: 'receipt.pdf',
    mimeType: 'application/pdf',
    contentBase64: Buffer.from('%PDF-1.4\n%%EOF').toString('base64'),
    ...override,
  });
  const imported = { status: 'IMPORTED', driveFileId: 'file-1' };
  beforeEach(() => {
    process.env.WHATSAPP_DEV_CONTACTS = JSON.stringify([
      { phone: '0500000001', firebaseId: 'u1', businesses: ['b1'] },
      { phone: '0500000002', firebaseId: 'u2', businesses: ['b2', 'b3'] },
    ]);
    importer = { importDocument: jest.fn().mockResolvedValue(imported) };
    service = new WhatsappDocumentService(
      new WhatsappRoutingService(new WhatsappDevelopmentConfig()),
      importer,
    );
  });
  afterAll(() => {
    process.env = original;
  });
  it('passes the resolved owner/business and file bytes to the shared importer', async () => {
    expect((await service.receive(message())).status).toBe('IMPORTED');
    expect(importer.importDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        firebaseId: 'u1',
        businessNumber: 'b1',
        source: DocumentImportSource.API_IMPORT,
        content: Buffer.from('%PDF-1.4\n%%EOF'),
      }),
    );
  });
  it.each([
    [{ from: '0500000009' }, 'UNKNOWN_SENDER'],
    [{ from: '0500000002' }, 'BUSINESS_REQUIRED'],
    [{ businessNumber: 'b2' }, 'BUSINESS_NOT_ALLOWED'],
  ])('does not import blocked routing results', async (override, status) => {
    expect((await service.receive(message(override))).status).toBe(status);
    expect(importer.importDocument).not.toHaveBeenCalled();
  });
  it('uses selected business, never the importer default', async () => {
    await service.receive(
      message({ from: '0500000002', businessNumber: 'b3' }),
    );
    expect(importer.importDocument).toHaveBeenCalledWith(
      expect.objectContaining({ firebaseId: 'u2', businessNumber: 'b3' }),
    );
  });
  it('deduplicates concurrent deliveries of the same event', async () => {
    let finish: (value: any) => void;
    importer.importDocument.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const first = service.receive(message());
    const second = service.receive(message());
    await Promise.resolve();
    expect(importer.importDocument).toHaveBeenCalledTimes(1);
    finish(imported);
    expect((await first).status).toBe('IMPORTED');
    expect((await second).status).toBe('DUPLICATE_MESSAGE');
  });
  it('rejects reuse of an event id with another file or recipient', async () => {
    await service.receive(message());
    await expect(
      service.receive(
        message({
          contentBase64: Buffer.from('%PDF-1.4\nnew\n%%EOF').toString('base64'),
        }),
      ),
    ).rejects.toThrow('different payload');
    await expect(
      service.receive(message({ from: '0500000002', businessNumber: 'b2' })),
    ).rejects.toThrow('different payload');
    expect(importer.importDocument).toHaveBeenCalledTimes(1);
  });
  it('preserves shared content duplicate status for new events', async () => {
    importer.importDocument.mockResolvedValue({
      status: 'ALREADY_IMPORTED',
      driveFileId: 'existing',
    });
    expect(await service.receive(message())).toMatchObject({
      status: 'ALREADY_IMPORTED',
      driveFileId: 'existing',
    });
  });
  it('allows retry of a failed event and does not cache a false success', async () => {
    importer.importDocument.mockResolvedValueOnce({
      status: 'SKIPPED',
      reason: 'private OAuth detail',
    });
    expect(await service.receive(message())).toMatchObject({
      status: 'IMPORT_FAILED',
      retryable: true,
    });
    expect((await service.receive(message())).status).toBe('IMPORTED');
    expect(importer.importDocument).toHaveBeenCalledTimes(2);
  });
  it('does not expose exception text', async () => {
    importer.importDocument.mockRejectedValue(new Error('private credential'));
    const result = await service.receive(message());
    expect(result.status).toBe('IMPORT_FAILED');
    expect(JSON.stringify(result)).not.toContain('private credential');
  });
  it.each([
    { mimeType: 'text/plain' },
    { mimeType: 'image/png' },
    { contentBase64: '%%%' },
    { contentBase64: '' },
    { filename: '' },
    { messageId: '' },
    { contentBase64: Buffer.from('not a PDF').toString('base64') },
    {
      contentBase64: 'A'.repeat(
        Math.ceil(MAX_WHATSAPP_DOCUMENT_BYTES / 3) * 4 + 4,
      ),
    },
  ])(
    'rejects invalid or oversized attachments before upload',
    async (override) => {
      await expect(service.receive(message(override))).rejects.toThrow();
      expect(importer.importDocument).not.toHaveBeenCalled();
    },
  );
  it.each([
    ['image/jpeg', [255, 216, 255, 224]],
    ['image/png', [137, 80, 78, 71, 13, 10, 26, 10]],
  ])('accepts matching %s headers', async (mimeType, bytes) => {
    expect(
      (
        await service.receive(
          message({
            mimeType,
            contentBase64: Buffer.from(bytes).toString('base64'),
          }),
        )
      ).status,
    ).toBe('IMPORTED');
  });
  it('cleans filenames before import', async () => {
    await service.receive(message({ filename: '../receipt\u0000.pdf' }));
    expect(importer.importDocument.mock.calls[0][0].filename).toBe(
      '..-receipt-.pdf',
    );
  });
});
