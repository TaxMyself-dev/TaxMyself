/**
 * Unit tests: Phase 4.3 — D8 documentKind routing on the documents side.
 *
 * Covers:
 *  - deriveDocumentKind's full type→kind table
 *  - matchCatalogSubCategoryId name-matching (exact pair, sub-only fallback, miss)
 *  - fileDocumentAsAnnual: terminal NOT_AN_EXPENSE + ANNUAL_DOCUMENT,
 *    slim reset + pair cascade, idempotent, APPROVED docs rejected
 *  - setDocumentKind: PENDING_REVIEW only, value validation
 *  - QA regression: the full re-kind -> file chain, and its effect on the
 *    approval-queue query + archive-tab status derivation
 *
 * Uses the prototype.call(fakeThis) pattern from documents-catalog.service.spec
 * so no full DocumentsService provider tree is needed.
 */
import { BadRequestException, HttpException } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { deriveDocumentKind } from './document-kind.util';
import { ExtractedDocStatus, ExtractedDocumentType } from './extracted-document.entity';
import { DocumentKind, DocumentArchiveStatus } from '../enum';

describe('deriveDocumentKind (D8)', () => {
  it.each([
    [ExtractedDocumentType.INVOICE, DocumentKind.EXPENSE_INVOICE],
    [ExtractedDocumentType.RECEIPT, DocumentKind.EXPENSE_INVOICE],
    [ExtractedDocumentType.TAX_INVOICE_RECEIPT, DocumentKind.EXPENSE_INVOICE],
    [ExtractedDocumentType.CREDIT_INVOICE, DocumentKind.EXPENSE_INVOICE],
    [ExtractedDocumentType.INVOICE_RECEIPT_PAIR, DocumentKind.EXPENSE_INVOICE],
    [ExtractedDocumentType.FORM_106, DocumentKind.ANNUAL_DOCUMENT],
    [ExtractedDocumentType.TAX_FORM, DocumentKind.ANNUAL_DOCUMENT],
    [ExtractedDocumentType.CONTRACT, DocumentKind.UNIDENTIFIED],
    [ExtractedDocumentType.UNKNOWN, DocumentKind.UNIDENTIFIED],
    [null, DocumentKind.UNIDENTIFIED],
    [undefined, DocumentKind.UNIDENTIFIED],
  ])('%s → %s', (input, expected) => {
    expect(deriveDocumentKind(input as any)).toBe(expected);
  });
});

describe('DocumentsService.matchCatalogSubCategoryId', () => {
  const catalog = [
    { subCategoryName: 'דלק', categoryName: 'רכב ותחבורה', taxPercent: 45, vatPercent: 66, isEquipment: false, subCategoryId: 11 },
    { subCategoryName: 'דלק', categoryName: 'ציוד', taxPercent: 100, vatPercent: 100, isEquipment: true, subCategoryId: 12 },
    { subCategoryName: 'חשמל', categoryName: 'משרד', taxPercent: 100, vatPercent: 100, isEquipment: false, subCategoryId: 13 },
  ];
  const call = (category: any, sub: any) =>
    (DocumentsService.prototype as any).matchCatalogSubCategoryId.call({}, catalog, category, sub);

  it('exact (category, subCategory) pair wins', () => {
    expect(call('ציוד', 'דלק')).toBe(12);
  });

  it('sub-name-only fallback when the category does not match', () => {
    expect(call('קטגוריה שלא קיימת', 'חשמל')).toBe(13);
  });

  it('null on a miss or on missing sub name', () => {
    expect(call('רכב ותחבורה', 'לא בקטלוג')).toBeNull();
    expect(call('רכב ותחבורה', null)).toBeNull();
  });
});

describe('DocumentsService.fileDocumentAsAnnual (D8 "תייק")', () => {
  function makeFakeThis(doc: any) {
    return {
      userRepo: { findOne: jest.fn().mockResolvedValue({ index: 7, firebaseId: 'uid-1' }) },
      extractedDocRepo: {
        findOne: jest.fn().mockResolvedValue(doc),
        update: jest.fn().mockResolvedValue(undefined),
      },
      slimTransactionRepo: { update: jest.fn().mockResolvedValue(undefined) },
      resetMatchedSlimAndCascadePair: (DocumentsService.prototype as any).resetMatchedSlimAndCascadePair,
    };
  }
  const run = (fakeThis: any, docId = 1) =>
    DocumentsService.prototype.fileDocumentAsAnnual.call(fakeThis as any, 'uid-1', docId);

  it('flips to NOT_AN_EXPENSE + ANNUAL_DOCUMENT, resets slim, cascades pair', async () => {
    const fakeThis = makeFakeThis({
      id: 1, userId: 7, status: ExtractedDocStatus.PENDING_REVIEW,
      matchedTransactionId: 55, pairedWithDocumentId: 9,
    });

    await expect(run(fakeThis)).resolves.toEqual({ ok: true, documentId: 1 });

    expect(fakeThis.extractedDocRepo.update).toHaveBeenCalledWith(
      { id: 1 },
      { status: ExtractedDocStatus.NOT_AN_EXPENSE, documentKind: DocumentKind.ANNUAL_DOCUMENT },
    );
    expect(fakeThis.slimTransactionRepo.update).toHaveBeenCalledWith(
      { id: 55 },
      { matchedDocumentId: null, isRecognized: false },
    );
    expect(fakeThis.extractedDocRepo.update).toHaveBeenCalledWith(
      { id: 9 },
      { status: ExtractedDocStatus.NOT_AN_EXPENSE },
    );
  });

  it('idempotent: already-filed doc is a no-op', async () => {
    const fakeThis = makeFakeThis({ id: 1, userId: 7, status: ExtractedDocStatus.NOT_AN_EXPENSE });
    await expect(run(fakeThis)).resolves.toEqual({ ok: true, documentId: 1 });
    expect(fakeThis.extractedDocRepo.update).not.toHaveBeenCalled();
  });

  it('APPROVED docs cannot be filed (expense must be reversed first)', async () => {
    const fakeThis = makeFakeThis({ id: 1, userId: 7, status: ExtractedDocStatus.APPROVED });
    await expect(run(fakeThis)).rejects.toThrow(BadRequestException);
  });

  it('ownership enforced', async () => {
    const fakeThis = makeFakeThis({ id: 1, userId: 999, status: ExtractedDocStatus.PENDING_REVIEW });
    await expect(run(fakeThis)).rejects.toThrow(HttpException);
  });
});

