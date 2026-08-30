import { BadRequestException } from '@nestjs/common';

import { DocumentsService } from './documents.service';
import { ExtractedDocStatus } from './extracted-document.entity';

describe('DocumentsService document rejection reason', () => {
  const archiveDocument = DocumentsService.prototype.archiveDocument;

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
});
