/**
 * Unit tests: Phase 4.3 — D8 documentKind routing on the review side.
 *
 * Covers:
 *  - approveMatched / approveDocCash reject ANNUAL_DOCUMENT rows (400)
 *  - approving flips the doc's documentKind to EXPENSE_INVOICE in the same tx
 *  - toDocSummary carries documentKind to the preview wire format
 *
 * Uses the prototype.call(fakeThis) pattern — no full provider tree.
 */
import { BadRequestException } from '@nestjs/common';
import { ReportReviewService } from './report-review.service';
import { ExtractedDocStatus, ExtractedDocument } from '../documents/extracted-document.entity';
import { DocumentKind } from '../enum';

const ANNUAL_MSG = 'מסמך שנתי — לא הוצאה; יש לתייק אותו לדוח השנתי';

describe('ReportReviewService — D8 approve guards', () => {
  it('approveMatched rejects an ANNUAL_DOCUMENT with 400', async () => {
    const fakeThis = {
      loadMatchedPair: jest.fn().mockResolvedValue({
        doc: { id: 1, documentKind: DocumentKind.ANNUAL_DOCUMENT },
        slim: { id: 2 },
        cache: {},
      }),
    };
    await expect(
      ReportReviewService.prototype.approveMatched.call(fakeThis as any, 'uid', 'biz', 1, 2),
    ).rejects.toThrow(ANNUAL_MSG);
  });

  it('approveDocCash rejects an ANNUAL_DOCUMENT with 400', async () => {
    const fakeThis = {
      docRepo: {
        findOne: jest.fn().mockResolvedValue({
          id: 1,
          status: ExtractedDocStatus.PENDING_REVIEW,
          documentKind: DocumentKind.ANNUAL_DOCUMENT,
        }),
      },
      assertDocOwnership: jest.fn().mockResolvedValue(undefined),
    };
    await expect(
      ReportReviewService.prototype.approveDocCash.call(fakeThis as any, 'uid', 'biz', 1),
    ).rejects.toThrow(BadRequestException);
  });

  it('approveDocCash flips an UNIDENTIFIED doc to EXPENSE_INVOICE in the approve tx', async () => {
    const doc = {
      id: 1,
      status: ExtractedDocStatus.PENDING_REVIEW,
      documentKind: DocumentKind.UNIDENTIFIED,
      documentType: 'unknown',
      supplier: 'ספק', supplierId: '123', invoiceNumber: 'A1',
      amount: '100', currency: null, date: '2024-03-10',
      category: 'הוצאות רכב', subCategory: 'דלק',
      vatPercent: '66', taxPercent: '45', isEquipment: false,
      pairedWithDocumentId: null,
    };
    const docUpdates: any[] = [];
    const manager = {
      getRepository: jest.fn().mockImplementation((entity: any) => ({
        update: jest.fn().mockImplementation(async (where: any, patch: any) => {
          if (entity === ExtractedDocument) docUpdates.push({ where, patch });
        }),
      })),
    };
    const fakeThis = {
      docRepo: { findOne: jest.fn().mockResolvedValue(doc) },
      assertDocOwnership: jest.fn().mockResolvedValue(undefined),
      buildExpenseAmountFromDoc: jest.fn().mockReturnValue({ sum: 100, originalCurrency: null, originalSum: null }),
      dataSource: { transaction: jest.fn().mockImplementation((cb: any) => cb(manager)) },
      expensesService: { addExpense: jest.fn().mockResolvedValue({ id: 42 }) },
      businessRepo: { findOne: jest.fn().mockResolvedValue(null) },
      sharedService: { buildReportPeriodLabel: jest.fn().mockReturnValue('3/2024') },
      logger: { log: jest.fn() },
    };

    await expect(
      ReportReviewService.prototype.approveDocCash.call(fakeThis as any, 'uid', 'biz', 1),
    ).resolves.toEqual({ expenseId: 42 });

    const statusFlip = docUpdates.find((u) => u.patch.status === ExtractedDocStatus.APPROVED);
    expect(statusFlip).toBeDefined();
    expect(statusFlip.patch.documentKind).toBe(DocumentKind.EXPENSE_INVOICE);
    // addExpense joined the caller's tx (manager passed as 5th arg).
    expect(fakeThis.expensesService.addExpense.mock.calls[0][4]).toBe(manager);
  });
});

describe('ReportReviewService.toDocSummary — documentKind on the wire', () => {
  it('carries documentKind so the Phase-6 UI can tag ANNUAL/UNIDENTIFIED rows', () => {
    const summary = (ReportReviewService.prototype as any).toDocSummary.call(
      {},
      {
        id: 1, driveFileId: 'f', driveFileName: 'n.pdf',
        supplier: null, supplierId: null, date: null, invoiceNumber: null,
        allocationNumber: null, amount: null, category: null, subCategory: null,
        vatPercent: null, taxPercent: null, isEquipment: null, uploadDate: null,
        documentType: 'form_106', documentKind: DocumentKind.ANNUAL_DOCUMENT,
        currency: null, ilsAmount: null,
      },
      new Map(),
    );
    expect(summary.documentKind).toBe(DocumentKind.ANNUAL_DOCUMENT);
  });
});