describe('DocumentsService.setDocumentKind (D8 triage)', () => {
  function makeFakeThis(doc: any) {
    return {
      userRepo: { findOne: jest.fn().mockResolvedValue({ index: 7 }) },
      extractedDocRepo: {
        findOne: jest.fn().mockResolvedValue(doc),
        update: jest.fn().mockResolvedValue(undefined),
      },
    };
  }
  const run = (fakeThis: any, kind: any) =>
    DocumentsService.prototype.setDocumentKind.call(fakeThis as any, 'uid-1', 1, kind);

  it('re-kinds a PENDING_REVIEW row', async () => {
    const fakeThis = makeFakeThis({ id: 1, userId: 7, status: ExtractedDocStatus.PENDING_REVIEW });
    await expect(run(fakeThis, DocumentKind.EXPENSE_INVOICE)).resolves.toEqual({
      ok: true, documentId: 1, documentKind: DocumentKind.EXPENSE_INVOICE,
    });
    expect(fakeThis.extractedDocRepo.update).toHaveBeenCalledWith(
      { id: 1 }, { documentKind: DocumentKind.EXPENSE_INVOICE },
    );
  });

  it('rejects non-PENDING_REVIEW rows', async () => {
    const fakeThis = makeFakeThis({ id: 1, userId: 7, status: ExtractedDocStatus.ARCHIVED });
    await expect(run(fakeThis, DocumentKind.EXPENSE_INVOICE)).rejects.toThrow(BadRequestException);
  });

  it('rejects an invalid kind value', async () => {
    const fakeThis = makeFakeThis({ id: 1, userId: 7, status: ExtractedDocStatus.PENDING_REVIEW });
    await expect(run(fakeThis, 'NOT_A_KIND')).rejects.toThrow(BadRequestException);
  });
});

/**
 * QA regression (keepintax_prodcopy repro, 2026-07-14): filing looked
 * broken because a re-kinded-to-ANNUAL row's badge already read "saved"
 * before the terminal write ever happened. Persistence itself was verified
 * live against prodcopy and was correct — this guards the full chain a
 * real user drives: triage re-kind -> actually file -> the row disappears
 * from the PENDING_REVIEW query the approval screen sources from -> the
 * archive tab derives FILED_ANNUAL once the write has landed.
 */
describe('QA regression: D8 "תייק" end-to-end (setDocumentKind -> fileDocumentAsAnnual)', () => {
  it('files a document, drops it from the approval queue, and archives it as FILED_ANNUAL', async () => {
    // One in-memory row both calls mutate in place, like a real UPDATE would.
    const doc: any = {
      id: 42, userId: 7, status: ExtractedDocStatus.PENDING_REVIEW,
      documentKind: DocumentKind.UNIDENTIFIED, confirmedExpenseId: null,
      matchedTransactionId: null, pairedWithDocumentId: null,
    };
    const fakeThis = {
      userRepo: { findOne: jest.fn().mockResolvedValue({ index: 7, firebaseId: 'uid-1' }) },
      extractedDocRepo: {
        findOne: jest.fn().mockResolvedValue(doc),
        update: jest.fn((_criteria: any, patch: any) => {
          Object.assign(doc, patch);
          return Promise.resolve(undefined);
        }),
      },
      slimTransactionRepo: { update: jest.fn().mockResolvedValue(undefined) },
      resetMatchedSlimAndCascadePair: (DocumentsService.prototype as any).resetMatchedSlimAndCascadePair,
    };

    // Step 1: triage re-kind (what the "מסמך שנתי — סמן לתיוק" button does).
    await DocumentsService.prototype.setDocumentKind.call(fakeThis as any, 'uid-1', 42, DocumentKind.ANNUAL_DOCUMENT);
    expect(doc.documentKind).toBe(DocumentKind.ANNUAL_DOCUMENT);
    // Re-kinding alone must NOT file the doc — this is exactly the state
    // the old badge mislabeled as already "saved".
    expect(doc.status).toBe(ExtractedDocStatus.PENDING_REVIEW);

    // Step 2: the actual "תייק" click.
    await DocumentsService.prototype.fileDocumentAsAnnual.call(fakeThis as any, 'uid-1', 42);
    expect(doc.status).toBe(ExtractedDocStatus.NOT_AN_EXPENSE);
    expect(doc.documentKind).toBe(DocumentKind.ANNUAL_DOCUMENT);

    // The approval screen's query (ReportReviewService.getReportPreview)
    // filters strictly on status = PENDING_REVIEW — this row no longer matches.
    expect(doc.status).not.toBe(ExtractedDocStatus.PENDING_REVIEW);

    // The archive tab must now label it FILED_ANNUAL (DocumentsService.deriveArchiveStatus).
    const archiveStatus = (DocumentsService.prototype as any).deriveArchiveStatus
      .call(fakeThis, doc, new Map());
    expect(archiveStatus).toBe(DocumentArchiveStatus.FILED_ANNUAL);
  });
});
