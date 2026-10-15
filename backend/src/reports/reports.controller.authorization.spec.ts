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

describe('ReportsController uniform-file date boundary', () => {
  function setup() {
    const reportsService = {
      createUniformFile: jest.fn().mockResolvedValue({
        filePath: 'openformat.zip',
        zipBuffer: Buffer.from('zip'),
        document_summary: [],
        list_summary: [],
      }),
    };
    const sharedService = {
      convertStringToDateObject: jest.fn((value: string) => {
        const [day, month, year] = value.split('/').map(Number);
        return new Date(Date.UTC(year, month - 1, day));
      }),
    };
    const controller = new ReportsController(
      reportsService as any,
      {} as any,
      sharedService as any,
      {} as any,
    );
    const response = { json: jest.fn() } as any;
    const request = { user: { firebaseId: 'demo-user' } } as any;
    return { controller, reportsService, response, request };
  }

  it('normalizes display dates to ISO before querying MySQL', async () => {
    const { controller, reportsService, response, request } = setup();

    await controller.getHelloWorldZip(request, {
      startDate: '01/02/2026',
      endDate: '31/03/2026',
      businessNumber: '222222226',
    }, response);

    expect(reportsService.createUniformFile).toHaveBeenCalledWith(
      'demo-user',
      '2026-02-01',
      '2026-03-31',
      '222222226',
    );
  });

  it('rejects an inverted date range before report generation', async () => {
    const { controller, reportsService, response, request } = setup();

    await expect(controller.getHelloWorldZip(request, {
      startDate: '31/03/2026',
      endDate: '01/02/2026',
      businessNumber: '222222226',
    }, response)).rejects.toThrow('startDate must not be after endDate');
    expect(reportsService.createUniformFile).not.toHaveBeenCalled();
  });
});
