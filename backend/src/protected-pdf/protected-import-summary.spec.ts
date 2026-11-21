import { GmailDriveImportService } from '../integrations/services/gmail-drive-import.service';
import { DocumentImportService } from '../document-import/document-import.service';
import { DocumentImportSource } from '../document-import/enums/document-import.enums';
describe('Protected PDF import summaries', () => {
  const previous = process.env.PROTECTED_PDF_ENABLED;
  afterEach(() => {
    if (previous === undefined) delete process.env.PROTECTED_PDF_ENABLED;
    else process.env.PROTECTED_PDF_ENABLED = previous;
  });
  it('counts durable password-required imports separately from unresolved skips', async () => {
    process.env.PROTECTED_PDF_ENABLED = 'true';
    const reader = {
      scanMessages: async function* () {
        yield {
          messageId: 'message',
          failed: false,
          reviewRequired: 0,
          skippedIrrelevant: 0,
          skippedWithoutFilename: 0,
          matchedByPdfContent: 0,
          attachments: [
            {
              messageId: 'message',
              filename: 'locked.pdf',
              mimeType: 'application/pdf',
              content: Buffer.from('synthetic'),
            },
          ],
        };
      },
    };
    const shared = {
      importDocument: jest
        .fn()
        .mockResolvedValue({
          status: 'IMPORTED',
          passwordRequired: true,
          driveFileId: 'blocked-file',
        }),
      recordProtectedRun: jest.fn().mockResolvedValue(undefined),
    };
    const importer = new GmailDriveImportService(
      reader as any,
      shared as any,
      {} as any,
    );
    const result = await importer.importFromGmail(
      { id: 17, firebaseId: 'owner' } as any,
      { businessNumber: '123' },
    );
    expect(result).toMatchObject({
      imported: 1,
      passwordRequired: 1,
      reviewRequired: 0,
      messagesFailed: 0,
    });
    expect(shared.importDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        firebaseId: 'owner',
        businessNumber: '123',
        metadata: expect.objectContaining({
          integrationId: 17,
          gmailMessageId: 'message',
        }),
      }),
    );
    expect(shared.recordProtectedRun).toHaveBeenCalledWith(
      'owner',
      17,
      expect.objectContaining({ passwordRequired: 1 }),
    );
  });
  it('routes opening-password PDFs to blocked storage before ordinary inbox/dedup work', async () => {
    const stored = {
      status: 'IMPORTED',
      passwordRequired: true,
      importedDocumentId: 41,
    };
    const protectedPdf = {
      enabled: () => true,
      inspection: {
        inspect: jest.fn().mockResolvedValue({ kind: 'password_required' }),
      },
      storeLocked: jest.fn().mockResolvedValue(stored),
    };
    const drive = { uploadFile: jest.fn(), listFolderFiles: jest.fn() },
      repo = { findOne: jest.fn() };
    const service = new DocumentImportService(
      repo as any,
      {} as any,
      drive as any,
      {} as any,
      protectedPdf as any,
    );
    expect(
      await service.importDocument({
        firebaseId: 'owner',
        businessNumber: '123',
        source: DocumentImportSource.GMAIL,
        filename: 'locked.pdf',
        mimeType: 'application/pdf',
        content: Buffer.from('synthetic'),
      }),
    ).toBe(stored);
    expect(protectedPdf.storeLocked).toHaveBeenCalledWith(
      expect.objectContaining({ firebaseId: 'owner', businessNumber: '123' }),
    );
    expect(drive.uploadFile).not.toHaveBeenCalled();
    expect(repo.findOne).not.toHaveBeenCalled();
  });
});
