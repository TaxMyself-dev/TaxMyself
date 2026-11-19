import { FIELDS } from './onboarding.domain';
import { OnboardingService } from './onboarding.service';
const user = {
  actorFirebaseId: 'owner',
  firebaseId: 'owner',
  businessNumber: null,
  delegationScopes: [],
  isDelegatedAccess: false,
  isAdminImpersonation: false,
};
describe('onboarding owner boundaries and proposals', () => {
  let service: OnboardingService;
  let db: any;
  let domain: any;
  let extractor: any;
  beforeEach(() => {
    process.env.AGENT_ONBOARDING_ENABLED = 'true';
    db = { query: jest.fn(), manager: {}, transaction: jest.fn() };
    domain = {
      ownerBusinesses: jest
        .fn()
        .mockResolvedValue([{ businessNumber: '111', businessName: 'עסק' }]),
    };
    extractor = {
      extract: jest.fn(),
      summarize: jest.fn(),
      respond: jest
        .fn()
        .mockResolvedValue({
          kind: 'conversation',
          reply: 'נעים להכיר. אפשר להמשיך לספר.',
        }),
    };
    service = new OnboardingService(db, domain, extractor);
  });
  afterEach(() => delete process.env.AGENT_ONBOARDING_ENABLED);
  it('rejects delegated profile writes before reading any business', async () => {
    await expect(
      service.scope(
        { ...user, actorFirebaseId: 'accountant', isDelegatedAccess: true },
        '111',
      ),
    ).rejects.toThrow();
    expect(domain.ownerBusinesses).not.toHaveBeenCalled();
  });
  it('rejects another owner business', async () =>
    await expect(service.scope(user, '999')).rejects.toThrow());
  it('requires explicit selection for several businesses', async () => {
    domain.ownerBusinesses.mockResolvedValue([
      { businessNumber: '111' },
      { businessNumber: '222' },
    ]);
    await expect(service.scope(user)).rejects.toThrow();
  });
  it('disabled feature never reads the database in ordinary chat', async () => {
    delete process.env.AGENT_ONBOARDING_ENABLED;
    expect(await service.context(user, '111')).toBe('');
    expect(db.query).not.toHaveBeenCalled();
  });
  it('does not expose personal onboarding to delegates', async () => {
    expect(
      await service.context({ ...user, actorFirebaseId: 'accountant' }, '111'),
    ).toBe('');
    expect(domain.ownerBusinesses).not.toHaveBeenCalled();
  });
  it('rejects stale version before a paid extraction', async () => {
    jest
      .spyOn(service, 'read')
      .mockResolvedValue({ version: { person: 2, business: 3 } } as any);
    await expect(
      service.propose(user, {
        businessNumber: '111',
        version: { person: 1, business: 3 },
        message: 'אני מעצב',
      }),
    ).rejects.toThrow();
    expect(extractor.extract).not.toHaveBeenCalled();
  });
  it('asks for a missing transition date without changing registration', async () => {
    jest.spyOn(service, 'read').mockResolvedValue({
      businessNumber: '111',
      version: { person: 1, business: 1 },
      facts: [
        {
          id: 'old',
          status: 'active',
          scope_kind: 'business',
          field_key: 'registration',
        },
      ],
      fields: [],
      turns: [],
      story: {},
    } as any);
    extractor.extract.mockResolvedValue({
      facts: [
        {
          field: 'registration',
          scope: 'business',
          statement: 'מורשה',
          value: 'מורשה',
          state: 'known',
          replaces: 'old',
          change: 'transition',
          effectiveDate: null,
          precision: 'unknown',
          evidence: 'מורשה',
        },
      ],
      clarification: null,
    });
    const proposal = await service.propose(user, {
      businessNumber: '111',
      version: { person: 1, business: 1 },
      message: 'עכשיו מורשה',
    });
    expect(proposal.facts).toEqual([]);
    expect(proposal.clarification).toContain('ממתי');
  });
  it('locks owner profiles before looking up the server-side proposal', async () => {
    const manager = {
      query: jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]),
    };
    db.transaction.mockImplementation((work) => work(manager));
    await expect(service.commit(user, '111', 'missing')).rejects.toThrow();
    expect(manager.query.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(manager.query.mock.calls[0][1]).toEqual(['owner', '', '111']);
    expect(manager.query.mock.calls[1][1]).toEqual(['missing', 'owner', '111']);
    expect(manager.query).toHaveBeenCalledTimes(2);
  });
  it('replaying an applied proposal performs no profile writes', async () => {
    const manager = {
      query: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ applied_at: new Date() }]),
    };
    db.transaction.mockImplementation((work) => work(manager));
    jest
      .spyOn(service, 'read')
      .mockResolvedValue({ version: { person: 4, business: 3 } } as any);
    const result = await service.commit(user, '111', 'already-applied');
    expect(result.version).toEqual({ person: 4, business: 3 });
    expect(manager.query).toHaveBeenCalledTimes(2);
  });
  it('uses the owner invitation state for all business choices', async () => {
    db.query.mockResolvedValue([
      { scope_key: '', field_states: {}, invitation: 'deferred' },
    ]);
    const choices = await service.businesses(user);
    expect(choices[0].invitation).toBe('deferred');
    expect(db.query.mock.calls[0][1]).toEqual(['owner']);
  });
  it('includes the sole owned business story even before a chat selected it', async () => {
    db.query
      .mockResolvedValueOnce([
        { id: 'p', scope_key: '', story: 'דני' },
        { id: 'b', scope_key: '111', story: 'מעצב מהבית' },
      ])
      .mockResolvedValueOnce([]);
    const context = await service.context(user, null);
    expect(context).toContain('מעצב מהבית');
    expect(db.query.mock.calls[0][1]).toEqual(['owner', '', '111']);
  });
  it('uses database age to reject an expired preview before writes', async () => {
    const manager = {
      query: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ applied_at: null, age_seconds: 1801 }]),
    };
    db.transaction.mockImplementation((work) => work(manager));
    await expect(service.commit(user, '111', 'expired')).rejects.toThrow('פג');
    expect(manager.query).toHaveBeenCalledTimes(2);
  });
  it('keeps invalid model facts out while preserving the source and asking a missing question', async () => {
    jest.spyOn(service, 'read').mockResolvedValue({
      businessNumber: '111',
      version: { person: 0, business: 0 },
      facts: [],
      fields: [
        { key: 'activity', state: 'unasked', question: 'מה העסק עושה?' },
      ],
      story: {},
      turns: [],
    } as any);
    extractor.extract.mockResolvedValue({
      facts: [
        {
          field: 'preferred_name',
          scope: 'business',
          statement: 'תוכן לא תקין',
        },
      ],
      clarification: null,
    });
    const proposal = await service.propose(user, {
      businessNumber: '111',
      version: { person: 0, business: 0 },
      message: 'אני מתכנן סניף חדש',
    });
    expect(proposal.facts).toEqual([]);
    expect(proposal.clarification).toContain('לנסח');
    expect(db.query.mock.calls[0][1][6]).toBe('אני מתכנן סניף חדש');
  });
  it('identifies an incomplete business independently of the shared invitation status', async () => {
    domain.ownerBusinesses.mockResolvedValue([
      { businessNumber: '111' },
      { businessNumber: '222' },
    ]);
    const person = Object.fromEntries(
      FIELDS.filter((f) => f.scope === 'person').map((f) => [f.key, 'known']),
    );
    const complete = Object.fromEntries(
      FIELDS.filter((f) => f.scope === 'business').map((f) => [f.key, 'known']),
    );
    db.query.mockResolvedValue([
      {
        scope_key: '',
        field_states: JSON.stringify(person),
        invitation: 'completed',
      },
      { scope_key: '111', field_states: complete },
      { scope_key: '222', field_states: { registration: 'known' } },
    ]);
    const choices = await service.businesses(user);
    expect(choices[0]).toMatchObject({
      onboardingStatus: 'completed',
      missingCount: 0,
    });
    expect(choices[1].onboardingStatus).toBe('in_progress');
    expect(choices[1].missingCount).toBeGreaterThan(0);
  });
  it('marks an owner with no stored profile as not started without writing data', async () => {
    db.query.mockResolvedValue([]);
    const choices = await service.businesses(user);
    expect(choices[0]).toMatchObject({
      onboardingStatus: 'not_started',
      missingCount: FIELDS.length,
    });
    expect(db.transaction).not.toHaveBeenCalled();
  });
  it.each([
    ['recall', 'קוראים לך שמואל ואתה גם עצמאי וגם שכיר.'],
    ['guidance', 'בשמחה. מה העסק שלך עושה בפועל?'],
    [
      'off topic',
      'זה צ׳אט להיכרות. לשאלות על האפליקציה אפשר לפנות לסוכן הראשי.',
    ],
  ])(
    'commits a conversational %s reply instead of repeating the next missing question',
    async (_kind, reply) => {
      const person = { id: 'p', scope_key: '', version: 1, field_states: {} };
      const business = {
        id: 'b',
        scope_key: '111',
        version: 1,
        field_states: {},
      };
      const manager = {
        query: jest.fn(async (sql: string, _params?: unknown[]) => {
          if (sql.includes('TIMESTAMPDIFF'))
            return [
              {
                base_person_version: 1,
                base_business_version: 1,
                age_seconds: 0,
                payload: { facts: [], clarification: null, reply },
                source_text: 'מה אתה יודע עלי?',
              },
            ];
          if (sql.startsWith('SELECT * FROM agent_onboarding_profiles'))
            return [person, business];
          return [];
        }),
      };
      db.transaction.mockImplementation((work) => work(manager));
      jest
        .spyOn(service, 'read')
        .mockResolvedValue({ version: { person: 2, business: 2 } } as any);
      await service.commit(user, '111', 'proposal');
      const change = manager.query.mock.calls.find(([sql]) =>
        sql.startsWith('INSERT INTO agent_onboarding_changes'),
      );
      expect(change?.[1][4]).toBe(reply);
      expect(
        manager.query.mock.calls.some(([sql]) =>
          sql.startsWith('INSERT INTO agent_onboarding_facts'),
        ),
      ).toBe(false);
    },
  );
  it('checks the narrative version before calling the model', async () => {
    jest
      .spyOn(service, 'read')
      .mockResolvedValue({ version: { person: 2, business: 1 } } as any);
    await expect(
      service.summarize(user, '111', { person: 1, business: 1 }),
    ).rejects.toThrow();
    expect(extractor.summarize).not.toHaveBeenCalled();
  });
  it('grounds the presentation in scoped current facts, history and source context without writing it as memory', async () => {
    const facts = [
      { statement: 'עובד במשרד', status: 'active' },
      { statement: 'עבד מהבית', status: 'superseded' },
    ];
    jest
      .spyOn(service, 'read')
      .mockResolvedValue({
        version: { person: 2, business: 1 },
        fields: [],
        facts,
        story: { narrative: 'תוכנית לקורס' },
      } as any);
    extractor.summarize.mockResolvedValue('אתה עובד במשרד ומתכנן קורס.');
    expect(
      await service.summarize(user, '111', { person: 2, business: 1 }),
    ).toEqual({
      story: 'אתה עובד במשרד ומתכנן קורס.',
      version: { person: 2, business: 1 },
    });
    expect(extractor.summarize).toHaveBeenCalledWith({
      fields: [],
      facts,
      sourceNarrative: 'תוכנית לקורס',
    });
    expect(db.transaction).not.toHaveBeenCalled();
    expect(db.query).not.toHaveBeenCalled();
  });

  it('passes new validated answers to the responder and removes them from missing questions', async () => {
    jest.spyOn(service, 'read').mockResolvedValue({
      businessNumber: '111',
      version: { person: 0, business: 0 },
      facts: [],
      story: {},
      turns: [],
      fields: [
        { key: 'preferred_name', state: 'unasked' },
        { key: 'activity', state: 'unasked' },
      ],
    } as any);
    extractor.extract.mockResolvedValue({
      facts: [
        {
          field: 'preferred_name',
          scope: 'person',
          statement: 'קוראים לך שמואל',
          value: 'שמואל',
          state: 'known',
          replaces: null,
          change: 'add',
          effectiveDate: null,
          precision: 'unknown',
          evidence: 'שמואל',
        },
      ],
      clarification: null,
    });
    await service.propose(user, {
      businessNumber: '111',
      version: { person: 0, business: 0 },
      message: 'אני שמואל',
    });
    const context = extractor.respond.mock.calls[0][1];
    expect(context.fields[0].state).toBe('known');
    expect(context.missingQuestions.map((f) => f.key)).toEqual(['activity']);
    expect(context.currentFacts[0].value_text).toBe('שמואל');
  });

  it.each(['guidance', 'recall', 'off_topic', 'defer'])(
    'routes %s without treating the request as a personal fact',
    async (intent) => {
      jest.spyOn(service, 'read').mockResolvedValue({
        businessNumber: '111',
        version: { person: 0, business: 0 },
        facts: [],
        story: { narrative: 'תוכנית לקורס' },
        turns: [],
        fields: [
          {
            key: 'activity',
            scope: 'business',
            label: 'פעילות העסק',
            question: 'מה העסק עושה?',
            state: 'unasked',
          },
          { key: 'vehicle', question: 'יש שימוש ברכב?', state: 'unasked' },
        ],
      } as any);
      extractor.extract.mockResolvedValue({
        facts: [],
        clarification: null,
        intent,
        deferredField: intent === 'defer' ? 'activity' : null,
      });
      const result = await service.propose(user, {
        businessNumber: '111',
        version: { person: 0, business: 0 },
        message: 'הודעה',
      });
      if (intent === 'defer') {
        expect(result.facts).toEqual([
          expect.objectContaining({
            field: 'activity',
            state: 'skipped',
            evidence: 'הודעה',
          }),
        ]);
        expect(result.reply).not.toContain('מה העסק עושה?');
      } else expect(result.facts).toEqual([]);
      if (intent === 'off_topic') expect(result.reply).toContain('לסוכן הראשי');
      if (intent === 'recall')
        expect(extractor.respond.mock.calls[0][1]).toMatchObject({
          intent: 'recall',
          sourceNarrative: 'תוכנית לקורס',
        });
      else expect(extractor.respond).not.toHaveBeenCalled();
    },
  );
});
