import { ReportWorkflowService } from './report-workflow.service';

// listStoredForClient (the AI agent's read): the stored workflows as they
// are, with no on-demand generation — unlike listForClient, which the
// client's own page keeps.

describe('ReportWorkflowService.listStoredForClient', () => {
  it("reads the client's rows, for one business, and generates nothing", async () => {
    const workflowRepo = { find: jest.fn().mockResolvedValue([{ id: 1 }]) };
    const tasksGenerator = { generateForUser: jest.fn() };
    const service = new ReportWorkflowService(
      workflowRepo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      tasksGenerator as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.listStoredForClient('client-1', '111111111'),
    ).resolves.toEqual([{ id: 1 }]);
    expect(workflowRepo.find).toHaveBeenCalledWith({
      where: { clientFirebaseId: 'client-1', businessNumber: '111111111' },
      order: { periodEnd: 'DESC', id: 'DESC' },
    });

    await service.listStoredForClient('client-1');
    expect(workflowRepo.find.mock.calls[1][0].where).toEqual({
      clientFirebaseId: 'client-1',
    });
    expect(tasksGenerator.generateForUser).not.toHaveBeenCalled();
  });
});
