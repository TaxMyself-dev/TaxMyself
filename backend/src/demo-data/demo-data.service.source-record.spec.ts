import { DemoDataService } from './demo-data.service';
import { DESIGNER_SANDBOX_PROFILE } from './profiles/designer-sandbox.profile';
import { Source } from 'src/transactions/source.entity';
import { UserSourceSyncState } from 'src/transactions/user-source-sync-state.entity';
import { DIRECT_CARD_DEMO_PROFILE } from './profiles/direct-card-demo.profile';
import { FullTransactionCache } from 'src/transactions/full-transaction-cache.entity';
import { User } from 'src/users/user.entity';

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
  it.each([undefined, true])('seeds Direct card detail and bank mirrors with exclusion=%s', async (enabled) => {
    const profile = DIRECT_CARD_DEMO_PROFILE;
    const cardName = profile.legacyDuplicateScenario!.cardSourceName;
    const bankName = profile.bills[0].sources[0].sourceName;
    const rows = profile.legacyDuplicateScenario!.duplicateMerchants.map((merchantName, i) => ({
      // Initial cache insert has already assigned primary keys before this step.
      id: 9706 + i,
      userId: 'direct-user', externalTransactionId: `bank-${i}`, merchantName,
      paymentIdentifier: bankName, sourceRecordId: 11, amount: -100,
    }));
    const manager = {
      ...makeManager([{ id: 11, sourceName: bankName }, { id: 22, sourceName: cardName }]),
      findOne: jest.fn().mockResolvedValue({ id: 77, name: 'כרטיס דיירקט', category: { name: 'בנק, אשראי ותנועות' } }),
    };
    await (makeService() as any).applyProfileSourceState(manager, 'direct-user', profile, rows, enabled);
    expect(manager.insert).toHaveBeenCalledWith(FullTransactionCache, expect.arrayContaining([
      expect.objectContaining({ paymentIdentifier: cardName, sourceRecordId: 22, subCategoryId: null }),
    ]));
    const cardInsert = manager.insert.mock.calls.find(([entity]) => entity === FullTransactionCache)![1] as any[];
    expect(cardInsert).toHaveLength(profile.legacyDuplicateScenario!.duplicateMerchants.length);
    for (const row of cardInsert) expect(row).not.toHaveProperty('id');
    expect(rows.find(row => row.paymentIdentifier === bankName)?.id).toBe(9706);
    expect(manager.update).toHaveBeenCalledWith(User, { firebaseId: 'direct-user' }, { excludeDirectCardBankTransactionsFromCashflow: enabled ?? false });
    expect(manager.insert).toHaveBeenCalledWith(UserSourceSyncState, expect.arrayContaining([
      expect.objectContaining({ sourceRecordId: 22, type: 'card', status: 'success', transactionCount: 5 }),
    ]));
    expect(rows.filter(row => row.paymentIdentifier === bankName)).toEqual(expect.arrayContaining([
      expect.objectContaining({ subCategoryId: 77, merchantName: 'כרטיס דיירקט' }),
    ]));
  });
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
