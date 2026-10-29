import { DemoDataService } from './demo-data.service';
import { DESIGNER_SANDBOX_PROFILE } from './profiles/designer-sandbox.profile';
import { Source } from 'src/transactions/source.entity';
import { UserSourceSyncState } from 'src/transactions/user-source-sync-state.entity';

const makeService = () =>
  new DemoDataService(
    null as any,
    null as any,
    null as any,
    null as any,
    null as any,
    null as any,
  );

const sourceRows = DESIGNER_SANDBOX_PROFILE.sourceSyncStates!.map((state, index) => ({
  id: index + 101,
  sourceName: state.sourceId,
}));

const makeManager = (sources = sourceRows) => ({
  find: jest.fn().mockResolvedValue(sources),
  update: jest.fn().mockResolvedValue(undefined),
  delete: jest.fn().mockResolvedValue(undefined),
  insert: jest.fn().mockResolvedValue(undefined),
});

describe('DemoDataService permanent source identity', () => {
  it('writes sourceRecordId for normal profile seed/reset sync rows', async () => {
    const service = makeService();
    const manager = makeManager();

    const count = await (service as any).applyProfileSourceState(
      manager,
      'designer-user',
      DESIGNER_SANDBOX_PROFILE,
      [],
    );

    expect(count).toBe(sourceRows.length);
    expect(manager.find).toHaveBeenCalledWith(Source, {
      where: {
        userId: 'designer-user',
        sourceName: expect.objectContaining({
          value: DESIGNER_SANDBOX_PROFILE.sourceSyncStates!.map((state) => state.sourceId),
        }),
      },
    });
    expect(manager.delete).toHaveBeenCalledWith(UserSourceSyncState, {
      userId: 'designer-user',
      sourceRecordId: expect.objectContaining({ value: sourceRows.map((source) => source.id) }),
    });
    expect(manager.insert).toHaveBeenCalledWith(
      UserSourceSyncState,
      DESIGNER_SANDBOX_PROFILE.sourceSyncStates!.map((state, index) =>
        expect.objectContaining({
          sourceId: state.sourceId,
          sourceRecordId: sourceRows[index].id,
        }),
      ),
    );
  });

  it('writes sourceRecordId for Direct-card scenario sync rows', async () => {
    const service = makeService();
    const manager = makeManager();
    const rows = DESIGNER_SANDBOX_PROFILE.sourceSyncStates!.map((state) => ({
      sourceId: state.sourceId,
      type: state.type,
      status: state.status,
      transactionCount: 0,
    }));

    await (service as any).writeSourceSyncRows(
      manager,
      'designer-user',
      DESIGNER_SANDBOX_PROFILE,
      rows,
    );

    expect(manager.insert).toHaveBeenCalledWith(
      UserSourceSyncState,
      rows.map((row, index) =>
        expect.objectContaining({
          sourceId: row.sourceId,
          sourceRecordId: sourceRows[index].id,
        }),
      ),
    );
  });

  it.each([
    ['missing', sourceRows.slice(1), 0],
    ['ambiguous', [...sourceRows, { ...sourceRows[0], id: 999 }], 2],
  ])('fails before insert when a fixture source is %s', async (_case, sources, matchCount) => {
    const service = makeService();
    const manager = makeManager(sources);

    await expect(
      (service as any).applyProfileSourceState(
        manager,
        'designer-user',
        DESIGNER_SANDBOX_PROFILE,
        [],
      ),
    ).rejects.toThrow(`resolved to ${matchCount} Source rows`);
    expect(manager.insert).not.toHaveBeenCalled();
  });
});
