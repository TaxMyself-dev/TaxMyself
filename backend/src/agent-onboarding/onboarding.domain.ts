import { BadRequestException } from '@nestjs/common';

export const FIELDS = [
  {
    key: 'preferred_name',
    scope: 'person',
    label: 'שם לפנייה',
    question: 'איך נוח לך שאפנה אליך?',
  },
  {
    key: 'employment',
    scope: 'person',
    label: 'עבודה כשכיר',
    question: 'האם אתה משלב גם עבודה כשכיר?',
  },
  {
    key: 'activity',
    scope: 'business',
    label: 'פעילות העסק',
    question: 'מה העסק שלך עושה בפועל?',
  },
  {
    key: 'business_stage',
    scope: 'business',
    label: 'מצב העסק',
    question: 'העסק כבר פעיל, עדיין בהקמה או שאינו פעיל כרגע?',
  },
  {
    key: 'registration',
    scope: 'business',
    label: 'סוג הרישום',
    question: 'איך העסק רשום כיום — פטור, מורשה, חברה או אחרת?',
  },
  {
    key: 'workplace',
    scope: 'business',
    label: 'סביבת העבודה',
    question: 'מאיפה אתה עובד — מהבית, ממשרד, בשטח או בשילוב?',
  },
  {
    key: 'vehicle',
    scope: 'business',
    label: 'שימוש עסקי ברכב',
    question: 'האם אתה משתמש ברכב לצורכי העסק?',
  },
  {
    key: 'employees',
    scope: 'business',
    label: 'עובדים',
    question: 'האם העסק מעסיק עובדים?',
  },
  {
    key: 'partners',
    scope: 'business',
    label: 'שותפים',
    question: 'האם יש שותפים בעסק?',
  },
  {
    key: 'international',
    scope: 'business',
    label: 'פעילות בחו״ל',
    question: 'האם יש לעסק לקוחות, ספקים או פעילות אחרת בחו״ל?',
  },
  {
    key: 'current_need',
    scope: 'person',
    label: 'מה חשוב כרגע',
    question: 'במה הכי יעזור לך שאתמקד כרגע?',
  },
] as const;
export type FieldKey = (typeof FIELDS)[number]['key'];
export type AnswerState = 'known' | 'unknown' | 'skipped' | 'not_applicable';
export interface FactInput {
  field: FieldKey | null;
  scope: 'person' | 'business';
  statement: string;
  value: string | null;
  state: AnswerState;
  replaces: string | null;
  change: 'add' | 'transition' | 'correction';
  effectiveDate: string | null;
  precision: 'day' | 'month' | 'unknown';
  evidence: string | string[];
  invalidates?: string[];
  workplaceModes?: string[] | null;
}
export interface Extraction {
  facts: FactInput[];
  clarification: string | null;
}
export interface ProfileRow {
  id: string;
  owner_uid: string;
  scope_key: string;
  version: number;
  story: string;
  field_states: Record<string, AnswerState>;
  invitation: string;
  [key: string]: unknown;
}
export function decode<T>(value: T | string): T {
  return typeof value === 'string' ? JSON.parse(value) : value;
}
export function validateExtraction(
  input: unknown,
  message: string,
  existingIds: Set<string>,
): Extraction {
  const x = input as Extraction;
  if (
    !x ||
    !Array.isArray(x.facts) ||
    x.facts.length > 30 ||
    !(
      x.clarification === null ||
      (typeof x.clarification === 'string' && x.clarification.length <= 1500)
    )
  )
    throw new BadRequestException('תשובת הניתוח אינה תקינה');
  const seen = new Set<string>();
  for (const f of x.facts) {
    if (!f || typeof f !== 'object')
      throw new BadRequestException('עובדה לא תקינה');
    const field = FIELDS.find((v) => v.key === f.field);
    if (
      !f ||
      !['person', 'business'].includes(f.scope) ||
      (f.field !== null && (!field || field.scope !== f.scope)) ||
      typeof f.statement !== 'string' ||
      !f.statement.trim() ||
      f.statement.length > 3000 ||
      !(
        f.value === null ||
        (typeof f.value === 'string' && f.value.length <= 2000)
      ) ||
      !['known', 'unknown', 'skipped', 'not_applicable'].includes(f.state) ||
      (f.field !== null &&
        f.state === 'known' &&
        !f.value?.trim() &&
        !(
          f.field === 'workplace' &&
          Array.isArray(f.workplaceModes) &&
          f.workplaceModes.length > 0
        )) ||
      !['add', 'transition', 'correction'].includes(f.change) ||
      !['day', 'month', 'unknown'].includes(f.precision) ||
      !validEvidence(f.evidence, message) ||
      (f.replaces !== null &&
        (!existingIds.has(f.replaces) || seen.has(f.replaces))) ||
      (f.replaces !== null && f.change === 'add') ||
      (f.replaces === null && f.change !== 'add')
    )
      throw new BadRequestException('יש לברר את המידע לפני שמירה');
    if (
      f.precision === 'unknown'
        ? f.effectiveDate !== null
        : !validDate(f.effectiveDate, f.precision)
    )
      throw new BadRequestException('תאריך לא תקין');
    if (f.replaces) seen.add(f.replaces);
    if (
      f.invalidates &&
      (!Array.isArray(f.invalidates) ||
        f.invalidates.length > 50 ||
        (f.change !== 'correction' && f.invalidates.length > 0) ||
        f.invalidates.some((id) => !existingIds.has(id)))
    )
      throw new BadRequestException('תיקון היסטורי לא תקין');
    if (
      f.workplaceModes &&
      (!Array.isArray(f.workplaceModes) ||
        f.workplaceModes.some(
          (v) => !['home', 'office', 'field', 'other'].includes(v),
        ))
    )
      throw new BadRequestException('סביבת עבודה לא תקינה');
  }
  const fields = x.facts.filter((f) => f.field).map((f) => f.field);
  if (new Set(fields).size !== fields.length)
    throw new BadRequestException('אותו שדה הופיע יותר מפעם אחת');
  return x;
}
function validEvidence(evidence: unknown, message: string) {
  const quotes = typeof evidence === 'string' ? [evidence] : evidence;
  return (
    Array.isArray(quotes) &&
    quotes.length > 0 &&
    quotes.length <= 10 &&
    quotes.every(
      (q) =>
        typeof q === 'string' && q.trim().length > 0 && message.includes(q),
    )
  );
}
function validDate(value: string | null, precision: string) {
  if (typeof value !== 'string') return false;
  if (precision === 'month') return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
export function missingFields(person: ProfileRow, business: ProfileRow) {
  return FIELDS.filter(
    (f) => !(f.scope === 'person' ? person : business).field_states[f.key],
  );
}
export function storyFromFacts(
  facts: {
    statement: string;
    effective_date?: string;
    date_precision?: string;
  }[],
) {
  return facts
    .map(
      (f) =>
        f.statement +
        (f.effective_date
          ? ` (החל מ־${f.effective_date}, דיוק: ${f.date_precision})`
          : ''),
    )
    .join('\n');
}
