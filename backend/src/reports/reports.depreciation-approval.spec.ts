import { ExpenseApprovalStatus } from '../enum';
import { ReportsService } from './reports.service';

describe('ReportsService depreciation approval boundary', () => {
  it('queries Form 1342 assets with APPROVED status only', async () => {
    const find = jest.fn().mockResolvedValue([]);
    const service = Object.create(ReportsService.prototype) as any;
    service.expenseRepo = { find };
    service.depreciationService = { calculateThroughYear: jest.fn() };

    const report = await service.createForm1342Report('client-1', '123456789', 2026);

    expect(find).toHaveBeenCalledWith({
      where: {
        userId: 'client-1',
        businessNumber: '123456789',
        isEquipmentSnapshot: true,
        approvalStatus: ExpenseApprovalStatus.APPROVED,
      },
      order: { date: 'ASC' },
    });
    expect(report.rows).toEqual([]);
  });
});
