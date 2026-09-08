import { ReportsService } from './reports.service';

describe('ReportsService P&L accounting-period filter', () => {
  it('uses the journal date and ignores the current VAT cadence', async () => {
    const andWhere = jest.fn().mockReturnThis();
    const qb: any = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere,
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    };
    const service: any = Object.create(ReportsService.prototype);
    service.businessRepo = {
      findOne: jest.fn().mockResolvedValue({
        businessName: 'Client',
        businessType: 'LICENSED',
        vatReportingType: 'DUAL_MONTH_REPORT',
      }),
    };
    service.sharedService = {
      expandPeriodLabelsInRange: jest.fn(() => ['1-2/2025', '3-4/2025']),
    };
    service.catalogContextService = {
      accountantIdsForUser: jest.fn().mockResolvedValue([]),
    };
    service.catalogService = {
      chartOwnerKeysFor: jest.fn().mockReturnValue(['SYSTEM', 'CLIENT_123456789']),
    };
    service.JournalLineRepo = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
    service.userRepo = { findOne: jest.fn().mockResolvedValue(null) };

    const startDate = new Date('2025-01-01T00:00:00.000Z');
    const endDate = new Date('2025-12-31T00:00:00.000Z');
    await service.createPnLReportFromJournal(
      'user-1',
      '123456789',
      startDate,
      endDate,
    );

    expect(andWhere).toHaveBeenCalledWith(
      'je.date BETWEEN :startDate AND :endDate',
      { startDate, endDate },
    );
    expect(service.sharedService.expandPeriodLabelsInRange).not.toHaveBeenCalled();
    expect(andWhere.mock.calls.some(([sql]) => String(sql).includes('vatReportingPeriod'))).toBe(false);
  });
});
