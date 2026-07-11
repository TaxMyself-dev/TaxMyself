import { CategoryType, ExpenseReportScope } from 'src/enum';

// ============================================================================
// Phase 2.6 (D13) — the flat SYSTEM category/sub_category seed, replacing
// AccountSeedService's 7-step keyword-matching cascade with data.
//
// SOURCE OF TRUTH: this is NOT re-derived from keywords — every row here is
// copied from `docs/redesign/phase2-catalog-review.md`, the reviewed and
// Elazar-approved output of the Phase 2.2 migration
// (`backend/scripts/migrations/2026-07-12_catalog_migration.ts`, MODE=review
// against `keepintax_prodcopy`). That migration already did the one-time
// resolution of every legacy (category, subCategory) pair to its target card
// exactly once (D13) — this file is a portable (name-keyed, not id-keyed)
// restatement of the same 81 SYSTEM sub_category rows so a fresh boot (or a
// different environment) can reproduce the identical catalog idempotently.
//
// The two ANNUAL merges approved that session (עסק/הפקדה לקרן פנסיה +
// החזרי מס/הפקדה לפנסיה (עצמאי) → one "הפקדה לפנסיה" row; the קרן השתלמות
// pair → one "הפקדה לקרן השתלמות" row) are folded in here already — both
// land under "החזרי מס ודוח שנתי" per ANNUAL_MERGE_PARENT_CATEGORY in the
// migration script.
// ============================================================================

export interface SystemCategorySeed {
  name: string;
  type: CategoryType;
}

export interface SystemSubCategorySeed {
  category: string;
  name: string;
  /** No card at all — never journaled (D5's D14-group-1 household bucket). */
  isPrivate?: boolean;
  /** ANNUAL items have no P&L account by design (D14 decision 2) — routed to
   *  the D8 "תייק" flow instead. Omitted ⇒ PNL (the entity column default). */
  reportScope?: ExpenseReportScope;
  /** booking_account.code within chartOwnerKey=SYSTEM this card points at.
   *  Omitted for isPrivate / ANNUAL rows (neither carries an account). */
  accountCode?: string;
}

export const SYSTEM_CATEGORIES: SystemCategorySeed[] = [
  { name: 'דיור והוצאות הבית', type: CategoryType.EXPENSE },
  { name: 'אוכל וצריכה שוטפת', type: CategoryType.EXPENSE },
  { name: 'רכב ותחבורה', type: CategoryType.EXPENSE },
  { name: 'קניות', type: CategoryType.EXPENSE },
  { name: 'ילדים ומשפחה', type: CategoryType.EXPENSE },
  { name: 'בריאות וביטוחים', type: CategoryType.EXPENSE },
  { name: 'פנאי וחופשות', type: CategoryType.EXPENSE },
  { name: 'עסק', type: CategoryType.EXPENSE },
  { name: 'בנק, אשראי ותנועות', type: CategoryType.EXPENSE },
  { name: 'החזרי מס ודוח שנתי', type: CategoryType.EXPENSE },
  { name: 'שונות', type: CategoryType.EXPENSE },
  { name: 'הכנסות', type: CategoryType.INCOME },
];

