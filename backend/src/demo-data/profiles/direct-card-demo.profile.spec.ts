import { SourceType } from 'src/enum';
import { DIRECT_CARD_DEMO_PROFILE } from './direct-card-demo.profile';
import { DEMO_PROFILES, findDemoProfileByEmail, isDemoEmail } from './index';

/**
 * Data-shape guards for the permanent Direct-card demo profile. These are the
 * invariants that make the manual Direct-card verification meaningful — if any
 * of them drifts, the demo silently stops reproducing production behaviour
 * (e.g. a card transaction sneaks in, or the settings-page join breaks because
 * a sourceId no longer matches a Source.sourceName).
 */
describe('DIRECT_CARD_DEMO_PROFILE', () => {
  const profile = DIRECT_CARD_DEMO_PROFILE;
  const sources = profile.bills.flatMap((b) => b.sources);
  const bank = sources.find((s) => s.sourceType === SourceType.BANK_ACCOUNT)!;
  const card = sources.find((s) => s.sourceType === SourceType.CREDIT_CARD)!;

  it('is registered and recognised as a demo user', () => {
    expect(DEMO_PROFILES).toContain(profile);
    expect(isDemoEmail(profile.email)).toBe(true);
    expect(findDemoProfileByEmail(profile.email.toUpperCase())).toBe(profile);
  });

  it('is a regular single-business open-banking user', () => {
    expect(profile.role).toBeUndefined(); // → [REGULAR]
    expect(profile.businesses).toHaveLength(1);
    expect(profile.hasOpenBanking ?? true).toBe(true);
    expect(profile.delegatedClients).toBeUndefined();
  });

  it('declares exactly one bank source and one Direct card', () => {
    expect(sources).toHaveLength(2);
    expect(bank.isDirect).toBeUndefined(); // banks never carry the flag
    expect(card.isDirect).toBe(true);
  });

  it('generates no transaction on the Direct card', () => {
    const onCard = profile.transactions.filter(
      (t) => t.paymentIdentifier === card.sourceName,
    );
    expect(onCard).toEqual([]);
    expect(
      profile.transactions.every((t) => t.paymentIdentifier === bank.sourceName),
    ).toBe(true);
    expect(profile.transactions.length).toBeGreaterThan(0);
  });

  it('declares sync state whose sourceIds match the Source names', () => {
    const states = profile.sourceSyncStates ?? [];
    const names = new Set(sources.map((s) => s.sourceName));
    expect(states).toHaveLength(2);
    for (const s of states) {
      expect(names.has(s.sourceId)).toBe(true);
      expect(s.consentId).toBeTruthy();
      expect(s.resourceId).toBeTruthy();
      expect(s.error).toBeUndefined();
    }
  });

  it('marks the bank success and the Direct card skipped_direct', () => {
    const states = profile.sourceSyncStates ?? [];
    const bankState = states.find((s) => s.sourceId === bank.sourceName)!;
    const cardState = states.find((s) => s.sourceId === card.sourceName)!;

    expect(bankState.type).toBe('bank');
    expect(bankState.status).toBe('success');
    // Derived by the seeder from the seeded rows — must not be hardcoded.
    expect(bankState.transactionCount).toBeUndefined();

    expect(cardState.type).toBe('card');
    expect(cardState.status).toBe('skipped_direct');
    expect(cardState.transactionCount).toBeUndefined();
  });
});

/** Backwards compatibility: the new optional fields must stay opt-in. */
describe('existing demo profiles', () => {
  const others = DEMO_PROFILES.filter((p) => p.id !== DIRECT_CARD_DEMO_PROFILE.id);

  it('declare no sourceSyncStates and no isDirect flags', () => {
    for (const p of others) {
      expect(p.sourceSyncStates).toBeUndefined();
      const allSources = [...p.bills.flatMap((b) => b.sources), ...(p.standaloneSources ?? [])];
      for (const s of allSources) {
        expect(s.isDirect).toBeUndefined();
      }
    }
  });

  it('keeps every profile id and email unique', () => {
    const ids = DEMO_PROFILES.map((p) => p.id);
    const emails = DEMO_PROFILES.map((p) => p.email.toLowerCase());
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(emails).size).toBe(emails.length);
  });
});
