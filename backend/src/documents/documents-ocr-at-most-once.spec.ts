import { BadRequestException } from '@nestjs/common';

import { DocumentsService } from './documents.service';
import { ExtractedDocStatus } from './extracted-document.entity';

describe('DocumentsService Drive OCR at-most-once boundary', () => {
  function directUploadSubject(extractResult: unknown) {
    const events: string[] = [];
    const createdRows: Record<string, unknown>[] = [];
    const extractedDocRepo = {
      create: jest.fn((row: Record<string, unknown>) => {
        createdRows.push({ ...row });
        return row;
      }),
      save: jest.fn(async (row: any) => {
        events.push(Array.isArray(row) ? 'result-save' : `save:${row.status}`);
        return row;
      }),
    };
    const fakeThis = {
      documentProcessor: {
        isSupportedMimeType: jest.fn().mockReturnValue(true),
        extract: jest.fn(async () => {
          events.push('claude');
          if (extractResult instanceof Error) throw extractResult;
          return extractResult;
        }),
      },
      userRepo: { findOne: jest.fn().mockResolvedValue({ index: 7 }) },
      ensureBusinessAndSubFolders: jest.fn().mockResolvedValue({
        driveInboxFolderId: 'inbox',
        driveProcessedFolderId: 'processed',
      }),
      googleDriveService: {
        uploadFile: jest.fn().mockResolvedValue('drive-file'),
      },
      buildExtractionCatalog: jest.fn().mockResolvedValue([]),
      fxRateService: { getRate: jest.fn() },
      extractedDocRepo,
      claimOcrAttempt: (DocumentsService.prototype as any).claimOcrAttempt,
      finalizeOcrClaimAsError: (DocumentsService.prototype as any).finalizeOcrClaimAsError,
      deriveMonthFromExtraction: (DocumentsService.prototype as any).deriveMonthFromExtraction,
      normalizeDocumentType: (DocumentsService.prototype as any).normalizeDocumentType,
      normalizeCurrency: (DocumentsService.prototype as any).normalizeCurrency,
      normalizeAllocationNumber: (DocumentsService.prototype as any).normalizeAllocationNumber,
      matchCatalogSubCategoryId: (DocumentsService.prototype as any).matchCatalogSubCategoryId,
      safelyMoveToProcessed: jest.fn(async () => {
        events.push('move');
      }),
    };
    return { fakeThis, extractedDocRepo, createdRows, events };
  }

  it('persists a processing claim before Claude and terminalizes an empty result', async () => {
    const test = directUploadSubject({ invoices: [], rawResponse: 'no invoices' });

    await expect(DocumentsService.prototype.uploadAndOcrDoc.call(
      test.fakeThis as any,
      'owner-firebase-id',
      '123456789',
      Buffer.from('pdf bytes'),
      'document.pdf',
      'application/pdf',
    )).rejects.toBeInstanceOf(BadRequestException);

    expect(test.events).toEqual([
      `save:${ExtractedDocStatus.PROCESSING}`,
      'claude',
      `save:${ExtractedDocStatus.ERROR}`,
      'move',
    ]);
    expect(test.createdRows[0]).toEqual(expect.objectContaining({
      driveFileId: 'drive-file',
      driveFileMd5: expect.stringMatching(/^[a-f0-9]{32}$/),
      status: ExtractedDocStatus.PROCESSING,
    }));
  });

  it('terminalizes an ambiguous provider exception without reopening the inbox', async () => {
    const test = directUploadSubject(new Error('provider timeout'));

    await expect(DocumentsService.prototype.uploadAndOcrDoc.call(
      test.fakeThis as any,
      'owner-firebase-id',
      '123456789',
      Buffer.from('pdf bytes'),
      'document.pdf',
      'application/pdf',
    )).rejects.toThrow('provider timeout');

    expect(test.events).toEqual([
      `save:${ExtractedDocStatus.PROCESSING}`,
      'claude',
      `save:${ExtractedDocStatus.ERROR}`,
      'move',
    ]);
  });

  it('does not call Claude when another path already won the unique claim', async () => {
    const test = directUploadSubject({ invoices: [], rawResponse: '' });
    test.extractedDocRepo.save.mockRejectedValueOnce(new Error('duplicate claim'));

    await expect(DocumentsService.prototype.uploadAndOcrDoc.call(
      test.fakeThis as any,
      'owner-firebase-id',
      '123456789',
      Buffer.from('pdf bytes'),
      'document.pdf',
      'application/pdf',
    )).rejects.toThrow('duplicate claim');

    expect(test.fakeThis.documentProcessor.extract).not.toHaveBeenCalled();
  });

  it('updates the claim in place and persists multi-invoice siblings once', async () => {
    const invoice = {
      document_type: 'invoice',
      currency: 'ILS',
      date: '2026-11-10',
      amount: 100,
      vat: 15.25,
      amount_before_vat: 84.75,
      category: null,
      sub_category: null,
    };
    const test = directUploadSubject({
      invoices: [invoice, { ...invoice, invoice_number: 'second' }],
      rawResponse: '{"invoices":[]}',
    });

    await expect(DocumentsService.prototype.uploadAndOcrDoc.call(
      test.fakeThis as any,
      'owner-firebase-id',
      '123456789',
      Buffer.from('pdf bytes'),
      'document.pdf',
      'application/pdf',
    )).resolves.toEqual(expect.objectContaining({
      driveFileId: 'drive-file',
      subIndex: 0,
      status: ExtractedDocStatus.PENDING_REVIEW,
    }));

    expect(test.events).toEqual([
      `save:${ExtractedDocStatus.PROCESSING}`,
      'claude',
      'result-save',
      'move',
    ]);
    const savedBatch = test.extractedDocRepo.save.mock.calls[1][0];
    expect(savedBatch).toHaveLength(2);
    expect(savedBatch[0]).toEqual(expect.objectContaining({ subIndex: 0 }));
    expect(savedBatch[1]).toEqual(expect.objectContaining({ subIndex: 1 }));
    expect(test.extractedDocRepo.create).toHaveBeenCalledTimes(2);
  });
});