export const SYSTEM_SUB_CATEGORIES: SystemSubCategorySeed[] = [
  { category: 'דיור והוצאות הבית', name: 'שכירות', accountCode: '60100' },
  { category: 'דיור והוצאות הבית', name: 'משכנתא', accountCode: '60100' },
  { category: 'דיור והוצאות הבית', name: 'ארנונה', accountCode: '60110' },
  { category: 'דיור והוצאות הבית', name: 'ועד בית', accountCode: '60130' },
  { category: 'דיור והוצאות הבית', name: 'חשמל', accountCode: '60140' },
  { category: 'דיור והוצאות הבית', name: 'מים', accountCode: '60150' },
  { category: 'דיור והוצאות הבית', name: 'גז', accountCode: '60120' },
  { category: 'דיור והוצאות הבית', name: 'אינטרנט', accountCode: '60310' },
  { category: 'דיור והוצאות הבית', name: 'טלפון קווי', accountCode: '60320' },
  { category: 'דיור והוצאות הבית', name: 'תחזוקה', accountCode: '60160' },
  { category: 'דיור והוצאות הבית', name: 'גינה', accountCode: '60100' },
  { category: 'אוכל וצריכה שוטפת', name: 'סופרמרקט', isPrivate: true },
  { category: 'אוכל וצריכה שוטפת', name: 'משלוחים', isPrivate: true },
  { category: 'אוכל וצריכה שוטפת', name: 'פארם', isPrivate: true },
  { category: 'רכב ותחבורה', name: 'דלק', accountCode: '60220' },
  { category: 'רכב ותחבורה', name: 'ביטוח רכב', accountCode: '60210' },
  { category: 'רכב ותחבורה', name: 'טיפולים', accountCode: '60240' },
  { category: 'רכב ותחבורה', name: 'חניה', accountCode: '60230' },
  { category: 'רכב ותחבורה', name: 'כבישי אגרה', accountCode: '60250' },
  { category: 'רכב ותחבורה', name: 'מערכות', accountCode: '60260' },
  { category: 'רכב ותחבורה', name: 'תחבורה ציבורית', accountCode: '60270' },
  { category: 'קניות', name: 'ביגוד', isPrivate: true },
  { category: 'קניות', name: 'אלקטרוניקה', isPrivate: true },
  { category: 'קניות', name: 'ריהוט', isPrivate: true },
  { category: 'קניות', name: 'מתנות', isPrivate: true },
  { category: 'קניות', name: 'כללי', isPrivate: true },
  { category: 'ילדים ומשפחה', name: 'גן', isPrivate: true },
  { category: 'ילדים ומשפחה', name: 'בית ספר', isPrivate: true },
  { category: 'ילדים ומשפחה', name: 'חוגים', isPrivate: true },
  { category: 'ילדים ומשפחה', name: 'בייביסיטר', isPrivate: true },
  { category: 'בריאות וביטוחים', name: 'רופא', isPrivate: true },
  { category: 'בריאות וביטוחים', name: 'תרופות', isPrivate: true },
  { category: 'בריאות וביטוחים', name: 'בדיקות', isPrivate: true },
  { category: 'בריאות וביטוחים', name: 'ביטוח בריאות', isPrivate: true },
  { category: 'פנאי וחופשות', name: 'מסעדות', isPrivate: true },
  { category: 'פנאי וחופשות', name: 'נופש', isPrivate: true },
  { category: 'פנאי וחופשות', name: 'ספורט', isPrivate: true },
  { category: 'פנאי וחופשות', name: 'בילויים', isPrivate: true },
  { category: 'עסק', name: 'הוצאות משרד', accountCode: '60100' },
  { category: 'עסק', name: 'תוכנות', accountCode: '60410' },
  { category: 'עסק', name: 'שיווק ופרסום', accountCode: '60500' },
  { category: 'עסק', name: 'הנהלת חשבונות', accountCode: '60700' },
  { category: 'עסק', name: 'רואה חשבון', accountCode: '60700' },
  { category: 'עסק', name: 'ספקים', accountCode: '60000' },
  { category: 'עסק', name: 'ייעוץ והשתלמויות', accountCode: '60610' },
  { category: 'עסק', name: 'ספרות מקצועית', accountCode: '60900' },
  { category: 'עסק', name: 'כיבוד', accountCode: '61000' },
  { category: 'עסק', name: 'מקדמות ביטוח לאומי', accountCode: '90300' },
  { category: 'עסק', name: 'מקדמות מס הכנסה', accountCode: '90100' },
  { category: 'עסק', name: 'גביית מע"מ', accountCode: '90200' },
  { category: 'עסק', name: 'עמלות ודמי כרטיס', accountCode: '61100' },
  { category: 'עסק', name: 'הוצאות שכר', accountCode: '60810' },
  { category: 'בנק, אשראי ותנועות', name: 'ריבית', accountCode: '61210' },
  { category: 'בנק, אשראי ותנועות', name: 'עמלות ודמי כרטיס', accountCode: '61100' },
  { category: 'בנק, אשראי ותנועות', name: 'חיוב אשראי חודשי', accountCode: '90500' },
  { category: 'בנק, אשראי ותנועות', name: 'משיכת מזומן', accountCode: '90500' },
  { category: 'בנק, אשראי ותנועות', name: 'פרעון הלוואה', accountCode: '90600' },
  { category: 'בנק, אשראי ותנועות', name: 'בין חשבונותי', accountCode: '90500' },
  { category: 'בנק, אשראי ותנועות', name: 'ביט', accountCode: '90500' },
  { category: 'בנק, אשראי ותנועות', name: 'פייבוקס', accountCode: '90500' },
  { category: 'הכנסות', name: 'הכנסה עסקית', accountCode: '40000' },
  { category: 'הכנסות', name: 'משכורת', accountCode: '40000' },
  { category: 'הכנסות', name: 'זיכוי כרטיס אשראי', accountCode: '40000' },
  { category: 'הכנסות', name: 'מילואים', accountCode: '40000' },
  { category: 'הכנסות', name: 'דמי לידה', accountCode: '40000' },
  { category: 'הכנסות', name: 'אפליקציית תשלום', accountCode: '40000' },
  { category: 'דיור והוצאות הבית', name: 'פלאפון', accountCode: '60330' },
  { category: 'שונות', name: 'שונות', accountCode: '60000' },
  { category: 'ילדים ומשפחה', name: 'מעון', isPrivate: true },
  { category: 'בריאות וביטוחים', name: 'קופת חולים', isPrivate: true },
  { category: 'החזרי מס ודוח שנתי', name: 'תרומות מוכרות', reportScope: ExpenseReportScope.ANNUAL },
  { category: 'החזרי מס ודוח שנתי', name: 'ביטוח חיים', reportScope: ExpenseReportScope.ANNUAL },
  { category: 'החזרי מס ודוח שנתי', name: 'ביטוח אובדן כושר עבודה', reportScope: ExpenseReportScope.ANNUAL },
  { category: 'פנאי וחופשות', name: 'ספרות וקריאה', isPrivate: true },
  { category: 'פנאי וחופשות', name: 'שירותי סטרימינג', isPrivate: true },
  { category: 'הכנסות', name: 'קצבת ילדים', accountCode: '40000' },
  { category: 'עסק', name: 'שכירות משרד', accountCode: '60170' },
  { category: 'עסק', name: 'שליחויות', accountCode: '60180' },
  { category: 'עסק', name: 'ייעוץ מקצועי', accountCode: '60620' },
  { category: 'החזרי מס ודוח שנתי', name: 'הפקדה לקרן השתלמות', reportScope: ExpenseReportScope.ANNUAL },
  { category: 'החזרי מס ודוח שנתי', name: 'הפקדה לפנסיה', reportScope: ExpenseReportScope.ANNUAL },
];
