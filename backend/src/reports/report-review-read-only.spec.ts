import { ReportReviewService } from './report-review.service';

// getReportPreview's readOnly option (the AI agent's readiness read): the
// rows are loaded and classified as they stand, while the steps that write —
// inbox processing, invoice/receipt pairing and the matcher — never run. The
// review screen passes no readOnly and keeps every step.

const from = new Date('2026-01-01T00:00:00.000Z');
const to = new Date('2026-02-28T00:00:00.000Z');

const fakeService = () => {
  const queryBuilder: any = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
  };
  return {
    queryBuilder,
    fakeThis: {
      userRepo: {
        findOne: jest
          .fn()
          .mockResolvedValue({ index: 7, hasOpenBanking: true }),
      },
      assertBusinessOwnership: jest.fn().mockResolvedValue(undefined),
      documentsService: {
        processInboxForUser: jest
          .fn()
          .mockResolvedValue({ duplicates: 0, restored: 0 }),
      },
      documentPairingService: {
        pairInvoicesAndReceiptsForBusiness: jest
          .fn()
          .mockResolvedValue(undefined),
      },
      matchingService: {
        matchDocumentsForBusiness: jest.fn().mockResolvedValue(undefined),
      },
      loadTransactionsInRange: jest.fn().mockResolvedValue([]),
      docRepo: { createQueryBuilder: jest.fn().mockReturnValue(queryBuilder) },
      supplierRepo: { find: jest.fn() },
      catalogContextService: {
        forUser: jest.fn().mockResolvedValue({ accountantIds: ['acc-1'] }),
      },
      catalogService: { refreshPendingClassifications: jest.fn(),
        getMergedExpenseCatalog: jest.fn().mockResolvedValue([]),
      },
    } as any,
  };
};

describe('ReportReviewService.getReportPreview readOnly', () => {
  it('loads the period rows but runs no inbox processing, pairing or matching', async () => {
    const { fakeThis, queryBuilder } = fakeService();

    const result = await ReportReviewService.prototype.getReportPreview.call(
      fakeThis,
      'client-1',
      '123456789',
      { from, to },
      { readOnly: true },
    );

    expect(
      fakeThis.documentsService.processInboxForUser,
    ).not.toHaveBeenCalled();
    expect(
      fakeThis.documentPairingService.pairInvoicesAndReceiptsForBusiness,
    ).not.toHaveBeenCalled();
    expect(
      fakeThis.matchingService.matchDocumentsForBusiness,
    ).not.toHaveBeenCalled();
    // The same period scope as the review screen.
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      '(d.date IS NULL OR d.date <= :to)',
      { to },
    );
    expect(fakeThis.loadTransactionsInRange).toHaveBeenCalledWith(
      'client-1',
      '123456789',
      { from, to },
    );
    expect(fakeThis.catalogService.refreshPendingClassifications).not.toHaveBeenCalled();
    expect(result.mode).toBe('with_banking');
    expect(result.clientHasActiveDelegation).toBe(true);
    expect(result.duplicatesSkipped).toBe(0);
  });

  it('says whether a transaction amount is a ₪ figure, without changing the amount', () => {
    const toTxSummary = (ReportReviewService.prototype as any).toTxSummary;
    const self = {
      dateToYmd: () => '2026-01-08',
      absIls: (ReportReviewService.prototype as any).absIls,
    };
    const slim = {
      id: 1,
      externalTransactionId: 'x',
      category: null,
      subCategory: null,
      subCategoryId: null,
    };
    const summary = (cache: object) =>
      toTxSummary.call(self, slim, { merchantName: 'AWS', ...cache });

    // Foreign with no stamped ₪ amount: amount falls back to the dollars.
    expect(
      summary({ currency: 'USD', amount: '-12', ilsAmount: null }),
    ).toMatchObject({
      amount: 12,
      originalAmount: 12,
      originalCurrency: 'USD',
      ilsConversionRecorded: false,
    });
    // A stamped conversion, even at 1:1, is a ₪ figure.
    expect(
      summary({ currency: 'EUR', amount: '-30', ilsAmount: '30' }),
    ).toMatchObject({
      amount: 30,
      originalAmount: 30,
      ilsConversionRecorded: true,
    });
    expect(
      summary({ currency: 'ILS', amount: '-77.7', ilsAmount: null }),
    ).toMatchObject({
      amount: 77.7,
      originalCurrency: null,
      ilsConversionRecorded: true,
    });
  });

  it('without readOnly, the review screen still runs every step', async () => {
    const { fakeThis } = fakeService();

    await ReportReviewService.prototype.getReportPreview.call(
      fakeThis,
      'client-1',
      '123456789',
      { from, to },
    );

    expect(fakeThis.documentsService.processInboxForUser).toHaveBeenCalledWith(
      'client-1',
      '123456789',
    );
    expect(
      fakeThis.documentPairingService.pairInvoicesAndReceiptsForBusiness,
    ).toHaveBeenCalledWith(7, '123456789');
    expect(
      fakeThis.matchingService.matchDocumentsForBusiness,
    ).toHaveBeenCalled();
  });
});
