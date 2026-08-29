import { ReportsController } from './reports.controller';

describe('ReportsController P&L PDF export', () => {
  it.each([true, 'true'])(
    'forwards osekZair when the query flag is %p',
    async (osekZair) => {
      const pdf = Buffer.from('pdf');
      const reportsService = {
        generatePnlReportPdfForExport: jest.fn().mockResolvedValue(pdf),
      };
      const sharedService = {
        convertStringToDateObject: jest.fn((value: string) => new Date(value)),
      };
      const controller = new ReportsController(
        reportsService as any,
        {} as any,
        sharedService as any,
        {} as any,
      );
      const response = {
        setHeader: jest.fn(),
        send: jest.fn((value) => value),
      };

      const result = await controller.getPnlReportPdf(
        { user: { firebaseId: 'user-1' } } as any,
        {
          startDate: '2026-01-01',
          endDate: '2026-12-31',
          businessNumber: '123456789',
          osekZair,
        },
        response as any,
      );

      expect(reportsService.generatePnlReportPdfForExport).toHaveBeenCalledWith(
        'user-1',
        '123456789',
        new Date('2026-01-01'),
        new Date('2026-12-31'),
        true,
        undefined,
      );
      expect(response.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/pdf',
      );
      expect(response.send).toHaveBeenCalledWith(pdf);
      expect(result).toBe(pdf);
    },
  );
});
