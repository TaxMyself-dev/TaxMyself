import { Logger } from '@nestjs/common';
import { WhatsappDevelopmentConfig } from './whatsapp-development.config';
import { WhatsappRoutingService } from './whatsapp-routing.service';
import { WhatsappDocumentService } from './whatsapp-document.service';
import { WhatsappSandboxImporter } from './whatsapp-sandbox-importer';

describe('WhatsApp shared import pipeline with sandbox I/O', () => {
  const original = { ...process.env };
  let service: WhatsappDocumentService;
  let importer: WhatsappSandboxImporter;
  const message = (
    id: string,
    from = '0500000001',
    businessNumber?: string,
  ) => ({
    messageId: id,
    from,
    businessNumber,
    filename: 'receipt.pdf',
    mimeType: 'application/pdf',
    contentBase64: Buffer.from('%PDF-1.4\n%%EOF').toString('base64'),
  });
  beforeEach(() => {
    process.env.WHATSAPP_DEV_CONTACTS = JSON.stringify([
      { phone: '0500000001', firebaseId: 'u1', businesses: ['b1'] },
      { phone: '0500000002', firebaseId: 'u2', businesses: ['b2', 'b3'] },
    ]);
    const config = new WhatsappDevelopmentConfig();
    importer = new WhatsappSandboxImporter(config);
    service = new WhatsappDocumentService(
      new WhatsappRoutingService(config),
      importer,
    );
  });
  afterAll(() => {
    process.env = original;
  });
  it('imports and finds identical bytes under a new event id', async () => {
    const first = await service.receive(message('first'));
    const duplicate = await service.receive(message('second'));
    expect(first.status).toBe('IMPORTED');
    expect(duplicate.status).toBe('ALREADY_IMPORTED');
    expect(duplicate.driveFileId).toBe(first.driveFileId);
  });
  it('keeps content dedup scoped to owner and business', async () => {
    const first = await service.receive(message('first'));
    const other = await service.receive(message('second', '0500000002', 'b2'));
    expect(other.status).toBe('IMPORTED');
    expect(other.driveFileId).not.toBe(first.driveFileId);
  });
  it('handles the shared importer upload failure and retries the same message', async () => {
    const logging = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    try {
      importer.failNextUpload();
      expect((await service.receive(message('retry'))).status).toBe(
        'IMPORT_FAILED',
      );
      expect((await service.receive(message('retry'))).status).toBe('IMPORTED');
    } finally {
      logging.mockRestore();
    }
  });
});
