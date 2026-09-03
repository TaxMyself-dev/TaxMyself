import { DocumentsService } from './documents.service';
import { RecordSource } from 'src/enum';
import { DocumentImportSource } from 'src/document-import/enums/document-import.enums';
import { ExtractedDocStatus } from './extracted-document.entity';

describe('DocumentsService.processInboxForUser deleted-document restoration', () => {
  function subject(findResults: any[][], file: any, importRows: any[] = []) {
    const extractedDocRepo = {
      find: jest.fn(),
      remove: jest.fn(),
    };
    for (const result of findResults) extractedDocRepo.find.mockResolvedValueOnce(result);

    const fakeThis = {
      userRepo: { findOne: jest.fn().mockResolvedValue({ index: 7 }) },
      ensureBusinessAndSubFolders: jest.fn().mockResolvedValue({
        driveInboxFolderId: 'inbox',
        driveProcessedFolderId: 'processed',
      }),
      googleDriveService: {
        listFolderFiles: jest.fn().mockResolvedValue([file]),
        downloadFile: jest.fn().mockResolvedValue(Buffer.from('pdf')),
      },
      importedDocumentRepo: { find: jest.fn().mockResolvedValue(importRows) },
      buildExtractionCatalog: jest.fn().mockResolvedValue([]),
      extractedDocRepo,
      documentProcessor: {
        isSupportedMimeType: jest.fn().mockReturnValue(true),
        extract: jest.fn(),
      },
      restoreDeletedDocumentRows: jest.fn().mockResolvedValue(1),
      safelyMoveToProcessed: jest.fn().mockResolvedValue(undefined),
      saveDuplicateRow: jest.fn(),
      saveErrorRow: jest.fn(),
      logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
    };

    return {
      fakeThis,
      run: () => DocumentsService.prototype.processInboxForUser.call(
        fakeThis as any,
        'client-firebase-id',
        '123456789',
      ),
    };
  }

  it('restores the retained document when a byte-identical file is uploaded again', async () => {
    const file = {
      id: 'new-file',
      name: 'renamed.pdf',
      mimeType: 'application/pdf',
      md5Checksum: 'same-content',
      createdTime: '2026-08-28T10:00:00.000Z',
    };
    const deletedRows = [{
      id: 41,
      userId: 7,
      businessNumber: '123456789',
      driveFileId: 'retained-file',
      driveFileMd5: 'same-content',
      status: ExtractedDocStatus.APPROVED,
      deletedAt: new Date(),
    }];
    // Current file-id rows, active MD5 rows, deleted MD5 rows.
    const test = subject([[], [], deletedRows], file);

    await expect(test.run()).resolves.toMatchObject({
      processed: 0,
      duplicates: 0,
      restored: 1,
      total: 1,
    });
    expect(test.fakeThis.restoreDeletedDocumentRows).toHaveBeenCalledWith(deletedRows);
    expect(test.fakeThis.safelyMoveToProcessed)
      .toHaveBeenCalledWith('new-file', 'inbox', 'processed');
    expect(test.fakeThis.documentProcessor.extract).not.toHaveBeenCalled();
    expect(test.fakeThis.saveDuplicateRow).not.toHaveBeenCalled();
  });

  it('restores rows when the exact retained Drive file returns to inbox', async () => {
    const file = {
      id: 'retained-file',
      name: 'original.pdf',
      mimeType: 'application/pdf',
      md5Checksum: null,
      createdTime: null,
    };
    const deletedRows = [{
      id: 41,
      driveFileId: 'retained-file',
      status: ExtractedDocStatus.PENDING_REVIEW,
      deletedAt: new Date(),
    }];
    const test = subject([deletedRows], file);

    await expect(test.run()).resolves.toMatchObject({ restored: 1, duplicates: 0 });
    expect(test.fakeThis.restoreDeletedDocumentRows).toHaveBeenCalledWith(deletedRows);
    expect(test.fakeThis.documentProcessor.extract).not.toHaveBeenCalled();
  });

  it('preserves EMAIL as the OCR/archive source for a Mailgun-imported file', async () => {
    const file = {
      id: 'mailgun-file',
      name: 'invoice.pdf',
      mimeType: 'application/pdf',
      md5Checksum: null,
      createdTime: '2026-09-02T10:00:00.000Z',
    };
    // Current file-id rows, active MD5 rows, deleted MD5 rows.
    const test = subject([[], [], []], file, [{
      driveFileId: file.id,
      source: DocumentImportSource.EMAIL_FORWARDING,
    }]);
    test.fakeThis.documentProcessor.extract.mockResolvedValue({
      invoices: null,
      rawResponse: 'diagnostic OCR failure',
    });

    await expect(test.run()).resolves.toMatchObject({ failed: 1 });
    expect(test.fakeThis.saveErrorRow).toHaveBeenCalledWith(
      7,
      '123456789',
      file,
      new Date(file.createdTime),
      'diagnostic OCR failure',
      RecordSource.EMAIL,
    );
  });
});
