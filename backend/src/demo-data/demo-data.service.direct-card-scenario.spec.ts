import { NotFoundException } from '@nestjs/common';
import { DemoDataService } from './demo-data.service';
import { DIRECT_CARD_DEMO_PROFILE } from './profiles/direct-card-demo.profile';
import { SINGLE_OB_OCR_TEST_PROFILE } from './profiles/single-ob-ocr-test.profile';
import { DemoProfile } from './demo-profile.types';
import { FullTransactionCache } from 'src/transactions/full-transaction-cache.entity';

/**
 * Pure-logic tests for the two Direct-card scenario actions. Everything under
 * test here is DB-free: the duplicate-row builder, the sync-row derivation and
 * the scenario guard. The DB-touching orchestration around them is exercised
 * manually (see the checklist in the PR description).
 *
 * The constructor only assigns its dependencies, so passing nulls is safe for
 * the private helpers below.
 */
const makeService = () =>
  new DemoDataService(
    null as any, // dataSource
    null as any, // driveService
    null as any, // fxRateService
    null as any, // usersService
    null as any, // documentsService
    null as any, // expensesService
  );

const CARD = DIRECT_CARD_DEMO_PROFILE.legacyDuplicateScenario!.cardSourceName;
const BANK = DIRECT_CARD_DEMO_PROFILE.bills[0].sources[0].sourceName;

/** Minimal stand-in for what buildCacheRowsFromProfile returns. */
const bankRow = (
  i: number,
  merchantName: string,
  over: Partial<FullTransactionCache> = {},
): Partial<FullTransactionCache> => ({
  externalTransactionId: `demo-direct-card-demo-${i}`,
  userId: 'fid-1',
  billId: 7,
  billName: 'חשבון נועם ברק',
  businessNumber: '340777888',
  merchantName,
  paymentIdentifier: BANK,
  transactionDate: new Date('2026-07-20T00:00:00Z'),
  amount: -318.4,
  currency: 'ILS',
  ilsAmount: null,
  fxRateToIls: null,
  ...over,
});

describe('buildLegacyDuplicateRows', () => {
  const service = makeService();
  const build = (
    profile: DemoProfile,
    rows: Array<Partial<FullTransactionCache>>,
  ): Array<Partial<FullTransactionCache>> =>
    (service as any).buildLegacyDuplicateRows(
      profile,
      profile.legacyDuplicateScenario!,
      rows,
    );

  const profile = DIRECT_CARD_DEMO_PROFILE;
  const merchants = profile.legacyDuplicateScenario!.duplicateMerchants;

  /**
   * A full bank-feed set — one row per named merchant. The builder validates
   * that EVERY named merchant is present, so callers must always hand it the
   * complete set (which the real caller, buildCacheRowsFromProfile, does).
   */
  const fullRows = (): Array<Partial<FullTransactionCache>> =>
    merchants.map((m, i) => bankRow(i, m));

  it('produces one card twin per named merchant', () => {
    const dups = build(profile, fullRows());

    expect(dups).toHaveLength(merchants.length);
    expect(dups.every((d) => d.paymentIdentifier === CARD)).toBe(true);
    expect(dups.map((d) => d.merchantName)).toEqual(merchants);
  });

  it('clones merchant, amount, date and currency verbatim', () => {
    const rows = fullRows();
    const original = bankRow(0, merchants[0], {
      amount: -59.99,
      currency: 'USD',
      ilsAmount: -221.36,
      fxRateToIls: 3.69,
      transactionDate: new Date('2026-07-19T00:00:00Z'),
    });
    rows[0] = original;

    const dup = build(profile, rows).find((d) => d.merchantName === merchants[0])!;

    expect(dup.amount).toBe(original.amount);
    expect(dup.transactionDate).toEqual(original.transactionDate);
    expect(dup.currency).toBe(original.currency);
    expect(dup.ilsAmount).toBe(original.ilsAmount);
    expect(dup.fxRateToIls).toBe(original.fxRateToIls);
    // Same bill — a Direct card's twin lands on the same account.
    expect(dup.billId).toBe(original.billId);
    // ...and differs ONLY by the source it came in on.
    expect(dup.paymentIdentifier).toBe(CARD);
    expect(original.paymentIdentifier).toBe(BANK);
  });

  it('gives twins a stable, derived externalTransactionId', () => {
    const rows = fullRows();
    const first = build(profile, rows).map((d) => d.externalTransactionId);
    const second = build(profile, rows).map((d) => d.externalTransactionId);

    // Deterministic → re-running the action rewrites the same rows instead of
    // accumulating new ones (the unique index is on userId+externalTransactionId).
    expect(second).toEqual(first);
    expect(first).toEqual(rows.map((r) => `${r.externalTransactionId}-dup`));
    expect(new Set(first).size).toBe(first.length);
  });

  it('skips transactions that are not named in the scenario', () => {
    const rows = [...fullRows(), bankRow(99, 'ארנונה עיריית חיפה')];
    const dups = build(profile, rows);

    expect(dups).toHaveLength(merchants.length);
    expect(dups.some((d) => d.merchantName === 'ארנונה עיריית חיפה')).toBe(false);
  });

  it('never duplicates a row that is already on the card', () => {
    // A leftover card row (e.g. the action re-run over a legacy state) must
    // not spawn a twin of its own — otherwise duplicates would compound.
    const rows = [...fullRows(), bankRow(99, merchants[0], { paymentIdentifier: CARD })];
    const dups = build(profile, rows);

    expect(dups).toHaveLength(merchants.length);
    expect(dups.map((d) => d.externalTransactionId)).not.toContain(
      'demo-direct-card-demo-99-dup',
    );
  });

  it('throws when a named merchant matches nothing', () => {
    const rows = fullRows().slice(1); // drop merchants[0]
    expect(() => build(profile, rows)).toThrow(/matches no non-card transaction/);
  });

  it('throws when the only match is already on the card', () => {
    const rows = fullRows();
    rows[0] = bankRow(0, merchants[0], { paymentIdentifier: CARD });
    expect(() => build(profile, rows)).toThrow(/matches no non-card transaction/);
  });
});

describe('bankSyncRowsFromProfile', () => {
  const service = makeService();
  const profile = DIRECT_CARD_DEMO_PROFILE;
  const scenario = profile.legacyDuplicateScenario!;

  it('derives the bank count and drops the scenario card', () => {
    const rows = [bankRow(0, 'א'), bankRow(1, 'ב'), bankRow(2, 'ג', { paymentIdentifier: CARD })];
    const out = (service as any).bankSyncRowsFromProfile(profile, scenario, rows);

    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      sourceId: BANK,
      type: 'bank',
      status: 'success',
      transactionCount: 2,
    });
  });
});

describe('findScenarioProfile', () => {
  const service = makeService();

  it('resolves a profile that declares the scenario', () => {
    const { profile, scenario } = (service as any).findScenarioProfile(
      DIRECT_CARD_DEMO_PROFILE.id,
    );
    expect(profile).toBe(DIRECT_CARD_DEMO_PROFILE);
    expect(scenario).toBe(DIRECT_CARD_DEMO_PROFILE.legacyDuplicateScenario);
  });

  it('refuses a demo profile without one', () => {
    expect(() =>
      (service as any).findScenarioProfile(SINGLE_OB_OCR_TEST_PROFILE.id),
    ).toThrow(NotFoundException);
  });

  it('refuses an unknown profile id', () => {
    expect(() => (service as any).findScenarioProfile('nope')).toThrow(NotFoundException);
  });
});
