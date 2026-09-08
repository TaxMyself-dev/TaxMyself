import { buildDepreciationReportPdf } from './depreciation-report-pdf';

describe('buildDepreciationReportPdf', () => {
  it('creates a clean PDF attachment from Form 1342 data', async () => {
    const pdf = await buildDepreciationReportPdf(
      {
        year: 2026,
        rows: [{
          assetName: 'מחשב נייד',
          purchaseDate: '2026-01-01',
          activationDate: '2026-01-01',
          originalCost: 10000,
          changesDuringYear: 0,
          depreciableCost: 10000,
          depreciationRatePerLaw: 15,
          currentYearDepreciation: 1500,
          priorYearsDepreciation: 0,
          totalDepreciation: 1500,
          remainingBalance: 8500,
        }],
        totalOriginalCost: 10000,
        totalChangesDuringYear: 0,
        totalDepreciableCost: 10000,
        totalCurrentYearDepreciation: 1500,
        totalPriorYearsDepreciation: 0,
        totalDepreciation: 1500,
        totalRemainingBalance: 8500,
      },
      { businessName: 'עסק בדיקה', taxFileNumber: '123456789', year: 2026 },
    );

    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.length).toBeGreaterThan(1000);
    expect(pdf.toString('latin1')).not.toContain('localhost');
  });
});
