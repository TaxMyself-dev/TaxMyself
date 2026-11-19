import {
  AutoClassificationService,
  autoIdentity,
} from './auto-classification.service';
import { ConflictException } from '@nestjs/common';
import { FullTransactionCache } from '../transactions/full-transaction-cache.entity';
import { ClassifiedTransactions } from '../transactions/classified-transactions.entity';
import { FIELDS } from '../agent-onboarding/onboarding.domain';
describe('standing-consent classifier', () => {
  const old = { ...process.env };
  beforeEach(() => {
    process.env.AGENT_AUTO_CLASSIFICATION_ENABLED = 'true';
    process.env.AGENT_ONBOARDING_ENABLED = 'true';
  });
  afterEach(() => {
    process.env = { ...old };
    jest.restoreAllMocks();
  });
  function setup() {
    const cache: any = {
      id: 1,
      userId: 'owner',
      externalTransactionId: 'tx',
      businessNumber: 'biz',
      billId: 2,
      sourceRecordId: 3,
      merchantName: 'Merchant',
      amount: -50,
      transactionDate: new Date('2026-11-01'),
      category: null,
      confirmed: false,
      isLocked: false,
    };
    const fields: any = {};
    for (const f of FIELDS) fields[f.key] = 'known';
    const profiles = ['', 'biz'].map((scope_key) => ({
      scope_key,
      version: 1,
      field_states: fields,
      story: 'explicit context',
      ...Object.fromEntries(FIELDS.map((f) => [f.key, 'known value'])),
    }));
    const item = { id: 'item', state: 'pending', attempts: 0, answer: null };
    const category: any = {
      id: 5,
      name: 'תוכנה',
      category: { name: 'משרד' },
      isPrivate: false,
      approvalStatus: 'APPROVED',
      account: { vatPercent: 0 },
    };
    const db: any = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('agent_onboarding_profiles')) return profiles;
        if (sql.startsWith('SELECT s.id')) return [{ id: 3 }];
        if (sql.startsWith('SELECT * FROM agent_auto_items')) return [item];
        if (sql.startsWith('SELECT * FROM agent_auto_preferences'))
          return [{ enabled: true, version: 1 }];
        if (sql.startsWith('SELECT state')) return [{ state: item.state }];
        return [];
      }),
      getRepository: jest.fn((entity: any) =>
        entity === FullTransactionCache
          ? { findOne: jest.fn(async () => ({ ...cache })) }
          : entity === ClassifiedTransactions
          ? { find: jest.fn(async () => []) }
          : { findOne: jest.fn(async () => ({ hasOpenBanking: true })) },
      ),
    };
    const domain: any = {
      resolveBusiness: jest.fn(async () => ({})),
      ownerBusinesses: jest.fn(async () => [{ businessNumber: 'biz' }]),
    };
    const classification: any = {
      prepare: jest.fn(async () => ({
        proposal: JSON.stringify({
          payload: JSON.stringify({
            dto: {
              externalTransactionId: 'tx',
              subCategoryId: 5,
              category: 'משרד',
              subCategory: 'תוכנה',
              businessNumber: 'biz',
            },
          }),
        }),
      })),
    };
    const write = jest.fn();
    const processing: any = {
      automaticRule: jest.fn(() => null),
      classifyPendingForAgent: jest.fn(
        async (
          owner: string,
          tx: string,
          preflight: any,
          single: boolean,
          automatic: any,
        ) => {
          const result = await preflight({ ...cache }, null, db);
          write(result.dto, single, automatic);
          return result.result;
        },
      ),
    };
    const catalog: any = {
      getMergedExpenseCatalog: jest.fn(async () => [category]),
    };
    const model: any = {
      decide: jest.fn(async () => ({
        kind: 'rule',
        subCategoryId: 5,
        reason: 'מנוי תוכנה עסקי מפורש',
        question: null,
      })),
    };
    const billing: any = { hasModuleAccess: jest.fn(async () => true) };
    const service = new AutoClassificationService(
      db,
      domain,
      classification,
      processing,
      catalog,
      { forUser: async () => ({}) } as any,
      billing,
      model,
    );
    return {
      service,
      db,
      domain,
      classification,
      processing,
      catalog,
      model,
      billing,
      write,
      cache,
      profiles,
      item,
    };
  }
  it('creates only permanent classification and atomically records the outcome', async () => {
    const f = setup();
    await f.service.process('owner', 1, 1);
    expect(f.write).toHaveBeenCalledWith(
      expect.objectContaining({ subCategoryId: 5 }),
      false,
      { existingRuleId: undefined },
    );
    expect(f.db.query).toHaveBeenCalledWith(
      expect.stringContaining("state='classified'"),
      expect.arrayContaining(['item', 'owner']),
    );
  });
  it('uncertainty creates a question and never prepares or writes', async () => {
    const f = setup();
    f.model.decide.mockResolvedValue({
      kind: 'clarify',
      subCategoryId: null,
      reason: 'חסר פירוט',
      question: 'מה נרכש?',
    });
    await f.service.process('owner', 1, 1);
    expect(f.classification.prepare).not.toHaveBeenCalled();
    expect(f.write).not.toHaveBeenCalled();
    expect(f.db.query).toHaveBeenCalledWith(
      expect.stringContaining("state='waiting'"),
      ['חסר פירוט', 'מה נרכש?', 'item'],
    );
  });
  it('does not run a model with missing profile fields', async () => {
    const f = setup();
    f.profiles[1].field_states.vehicle = 'skipped';
    await f.service.process('owner', 1, 1);
    expect(f.model.decide).not.toHaveBeenCalled();
    expect(f.write).not.toHaveBeenCalled();
  });
  it('does not infer source ownership from a stale bill ID', async () => {
    const f = setup();
    const query = f.db.query.getMockImplementation();
    f.db.query.mockImplementation(async (sql: string, ...args: any[]) =>
      sql.startsWith('SELECT s.id') ? [] : query(sql, ...args),
    );
    await f.service.process('owner', 1, 1);
    expect(f.model.decide).not.toHaveBeenCalled();
  });
  it('rechecks consent after model work and refuses revoked or newer consent', async () => {
    const f = setup();
    const query = f.db.query.getMockImplementation();
    f.db.query.mockImplementation(async (sql: string, ...args: any[]) =>
      sql.startsWith('SELECT * FROM agent_auto_preferences')
        ? [{ enabled: false, version: 2 }]
        : query(sql, ...args),
    );
    await f.service.process('owner', 1, 1);
    expect(f.write).not.toHaveBeenCalled();
  });
  it('refuses a manually classified transaction that raced model work', async () => {
    const f = setup();
    f.processing.classifyPendingForAgent.mockImplementation(
      async (o: string, t: string, preflight: any) =>
        preflight({ ...f.cache }, { classificationType: 'ONE_TIME' }, f.db),
    );
    await f.service.process('owner', 1, 1);
    expect(f.write).not.toHaveBeenCalled();
    expect(f.db.query).not.toHaveBeenCalledWith(
      expect.stringContaining("state='classified'"),
      expect.anything(),
    );
  });
  it('a changed source or amount invalidates model work', async () => {
    const f = setup();
    f.model.decide.mockImplementation(async () => {
      f.cache.amount = -99;
      return { kind: 'rule', subCategoryId: 5, reason: 'r', question: null };
    });
    await f.service.process('owner', 1, 1);
    expect(f.write).not.toHaveBeenCalled();
  });
  it('denies missing billing access immediately before writes', async () => {
    const f = setup();
    f.billing.hasModuleAccess.mockResolvedValue(false);
    await f.service.process('owner', 1, 1);
    expect(f.write).not.toHaveBeenCalled();
  });
  it('reuses an existing rule without asking the model', async () => {
    const f = setup();
    f.processing.automaticRule.mockReturnValue({
      id: 7,
      subCategoryId: 5,
      businessNumber: 'biz',
    });
    await f.service.process('owner', 1, 1);
    expect(f.model.decide).not.toHaveBeenCalled();
    expect(f.write).toHaveBeenCalledWith(expect.anything(), false, {
      existingRuleId: 7,
    });
  });
  it('does not use a cross-business rule', async () => {
    const f = setup();
    f.processing.automaticRule.mockReturnValue({
      id: 7,
      subCategoryId: 5,
      businessNumber: 'other',
    });
    await f.service.process('owner', 1, 1);
    expect(f.write).not.toHaveBeenCalled();
    expect(f.model.decide).not.toHaveBeenCalled();
  });
  it('model failure is retried with a bound and never a fallback category', async () => {
    const f = setup();
    f.item.attempts = 2;
    f.model.decide.mockRejectedValue(new Error('timeout'));
    await f.service.process('owner', 1, 1);
    expect(f.write).not.toHaveBeenCalled();
    expect(f.db.query).toHaveBeenCalledWith(
      expect.stringContaining('attempts=?'),
      expect.arrayContaining(['failed', 3]),
    );
  });
  it('does not touch tables when disabled and refuses delegate status', async () => {
    const f = setup();
    process.env.AGENT_AUTO_CLASSIFICATION_ENABLED = 'false';
    expect((await f.service.status(autoIdentity('owner'))).available).toBe(
      false,
    );
    expect(f.db.query).not.toHaveBeenCalled();
    await expect(
      f.service.status({ ...autoIdentity('owner'), actorFirebaseId: 'agent' }),
    ).rejects.toThrow();
  });
  it('start never enables consent', async () => {
    const f = setup();
    f.db.query.mockResolvedValue({ affectedRows: 0 });
    await expect(f.service.start(autoIdentity('owner'))).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(
      f.db.query.mock.calls.every(
        ([sql]: [string]) => !sql.includes('enabled=true,'),
      ),
    ).toBe(true);
  });
  it('only one local dispatcher runs even while MySQL lock acquisition is pending', async () => {
    const f = setup();
    let release: () => void;
    const wait = new Promise<void>((r) => (release = r));
    f.db.createQueryRunner = () => ({
      connect: () => wait,
      query: async () => [{ acquired: 0 }],
      release: async () => undefined,
    });
    const first = f.service.tick();
    await f.service.tick();
    release();
    await first;
    expect((f.service as any).busy).toBe(false);
  });
});
