import { SourceType } from 'src/enum';
import { DIRECT_CARD_DEMO_PROFILE } from './direct-card-demo.profile';
import { DESIGNER_SANDBOX_PROFILE } from './designer-sandbox.profile';
import { PARTNER_CANDIDATE_COUPLE_PROFILE } from './partner-candidate-couple.profile';
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

describe('DIRECT_CARD_DEMO_PROFILE legacyDuplicateScenario', () => {
  const profile = DIRECT_CARD_DEMO_PROFILE;
  const scenario = profile.legacyDuplicateScenario!;
  const card = profile.bills
    .flatMap((b) => b.sources)
    .find((s) => s.sourceType === SourceType.CREDIT_CARD)!;

  it('targets the profile’s Direct card', () => {
    expect(scenario).toBeDefined();
    expect(scenario.cardSourceName).toBe(card.sourceName);
  });

  it('names only merchants that exist on a non-card transaction', () => {
    expect(scenario.duplicateMerchants.length).toBeGreaterThanOrEqual(2);
    for (const merchant of scenario.duplicateMerchants) {
      const matches = profile.transactions.filter(
        (t) => t.merchantName === merchant && t.paymentIdentifier !== scenario.cardSourceName,
      );
      expect(matches.length).toBeGreaterThan(0);
    }
  });

  it('names distinct merchants (one duplicate pair each)', () => {
    const unique = new Set(scenario.duplicateMerchants);
    expect(unique.size).toBe(scenario.duplicateMerchants.length);
    // Each name must resolve to exactly one bank row, otherwise the
    // "N duplicate pairs" claim in the docs/UI stops holding.
    for (const merchant of scenario.duplicateMerchants) {
      const matches = profile.transactions.filter((t) => t.merchantName === merchant);
      expect(matches).toHaveLength(1);
    }
  });

  it('leaves some transactions un-duplicated so the contrast is visible', () => {
    const duplicated = new Set(scenario.duplicateMerchants);
    const untouched = profile.transactions.filter((t) => !duplicated.has(t.merchantName));
    expect(untouched.length).toBeGreaterThan(0);
  });
});

/** Optional Open-Banking fixture fields must stay explicit and isolated. */
describe('demo profiles with source-state metadata', () => {
  const expectedFixtureProfileIds = [
    DESIGNER_SANDBOX_PROFILE.id,
    DIRECT_CARD_DEMO_PROFILE.id,
    PARTNER_CANDIDATE_COUPLE_PROFILE.id,
  ].sort();

  it('limits sourceSyncStates and explicit isDirect metadata to fixture profiles', () => {
    const withSyncStates = DEMO_PROFILES
      .filter((p) => p.sourceSyncStates !== undefined)
      .map((p) => p.id)
      .sort();
    const withDirectMetadata = DEMO_PROFILES
      .filter((p) => [...p.bills.flatMap((b) => b.sources), ...(p.standaloneSources ?? [])]
        .some((source) => source.isDirect !== undefined))
      .map((p) => p.id)
      .sort();

    expect(withSyncStates).toEqual(expectedFixtureProfileIds);
    expect(withDirectMetadata).toEqual(expectedFixtureProfileIds);
  });

  it('limits the legacy duplicate scenario to the Direct-card demo', () => {
    expect(DEMO_PROFILES.filter((p) => p.legacyDuplicateScenario).map((p) => p.id))
      .toEqual([DIRECT_CARD_DEMO_PROFILE.id]);
  });

  it('keeps every profile id and email unique', () => {
    const ids = DEMO_PROFILES.map((p) => p.id);
    const emails = DEMO_PROFILES.map((p) => p.email.toLowerCase());
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(emails).size).toBe(emails.length);
  });
});
