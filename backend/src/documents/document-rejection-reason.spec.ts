import { BadRequestException } from '@nestjs/common';

import { DocumentsService } from './documents.service';
import { ExtractedDocStatus } from './extracted-document.entity';

describe('DocumentsService document rejection reason', () => {
  const archiveDocument = DocumentsService.prototype.archiveDocument;
  const saveDuplicateRow = (DocumentsService.prototype as any).saveDuplicateRow;
  const archiveRejectionReasonForDocument =
    (DocumentsService.prototype as any).archiveRejectionReasonForDocument;

  function makeService(documentOverrides: Record<string, unknown> = {}) {
    const extractedDocRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 10,
        userId: 7,
        status: ExtractedDocStatus.PENDING_REVIEW,
        deletedAt: null,
        rejectionReason: null,
        matchedTransactionId: null,
        pairedWithDocumentId: null,
        ...documentOverrides,
      }),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const resetMatchedSlimAndCascadePair = jest.fn().mockResolvedValue(undefined);
    const service = {
      userRepo: { findOne: jest.fn().mockResolvedValue({ index: 7 }) },
      extractedDocRepo,
      resetMatchedSlimAndCascadePair,
    };
    return { service, extractedDocRepo, resetMatchedSlimAndCascadePair };
  }

  it('trims and stores the optional reason when rejecting a document', async () => {
    const { service, extractedDocRepo, resetMatchedSlimAndCascadePair } = makeService();

    await archiveDocument.call(
      service as any,
      'firebase-1',
      10,
      ExtractedDocStatus.REJECTED,
      '  מסמך כפול  ',
    );

    expect(extractedDocRepo.update).toHaveBeenCalledWith(
      { id: 10 },
      { status: ExtractedDocStatus.REJECTED, rejectionReason: 'מסמך כפול' },
    );
    expect(resetMatchedSlimAndCascadePair).toHaveBeenCalledWith(
      expect.objectContaining({ id: 10 }),
      ExtractedDocStatus.REJECTED,
      'מסמך כפול',
    );
  });

  it('stores null when the user skips the reason', async () => {
    const { service, extractedDocRepo } = makeService();

    await archiveDocument.call(
      service as any,
      'firebase-1',
      10,
      ExtractedDocStatus.REJECTED,
      '   ',
    );

    expect(extractedDocRepo.update).toHaveBeenCalledWith(
      { id: 10 },
      { status: ExtractedDocStatus.REJECTED, rejectionReason: null },
    );
  });

  it('rejects a reason longer than the persisted column', async () => {
    const { service, extractedDocRepo } = makeService();

    await expect(archiveDocument.call(
      service as any,
      'firebase-1',
      10,
      ExtractedDocStatus.REJECTED,
      'x'.repeat(501),
    )).rejects.toBeInstanceOf(BadRequestException);

    expect(extractedDocRepo.update).not.toHaveBeenCalled();
  });

  it('stores an explicit duplicate reason for automatically rejected uploads', async () => {
    const extractedDocRepo = {
      create: jest.fn((row: Record<string, unknown>) => row),
      save: jest.fn().mockResolvedValue(undefined),
    };

    await saveDuplicateRow.call(
      { extractedDocRepo },
      7,
      '123456789',
      { id: 'duplicate-file', name: 'invoice.pdf', md5Checksum: 'same-content' },
      new Date('2026-09-09T10:00:00.000Z'),
      'original-file',
    );

    expect(extractedDocRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      status: ExtractedDocStatus.REJECTED,
      rejectionReason: 'קובץ כפול',
      rawResponse: expect.stringContaining('Duplicate of drive file original-file'),
    }));
  });

  it('projects the duplicate reason for legacy auto-rejected rows', () => {
    expect(archiveRejectionReasonForDocument.call({}, {
      status: ExtractedDocStatus.REJECTED,
      rejectionReason: null,
      rawResponse: 'Duplicate of drive file original-file (identical content hash) — skipped OCR.',
    })).toBe('קובץ כפול');
  });

  it('does not invent a reason for an ordinary rejected row', () => {
    expect(archiveRejectionReasonForDocument.call({}, {
      status: ExtractedDocStatus.REJECTED,
      rejectionReason: null,
      rawResponse: null,
    })).toBeNull();
  });
});
