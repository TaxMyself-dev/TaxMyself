import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { OnboardingService } from './onboarding.service';
// Local disposable DB, or the explicitly approved keepintax-dev via the guarded runner.
// A unique synthetic owner namespace is cleaned in afterAll; real users are never used.
const {
  developmentOptions,
  assertDevelopmentDatabase,
  cleanupOwners,
} = require('../../scripts/onboarding-test-target.cjs');
const approvedDev =
  process.env.ONBOARDING_APPROVED_DATABASE === 'keepintax-dev';
const runId = randomUUID();
const owners = ['alice', 'bob', 'seed', 'live'].map(
  (name) => `onboarding-qa-${runId}-${name}`,
);
const local = process.env.ONBOARDING_TEST_MYSQL_URL;
const suite = local || approvedDev ? describe : describe.skip;
suite('onboarding transactional MySQL', () => {
  let db: DataSource;
  let service: OnboardingService;
  let extraction: any;
  const user = {
    actorFirebaseId: owners[0],
    firebaseId: owners[0],
    businessNumber: null,
    delegationScopes: [],
    isDelegatedAccess: false,
    isAdminImpersonation: false,
  };
  beforeAll(async () => {
    let options: any;
    if (approvedDev) options = developmentOptions();
    else {
      const url = new URL(local!);
      if (
        !['127.0.0.1', 'localhost'].includes(url.hostname) ||
        url.pathname !== '/onboarding_test'
      )
        throw new Error(
          'Only disposable local onboarding_test database is permitted',
        );
      options = { url: local };
    }

    db = new DataSource({
      type: 'mysql',
      ...options,
      synchronize: false,
      timezone: 'Z',
      dateStrings: true,
    });
    await db.initialize();
    if (approvedDev) await assertDevelopmentDatabase(db);
    else {
      const sql = readFileSync(
        join(
          __dirname,
          '../../scripts/migrations/2026-11-19_agent_onboarding.sql',
        ),
        'utf8',
      );
      for (const statement of sql.split(';').filter((s) => s.trim()))
        await db.query(statement);
    }
    service = new OnboardingService(db, {
      ownerBusinesses: async () => [
        { businessNumber: '111', businessName: 'עסק ראשון' },
        { businessNumber: '222', businessName: 'עסק שני' },
      ],
    } as any);
  }, 30000);
  afterAll(async () => {
    if (db?.isInitialized) {
      try {
        await cleanupOwners(db, owners);
      } finally {
        await db.destroy();
      }
    }
  });
  async function prepare(
    store: OnboardingService,
    owner: typeof user,
    body: any,
  ) {
    return store.prepareChanges(owner, {
      ...body,
      extraction,
      operationId: randomUUID(),
    });
  }
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
    const proposal = await prepare(service, user, {
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
    const a = await prepare(service, user, {
      businessNumber: '111',
      version: state.version,
      message: 'מטרה חדשה',
    });
    const b = await prepare(service, user, {
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
    const proposal = await prepare(service, user, {
      businessNumber: '111',
      version: state.version,
      message: 'עדכון',
    });
    await expect(
      service.commit(
        { ...user, firebaseId: owners[1], actorFirebaseId: owners[1] },
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
  it('seeds existing registration with application provenance instead of asking it again', async () => {
    const seededUser = {
      ...user,
      firebaseId: owners[2],
      actorFirebaseId: owners[2],
    };
    const seeded = new OnboardingService(db, {
      ownerBusinesses: async () => [
        { businessNumber: '333', businessType: 'EXEMPT' },
      ],
    } as any);
    const first = await seeded.read(seededUser, '333');
    const again = await seeded.read(seededUser, '333');
    expect(first.fields.find((f) => f.key === 'registration')).toMatchObject({
      state: 'known',
      value: 'עוסק פטור',
    });
    expect(first.facts[0]).toMatchObject({
      source_type: 'application',
      date_precision: 'unknown',
      effective_date: null,
    });
    expect(again.facts).toHaveLength(1);
    expect(again.version).toEqual(first.version);
  });
  it('serializes simultaneous confirmations and commits exactly one competing edit', async () => {
    const state = await service.read(user, '111');
    extraction = {
      facts: [f(null, 'business', 'תוספת מקבילה')],
      clarification: null,
    };
    const a = await prepare(service, user, {
      businessNumber: '111',
      version: state.version,
      message: 'תוספת מקבילה',
    });
    const b = await prepare(service, user, {
      businessNumber: '111',
      version: state.version,
      message: 'תוספת מקבילה',
    });
    const results = await Promise.allSettled([
      service.commit(user, '111', a.id),
      service.commit(user, '111', b.id),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const failure = results.find(
      (r) => r.status === 'rejected',
    ) as PromiseRejectedResult;
    expect(failure.reason.getStatus()).toBe(409);
    const after = await service.read(user, '111');
    expect(
      after.facts.filter((f) => f.statement === 'תוספת מקבילה'),
    ).toHaveLength(1);
  });
  it('rolls back facts, fields and change logs when a late story write fails', async () => {
    const before = await service.read(user, '111');
    extraction = {
      facts: [f('activity', 'business', 'תיאור שנכשל בשמירה')],
      clarification: null,
    };
    const proposal = await prepare(service, user, {
      businessNumber: '111',
      version: before.version,
      message: 'תיאור שנכשל בשמירה',
    });
    const faultingDb = {
      query: db.query.bind(db),
      manager: db.manager,
      transaction: (work) =>
        db.transaction(async (manager) =>
          work({
            query: async (sql: string, params: any[]) => {
              if (sql.includes('INSERT INTO agent_onboarding_story_versions'))
                throw new Error('INJECTED_LATE_FAILURE');
              return manager.query(sql, params);
            },
          }),
        ),
    };
    const faulting = new OnboardingService(
      faultingDb as any,
      { ownerBusinesses: async () => [{ businessNumber: '111' }] } as any,
    );
    await expect(faulting.commit(user, '111', proposal.id)).rejects.toThrow(
      'INJECTED_LATE_FAILURE',
    );
    const after = await service.read(user, '111');
    expect(after.version).toEqual(before.version);
    expect(after.story).toEqual(before.story);
    expect(after.facts).toEqual(before.facts);
    expect(after.turns).toEqual(before.turns);
    const stored = await db.query(
      'SELECT applied_at FROM agent_onboarding_proposals WHERE id=? AND owner_uid=?',
      [proposal.id, user.firebaseId],
    );
    expect(stored[0].applied_at).toBeNull();
  });
  it('expires previews using database time without applying changes', async () => {
    const state = await service.read(user, '111');
    extraction = { facts: [], clarification: 'ממתי?' };
    const proposal = await prepare(service, user, {
      businessNumber: '111',
      version: state.version,
      message: 'עדכון ישן',
    });
    await db.query(
      'UPDATE agent_onboarding_proposals SET created_at=DATE_SUB(CURRENT_TIMESTAMP(6),INTERVAL 31 MINUTE) WHERE id=? AND owner_uid=?',
      [proposal.id, user.firebaseId],
    );
    await expect(service.commit(user, '111', proposal.id)).rejects.toThrow(
      'פג',
    );
    expect((await service.read(user, '111')).version).toEqual(state.version);
  });
  it('deletes employment through chat including past corrections and assistant recaps, without asserting the opposite', async () => {
    let state = (
      await save([f('employment', 'person', 'סוד-שכיר-כן')], 'סוד-שכיר-כן')
    ).snapshot;
    const old = state.facts.find((f) => f.field_key === 'employment');
    state = (
      await save(
        [
          f('employment', 'person', 'סוד-שכיר-לא', {
            replaces: old.id,
            change: 'correction',
          }),
        ],
        'סוד-שכיר-לא',
      )
    ).snapshot;
    await db.query(
      'UPDATE agent_onboarding_changes SET assistant_text=? WHERE owner_uid=?',
      ['סוד-שכיר-כן סוד-שכיר-לא', user.firebaseId],
    );
    const target = state.facts.find(
      (f) => f.field_key === 'employment' && f.status === 'active',
    );
    extraction = {
      facts: [],
      clarification: null,
      intent: 'forget_facts',
      forgetIds: [target.id],
    };
    const proposal = await prepare(service, user, {
      businessNumber: '111',
      version: state.version,
      message: 'תמחק את המידע עלי כשכיר',
    });
    const after = await service.commit(user, '111', proposal.id);
    expect(after.facts.some((f) => f.field_key === 'employment')).toBe(false);
    expect(after.fields.find((f) => f.key === 'employment')).toMatchObject({
      value: null,
      state: 'skipped',
    });
    expect(after.story.business).toContain('תבניות');
    expect(JSON.stringify(after)).not.toContain('סוד-שכיר');
    const again = await service.commit(user, '111', proposal.id);
    expect(again.version).toEqual(after.version);
  });
  it('rolls back a chat-wide deletion if its receipt cannot be saved', async () => {
    const before = await service.read(user, '111');
    extraction = {
      facts: [],
      clarification: null,
      intent: 'forget_all',
      forgetIds: [],
    };
    const proposal = await prepare(service, user, {
      businessNumber: '111',
      version: before.version,
      message: 'תמחק את כל מה ששמרת עלי',
    });
    const faulting = new OnboardingService(
      {
        query: db.query.bind(db),
        manager: db.manager,
        transaction: (work) =>
          db.transaction((manager) =>
            work({
              query: (sql, params) => {
                if (sql.startsWith('INSERT INTO agent_onboarding_changes'))
                  throw new Error('DELETE_RECEIPT_FAILURE');
                return manager.query(sql, params);
              },
            }),
          ),
      } as any,
      { ownerBusinesses: async () => [{ businessNumber: '111' }] } as any,
    );
    await expect(faulting.commit(user, '111', proposal.id)).rejects.toThrow(
      'DELETE_RECEIPT_FAILURE',
    );
    const after = await service.read(user, '111');
    expect(after).toEqual(before);
  });
  it('clears all owner businesses through chat and preserves another owner and the applied receipt', async () => {
    const bob = { ...user, firebaseId: owners[1], actorFirebaseId: owners[1] };
    const bobState = await service.read(bob, '111');
    extraction = {
      facts: [f('preferred_name', 'person', 'שם-בוב')],
      clarification: null,
    };
    const bobProposal = await prepare(service, bob, {
      businessNumber: '111',
      version: bobState.version,
      message: 'שם-בוב',
    });
    await service.commit(bob, '111', bobProposal.id);
    await save(
      [f(null, 'business', 'מידע בעסק נוסף')],
      'מידע בעסק נוסף',
      '222',
    );
    const state = await service.read(user, '111');
    extraction = {
      facts: [],
      clarification: null,
      intent: 'forget_all',
      forgetIds: [],
    };
    const proposal = await prepare(service, user, {
      businessNumber: '111',
      version: state.version,
      message: 'תמחק את כל מה ששמרת עלי',
    });
    const after = await service.commit(user, '111', proposal.id);
    for (const number of ['111', '222']) {
      const result = await service.read(user, number);
      expect(result.facts).toEqual([]);
      expect(result.fields.every((f) => f.value === null)).toBe(true);
      expect(result.story.person).toBe('');
      expect(result.story.business).toBe('');
    }
    expect((await service.read(bob, '111')).story.person).toContain('שם-בוב');
    expect((await service.commit(user, '111', proposal.id)).version).toEqual(
      after.version,
    );
    const stored = await db.query(
      'SELECT source_text,payload,applied_at FROM agent_onboarding_proposals WHERE id=?',
      [proposal.id],
    );
    expect(stored[0].applied_at).toBeTruthy();
    expect(stored[0].source_text).toBe('בקשת מחיקה מהזיכרון');
  });
  it('stores consecutive negative answers in the explicit fields supplied by the shared agent, leaving employment intact', async () => {
    const state = await service.read(user, '111');
    const employment = state.fields.find((field) => field.key === 'employment');
    await save(
      [
        f('employees', 'business', 'אין עובדים', {
          value: 'לא',
          evidence: 'לא',
        }),
      ],
      'לא',
    );
    const after = (
      await save(
        [
          f('partners', 'business', 'אין שותפים', {
            value: 'לא',
            evidence: 'לא',
          }),
        ],
        'לא',
      )
    ).snapshot;
    expect(after.fields.find((field) => field.key === 'employees')?.value).toBe(
      'לא',
    );
    expect(after.fields.find((field) => field.key === 'partners')?.value).toBe(
      'לא',
    );
    expect(after.fields.find((field) => field.key === 'employment')).toEqual(
      employment,
    );
  });
});
