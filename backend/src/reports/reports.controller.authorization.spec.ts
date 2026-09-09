import { DelegationScope } from '../delegation/delegation.entity';
import { ReportsController } from './reports.controller';

describe('ReportsController review UI capability', () => {
  const body = {
    businessNumber: '123456789',
    startDate: '2026-01-01',
    endDate: '2026-02-28',
  };

  function setup(represented: boolean) {
    const preview = {
      mode: 'documents_only', rows: [],
      counts: { matched: 0, docOnly: 0, txOnly: 0 },
      duplicatesSkipped: 0, deletedDocumentsRestored: 0,
      clientHasActiveDelegation: represented,
    };
    const reviewService = { getReportPreview: jest.fn().mockResolvedValue(preview) };
    const sharedService = {
      convertStringToDateObject: jest.fn((value: string) => new Date(value)),
      isRepresentedByAccountant: jest.fn().mockResolvedValue(represented),
    };
    const controller = new ReportsController({} as any, reviewService as any, sharedService as any, {} as any);
    return { controller, sharedService };
  }

  it('returns read-only capability for a represented owner', async () => {
    const { controller } = setup(true);
    const request = { user: { firebaseId: 'client-1', role: 'user' } } as any;

    const result = await controller.getReportPreview(request, body);

    expect(result.canManageExpenses).toBe(false);
  });

  it('grants capability to an accountant holding EXPENSES_APPROVE', async () => {
    const { controller, sharedService } = setup(true);
    const request = {
      user: {
        firebaseId: 'client-1', role: 'agent', actorFirebaseId: 'accountant-1',
        delegationScopes: [DelegationScope.EXPENSES_APPROVE],
      },
    } as any;

    const result = await controller.getReportPreview(request, body);

    expect(result.canManageExpenses).toBe(true);
    expect(sharedService.isRepresentedByAccountant).not.toHaveBeenCalled();
  });
});
