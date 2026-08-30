import { BadRequestException } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportReviewService } from './report-review.service';

describe('ReportsController focused archive review', () => {
  const from = new Date('2026-01-01T00:00:00.000Z');
  const to = new Date('2026-12-31T00:00:00.000Z');

  function subject() {
    const reviewService = {
      getReportPreview: jest.fn().mockResolvedValue({ rows: [] }),
    };
    const sharedService = {
      convertStringToDateObject: jest.fn((value: string) =>
        value === '2026-01-01' ? from : value === '2026-12-31' ? to : null,
      ),
    };
    const controller = new ReportsController(
      {} as any,
      reviewService as any,
      sharedService as any,
      {} as any,
    );
    return { controller, reviewService };
  }

  it('forwards a positive focusDocumentId to the review service', async () => {
    const { controller, reviewService } = subject();

    await controller.getReportPreview(
      { user: { firebaseId: 'client-1' } } as any,
      {
        businessNumber: '123456789',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        focusDocumentId: 42,
      },
    );

    expect(reviewService.getReportPreview).toHaveBeenCalledWith(
      'client-1',
      '123456789',
      { from, to },
      { focusDocumentId: 42 },
    );
  });

  it.each([0, -1, 1.5, Number.NaN])('rejects invalid focusDocumentId %p', async (focusDocumentId) => {
    const { controller, reviewService } = subject();

    await expect(controller.getReportPreview(
      { user: { firebaseId: 'client-1' } } as any,
      {
        businessNumber: '123456789',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        focusDocumentId,
      },
    )).rejects.toBeInstanceOf(BadRequestException);
    expect(reviewService.getReportPreview).not.toHaveBeenCalled();
  });
});

describe('ReportReviewService focused archive preview', () => {
  it('loads only the selected pending document and skips inbox/pairing/matching side effects', async () => {
    const focusedFrom = new Date('2026-01-01T00:00:00.000Z');
    const focusedTo = new Date('2026-12-31T00:00:00.000Z');
    const queryBuilder: any = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    const fakeThis: any = {
      userRepo: { findOne: jest.fn().mockResolvedValue({ index: 7, hasOpenBanking: true }) },
      assertBusinessOwnership: jest.fn().mockResolvedValue(undefined),
      documentsService: { processInboxForUser: jest.fn() },
      documentPairingService: { pairInvoicesAndReceiptsForBusiness: jest.fn() },
      matchingService: { matchDocumentsForBusiness: jest.fn() },
      docRepo: { createQueryBuilder: jest.fn().mockReturnValue(queryBuilder) },
      supplierRepo: { find: jest.fn() },
      catalogContextService: {
        forUser: jest.fn().mockResolvedValue({ accountantIds: [] }),
      },
      catalogService: { getMergedExpenseCatalog: jest.fn().mockResolvedValue([]) },
    };

    const result = await ReportReviewService.prototype.getReportPreview.call(
      fakeThis,
      'client-1',
      '123456789',
      { from: focusedFrom, to: focusedTo },
      { focusDocumentId: 42 },
    );

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'd.id = :focusDocumentId',
      { focusDocumentId: 42 },
    );
    expect(fakeThis.documentsService.processInboxForUser).not.toHaveBeenCalled();
    expect(fakeThis.documentPairingService.pairInvoicesAndReceiptsForBusiness).not.toHaveBeenCalled();
    expect(fakeThis.matchingService.matchDocumentsForBusiness).not.toHaveBeenCalled();
    expect(result.rows).toEqual([]);
  });
});
