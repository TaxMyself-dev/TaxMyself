import {
  assertSelf,
  automationMissing,
  decision,
  groundedDecision,
} from './auto-classification.policy';
import { FIELDS, ProfileRow } from '../agent-onboarding/onboarding.domain';
import { autoIdentity } from './auto-classification.service';
describe('automatic classification policy', () => {
  function complete() {
    const person = { field_states: {} } as ProfileRow,
      business = { field_states: {} } as ProfileRow;
    for (const f of FIELDS) {
      const row = f.scope === 'person' ? person : business;
      row.field_states[f.key] = 'known';
      row[f.key] = 'מידע מפורש';
    }
    return { person, business };
  }
  it('requires every predefined field from both scopes', () => {
    expect(automationMissing()).toHaveLength(FIELDS.length);
    const f = complete();
    expect(automationMissing(f.person, f.business)).toEqual([]);
  });
  it.each(['unknown', 'skipped'] as const)(
    'does not mistake %s for complete',
    (state) => {
      const f = complete();
      f.business.field_states.vehicle = state;
      expect(automationMissing(f.person, f.business)).toEqual([
        { key: 'vehicle', label: 'שימוש עסקי ברכב' },
      ]);
    },
  );
  it('requires an actual known value', () => {
    const f = complete();
    f.person.preferred_name = ' ';
    expect(automationMissing(f.person, f.business)).toHaveLength(1);
  });
  it('accepts explicit not-applicable as onboarding permits', () => {
    const f = complete();
    f.business.field_states.vehicle = 'not_applicable';
    f.business.vehicle = null;
    expect(automationMissing(f.person, f.business)).toEqual([]);
  });
  it.each([
    { actorFirebaseId: 'agent' },
    { isDelegatedAccess: true },
    { isAdminImpersonation: true },
  ])('denies represented identity %j', (override) => {
    expect(() =>
      assertSelf({ ...autoIdentity('owner'), ...override }),
    ).toThrow();
  });
  it('allows the real owner', () =>
    expect(() => assertSelf(autoIdentity('owner'))).not.toThrow());
  it('accepts a valid permanent rule decision', () =>
    expect(
      decision(
        {
          kind: 'rule',
          subCategoryId: 2,
          reason: 'מבוסס על המידע',
          question: null,
        },
        [2],
      ).kind,
    ).toBe('rule'));
  it.each([
    { kind: 'one_time', subCategoryId: 2, reason: 'r', question: null },
    { kind: 'rule', subCategoryId: 99, reason: 'r', question: null },
    { kind: 'rule', subCategoryId: 2, reason: 'r', question: 'ספק' },
    { kind: 'clarify', subCategoryId: 2, reason: 'r', question: 'מה נרכש?' },
    { kind: 'clarify', subCategoryId: null, reason: 'r', question: null },
    { kind: 'rule', subCategoryId: 2, reason: '', question: null },
  ])('refuses malformed or uncertain write %j', (d) =>
    expect(() => decision(d, [2])).toThrow(),
  );
});

describe('evidence boundary', () => {
  const input = {
    profile: { business: 'המנוי מיועד לעסק בלבד' },
    transaction: { note: 'מנוי' },
    categories: [{ id: 1, private: false }],
  };
  const valid = {
    kind: 'rule',
    subCategoryId: 1,
    reason: 'מנוי עסקי',
    question: null,
    assessment: {
      purchaseKnown: true,
      purpose: 'business',
      purposeEvidence: 'לעסק בלבד',
      permanentRuleSupported: true,
      uncertainties: [],
    },
  };
  it('accepts a purpose quoted from actual input', () =>
    expect(groundedDecision(valid, input, [1]).kind).toBe('rule'));
  it.each([
    { purpose: 'unknown' },
    { purposeEvidence: 'a fabricated quotation' },
    { uncertainties: ['לא ברור אם הרכב עסקי'] },
    { permanentRuleSupported: false },
    { purpose: 'private' },
  ])('turns unsupported rule decisions into a question %j', (patch) =>
    expect(
      groundedDecision(
        { ...valid, assessment: { ...valid.assessment, ...patch } },
        input,
        [1],
      ).kind,
    ).toBe('clarify'),
  );
});
