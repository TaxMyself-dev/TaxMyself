import {
  SETTINGS_TABS,
  shouldLoadOpenBankingAccountSources,
} from './settings-access.policy';

describe('settings access policy', () => {
  it('keeps categories and permission management available without module filtering', () => {
    const values = SETTINGS_TABS.map((tab) => tab.value);
    expect(values).toContain('categories');
    expect(values).toContain('permissions');
  });

  it('loads bank account sources only inside the permissions tab with OPEN_BANKING access', () => {
    expect(shouldLoadOpenBankingAccountSources('permissions', true)).toBeTrue();
    expect(shouldLoadOpenBankingAccountSources('permissions', false)).toBeFalse();
    expect(shouldLoadOpenBankingAccountSources('categories', true)).toBeFalse();
  });
});
