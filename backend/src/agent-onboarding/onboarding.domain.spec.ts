import {
  FIELDS,
  missingFields,
  storyFromFacts,
  narrativeFromTurns,
  evidenceSources,
  resolveEvidenceIds,
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
  it('stores voluntarily shared needs as flexible facts, including legacy inputs', () => {
    const need = {
      ...fact,
      field: 'current_need',
      scope: 'person',
      statement: 'רוצה להרחיב את העסק',
      value: 'הרחבת העסק',
      evidence: 'להרחיב את העסק',
    };
    const result = validateExtraction(
      { facts: [need], clarification: null },
      'רוצה להרחיב את העסק',
      new Set(),
    );
    expect(result.facts[0].field).toBeNull();
    expect(storyFromFacts(result.facts)).toContain('רוצה להרחיב את העסק');
    expect(FIELDS.map((field) => field.key)).not.toContain('current_need');
  });
  it('retains unrelated narrative when rebuilding the story', () =>
    expect(
      storyFromFacts([
        { statement: 'עובד במשרד' },
        { statement: 'רוצה להרחיב מכירת תבניות' },
      ]),
    ).toContain('רוצה להרחיב מכירת תבניות'));
  it('preserves original narrative independently of extracted summary facts', () => {
    const narrative = narrativeFromTurns([
      {
        source_text: 'אני מתכנן קורס דיגיטלי',
        created_at: new Date('2026-11-19T10:00:00Z'),
      },
    ]);
    expect(narrative).toContain('אני מתכנן קורס דיגיטלי');
    expect(narrative).toContain('2026-11-19T10:00:00.000Z');
  });
  it('resolves enum-constrained source IDs to the exact original quotes', () => {
    const message = 'אני דני. אני עובד גם בבית וגם במשרד.';
    const sources = evidenceSources(message);
    const result = resolveEvidenceIds(
      { facts: [{ evidence: [sources[1].id] }], clarification: null },
      sources,
    ) as any;
    expect(result.facts[0].evidence).toEqual(['אני עובד גם בבית וגם במשרד.']);
    expect(message).toContain(result.facts[0].evidence[0]);
  });
  it('rejects invented IDs and joined quotations rather than accepting them', () => {
    const sources = evidenceSources('אני עוסק פטור.');
    expect(() =>
      resolveEvidenceIds(
        { facts: [{ evidence: ['אני [...] פטור'] }], clarification: null },
        sources,
      ),
    ).toThrow('UNKNOWN_SOURCE');
  });
  it('bounds source enumeration while keeping every segment contiguous in the original', () => {
    const message = Array.from(
      { length: 1000 },
      (_, i) => 'משפט ' + i + '.',
    ).join(' ');
    const sources = evidenceSources(message);
    expect(sources.length).toBeLessThanOrEqual(200);
    for (const source of sources) expect(message).toContain(source.text);
  });
});
