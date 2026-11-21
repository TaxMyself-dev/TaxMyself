import { DocumentsService } from './documents.service';
import { RecordSource } from 'src/enum';
import { DocumentImportSource } from 'src/document-import/enums/document-import.enums';
import { ExtractedDocStatus } from './extracted-document.entity';

const priorEnv={...process.env};
beforeEach(()=>Object.assign(process.env,{DOCUMENT_AI_LIMIT_GROUP:'test',DOCUMENT_AI_MAX_CONCURRENCY:'8',DOCUMENT_AI_RPM:'60',DOCUMENT_AI_ITPM:'60000',DOCUMENT_AI_OTPM:'6000',DOCUMENT_AI_PDF_PAGE_TOKENS:'1000',DOCUMENT_AI_IMAGE_TOKENS:'1000',DOCUMENT_AI_OUTPUT_ESTIMATE:'100'}));
afterEach(()=>{process.env={...priorEnv};});
describe('DocumentsService.processInboxForUser deleted-document restoration', () => {
  function subject(findResults: any[][], file: any, importRows: any[] = []) {
    const files = Array.isArray(file) ? file : [file];
    const createdRows: Record<string, unknown>[] = [];
    const extractedDocRepo = {
      find: jest.fn(),
      remove: jest.fn(),
      create: jest.fn((row: Record<string, unknown>) => {
        createdRows.push({ ...row });
        return row;
      }),
      save: jest.fn(async (row: any) => row),
      createdRows,
    };
    for (const result of findResults) extractedDocRepo.find.mockResolvedValueOnce(result);

    const fakeThis = {
      queueStore:()=>({enqueue:jest.fn().mockResolvedValue({id:'job',state:'READY'})}),
      queuedInputs:[] as any[],
      userRepo: { findOne: jest.fn().mockResolvedValue({ index: 7 }) },
      ensureBusinessAndSubFolders: jest.fn().mockResolvedValue({
        driveInboxFolderId: 'inbox',
        driveProcessedFolderId: 'processed',
      }),
      googleDriveService: {
        listFolderFiles: jest.fn().mockResolvedValue(files),
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
      claimOcrAttempt: (DocumentsService.prototype as any).claimOcrAttempt,
      finalizeOcrClaimAsError: (DocumentsService.prototype as any).finalizeOcrClaimAsError,
      recordSourceForImport: (DocumentsService.prototype as any).recordSourceForImport,
      logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
    };

    fakeThis.queueStore=()=>({enqueue:jest.fn(async input=>{fakeThis.queuedInputs.push(input);return {id:'job',state:'READY'};})});
    return {
      fakeThis,
      // Exercise the inbox body directly. The public wrapper owns the
      // advisory/concurrency locks and is covered by documents-inbox-lock.
      run: () => (DocumentsService.prototype as any).processInboxForUserUnlocked.call(
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

    await expect(test.run()).resolves.toMatchObject({queued:1,failed:0});
    expect(test.fakeThis.queuedInputs[0]).toMatchObject({fileId:file.id,source:DocumentImportSource.EMAIL_FORWARDING});
    expect(test.fakeThis.documentProcessor.extract).not.toHaveBeenCalled();
    expect(test.fakeThis.extractedDocRepo.save).not.toHaveBeenCalled();
  });

  it('preserves WHATSAPP as the OCR/archive source for an API-imported file', async () => {
    const file = {
      id: 'whatsapp-file',
      name: 'receipt.pdf',
      mimeType: 'application/pdf',
      md5Checksum: null,
      createdTime: '2026-11-05T10:00:00.000Z',
    };
    const test = subject([[], [], []], file, [{
      driveFileId: file.id,
      source: DocumentImportSource.API_IMPORT,
    }]);
    test.fakeThis.documentProcessor.extract.mockResolvedValue({
      invoices: null,
      rawResponse: 'diagnostic OCR failure',
    });

    await expect(test.run()).resolves.toMatchObject({queued:1,failed:0});
    expect(test.fakeThis.queuedInputs[0]).toMatchObject({fileId:file.id,source:DocumentImportSource.API_IMPORT});
    expect(test.fakeThis.documentProcessor.extract).not.toHaveBeenCalled();
    expect(test.fakeThis.extractedDocRepo.save).not.toHaveBeenCalled();
  });

  it('moves an existing error row to processed without calling Claude again', async () => {
    const file = {
      id: 'failed-file',
      name: 'not-an-invoice.pdf',
      mimeType: 'application/pdf',
      md5Checksum: 'failed-content',
      createdTime: '2026-11-10T10:00:00.000Z',
    };
    const errorRow = {
      id: 1544,
      driveFileId: file.id,
      driveFileMd5: file.md5Checksum,
      status: ExtractedDocStatus.ERROR,
      deletedAt: null,
    };
    const test = subject([[errorRow], [errorRow], []], file);

    await expect(test.run()).resolves.toMatchObject({ skipped: 1, failed: 0 });

    expect(test.fakeThis.documentProcessor.extract).not.toHaveBeenCalled();
    expect(test.fakeThis.extractedDocRepo.remove).not.toHaveBeenCalled();
    expect(test.fakeThis.safelyMoveToProcessed)
      .toHaveBeenCalledWith(file.id, 'inbox', 'processed');
  });

  it('does not parse byte-identical content again under a new Drive file id', async () => {
    const file = {
      id: 'reuploaded-file',
      name: 'same-failed-document.pdf',
      mimeType: 'application/pdf',
      md5Checksum: 'failed-content',
      createdTime: '2026-11-10T10:00:00.000Z',
    };
    const priorError = {
      id: 1544,
      driveFileId: 'original-failed-file',
      driveFileMd5: file.md5Checksum,
      status: ExtractedDocStatus.ERROR,
      deletedAt: null,
    };
    const test = subject([[], [priorError], []], file);

    await expect(test.run()).resolves.toMatchObject({ duplicates: 1, failed: 0 });

    expect(test.fakeThis.documentProcessor.extract).not.toHaveBeenCalled();
    expect(test.fakeThis.saveDuplicateRow).toHaveBeenCalledWith(
      7,
      '123456789',
      file,
      new Date(file.createdTime),
      priorError.driveFileId,
      RecordSource.DRIVE,
    );
  });

  it('reserves queued content before its batch sibling can be admitted again', async () => {
    const files = [
      {
        id: 'first-copy',
        name: 'first.pdf',
        mimeType: 'application/pdf',
        md5Checksum: 'same-batch-content',
        createdTime: '2026-11-10T10:00:00.000Z',
      },
      {
        id: 'second-copy',
        name: 'second.pdf',
        mimeType: 'application/pdf',
        md5Checksum: 'same-batch-content',
        createdTime: '2026-11-10T10:00:01.000Z',
      },
    ];
    const test = subject([[], [], []], files);
    test.fakeThis.documentProcessor.extract.mockResolvedValue({
      invoices: null,
      rawResponse: 'diagnostic OCR failure',
    });

    await expect(test.run()).resolves.toMatchObject({
      failed: 0,
      queued: 1,
      duplicates: 1,
      total: 2,
    });

    expect(test.fakeThis.documentProcessor.extract).not.toHaveBeenCalled();
    expect(test.fakeThis.saveDuplicateRow).toHaveBeenCalledWith(
      7,
      '123456789',
      files[1],
      new Date(files[1].createdTime),
      files[0].id,
      RecordSource.DRIVE,
    );
  });

  it('discovery never executes AI or decides deletion from a pending file',async()=>{
    const file={id:'pending',name:'pending.pdf',mimeType:'application/pdf',md5Checksum:null};
    const test=subject([[],[],[]],file);
    await expect(test.run()).resolves.toMatchObject({queued:1,processed:0,failed:0});
    expect(test.fakeThis.queuedInputs[0]).toMatchObject({fileId:'pending',hash:expect.stringMatching(/^[a-f0-9]{64}$/)});
    expect(test.fakeThis.documentProcessor.extract).not.toHaveBeenCalled();
    expect(test.fakeThis.extractedDocRepo.save).not.toHaveBeenCalled();
  });
});
