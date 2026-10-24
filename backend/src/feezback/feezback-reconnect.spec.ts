import { FeezbackDisconnectionService } from './feezback-disconnection.service';
import { getMetadataArgsStorage } from 'typeorm';
import { FeezbackService } from './feezback.service';
import { UserSyncStateService } from '../transactions/user-sync-state.service';
import { Source } from '../transactions/source.entity';
import { SourceType } from '../enum';

/** Real discovery + consent-state services, isolated repositories and provider. No live DB/API. */
describe('Feezback reconnection preserves permanent sources', () => {
  const uid = 'reconnect-user';
  let service: FeezbackService;
  let sync: UserSyncStateService;
  let accounts: any[];
  let states: any[];
  let sourceRepo: any;
  let stateRepo: any;
  let userRepo: any;
  let generation: number;
  let connected: boolean;
  let api: any;
  let user: any;
  let progress: any;
  const matching = (row: any, where: any) => Object.entries(where).every(([key, value]) => row[key] === value);

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    generation = 1;
    connected = true;
    accounts = [];
    states = [];
    sourceRepo = {
      // Execute the conflict semantics while asserting the actual emitted SQL below.
      query: jest.fn(async (sql: string, [userId, sourceName, sourceType, isDirect, connectionRole]: any[]) => {
        const existing = accounts.find(row => matching(row, { userId, sourceName, sourceType, connectionRole }));
        if (existing) { if (isDirect !== null) existing.isDirect = isDirect; }
        else accounts.push({ id: accounts.length + 1, userId, sourceName, sourceType, connectionRole, isDirect, bill: null });
      }),
      find: jest.fn(async ({ where }: any) => accounts.filter(row => matching(row, where))),
      findOne: jest.fn(async ({ where }: any) => accounts.find(row => matching(row, where))),
    };
    stateRepo = {
      find: jest.fn(async ({ where }: any) => states.filter(row => matching(row, where)).map(row =>
        Object.assign(row, { source: accounts.find(source => source.id === row.sourceRecordId) }))),
      findOne: jest.fn(async ({ where }: any) => states.find(row => matching(row, where))),
      create: jest.fn(row => row),
      save: jest.fn(async row => { states.push({ id: states.length + 1, ...row }); return row; }),
      update: jest.fn(async (where, patch) => {
        for (const row of states.filter(row => matching(row, where))) Object.assign(row, patch);
        return { affected: states.filter(row => matching(row, where)).length };
      }),
    };
    progress = { upsert: jest.fn().mockResolvedValue(undefined), update: jest.fn().mockResolvedValue({ affected: 1 }) };
    sync = new UserSyncStateService(progress as any, stateRepo, sourceRepo);
    user = { firebaseId: uid, hasSpouseFeezbackIdentity: true, hasOpenBanking: true };
    userRepo = {
      findOne: jest.fn().mockResolvedValue(user),
      update: jest.fn(async (_where, patch) => { Object.assign(user, patch); return { affected: 1 }; }),
    };
    api = {
      getUserConsents: jest.fn(async sub => ({ consents: connected ? [{ resourceId: `${sub}-consent-${generation}`, consentStatus: 'valid', validUntil: '2099-01-01' }] : [] })),
      getUserAccounts: jest.fn(async sub => ({ accounts: connected ? ['ILS', 'USD'].map(currency => ({
        iban: 'IL0000001234567', currency, resourceId: `${sub}-${currency}-account-${generation}`, consentId: `${sub}-consent-${generation}`,
      })) : [] })),
      getUserCards: jest.fn(async sub => ({ cards: connected ? [{ maskedPan: '****1234', currency: 'ILS',
        resourceId: `${sub}-card-${generation}`, consentId: `${sub}-consent-${generation}`, balances: [{ balanceAmount: { amount: '1' } }] }] : [] })),
    };
    service = new FeezbackService({} as any, { getTppId: () => 'test-tpp' } as any, api as any,
      {} as any, {} as any, sync, userRepo, sourceRepo,
      { autoUpgradeReferralOpenBankingIfEligible: jest.fn().mockResolvedValue(undefined) } as any, {} as any);
  });

  afterEach(() => jest.restoreAllMocks());

  it('retains source IDs, bill associations and identity/currency separation across disconnection and repeated rediscovery', async () => {
    await service.refreshUserSources(uid, 'test-initial');
    expect(accounts).toHaveLength(6); // primary/spouse x ILS bank, USD bank, card
    expect(states).toHaveLength(6);
    for (const account of accounts) account.bill = { id: 100 + account.id, billName: `mapping-${account.id}` };
    const original = accounts.map(row => ({ ...row }));
    const originalStateIds = states.map(row => row.id);

    // Provider-confirmed disconnection does not delete any permanent source or its mapping.
    connected = false;
    await service.refreshUserSources(uid, 'test-disconnected');
    expect(userRepo.update).toHaveBeenLastCalledWith({ firebaseId: uid }, { hasOpenBanking: false });
    expect(accounts).toEqual(original);

    // Real consent clearing is tested separately; rotate IDs as a new authorization would.
    for (const state of states) { state.consentId = null; state.status = 'not_synced'; }
    generation = 2;
    connected = true;
    await service.refreshUserSources(uid, 'test-reconnected');
    await service.refreshUserSources(uid, 'test-repeat-webhook');
    expect(accounts).toEqual(original);
    expect(states).toHaveLength(6);
    expect(states.map(row => row.id)).toEqual(originalStateIds);
    expect(states.every(row => row.consentId.endsWith('-2') && row.resourceId.endsWith('-2'))).toBe(true);
    expect(states.map(row => row.sourceRecordId).sort()).toEqual(original.map(row => row.id).sort());
    expect(userRepo.update).toHaveBeenLastCalledWith({ firebaseId: uid }, { hasOpenBanking: true });

    const response = { normalizedTransactions: [{ paymentIdentifier: '1234' }] };
    const result = await (service as any).attachSourceRecords(uid, uid + '_sub_spouse', 'card', response);
    const spouseCard = original.find(row => row.connectionRole === 'spouse' && row.sourceType === SourceType.CREDIT_CARD);
    expect(result.normalizedTransactions[0].sourceRecordId).toBe(spouseCard.id);
  });

  it('reconnects stable primary and spouse instruments after the fully disconnected flags reset', async () => {
    await service.refreshUserSources(uid, 'initial');
    for (const account of accounts) account.bill = { id: 100 + account.id };
    const original = accounts.map(row => ({ ...row }));
    const sourceIds = original.map(row => row.id);
    connected = false;
    const disconnection = new FeezbackDisconnectionService(api, userRepo, sourceRepo, sync, { cleanup: jest.fn().mockResolvedValue({ deleted: 0, full: false }) } as any);
    await disconnection.targets(uid);
    expect(user).toMatchObject({ hasOpenBanking: false, hasSpouseFeezbackIdentity: false });
    expect(progress.update).toHaveBeenCalledWith({ userId: uid }, { lastConsentInitiatedAt: null });
    expect(accounts).toEqual(original);
    expect(await service.getConnectionOptions(uid)).toEqual({ offerSpouse: false });

    generation = 2;
    connected = true;
    await service.refreshUserSources(uid, 'primary-reconnected');
    expect(await service.getConnectionOptions(uid)).toEqual({ offerSpouse: true });
    await expect(service.verifySpouseWebhookConnection(uid, uid + '_sub_spouse')).resolves.toBe(true);
    expect(api.getUserConsents).toHaveBeenCalledWith(uid + '_sub_spouse');
    await service.refreshUserSources(uid, 'spouse-reconnected');
    await service.refreshUserSources(uid, 'repeated-webhook');
    expect(user).toMatchObject({ hasOpenBanking: true, hasSpouseFeezbackIdentity: true });
    expect(accounts).toEqual(original);
    expect(states).toHaveLength(6);
    expect(states.map(row => row.sourceRecordId).sort()).toEqual(sourceIds.sort());
    expect(states.every(row => row.consentId.endsWith('-2') && row.resourceId.endsWith('-2'))).toBe(true);
  });

  it('serializes an old empty preview before fresh spouse verification and subsequent discovery', async () => {
    await service.refreshUserSources(uid, 'initial');
    const originalSourceIds = accounts.map(row => row.id);
    connected = false;
    let releasePreview!: () => void;
    let previewReadStarted!: () => void;
    const held = new Promise<void>(resolve => { releasePreview = resolve; });
    const started = new Promise<void>(resolve => { previewReadStarted = resolve; });
    const providerRead = api.getUserConsents.getMockImplementation();
    let holdOnce = true;
    api.getUserConsents.mockImplementation(async (sub, withInvalid) => {
      if (withInvalid && sub.endsWith('_sub_spouse') && holdOnce) {
        holdOnce = false;
        previewReadStarted();
        await held;
        return { consents: [] }; // Snapshot captured before the new authorization.
      }
      return providerRead(sub);
    });
    const disconnection = new FeezbackDisconnectionService(api, userRepo, sourceRepo, sync, { cleanup: jest.fn().mockResolvedValue({ deleted: 0, full: false }) } as any);
    const preview = disconnection.targets(uid);
    await started;
    generation = 2;
    connected = true;
    const callsBeforeVerification = api.getUserConsents.mock.calls.length;
    const verified = service.verifySpouseWebhookConnection(uid, uid + '_sub_spouse');
    await Promise.resolve(); await Promise.resolve();
    expect(api.getUserConsents).toHaveBeenCalledTimes(callsBeforeVerification);
    releasePreview();
    await preview;
    await expect(verified).resolves.toBe(true);
    expect(user.hasSpouseFeezbackIdentity).toBe(true);
    await service.refreshUserSources(uid, 'fresh-spouse-data');
    expect(user.hasOpenBanking).toBe(true);
    expect(accounts.map(row => row.id)).toEqual(originalSourceIds);
    expect(states.filter(row => accounts.find(source => source.id === row.sourceRecordId)?.connectionRole === 'spouse').every(row => row.consentId.endsWith('-2'))).toBe(true);
  });

  it('enforces atomic upsert uniqueness on stable identity and never updates bill or source primary key', async () => {
    await service.refreshUserSources(uid, 'test');
    const index = getMetadataArgsStorage().uniques.find(item => item.target === Source && item.name === 'UQ_source_user_type_name_role');
    expect(index?.columns).toEqual(['userId', 'sourceType', 'sourceName', 'connectionRole']);
    for (const [sql, params] of sourceRepo.query.mock.calls) {
      expect(sql).toContain('ON DUPLICATE KEY UPDATE');
      const update = sql.split('ON DUPLICATE KEY UPDATE')[1];
      expect(update).not.toMatch(/bill|resourceId|consentId|`id`|sourceName|connectionRole/);
      expect(params).toHaveLength(5);
    }
  });

  it('clears only provider consent metadata, preserving direct-card terminal state and all source mappings', async () => {
    sourceRepo.find.mockResolvedValue([{ id: 7 }]);
    await sync.clearConsentOnSources(uid, 'old-consent', true);
    expect(sourceRepo.query).not.toHaveBeenCalled();
    expect(stateRepo.save).not.toHaveBeenCalled();
    expect(stateRepo.update.mock.calls).toHaveLength(2);
    const [regular, direct] = stateRepo.update.mock.calls;
    expect(regular[0]).toEqual(expect.objectContaining({ userId: uid, consentId: 'old-consent' }));
    expect(regular[1]).toEqual({ consentId: null, status: 'not_synced', error: null });
    expect(direct[0]).toEqual(expect.objectContaining({ status: 'skipped_direct' }));
    expect(direct[1]).toEqual({ consentId: null });
    expect(sourceRepo.find).toHaveBeenCalledWith({ where: { userId: uid, connectionRole: 'spouse' }, select: ['id'] });
  });
});
