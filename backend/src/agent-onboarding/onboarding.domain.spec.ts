import {
  FIELDS,
  missingFields,
  storyFromFacts,
  validateExtraction,
} from './onboarding.domain';

const fact = {
  field: 'activity',
  scope: 'business',
  statement: 'המשתמש מעצב',
  value: 'מעצב',
  state: 'known',
  replaces: null,
  change: 'add',
  effectiveDate: null,
  precision: 'unknown',
  evidence: 'מעצב',
};
describe('onboarding extraction boundaries', () => {
  it('extracts basic and open-ended narrative in one answer', () => {
    const result = validateExtraction(
      {
        facts: [
          fact,
          {
            ...fact,
            field: null,
            statement: 'רוצה להרחיב את העסק',
            value: null,
            evidence: 'רוצה להרחיב',
          },
        ],
        clarification: null,
      },
      'אני מעצב ורוצה להרחיב',
      new Set(),
    );
    expect(result.facts).toHaveLength(2);
  });
  it('rejects unsupported evidence', () =>
    expect(() =>
      validateExtraction(
        { facts: [fact], clarification: null },
        'אני מורה',
        new Set(),
      ),
    ).toThrow());
  it('accepts multiple exact quote fragments without fabricating a joined quote', () =>
    expect(
      validateExtraction(
        {
          facts: [{ ...fact, evidence: ['אני', 'מעצב'] }],
          clarification: null,
        },
        'אני דני מעצב',
        new Set(),
      ).facts,
    ).toHaveLength(1));
  it('rejects an inaccessible replacement', () =>
    expect(() =>
      validateExtraction(
        {
          facts: [{ ...fact, replaces: 'another-owner', change: 'correction' }],
          clarification: null,
        },
        'מעצב',
        new Set(),
      ),
    ).toThrow());
  it('rejects personal fields stored under business scope', () =>
    expect(() =>
      validateExtraction(
        { facts: [{ ...fact, field: 'preferred_name' }], clarification: null },
        'מעצב',
        new Set(),
      ),
    ).toThrow());
  it('keeps month precision without inventing a day', () => {
    const result = validateExtraction(
      {
        facts: [{ ...fact, effectiveDate: '2026-10', precision: 'month' }],
        clarification: null,
      },
      'מעצב',
      new Set(),
    );
    expect(result.facts[0].effectiveDate).toBe('2026-10');
  });
  it('rejects an impossible date', () =>
    expect(() =>
      validateExtraction(
        {
          facts: [{ ...fact, effectiveDate: '2026-02-30', precision: 'day' }],
          clarification: null,
        },
        'מעצב',
        new Set(),
      ),
    ).toThrow());
  it('rejects duplicate basic fields', () =>
    expect(() =>
      validateExtraction(
        { facts: [fact, fact], clarification: null },
        'מעצב',
        new Set(),
      ),
    ).toThrow());
  it('unknown and skip count as answered but absent states do not', () => {
    const person = {
      field_states: {
        preferred_name: 'skipped',
        employment: 'unknown',
        current_need: 'known',
      },
    } as any;
    const business = {
      field_states: Object.fromEntries(
        FIELDS.filter((f) => f.scope === 'business').map((f) => [
          f.key,
          'known',
        ]),
      ),
    } as any;
    expect(missingFields(person, business)).toEqual([]);
    delete business.field_states.vehicle;
    expect(missingFields(person, business).map((f) => f.key)).toEqual([
      'vehicle',
    ]);
  });
  it('retains unrelated narrative when rebuilding the story', () =>
    expect(
      storyFromFacts([
        { statement: 'עובד במשרד' },
        { statement: 'רוצה להרחיב מכירת תבניות' },
      ]),
    ).toContain('רוצה להרחיב מכירת תבניות'));
});
