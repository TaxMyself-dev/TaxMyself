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
    extractor = { extract: jest.fn() };
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
    expect(proposal.clarification).toBe('מה העסק עושה?');
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
});
