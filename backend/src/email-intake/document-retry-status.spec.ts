import { EmailIntakeRunsService } from './email-intake-runs.service';
describe('retry progress reflected by latest mailbox status', () => {
  it('recomputes a duplicate-referencing latest run instead of returning stale ATTENTION', async () => {
    const run: any = {
      id: 'latest',
      integration_id: 17,
      firebase_id: 'owner',
      processing_state: 'ATTENTION',
    };
    const summary = {
      documents: { READY: 1 },
      messages: { SCANNED: 1 },
      attachments: { DUPLICATE: 1 },
    };
    const store: any = {
      runs: jest.fn(async () => [run]),
      refreshRun: jest.fn(async () => {
        run.processing_state = 'RUNNING';
        return { summary };
      }),
      query: jest.fn(async () => [
        {
          processing_state: run.processing_state,
          pull_state: 'COMPLETE',
          scan_state: 'DONE',
        },
      ]),
    };
    const service = new EmailIntakeRunsService(
      store,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const result = await service.status('owner');
    expect(store.refreshRun).toHaveBeenCalledWith(run);
    expect(result[0].processing_state).toBe('RUNNING');
    expect(result[0].documents).toEqual({ READY: 1 });
    expect(store.query.mock.calls[0][1]).toEqual(['latest', 'owner']);
  });
  it('reflects completion on a later poll without restarting the mailbox scan', async () => {
    let complete = false;
    const run: any = { id: 'latest', integration_id: 17, firebase_id: 'owner' };
    const store: any = {
      runs: jest.fn(async () => [run]),
      refreshRun: jest.fn(async () => ({
        summary: {
          documents: complete ? { AWAITING_APPROVAL: 1 } : { READY: 1 },
        },
      })),
      query: jest.fn(async () => [
        {
          processing_state: complete ? 'COMPLETE' : 'RUNNING',
          pull_state: 'COMPLETE',
        },
      ]),
    };
    const service = new EmailIntakeRunsService(
      store,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    expect((await service.status('owner'))[0].processing_state).toBe('RUNNING');
    complete = true;
    expect((await service.status('owner'))[0].processing_state).toBe(
      'COMPLETE',
    );
  });
});
