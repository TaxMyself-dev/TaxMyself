import { SourceType, UserRole } from 'src/enum';
import { DESIGNER_SANDBOX_PROFILE } from './designer-sandbox.profile';
import {
  canSelfResetDemoEmail,
  DEMO_PROFILES,
  isDemoEmail,
  usesSyntheticOpenBanking,
} from './index';

describe('designer sandbox demo profile', () => {
  it('is registered as an isolated regular-user sandbox', () => {
    expect(DEMO_PROFILES).toContain(DESIGNER_SANDBOX_PROFILE);
    expect(DESIGNER_SANDBOX_PROFILE.role).toEqual([UserRole.REGULAR]);
    expect(DESIGNER_SANDBOX_PROFILE.delegatedClients).toBeUndefined();
    expect(DESIGNER_SANDBOX_PROFILE.email).toMatch(/@keepintax\.co\.il$/);
    expect(isDemoEmail(DESIGNER_SANDBOX_PROFILE.email)).toBe(true);
  });

  it('is the only profile granted self-reset and synthetic-sync capabilities', () => {
    expect(canSelfResetDemoEmail(DESIGNER_SANDBOX_PROFILE.email)).toBe(true);
    expect(usesSyntheticOpenBanking(DESIGNER_SANDBOX_PROFILE.email)).toBe(true);

    for (const profile of DEMO_PROFILES.filter((item) => item !== DESIGNER_SANDBOX_PROFILE)) {
      expect(canSelfResetDemoEmail(profile.email)).toBe(false);
      expect(usesSyntheticOpenBanking(profile.email)).toBe(false);
    }
  });

  it('contains completed bank and card fixture data with income and expenses', () => {
    const sourceTypes = DESIGNER_SANDBOX_PROFILE.bills.flatMap((bill) => bill.sources.map((source) => source.sourceType));
    expect(sourceTypes).toContain(SourceType.BANK_ACCOUNT);
    expect(sourceTypes).toContain(SourceType.CREDIT_CARD);
    expect(DESIGNER_SANDBOX_PROFILE.transactions.some((row) => row.amount > 0)).toBe(true);
    expect(DESIGNER_SANDBOX_PROFILE.transactions.some((row) => row.amount < 0)).toBe(true);
    expect(DESIGNER_SANDBOX_PROFILE.sourceSyncStates?.every((row) => row.status === 'success')).toBe(true);
  });
});
