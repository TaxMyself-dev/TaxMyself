import { BusinessType, SourceType, UserRole } from 'src/enum';
import { DemoDataService } from '../demo-data.service';
import {
  canSelfResetDemoEmail,
  DEMO_PROFILES,
  isDemoEmail,
  usesSyntheticOpenBanking,
} from './index';
import { PARTNER_CANDIDATE_COUPLE_PROFILE as profile } from './partner-candidate-couple.profile';

const isValidIsraeliId = (id: string): boolean =>
  /^\d{9}$/.test(id) &&
  [...id].reduce((sum, digit, index) => {
    const weighted = Number(digit) * (index % 2 === 0 ? 1 : 2);
    return sum + (weighted > 9 ? weighted - 9 : weighted);
  }, 0) % 10 === 0;

describe('partner-candidate couple demo profile', () => {
  it('is registered as an isolated regular user with no privileged capabilities', () => {
    expect(DEMO_PROFILES).toContain(profile);
    expect(profile.role).toEqual([UserRole.REGULAR]);
    expect(profile.delegatedClients).toBeUndefined();
    expect(profile.allowSelfReset).not.toBe(true);
    expect(profile.syntheticOpenBanking).toBe(true);
    expect(profile.hasOpenBanking).toBe(true);
    expect(isDemoEmail(profile.email)).toBe(true);
    expect(canSelfResetDemoEmail(profile.email)).toBe(false);
    expect(usesSyntheticOpenBanking(profile.email)).toBe(true);
  });

  it('models Shani as licensed and her spouse as exempt with valid distinct ids', () => {
    expect(profile.user.fName).toBe('שני');
    expect(profile.spouse).toBeDefined();
    expect(profile.businesses).toEqual([
      expect.objectContaining({
        businessNumber: profile.user.id,
        businessType: BusinessType.LICENSED,
      }),
      expect.objectContaining({
        businessNumber: profile.spouse!.id,
        businessType: BusinessType.EXEMPT,
      }),
    ]);
    expect(profile.user.id).not.toBe(profile.spouse!.id);
    expect(isValidIsraeliId(profile.user.id)).toBe(true);
    expect(isValidIsraeliId(profile.spouse!.id)).toBe(true);
  });

  it('contains exactly two bank accounts and three credit cards across both identities', () => {
    const sources = profile.bills.flatMap((bill) => bill.sources);
    expect(sources.filter((source) => source.sourceType === SourceType.BANK_ACCOUNT)).toHaveLength(2);
    expect(sources.filter((source) => source.sourceType === SourceType.CREDIT_CARD)).toHaveLength(3);
    expect(sources.filter((source) => source.connectionRole === 'primary')).toHaveLength(3);
    expect(sources.filter((source) => source.connectionRole === 'spouse')).toHaveLength(2);
    expect(new Set(sources.map((source) => source.sourceName)).size).toBe(sources.length);

    const syncIds = new Set(profile.sourceSyncStates?.map((state) => state.sourceId));
    expect(profile.sourceSyncStates).toHaveLength(5);
    expect(profile.sourceSyncStates?.every((state) => state.status === 'success')).toBe(true);
    expect(sources.every((source) => syncIds.has(source.sourceName))).toBe(true);
  });

  it('provides fixed, varied data from January through October 2026 on every source', () => {
    const fixedDates = profile.transactions.map((transaction) => transaction.transactionDate!);
    expect(profile.transactions.every((transaction) => transaction.daysAgo === undefined)).toBe(true);
    expect(fixedDates.every((date) => /^2026-\d{2}-\d{2}$/.test(date))).toBe(true);
    const sortedDates = [...fixedDates].sort();
    expect(sortedDates[0]).toBe('2026-01-04');
    expect(sortedDates[sortedDates.length - 1]).toBe('2026-10-18');

    const usedBills = new Set(profile.transactions.map((transaction) => transaction.billKey));
    expect(profile.bills.every((bill) => usedBills.has(bill.key))).toBe(true);
    expect(profile.transactions.some((transaction) => transaction.amount > 0)).toBe(true);
    expect(profile.transactions.some((transaction) => transaction.amount < 0)).toBe(true);
    expect(profile.transactions.some((transaction) => transaction.currency === 'USD')).toBe(true);
    expect(profile.transactions.some((transaction) => transaction.currency === 'EUR')).toBe(true);
    expect(profile.transactions.some((transaction) => transaction.merchantName.includes('מע״מ'))).toBe(true);
    expect(profile.transactions.some((transaction) => transaction.merchantName.includes('החזר'))).toBe(true);
    expect(profile.transactions.some((transaction) => transaction.merchantName.includes('מחשב'))).toBe(true);
  });

  it('resolves fixed dates without moving them and rejects invalid date shapes', () => {
    const service = new DemoDataService(
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
    );
    const today = new Date('2026-10-20T00:00:00.000Z');
    const resolve = (value: object) =>
      (service as any).resolveDemoTransactionDate(value, today) as Date;

    expect(resolve({ transactionDate: '2026-01-04' }).toISOString()).toBe(
      '2026-01-04T00:00:00.000Z',
    );
    expect(resolve({ daysAgo: 2 }).toISOString()).toBe('2026-10-18T00:00:00.000Z');
    expect(() => resolve({})).toThrow(/exactly one/);
    expect(() => resolve({ daysAgo: 2, transactionDate: '2026-01-04' })).toThrow(/exactly one/);
    expect(() => resolve({ transactionDate: '2026-02-30' })).toThrow(/real calendar date/);
    expect(() => resolve({ transactionDate: '2026-10-21' })).toThrow(/future/);
  });
});
