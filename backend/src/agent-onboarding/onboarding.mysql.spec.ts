import { readFileSync } from 'fs';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { OnboardingService } from './onboarding.service';
// Local, disposable MySQL only. No repository .env or live database is loaded.
const local = process.env.ONBOARDING_TEST_MYSQL_URL;
const suite = local ? describe : describe.skip;
suite('onboarding transactional MySQL', () => {
  let db: DataSource;
  let service: OnboardingService;
  let extraction: any;
  const user = {
    actorFirebaseId: 'alice',
    firebaseId: 'alice',
    businessNumber: null,
    delegationScopes: [],
    isDelegatedAccess: false,
    isAdminImpersonation: false,
  };
  beforeAll(async () => {
    const url = new URL(local!);
    if (
      !['127.0.0.1', 'localhost'].includes(url.hostname) ||
      url.pathname !== '/onboarding_test'
    )
      throw new Error(
        'Only disposable local onboarding_test database is permitted',
      );
    process.env.AGENT_ONBOARDING_ENABLED = 'true';
    db = new DataSource({
      type: 'mysql',
      url: local,
      synchronize: false,
      timezone: 'Z',
      dateStrings: true,
    });
    await db.initialize();
    const sql = readFileSync(
      join(
        __dirname,
        '../../scripts/migrations/2026-11-19_agent_onboarding.sql',
      ),
      'utf8',
    );
    for (const statement of sql.split(';').filter((s) => s.trim()))
      await db.query(statement);
    service = new OnboardingService(
      db,
      {
        ownerBusinesses: async () => [
          { businessNumber: '111', businessName: 'עסק ראשון' },
          { businessNumber: '222', businessName: 'עסק שני' },
        ],
      } as any,
      { extract: async () => extraction } as any,
    );
  }, 30000);
  afterAll(async () => {
    delete process.env.AGENT_ONBOARDING_ENABLED;
    if (db?.isInitialized) await db.destroy();
  });
  function f(
    field: string | null,
    scope: string,
    statement: string,
    overrides = {},
  ) {
    return {
      field,
      scope,
      statement,
      value: statement,
      state: 'known',
      replaces: null,
      change: 'add',
      effectiveDate: null,
      precision: 'unknown',
      evidence: statement,
      ...overrides,
    };
  }
  async function save(facts: any[], message: string, businessNumber = '111') {
    const state = await service.read(user, businessNumber);
    extraction = { facts, clarification: null };
    const proposal = await service.propose(user, {
      businessNumber,
      version: state.version,
      message,
    });
    return {
      proposal,
      snapshot: await service.commit(user, businessNumber, proposal.id),
    };
  }
  it('stores personal and business facts separately and preserves open narrative', async () => {
    const { snapshot } = await save(
      [
        f('preferred_name', 'person', 'אלעזר'),
        f('registration', 'business', 'פטור'),
        f(null, 'business', 'רוצה למכור תבניות'),
      ],
      'אלעזר פטור רוצה למכור תבניות',
    );
    expect(snapshot.story.person).toContain('אלעזר');
    expect(snapshot.story.business).toContain('תבניות');
    const second = await service.read(user, '222');
    expect(second.story.person).toContain('אלעזר');
    expect(second.story.business).toBe('');
  });
  it('keeps a transition and its effective month, and retries once without duplication', async () => {
    const state = await service.read(user, '111');
    const old = state.facts.find(
      (f) => f.field_key === 'registration' && f.status === 'active',
    );
    const { snapshot, proposal } = await save(
      [
        f('registration', 'business', 'מורשה', {
          replaces: old.id,
          change: 'transition',
          effectiveDate: '2026-10',
          precision: 'month',
        }),
      ],
      'מורשה',
    );
    expect(snapshot.facts.find((f) => f.id === old.id)).toMatchObject({
      status: 'superseded',
      valid_to_text: '2026-10',
    });
    expect(snapshot.story.business).toContain('תבניות');
    const repeated = await service.commit(user, '111', proposal.id);
    expect(repeated.version).toEqual(snapshot.version);
    expect(repeated.facts).toHaveLength(snapshot.facts.length);
  });
  it('marks mistaken facts as corrected rather than a historical transition', async () => {
    const state = await service.read(user, '111');
    const old = state.facts.find(
      (f) => f.field_key === 'registration' && f.status === 'active',
    );
    const { snapshot } = await save(
      [
        f('registration', 'business', 'חברה', {
          replaces: old.id,
          change: 'correction',
        }),
      ],
      'חברה',
    );
    expect(snapshot.facts.find((f) => f.id === old.id)).toMatchObject({
      status: 'corrected',
      valid_to_text: null,
    });
  });
  it('rejects competing stale proposal and rolls back changes', async () => {
    const state = await service.read(user, '111');
    extraction = {
      facts: [f(null, 'business', 'מטרה חדשה')],
      clarification: null,
    };
    const a = await service.propose(user, {
      businessNumber: '111',
      version: state.version,
      message: 'מטרה חדשה',
    });
    const b = await service.propose(user, {
      businessNumber: '111',
      version: state.version,
      message: 'מטרה חדשה',
    });
    await service.commit(user, '111', a.id);
    await expect(service.commit(user, '111', b.id)).rejects.toThrow('עודכן');
    const after = await service.read(user, '111');
    expect(after.facts.filter((f) => f.statement === 'מטרה חדשה')).toHaveLength(
      1,
    );
  });
  it('rejects cross-owner proposal IDs', async () => {
    const state = await service.read(user, '111');
    extraction = { facts: [], clarification: 'ממתי?' };
    const proposal = await service.propose(user, {
      businessNumber: '111',
      version: state.version,
      message: 'עדכון',
    });
    await expect(
      service.commit(
        { ...user, firebaseId: 'bob', actorFirebaseId: 'bob' },
        '111',
        proposal.id,
      ),
    ).rejects.toThrow();
  });
  it('forgets a field history and its story snapshots without removing unrelated facts', async () => {
    const state = await service.read(user, '111');
    const target = state.facts.find((f) => f.field_key === 'registration');
    const after = await service.forget(user, '111', target.id, state.version);
    expect(after.facts.some((f) => f.field_key === 'registration')).toBe(false);
    expect(after.story.business).toContain('תבניות');
    const versions = await db.query(
      'SELECT story FROM agent_onboarding_story_versions WHERE profile_id=?',
      [target.profile_id],
    );
    expect(versions).toHaveLength(0);
  });
});
