export interface SettingsTab {
  label: string;
  value: string;
}

/** Settings sections that belong to every authenticated user. */
export const SETTINGS_TABS: SettingsTab[] = [
  { label: 'פרטים אישיים', value: 'personal' },
  { label: 'העסקים שלי', value: 'businesses' },
  { label: 'הקטגוריות שלי', value: 'categories' },
  { label: 'ניהול הרשאות וחשבונות', value: 'permissions' },
  { label: 'המנוי שלי', value: 'subscription' },
];

/** Only the bank-account subsection of the permissions tab needs OPEN_BANKING. */
export function shouldLoadOpenBankingAccountSources(
  selectedTab: string,
  hasOpenBankingAccess: boolean,
): boolean {
  return selectedTab === 'permissions' && hasOpenBankingAccess;
}
