export const PERSONAL_SETTINGS_LINKS = [
  { key: 'account', label: 'החשבון שלי' },
  { key: 'businesses', label: 'העסקים שלי' },
  { key: 'agent', label: 'הסוכן שלי' },
] as const;
export const SUBSCRIPTION_SETTINGS_LINKS = [
  { key: 'subscription', label: 'פרטי המנוי' },
  { key: 'payment', label: 'אמצעי תשלום' },
  { key: 'history', label: 'היסטוריית תשלומים' },
  { key: 'categories', label: 'הקטגוריות שלי' },
  { key: 'permissions', label: 'הרשאות' },
  { key: 'banking', label: 'בנקאות פתוחה' },
] as const;
export type SettingsSection = typeof PERSONAL_SETTINGS_LINKS[number]['key'] | typeof SUBSCRIPTION_SETTINGS_LINKS[number]['key'];

export function activeSettingsSection(sections: { key: SettingsSection; top: number }[], viewportTop: number, atEnd: boolean): SettingsSection {
  if (!sections.length) return 'account';
  if (atEnd) return sections[sections.length - 1].key;
  return sections.filter(section => section.top <= viewportTop + 240).pop()?.key ?? sections[0].key;
}
