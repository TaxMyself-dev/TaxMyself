import { randomUUID } from 'crypto';
import { OnboardingService } from './onboarding.service';
const user = {
  actorFirebaseId: 'owner',
  firebaseId: 'owner',
  businessNumber: null,
  delegationScopes: [],
  isDelegatedAccess: false,
  isAdminImpersonation: false,
};
describe('shared profile store', () => {
  let db: any, domain: any, service: OnboardingService;
  const fact = (overrides = {}) => ({
    field: 'employment',
    scope: 'person',
    statement: 'שכיר',
    value: 'כן',
    state: 'known',
    replaces: null,
    change: 'add',
    effectiveDate: null,
    precision: 'unknown',
    evidence: 'שכיר',
    ...overrides,
  });
  const body = (facts: any[] = [fact()]) => ({
    businessNumber: '111',
    version: { person: 1, business: 1 },
    message: 'אני שכיר',
    operationId: randomUUID(),
    extraction: { facts, clarification: null },
  });
  beforeEach(() => {
    process.env.AGENT_ONBOARDING_ENABLED = 'true';
    db = {
      query: jest.fn().mockResolvedValue([]),
      manager: {},
      transaction: jest.fn(),
    };
    domain = {
      ownerBusinesses: jest.fn().mockResolvedValue([{ businessNumber: '111' }]),
    };
    service = new OnboardingService(db, domain);
    jest
      .spyOn(service, 'read')
      .mockResolvedValue({
        businessNumber: '111',
        version: { person: 1, business: 1 },
        facts: [],
        fields: [],
        turns: [],
      } as any);
  });
  afterEach(() => delete process.env.AGENT_ONBOARDING_ENABLED);
  it('rejects delegates before reading any business', async () => {
    await expect(
      service.prepareChanges(
        { ...user, actorFirebaseId: 'other', isDelegatedAccess: true },
        body(),
      ),
    ).rejects.toThrow();
    expect(domain.ownerBusinesses).not.toHaveBeenCalled();
  });
  it('rejects foreign businesses', async () => {
    await expect(
      service.prepareChanges(user, { ...body(), businessNumber: '999' }),
    ).rejects.toThrow();
  });
  it('does not expose context when disabled or delegated', async () => {
    delete process.env.AGENT_ONBOARDING_ENABLED;
    expect(await service.context(user, '111')).toBe('');
    process.env.AGENT_ONBOARDING_ENABLED = 'true';
    expect(
      await service.context({ ...user, actorFirebaseId: 'other' }, '111'),
    ).toBe('');
    expect(db.query).not.toHaveBeenCalled();
  });
  it('rejects stale versions before preparing a write', async () => {
    await expect(
      service.prepareChanges(user, {
        ...body(),
        version: { person: 0, business: 1 },
      }),
    ).rejects.toThrow('עודכן');
    expect(db.query).toHaveBeenCalledTimes(1);
  });
  it('requires evidence in the current message rather than replaying old facts', async () => {
    await expect(
      service.prepareChanges(user, { ...body(), message: 'לא' }),
    ).rejects.toThrow();
    expect(db.query).toHaveBeenCalledTimes(1);
  });
  it('prepares a focused mutation without creating a chatbot response or question', async () => {
    const input = body();
    expect(await service.prepareChanges(user, input)).toEqual({
      id: input.operationId,
    });
    const payload = JSON.parse(db.query.mock.calls[1][1][5]);
    expect(payload.facts).toHaveLength(1);
    expect(payload.reply).toBeNull();
    expect(payload.askedField).toBeNull();
    expect(db.query.mock.calls[1][1][6]).toBe('אני שכיר');
  });
  it('returns an existing operation before a stale-version retry', async () => {
    const input = body();
    db.query.mockResolvedValueOnce([{ id: input.operationId }]);
    expect(
      await service.prepareChanges(user, {
        ...input,
        version: { person: 0, business: 0 },
      }),
    ).toEqual({ id: input.operationId });
    expect(service.read).not.toHaveBeenCalled();
  });
  it('refuses a workplace transition without its effective date', async () => {
    jest
      .mocked(service.read)
      .mockResolvedValue({
        businessNumber: '111',
        version: { person: 1, business: 1 },
        facts: [
          {
            id: 'old',
            status: 'active',
            scope_kind: 'business',
            field_key: 'workplace',
          },
        ],
        fields: [],
        turns: [],
      } as any);
    const input = body([
      fact({
        field: 'workplace',
        scope: 'business',
        statement: 'משרד',
        value: 'משרד',
        evidence: 'משרד',
        replaces: 'old',
        change: 'transition',
      }),
    ]);
    await expect(
      service.prepareChanges(user, { ...input, message: 'עברתי למשרד' }),
    ).rejects.toThrow('ממתי');
    expect(db.query).toHaveBeenCalledTimes(1);
  });
  it('rejects cross-field replacements even with a visible fact id', async () => {
    jest
      .mocked(service.read)
      .mockResolvedValue({
        version: { person: 1, business: 1 },
        facts: [
          {
            id: 'old',
            status: 'active',
            scope_kind: 'business',
            field_key: 'employees',
          },
        ],
      } as any);
    await expect(
      service.prepareChanges(
        user,
        body([fact({ replaces: 'old', change: 'correction' })]),
      ),
    ).rejects.toThrow('תואם');
  });
});
