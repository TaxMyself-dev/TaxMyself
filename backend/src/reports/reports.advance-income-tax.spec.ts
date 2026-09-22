import { BusinessType, VATReportingType } from 'src/enum';
import { ReportsService } from './reports.service';

describe('ReportsService advance income tax journal source', () => {
  const startDate = new Date('2026-07-01T00:00:00.000Z');
  const endDate = new Date('2026-08-31T00:00:00.000Z');

  it('reads income and output VAT from the journal with the shared VAT-period filter', async () => {
    const queryBuilder: any = {};
    for (const method of ['innerJoin', 'where', 'andWhere', 'select', 'addSelect']) {
      queryBuilder[method] = jest.fn().mockReturnValue(queryBuilder);
    }
    queryBuilder.getRawOne = jest.fn().mockResolvedValue({
      vatableTurnover: '10000.50',
      nonVatableTurnover: '250.25',
      vatOnTurnover: '1800.09',
    });
    const fakeService = {
      sharedService: {
        expandPeriodLabelsInRange: jest.fn().mockReturnValue(['7-8/2026']),
      },
      JournalLineRepo: {
        createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      },
      applyVatJournalPeriodFilter: jest.fn(),
    };

    const result = await (ReportsService.prototype as any).loadJournalIncomeSummary.call(
      fakeService,
      'user-1',
      '123456789',
      startDate,
      endDate,
      {
        businessType: BusinessType.LICENSED,
        vatReportingType: VATReportingType.DUAL_MONTH_REPORT,
      },
    );

    expect(fakeService.applyVatJournalPeriodFilter).toHaveBeenCalledWith(
      queryBuilder,
      ['7-8/2026'],
      startDate,
      endDate,
    );
    expect(result).toEqual({
      vatableTurnover: 10000.5,
      nonVatableTurnover: 250.25,
      vatOnTurnover: 1800.09,
    });
  });

  it('builds the licensed-business report from journal income totals', async () => {
    const fakeService = {
      loadJournalIncomeSummary: jest.fn().mockResolvedValue({
        vatableTurnover: 10_000,
        nonVatableTurnover: 500,
        vatOnTurnover: 1_800,
      }),
      getWithholdingAtSourceSum: jest.fn().mockResolvedValue(200),
    };

    const result = await (ReportsService.prototype as any)
      .getAdvanceIncomeTaxReportDataForLicensed.call(
        fakeService,
        'user-1',
        '123456789',
        startDate,
        endDate,
        {
          businessType: BusinessType.LICENSED,
          vatReportingType: VATReportingType.DUAL_MONTH_REPORT,
          advanceTaxPercent: 5,
        },
      );

    expect(fakeService.loadJournalIncomeSummary).toHaveBeenCalledWith(
      'user-1',
      '123456789',
      startDate,
      endDate,
      expect.objectContaining({ businessType: BusinessType.LICENSED }),
    );
    expect(result).toEqual(expect.objectContaining({
      vatableTurnover: 10_000,
      nonVatableTurnover: 500,
      vatOnTurnover: 1_800,
      totalIncome: 10_500,
      totalAdvanceTax: 525,
      taxWithholdingAtSource: 200,
      totalToPay: 325,
    }));
  });

  it('builds exempt-business turnover from journal income totals', async () => {
    const fakeService = {
      loadJournalIncomeSummary: jest.fn().mockResolvedValue({
        vatableTurnover: 2_000,
        nonVatableTurnover: 300,
        vatOnTurnover: 0,
      }),
      getWithholdingAtSourceSum: jest.fn().mockResolvedValue(50),
    };

    const result = await (ReportsService.prototype as any)
      .getAdvanceIncomeTaxReportDataForExempt.call(
        fakeService,
        'user-2',
        '987654321',
        startDate,
        endDate,
        {
          businessType: BusinessType.EXEMPT,
          vatReportingType: VATReportingType.NOT_REQUIRED,
          advanceTaxPercent: 4,
        },
      );

    expect(result).toEqual(expect.objectContaining({
      businessType: BusinessType.EXEMPT,
      vatableTurnover: 0,
      nonVatableTurnover: 0,
      vatOnTurnover: 0,
      totalIncome: 2_300,
      totalAdvanceTax: 92,
      taxWithholdingAtSource: 50,
      totalToPay: 42,
    }));
  });
});
