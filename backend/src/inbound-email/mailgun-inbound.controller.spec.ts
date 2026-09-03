import {
  InternalServerErrorException,
  NotAcceptableException,
} from '@nestjs/common';
import { DocumentImportService } from 'src/document-import/document-import.service';
import { DocumentImportSource } from 'src/document-import/enums/document-import.enums';
import { MailgunInboundController } from './mailgun-inbound.controller';
import { MailgunSignatureService } from './mailgun-signature.service';

describe('MailgunInboundController spike', () => {
  const originalEnv = process.env;
  const signatureService = { assertValid: jest.fn() };
  const importDocument = jest.fn();
  const resolveRecipient = jest.fn();
  let controller: MailgunInboundController;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      MAILGUN_INBOUND_SPIKE_ENABLED: 'true',
      MAILGUN_INBOUND_SPIKE_RECIPIENT: 'spike@docs-dev.keepintax.co.il',
      MAILGUN_INBOUND_SPIKE_FIREBASE_ID: 'firebase-test-user',
      MAILGUN_INBOUND_SPIKE_BUSINESS_NUMBER: '123456789',
    };
    controller = new MailgunInboundController(
      signatureService as unknown as MailgunSignatureService,
      { importDocument } as unknown as DocumentImportService,
      { resolveRecipient } as any,
    );
    resolveRecipient.mockRejectedValue(new NotAcceptableException());
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('imports a supported attachment through the shared intake pipeline', async () => {
    importDocument.mockResolvedValue({ status: 'IMPORTED', reason: null });
    const file = attachment('invoice.pdf', 'application/pdf');

    const result = await controller.receive(
      { recipient: 'SPIKE@docs-dev.keepintax.co.il' },
      [file],
    );

    expect(signatureService.assertValid).toHaveBeenCalledTimes(1);
    expect(importDocument).toHaveBeenCalledWith({
      firebaseId: 'firebase-test-user',
      businessNumber: '123456789',
      source: DocumentImportSource.EMAIL_FORWARDING,
      filename: 'invoice.pdf',
      mimeType: 'application/pdf',
      content: file.buffer,
    });
    expect(result).toEqual({
      accepted: true,
      receivedFiles: 1,
      imported: 1,
      duplicates: 0,
      ignored: 0,
    });
  });

  it('routes an opaque production recipient to its owning business', async () => {
    process.env.MAILGUN_INBOUND_ENABLED = 'true';
    resolveRecipient.mockResolvedValue({
      firebaseId: 'mailbox-owner',
      businessNumber: '987654321',
    });
    importDocument.mockResolvedValue({ status: 'IMPORTED', reason: null });

    await controller.receive(
      { recipient: 'd-opaque@docs-dev.keepintax.co.il' },
      [attachment('invoice.pdf', 'application/pdf')],
    );

    expect(importDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        firebaseId: 'mailbox-owner',
        businessNumber: '987654321',
        source: DocumentImportSource.EMAIL_FORWARDING,
      }),
    );
    delete process.env.MAILGUN_INBOUND_ENABLED;
  });

  it('repairs a UTF-8 Hebrew filename decoded as latin1 by multipart parsing', async () => {
    importDocument.mockResolvedValue({ status: 'IMPORTED', reason: null });
    const hebrewFilename = 'חשבונית בדיקה.pdf';
    const mojibakeFilename = Buffer.from(hebrewFilename, 'utf8').toString(
      'latin1',
    );
    const file = attachment(mojibakeFilename, 'application/pdf');

    await controller.receive(
      { recipient: 'spike@docs-dev.keepintax.co.il' },
      [file],
    );

    expect(importDocument).toHaveBeenCalledWith(
      expect.objectContaining({ filename: hebrewFilename }),
    );
  });

  it('does not corrupt an already-correct Unicode filename', async () => {
    importDocument.mockResolvedValue({ status: 'IMPORTED', reason: null });
    const filename = 'חשבונית.pdf';

    await controller.receive(
      { recipient: 'spike@docs-dev.keepintax.co.il' },
      [attachment(filename, 'application/pdf')],
    );

    expect(importDocument).toHaveBeenCalledWith(
      expect.objectContaining({ filename }),
    );
  });

  it('ignores unsupported attachments without importing them', async () => {
    const result = await controller.receive(
      { recipient: 'spike@docs-dev.keepintax.co.il' },
      [attachment('notes.txt', 'text/plain')],
    );

    expect(importDocument).not.toHaveBeenCalled();
    expect(result.ignored).toBe(1);
  });

  it('returns 406 for an unknown recipient', async () => {
    await expect(
      controller.receive({ recipient: 'other@docs-dev.keepintax.co.il' }, []),
    ).rejects.toBeInstanceOf(NotAcceptableException);
  });

  it('requests a safe Mailgun retry when Drive or DB import fails', async () => {
    importDocument.mockResolvedValue({
      status: 'SKIPPED',
      reason: 'drive_upload_failed',
    });

    await expect(
      controller.receive({ recipient: 'spike@docs-dev.keepintax.co.il' }, [
        attachment('invoice.pdf', 'application/pdf'),
      ]),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});

function attachment(
  originalname: string,
  mimetype: string,
): Express.Multer.File {
  return {
    fieldname: 'attachment-1',
    originalname,
    encoding: '7bit',
    mimetype,
    size: 4,
    buffer: Buffer.from('test'),
    destination: '',
    filename: originalname,
    path: '',
    stream: null as any,
  };
}
