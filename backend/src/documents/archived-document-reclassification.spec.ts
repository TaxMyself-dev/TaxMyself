import { BadRequestException, HttpException } from '@nestjs/common';
import { ArchiveDocumentClassification, DocumentKind } from '../enum';
import { DocumentsService } from './documents.service';
import { ExtractedDocStatus } from './extracted-document.entity';

describe('DocumentsService.reclassifyArchivedDocument', () => {
  function subject(doc: any = {}) {
    const current = {
      id: 10,
      userId: 7,
      status: ExtractedDocStatus.ARCHIVED,
      confirmedExpenseId: null,
      deletedAt: null,
      pairedWithDocumentId: null,
      matchedTransactionId: null,
      ...doc,
    };
    const extractedDocRepo = {
      findOne: jest.fn().mockResolvedValue(current),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const fakeThis = {
      userRepo: { findOne: jest.fn().mockResolvedValue({ index: 7 }) },
      extractedDocRepo,
      slimTransactionRepo: { update: jest.fn() },
      resetMatchedSlimAndCascadePair: jest.fn().mockResolvedValue(undefined),
      archiveDocument: jest.fn().mockResolvedValue({ ok: true }),
      fileDocumentAsAnnual: jest.fn().mockResolvedValue({ ok: true }),
    };
    return {
      fakeThis,
      extractedDocRepo,
      run: (classification: ArchiveDocumentClassification, rejectionReason?: string | null) =>
        DocumentsService.prototype.reclassifyArchivedDocument.call(
          fakeThis as any,
          'client-1',
          10,
          classification,
          rejectionReason,
        ),
    };
  }

  it('returns a terminal document to pending expense review', async () => {
    const test = subject({ pairedWithDocumentId: 11, matchedTransactionId: 42 });

    await expect(test.run(ArchiveDocumentClassification.PENDING)).resolves.toEqual({
      ok: true,
      documentId: 10,
      classification: ArchiveDocumentClassification.PENDING,
    });
    expect(test.fakeThis.resetMatchedSlimAndCascadePair).toHaveBeenCalledWith(
      expect.objectContaining({ id: 10 }),
      ExtractedDocStatus.PENDING_REVIEW,
    );
    expect(test.extractedDocRepo.update).toHaveBeenCalledWith(
      { id: 10 },
      expect.objectContaining({
        status: ExtractedDocStatus.PENDING_REVIEW,
        documentKind: DocumentKind.EXPENSE_INVOICE,
        confirmedExpenseId: null,
        rejectionReason: null,
      }),
    );
    expect(test.extractedDocRepo.update).toHaveBeenCalledWith(
      { id: 11 },
      expect.objectContaining({ status: ExtractedDocStatus.PAIRED }),
    );
  });

  it.each([
    [ArchiveDocumentClassification.FILED_ANNUAL, 'fileDocumentAsAnnual'],
    [ArchiveDocumentClassification.ARCHIVED, 'archiveDocument'],
    [ArchiveDocumentClassification.REJECTED, 'archiveDocument'],
  ] as const)('delegates %s to the existing guarded transition', async (classification, method) => {
    const test = subject();
    await test.run(classification);
    expect(test.fakeThis[method]).toHaveBeenCalled();
  });

  it('passes the entered reason to the rejected transition', async () => {
    const test = subject();
    await test.run(ArchiveDocumentClassification.REJECTED, 'מסמך פרטי');
    expect(test.fakeThis.archiveDocument).toHaveBeenCalledWith(
      'client-1',
      10,
      ExtractedDocStatus.REJECTED,
      'מסמך פרטי',
    );
  });

  it('blocks approved evidence', async () => {
    const test = subject({ status: ExtractedDocStatus.APPROVED, confirmedExpenseId: 55 });
    await expect(test.run(ArchiveDocumentClassification.PENDING))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(test.extractedDocRepo.update).not.toHaveBeenCalled();
  });

  it('blocks another user’s document', async () => {
    const test = subject({ userId: 99 });
    await expect(test.run(ArchiveDocumentClassification.PENDING))
      .rejects.toBeInstanceOf(HttpException);
  });
});
