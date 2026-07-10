import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BookingAccount } from './account.entity';
import { DEFAULT_ACCOUNTS } from './account.seed';

/**
 * Ensures the canonical chart of accounts (DEFAULT_ACCOUNTS) exists on every
 * app bootstrap. Replaces the previous manual SQL step.
 *
 * Provided ONLY by BookkeepingModule (not re-provided elsewhere), so it is a
 * single instance and onModuleInit runs exactly once per process — even though
 * other modules import BookkeepingModule.
 */
@Injectable()
export class AccountSeedService implements OnModuleInit {
  private readonly logger = new Logger(AccountSeedService.name);

  constructor(
    @InjectRepository(BookingAccount)
    private readonly accountRepo: Repository<BookingAccount>,
  ) {}

  /**
   * Maps a sub-category's pnlCategory (P&L presentation grouping) to its
   * bookkeeping account code — updated for the Phase-1 renumbered chart.
   * Sub-categories with an unmapped/NULL pnlCategory fall back to '5000'
   * (default_sub_category only — see seedSubCategoryAccountCodes).
   *
   * Legacy aliases (marked "legacy alias") handle pnlCategory strings that
   * still exist in older data/EXPENSE_SUBCATEGORY_PNL after the renaming; they
   * route to the same account as their modern equivalents so nothing breaks on
   * existing rows while an in-place migration of pnlCategory values is deferred.
   */
  private static readonly PNL_CATEGORY_TO_ACCOUNT: Record<string, string> = {
    'הוצאות משרד':              '5100',
    'רכב ותחבורה':              '5200',
    'תקשורת':                   '5300',
    'תקשורת ותוכנות':           '5300', // legacy alias — still used in EXPENSE_SUBCATEGORY_PNL
    'תוכנות':                   '5400', // now separate from תקשורת
    'תוכנות ושירותי ענן':       '5400',
    'שיווק ופרסום':              '5500',
    'ייעוץ ושירותים מקצועיים':  '5600',
    'ייעוץ מקצועי':              '5600', // legacy alias
    'הנהלת חשבונות':             '5700',
    'הוצאות חשבונאות':           '5700', // legacy alias
    'שכר':                       '5800',
    'ספרות מקצועית':             '5900',
    'כיבוד':                     '6000',
    'עמלות ודמי כרטיס':         '6100',
    'עמלות ומימון':              '6100', // legacy alias
    'הוצאות מימון':              '6200',
    'פחת':                       '6300',
    // 'ספקים' intentionally removed — pnlCategory no longer has a direct account;
    // the explicit Step-3 override in seedSubCategoryAccountCodes() routes any
    // lingering rows to '5000'. DB query confirmed 0 such rows in dev as of Step 2.
  };
  private static readonly EXPENSE_FALLBACK_ACCOUNT = '5000';

  /**
   * Phase 3 — sub-category NAME keyword overrides. Most specific signal in the
   * cascade (see seedSubCategoryAccountCodes): applied after category defaults
   * so a textual match always wins over a broad category-level guess. Order
   * matters only for keywords that could theoretically appear in more than one
   * group — later groups in this list win when applied (see execution order).
   */
  private static readonly SUBCATEGORY_KEYWORD_RULES: ReadonlyArray<{
    code: string;
    keywords: string[];
  }> = [
    { code: '5300', keywords: ['טלפון', 'פלאפון', 'סלולר', 'אינטרנט', 'תקשורת'] },
    { code: '5400', keywords: ['תוכנה', 'תוכנות', 'ענן', 'SaaS', 'Google Workspace', 'Microsoft', 'ChatGPT', 'Claude', 'Canva', 'Adobe', 'Firebase', 'AWS', 'Cloud'] },
    { code: '5500', keywords: ['פרסום', 'שיווק', 'פייסבוק', 'גוגל', 'קמפיין', 'מודעה'] },
    { code: '5600', keywords: ['ייעוץ', 'יועץ', 'עורך דין', 'עו"ד', 'משפטי'] },
    { code: '5700', keywords: ['רואה חשבון', 'רו"ח', 'הנהלת חשבונות'] },
    { code: '5800', keywords: ['שכר', 'משכורת', 'עובד', 'עובדים'] },
    { code: '5900', keywords: ['ספרות', 'השתלמות', 'קורס', 'לימוד', 'מקצועית'] },
    { code: '6000', keywords: ['כיבוד', 'קפה', 'מסעדה', 'אירוח'] },
    { code: '6100', keywords: ['עמלה', 'עמלות', 'סליקה', 'אשראי', 'כרטיס'] },
    { code: '6200', keywords: ['ריבית', 'מימון', 'הלוואה'] },
    { code: '6300', keywords: ['פחת'] },
  ];

  /**
   * Category-level accountCode defaults for default_category — Phase 2 of the
   * bookkeeping redesign (maps categories onto the Phase 1 chart in
   * account.seed.ts). The resolver (ExpensesService.resolveAccountCode)
   * consults the category only after a sub-category yields no accountCode, so
   * these are coarse fallbacks; sub-categories override them (Phase 3). `null`
   * marks a category too broad / private to map at the category level — those
   * rows keep accountCode NULL and the resolver falls back to '5000'.
   * Applied idempotently on every boot.
   *
   * NOTE: category names must match `default_category.categoryName` exactly —
   * verified against real usages elsewhere in this file (EXPENSE_SUBCATEGORY_PNL)
   * and demo-data/profiles/ledger-test.profile.ts, not just assumed.
   */
  private static readonly CATEGORY_ACCOUNT_DEFAULTS: Record<string, string | null> = {
    'רכב ותחבורה':              '5200',
    'בנק, אשראי ותנועות':      '6100', // legacy alias seen in prod
    'עסק':                      null,   // too broad — sub-category level only
    'שונות':                    '5000',
    'רכוש קבוע (פחת)':         '6300',
    'אוכל וצריכה שוטפת':       null,   // not a business expense
    'קניות':                    null,
    'ילדים ומשפחה':             null,
    'בריאות וביטוחים':          null,
    'פנאי וחופשות':             null,
    'העברות ותנועות בחשבון':    null,   // internal transfers — not a P&L item
    'הכנסות':                   null,   // income handled by step 7 in sub-category cascade
    'העברות':                   null,
    'דיור והוצאות הבית':        '5100', // canonical home-expenses category — 'בית' was removed
    'החזרי מס ודוח שנתי':       null,   // never P&L
  };

  /**
   * Canonical (category, subCategory) → pnlCategory assignments for the expense
   * sub-categories used by reporting. Boot ensures each pair exists in
   * default_sub_category (creating it if missing) and sets its pnlCategory; the
   * subsequent accountCode mapping (PNL_CATEGORY_TO_ACCOUNT) then routes it to
   * the right account. NOTE: this writes to the GLOBAL catalog (all businesses).
   */
  private static readonly EXPENSE_SUBCATEGORY_PNL: ReadonlyArray<{
    category: string;
    subCategory: string;
    pnlCategory: string;
  }> = [
    // 5100 — הוצאות משרד
    { category: 'דיור והוצאות הבית', subCategory: 'ארנונה',  pnlCategory: 'הוצאות משרד' },
    { category: 'דיור והוצאות הבית', subCategory: 'חשמל',    pnlCategory: 'הוצאות משרד' },
    { category: 'דיור והוצאות הבית', subCategory: 'ועד בית', pnlCategory: 'הוצאות משרד' },
    { category: 'דיור והוצאות הבית', subCategory: 'תחזוקה',  pnlCategory: 'הוצאות משרד' },
    { category: 'דיור והוצאות הבית', subCategory: 'גז',      pnlCategory: 'הוצאות משרד' },
    { category: 'דיור והוצאות הבית', subCategory: 'מים',     pnlCategory: 'הוצאות משרד' },
    { category: 'דיור והוצאות הבית', subCategory: 'שכירות',  pnlCategory: 'הוצאות משרד' },
    { category: 'עסק', subCategory: 'שכירות משרד', pnlCategory: 'הוצאות משרד' },
    { category: 'עסק', subCategory: 'הוצאות משרד', pnlCategory: 'הוצאות משרד' },
    { category: 'עסק', subCategory: 'שליחויות',    pnlCategory: 'הוצאות משרד' },
    // 5200 — רכב ותחבורה
    { category: 'רכב ותחבורה', subCategory: 'דלק',             pnlCategory: 'רכב ותחבורה' },
    { category: 'רכב ותחבורה', subCategory: 'חניה',            pnlCategory: 'רכב ותחבורה' },
    { category: 'רכב ותחבורה', subCategory: 'ביטוח רכב',       pnlCategory: 'רכב ותחבורה' },
    { category: 'רכב ותחבורה', subCategory: 'תחבורה ציבורית',  pnlCategory: 'רכב ותחבורה' },
    { category: 'רכב ותחבורה', subCategory: 'כבישי אגרה',      pnlCategory: 'רכב ותחבורה' },
    { category: 'רכב ותחבורה', subCategory: 'טיפולים',         pnlCategory: 'רכב ותחבורה' },
    { category: 'רכב ותחבורה', subCategory: 'מערכות',          pnlCategory: 'רכב ותחבורה' },
    // 5300 — תקשורת
    { category: 'דיור והוצאות הבית', subCategory: 'פלאפון',     pnlCategory: 'תקשורת' },
    { category: 'דיור והוצאות הבית', subCategory: 'אינטרנט',    pnlCategory: 'תקשורת' },
    { category: 'דיור והוצאות הבית', subCategory: 'טלפון קווי', pnlCategory: 'תקשורת' },
    { category: 'עסק', subCategory: 'תוכנות',     pnlCategory: 'תקשורת ותוכנות' }, // keyword step overrides to 5400
    // 5400 — שיווק ופרסום
    { category: 'עסק', subCategory: 'שיווק ופרסום', pnlCategory: 'שיווק ופרסום' },
    // 5500 — ייעוץ ושירותים מקצועיים
    { category: 'עסק', subCategory: 'ייעוץ והשתלמויות', pnlCategory: 'ייעוץ ושירותים מקצועיים' },
    { category: 'עסק', subCategory: 'ייעוץ מקצועי',     pnlCategory: 'ייעוץ ושירותים מקצועיים' },
    // 5600 — הנהלת חשבונות ('רואה חשבון' removed — duplicate of 'הנהלת חשבונות')
    { category: 'עסק', subCategory: 'הנהלת חשבונות', pnlCategory: 'הנהלת חשבונות' },
    // 5800 — שכר
    { category: 'עסק', subCategory: 'שכר', pnlCategory: 'שכר' },
    // 5900 — ספרות מקצועית
    { category: 'עסק', subCategory: 'ספרות מקצועית', pnlCategory: 'ספרות מקצועית' },
    // 6000 — כיבוד
    { category: 'עסק', subCategory: 'כיבוד', pnlCategory: 'כיבוד' },
    // 6100 — עמלות ודמי כרטיס
    { category: 'עסק', subCategory: 'עמלות ודמי כרטיס',                pnlCategory: 'עמלות ודמי כרטיס' },
    { category: 'בנק, אשראי ותנועות', subCategory: 'עמלות ודמי כרטיס', pnlCategory: 'עמלות ודמי כרטיס' },
    // 6200 — הוצאות מימון (keyword 'ריבית' also routes accountCode to 6200)
    // 'בנקים וכרטיסי אשראי' removed — duplicate category of 'בנק, אשראי ותנועות'
    { category: 'בנק, אשראי ותנועות', subCategory: 'ריבית', pnlCategory: 'הוצאות מימון' },
    // 6300 — פחת (fixed-asset depreciation; taxPercent=0 — recognized gradually
    // via reductionPercent, not as an immediate expense — see SUBCATEGORY_TAX_VAT_DEFAULTS)
    { category: 'רכוש קבוע (פחת)', subCategory: 'רכב',    pnlCategory: 'פחת' },
    { category: 'רכוש קבוע (פחת)', subCategory: 'מחשב',   pnlCategory: 'פחת' },
    { category: 'רכוש קבוע (פחת)', subCategory: 'ריהוט',  pnlCategory: 'פחת' },
  ];

  /**
   * Sub-categories whose taxPercent and/or vatPercent deductibility differ from
   * the defaults (100/100). Consulted ONLY at row-creation time, inside
   * seedExpenseSubCategoryMappings' INSERT branch — never re-applied to a row
   * that already exists. This is deliberate: default_sub_category is editable
   * via the admin panel (expenses.controller.ts update/add/delete-default-sub-
   * category), so once a row exists its taxPercent/vatPercent are the admin's
   * to own — boot-time code must never silently revert them.
   *
   * 'משכנתא' and 'גינה' were deliberately removed (not tracked, not relevant).
   *
   * `reductionPercent`/`isEquipment` are optional — only fixed-asset
   * (depreciation) sub-categories set them; everything else defaults to 0/false
   * in seedExpenseSubCategoryMappings' INSERT.
   */
  private static readonly SUBCATEGORY_TAX_VAT_DEFAULTS: ReadonlyArray<{
    category: string;
    subCategory: string;
    taxPercent: number;
    vatPercent: number;
    reductionPercent?: number;
    isEquipment?: boolean;
  }> = [
    // דיור / הוצאות משרד — לא ניתנות לניכוי מע"מ, 25% מוכר למס הכנסה (חלק עסקי מהבית)
    { category: 'דיור והוצאות הבית', subCategory: 'ארנונה',  taxPercent: 25, vatPercent: 0  },
    { category: 'דיור והוצאות הבית', subCategory: 'מים',     taxPercent: 25, vatPercent: 0  },
    { category: 'דיור והוצאות הבית', subCategory: 'ועד בית', taxPercent: 25, vatPercent: 0  },
    { category: 'דיור והוצאות הבית', subCategory: 'שכירות',  taxPercent: 25, vatPercent: 0  },
    // חשמל/גז/תחזוקה — 25% מוכר בשניהם (גם מע"מ, בניגוד לשאר קבוצת הדיור)
    { category: 'דיור והוצאות הבית', subCategory: 'חשמל',    taxPercent: 25, vatPercent: 25 },
    { category: 'דיור והוצאות הבית', subCategory: 'גז',      taxPercent: 25, vatPercent: 25 },
    { category: 'דיור והוצאות הבית', subCategory: 'תחזוקה',  taxPercent: 25, vatPercent: 25 },
    // תקשורת (טלפון/אינטרנט/פלאפון) — 25% בשניהם
    { category: 'דיור והוצאות הבית', subCategory: 'אינטרנט',    taxPercent: 25, vatPercent: 25 },
    { category: 'דיור והוצאות הבית', subCategory: 'טלפון קווי', taxPercent: 25, vatPercent: 25 },
    { category: 'דיור והוצאות הבית', subCategory: 'פלאפון',     taxPercent: 25, vatPercent: 25 },
    // רכב — 45% מס הכנסה, 66.66% מע"מ (כלל 2/3 לרכב פרטי), חוץ מביטוח (מע"מ 0)
    { category: 'רכב ותחבורה', subCategory: 'דלק',            taxPercent: 45, vatPercent: 66.66 },
    { category: 'רכב ותחבורה', subCategory: 'חניה',            taxPercent: 45, vatPercent: 66.66 },
    { category: 'רכב ותחבורה', subCategory: 'טיפולים',         taxPercent: 45, vatPercent: 66.66 },
    { category: 'רכב ותחבורה', subCategory: 'כבישי אגרה',      taxPercent: 45, vatPercent: 66.66 },
    { category: 'רכב ותחבורה', subCategory: 'תחבורה ציבורית',  taxPercent: 45, vatPercent: 66.66 },
    { category: 'רכב ותחבורה', subCategory: 'מערכות',          taxPercent: 45, vatPercent: 66.66 },
    { category: 'רכב ותחבורה', subCategory: 'ביטוח רכב',      taxPercent: 45, vatPercent: 0     },
    // כיבוד — ללא ניכוי מע"מ (נשאר כמו קודם)
    { category: 'עסק', subCategory: 'כיבוד', taxPercent: 100, vatPercent: 0 },
    // בנק, אשראי ותנועות — 25% מוכר למס הכנסה, ללא ניכוי מע"מ
    { category: 'בנק, אשראי ותנועות', subCategory: 'ריבית',               taxPercent: 25, vatPercent: 0 },
    { category: 'בנק, אשראי ותנועות', subCategory: 'עמלות ודמי כרטיס',    taxPercent: 25, vatPercent: 0 },
    // רכוש קבוע (פחת) — לא מוכר כהוצאה מיידית (taxPercent=0), מופחת בהדרגה
    // דרך reductionPercent. vatPercent שונה לפי הפריט: מחשב/ריהוט 100%, רכב 0%
    // (כלל רכב פרטי, עקבי עם שאר הוצאות הרכב).
    { category: 'רכוש קבוע (פחת)', subCategory: 'רכב',   taxPercent: 0, vatPercent: 0,   reductionPercent: 15,    isEquipment: true },
    { category: 'רכוש קבוע (פחת)', subCategory: 'מחשב',  taxPercent: 0, vatPercent: 100, reductionPercent: 33.33, isEquipment: true },
    { category: 'רכוש קבוע (פחת)', subCategory: 'ריהוט', taxPercent: 0, vatPercent: 100, reductionPercent: 7,     isEquipment: true },
  ];

  /**
   * Per-(category, subCategory) sub-ledger account code, nested under the
   * parent bookkeeping account (e.g. 5100 הוצאות משרד → 5101 ארנונה, 5102 גז...).
   * Consulted by seedSubAccountCodes() (fills default_sub_category.subAccountCode)
   * and by ExpensesService when posting a journal entry's subCounterAccountCode.
   * Numbering is alphabetical-within-group and arbitrary but must stay unique.
   */
  private static readonly SUBCATEGORY_SUB_ACCOUNT_CODES: ReadonlyArray<{
    category: string;
    subCategory: string;
    subAccountCode: string;
  }> = [
    // 5100 — הוצאות משרד
    { category: 'דיור והוצאות הבית', subCategory: 'ארנונה',        subAccountCode: '5101' },
    { category: 'דיור והוצאות הבית', subCategory: 'גז',            subAccountCode: '5102' },
    { category: 'עסק',               subCategory: 'הוצאות משרד',   subAccountCode: '5103' },
    { category: 'דיור והוצאות הבית', subCategory: 'ועד בית',       subAccountCode: '5104' },
    { category: 'דיור והוצאות הבית', subCategory: 'חשמל',          subAccountCode: '5105' },
    { category: 'דיור והוצאות הבית', subCategory: 'מים',           subAccountCode: '5106' },
    { category: 'דיור והוצאות הבית', subCategory: 'שכירות',        subAccountCode: '5107' },
    { category: 'עסק',               subCategory: 'שכירות משרד',   subAccountCode: '5108' },
    { category: 'עסק',               subCategory: 'שליחויות',      subAccountCode: '5109' },
    { category: 'דיור והוצאות הבית', subCategory: 'תחזוקה',        subAccountCode: '5110' },
    // 5200 — רכב ותחבורה
    { category: 'רכב ותחבורה', subCategory: 'ביטוח רכב',       subAccountCode: '5201' },
    { category: 'רכב ותחבורה', subCategory: 'דלק',              subAccountCode: '5202' },
    { category: 'רכב ותחבורה', subCategory: 'חניה',              subAccountCode: '5203' },
    { category: 'רכב ותחבורה', subCategory: 'טיפולים',           subAccountCode: '5204' },
    { category: 'רכב ותחבורה', subCategory: 'כבישי אגרה',        subAccountCode: '5205' },
    { category: 'רכב ותחבורה', subCategory: 'מערכות',            subAccountCode: '5206' },
    { category: 'רכב ותחבורה', subCategory: 'תחבורה ציבורית',    subAccountCode: '5207' },
    // 5300 — תקשורת
    { category: 'דיור והוצאות הבית', subCategory: 'אינטרנט',     subAccountCode: '5301' },
    { category: 'דיור והוצאות הבית', subCategory: 'טלפון קווי',  subAccountCode: '5302' },
    { category: 'דיור והוצאות הבית', subCategory: 'פלאפון',      subAccountCode: '5303' },
    // 5400 — תוכנות ושירותי ענן
    { category: 'עסק', subCategory: 'תוכנות', subAccountCode: '5401' },
    // 5500 — שיווק ופרסום
    { category: 'עסק', subCategory: 'שיווק ופרסום', subAccountCode: '5501' },
    // 5600 — ייעוץ ושירותים מקצועיים
    { category: 'עסק', subCategory: 'ייעוץ והשתלמויות', subAccountCode: '5601' },
    { category: 'עסק', subCategory: 'ייעוץ מקצועי',     subAccountCode: '5602' },
    // 5700 — הנהלת חשבונות (אחרי מחיקת "רואה חשבון")
    { category: 'עסק', subCategory: 'הנהלת חשבונות', subAccountCode: '5701' },
    // 5800 — שכר
    { category: 'עסק', subCategory: 'שכר', subAccountCode: '5801' },
    // 5900 — ספרות מקצועית
    { category: 'עסק', subCategory: 'ספרות מקצועית', subAccountCode: '5901' },
    // 6000 — כיבוד
    { category: 'עסק', subCategory: 'כיבוד', subAccountCode: '6001' },
    // 6100 — עמלות ודמי כרטיס (שני מקורות שונים, אותו חשבון-אב)
    { category: 'עסק',                 subCategory: 'עמלות ודמי כרטיס', subAccountCode: '6101' },
    { category: 'בנק, אשראי ותנועות', subCategory: 'עמלות ודמי כרטיס', subAccountCode: '6102' },
    // 6200 — הוצאות מימון (אחרי מחיקת "בנקים וכרטיסי אשראי")
    { category: 'בנק, אשראי ותנועות', subCategory: 'ריבית', subAccountCode: '6201' },
    // 6300 — פחת
    { category: 'רכוש קבוע (פחת)', subCategory: 'מחשב',  subAccountCode: '6301' },
    { category: 'רכוש קבוע (פחת)', subCategory: 'ריהוט', subAccountCode: '6302' },
    { category: 'רכוש קבוע (פחת)', subCategory: 'רכב',   subAccountCode: '6303' },
  ];

  async onModuleInit(): Promise<void> {
    // Escape hatch for one-off scripts/reports run against a database that
    // must stay byte-for-byte identical to its source (e.g. keepintax_prodcopy,
    // the categories-redesign baseline-report fixtures) — this seeder writes
    // unconditionally on every boot otherwise. Deleted along with this whole
    // service in Phase 2.6.
    if (process.env.SKIP_BOOT_SEED === 'true') {
      this.logger.log('SKIP_BOOT_SEED=true — AccountSeedService.onModuleInit is a no-op.');
      return;
    }
    try {
      // Idempotent upsert — TypeORM emits INSERT ... ON DUPLICATE KEY UPDATE on
      // MySQL, keyed on the unique `code` column. Safe to run on every boot;
      // refreshes name/type/pnlCategory/displayOrder for existing codes and
      // inserts any missing ones (every column in DEFAULT_ACCOUNTS is upserted).
      await this.accountRepo.upsert(DEFAULT_ACCOUNTS, ['code']);
      this.logger.log(
        `Chart of accounts ensured (${DEFAULT_ACCOUNTS.length} accounts upserted).`,
      );
    } catch (err: any) {
      // Never block bootstrap on a seed failure — log and continue. The journal
      // posting paths already degrade gracefully when an account is missing.
      this.logger.error(
        `Chart-of-accounts seed failed: ${err?.message ?? err}`,
      );
    }

    // Ensure the expense sub-categories exist — creates any MISSING (category,
    // subCategory) row (with its correct initial pnlCategory + vatPercent);
    // never touches a row that already exists (admin-panel edits are the row's
    // owner from that point on). Own try so a failure here doesn't block the
    // accountCode mapping below.
    try {
      await this.seedExpenseSubCategoryMappings();
    } catch (err: any) {
      this.logger.error(
        `Expense sub-category mapping seed failed: ${err?.message ?? err}`,
      );
    }

    // Separate try so a sub-category mapping failure can't undo the account
    // upsert above (and vice-versa).
    try {
      await this.seedSubCategoryAccountCodes();
      await this.logSubCategoryAccountCodeValidation();
    } catch (err: any) {
      this.logger.error(
        `Sub-category accountCode seed failed: ${err?.message ?? err}`,
      );
    }

    // Category-level accountCode defaults (resolver fallback below the
    // sub-category level). Own try so it can't undo the steps above.
    try {
      await this.seedCategoryAccountCodes();
    } catch (err: any) {
      this.logger.error(
        `Category accountCode seed failed: ${err?.message ?? err}`,
      );
    }

    // Sub-ledger (subAccountCode) numbering — own try so a failure here can't
    // undo any of the steps above.
    try {
      await this.seedSubAccountCodes();
    } catch (err: any) {
      this.logger.error(
        `Sub-account code seed failed: ${err?.message ?? err}`,
      );
    }
  }

  /**
   * Set `accountCode` on default_category rows from CATEGORY_ACCOUNT_DEFAULTS.
   * Idempotent — runs the same UPDATE per category on every boot. Entries
   * mapped to `null` explicitly clear the column (category too broad to map);
   * categories not listed are left untouched. user_category overrides are
   * user-owned and never written here.
   */
  private async seedCategoryAccountCodes(): Promise<void> {
    const em = this.accountRepo.manager;
    // GUARD INVARIANT: only fills a category's accountCode when it's currently
    // NULL — never overwrites an existing value (whether set by a prior boot or
    // an admin edit). `null`-mapped entries have nothing to "fill", so they're
    // skipped entirely rather than force-clearing an already-set value.
    const entries = Object.entries(AccountSeedService.CATEGORY_ACCOUNT_DEFAULTS).filter(
      ([, code]) => code !== null,
    );
    for (const [categoryName, code] of entries) {
      await em.query(
        'UPDATE default_category SET accountCode = ? WHERE categoryName = ? AND accountCode IS NULL',
        [code, categoryName],
      );
    }
    const mappingLines = entries
      .map(([categoryName, code]) => `  ${categoryName} -> ${code}`)
      .join('\n');
    this.logger.log(
      `Category accountCode defaults applied to previously-NULL rows (${entries.length} categories checked):\n${mappingLines}`,
    );
  }

  /**
   * Set `subAccountCode` on default_sub_category rows from
   * SUBCATEGORY_SUB_ACCOUNT_CODES. Idempotent, GUARD INVARIANT: only fills a
   * row's subAccountCode when it's currently NULL — never overwrites an
   * existing value (prior boot or admin edit).
   */
  private async seedSubAccountCodes(): Promise<void> {
    const em = this.accountRepo.manager;
    let updated = 0;
    for (const { category, subCategory, subAccountCode } of AccountSeedService.SUBCATEGORY_SUB_ACCOUNT_CODES) {
      const result = await em.query(
        `UPDATE default_sub_category SET subAccountCode = ?
         WHERE categoryName = ? AND subCategoryName = ? AND subAccountCode IS NULL`,
        [subAccountCode, category, subCategory],
      );
      const affected = result?.affectedRows ?? 0;
      updated += affected;
    }
    this.logger.log(
      `Sub-account codes applied to ${updated} previously-NULL row(s) out of ${AccountSeedService.SUBCATEGORY_SUB_ACCOUNT_CODES.length} mapped pairs.`,
    );
  }

  /**
   * Ensure each (category, subCategory) in EXPENSE_SUBCATEGORY_PNL exists in the
   * GLOBAL default_sub_category catalog. GUARD INVARIANT: only ever INSERTs a
   * row that doesn't exist yet — a row that already exists (whatever its
   * current pnlCategory/vatPercent/etc.) is never touched, because
   * default_sub_category is admin-editable (expenses.controller.ts's
   * update/add/delete-default-sub-category endpoints) and boot-time code must
   * never silently revert an admin's edit. On creation, taxPercent/vatPercent
   * are looked up from SUBCATEGORY_TAX_VAT_DEFAULTS (falling back to 100/100)
   * so a brand-new row starts with the correct values instead of always-100.
   * Runs BEFORE seedSubCategoryAccountCodes so the accountCode mapping sees the
   * freshly-created rows' pnlCategory.
   */
  private async seedExpenseSubCategoryMappings(): Promise<void> {
    const em = this.accountRepo.manager;
    let created = 0;
    for (const { category, subCategory, pnlCategory } of AccountSeedService.EXPENSE_SUBCATEGORY_PNL) {
      const existing: Array<{ id: number }> = await em.query(
        'SELECT id FROM default_sub_category WHERE categoryName = ? AND subCategoryName = ? LIMIT 1',
        [category, subCategory],
      );
      if (existing.length) continue; // row already exists — admin owns it, never overwrite

      const defaults = AccountSeedService.SUBCATEGORY_TAX_VAT_DEFAULTS.find(
        (v) => v.category === category && v.subCategory === subCategory,
      );
      const taxPercent = defaults?.taxPercent ?? 100;
      const vatPercent = defaults?.vatPercent ?? 100;
      const reductionPercent = defaults?.reductionPercent ?? 0;
      const isEquipment = defaults?.isEquipment ?? false;

      // necessity + reportScope rely on their DB column defaults; accountCode
      // is set right after by seedSubCategoryAccountCodes.
      await em.query(
        `INSERT INTO default_sub_category
           (subCategoryName, categoryName, taxPercent, vatPercent, reductionPercent,
            isEquipment, isRecognized, isExpense, pnlCategory)
         VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?)`,
        [subCategory, category, taxPercent, vatPercent, reductionPercent, isEquipment ? 1 : 0, pnlCategory],
      );
      created++;
    }
    this.logger.log(
      `Expense sub-category mappings ensured (${created} new row(s) created out of ${AccountSeedService.EXPENSE_SUBCATEGORY_PNL.length} pairs; existing rows left untouched).`,
    );
  }

  /**
   * Set `accountCode` on default_sub_category rows — Phase 3 of the bookkeeping
   * redesign. "Subcategory accountCode overrides category accountCode; use the
   * most specific mapping possible" — implemented as a sequence of idempotent
   * UPDATEs run from LEAST to MOST specific, so each later step overwrites the
   * previous one's result on any row it also matches. Final precedence
   * (highest wins, last in the list):
   *
   *   1. Recognized-expense baseline  → '5000' (isRecognized && isExpense rows only;
   *      "private/non-business categories may stay NULL" — rows that are NOT a
   *      recognized business expense are simply never touched here, so they stay
   *      whatever they already are, i.e. NULL on a fresh seed)
   *   2. Legacy pnlCategory  → PNL_CATEGORY_TO_ACCOUNT (pre-Phase-1 mapping)
   *   3. Legacy 'ספקים' override → '5000' (account 5800 was renamed "שכר" in
   *      Phase 1 — '5800' is no longer a valid target for this pnlCategory)
   *   4. Category-level defaults → reuses CATEGORY_ACCOUNT_DEFAULTS (Phase 2),
   *      including its `null` entries, so private/broad categories are
   *      explicitly cleared at the sub-category level too
   *   5. Sub-category NAME keyword overrides (SUBCATEGORY_KEYWORD_RULES)
   *   6. Equipment            → '6300' (isEquipment rows; no fixed-assets chart
   *      yet, blanket-routed to depreciation "for now" per Phase 3 scope)
   *   7. Income                → '4000' for categoryName 'הכנסות', then '4010'
   *      for the more specific subCategoryName 'הכנסות פטורות' (run last so it
   *      wins over the general income-category default)
   *
   * user_sub_category is left on its pre-existing (pnlCategory-only) mapping —
   * out of Phase 3 scope, untouched.
   *
   * GUARD INVARIANT: a row's accountCode is assigned by this cascade ONCE —
   * the very first time it's seen with accountCode IS NULL. The set of
   * eligible ids is snapshotted BEFORE step 1 runs, and every step's UPDATE is
   * scoped to `id IN (<snapshot>)`, so the 7-step precedence logic still runs
   * to completion for those rows (a later step can still override an earlier
   * step's result WITHIN this one pass), but a row that already has an
   * accountCode — from a previous boot, OR because an admin edited it via the
   * generic update-default-sub-category endpoint — is never touched again.
   */
  private async seedSubCategoryAccountCodes(): Promise<void> {
    const em = this.accountRepo.manager;
    const fallback = AccountSeedService.EXPENSE_FALLBACK_ACCOUNT;
    const legacyMap = AccountSeedService.PNL_CATEGORY_TO_ACCOUNT;

    const nullRows: Array<{ id: number }> = await em.query(
      `SELECT id FROM default_sub_category WHERE accountCode IS NULL`,
    );
    const ids = nullRows.map((r) => r.id);
    if (ids.length === 0) {
      this.logger.log('Sub-category accountCode mapping: no NULL rows to assign — skipped.');
    } else {
      // 1. Baseline for recognized, deductible business expenses — "if unsure,
      //    map to 5000". Rows that aren't a recognized expense are left alone.
      await em.query(
        `UPDATE default_sub_category SET accountCode = ? WHERE isRecognized = 1 AND isExpense = 1 AND id IN (?)`,
        [fallback, ids],
      );

      // 2. Legacy pnlCategory → account, pre-Phase-1 mapping.
      for (const [pnlCategory, code] of Object.entries(legacyMap)) {
        await em.query(
          `UPDATE default_sub_category SET accountCode = ? WHERE pnlCategory = ? AND id IN (?)`,
          [code, pnlCategory, ids],
        );
      }

      // 3. 'ספקים' was account 5800's OLD name pre-Phase-1; 5800 now means "שכר".
      //    Any row still tagged with this stale pnlCategory falls back to 5000.
      await em.query(
        `UPDATE default_sub_category SET accountCode = ? WHERE pnlCategory = ? AND id IN (?)`,
        [fallback, 'ספקים', ids],
      );

      // 4. Category-level defaults — applies non-null entries only.
      //    Null entries in CATEGORY_ACCOUNT_DEFAULTS mean "category too broad to
      //    map at the category level" (they serve seedCategoryAccountCodes which
      //    writes to default_category). Applying them here would wipe the more
      //    specific accountCodes already set by step 2 (e.g. 'עסק' sub-categories
      //    that have correct pnlCategory-derived codes like 5100 would be cleared
      //    to null and fall back to the 5000 resolver fallback).
      for (const [categoryName, code] of Object.entries(AccountSeedService.CATEGORY_ACCOUNT_DEFAULTS)) {
        if (code === null) continue;
        await em.query(
          `UPDATE default_sub_category SET accountCode = ? WHERE categoryName = ? AND id IN (?)`,
          [code, categoryName, ids],
        );
      }

      // 5. Sub-category NAME keyword overrides — most specific textual signal.
      for (const { code, keywords } of AccountSeedService.SUBCATEGORY_KEYWORD_RULES) {
        const likeClauses = keywords.map(() => 'subCategoryName LIKE ?').join(' OR ');
        await em.query(
          `UPDATE default_sub_category SET accountCode = ? WHERE (${likeClauses}) AND id IN (?)`,
          [code, ...keywords.map((k) => `%${k}%`), ids],
        );
      }

      // 6. Equipment — blanket-routed to depreciation; no fixed-assets chart yet.
      await em.query(
        `UPDATE default_sub_category SET accountCode = ? WHERE isEquipment = 1 AND id IN (?)`,
        ['6300', ids],
      );

      // 7. Income — most specific subcategory applied last so it wins over the
      //    general income-category default.
      await em.query(
        `UPDATE default_sub_category SET accountCode = ? WHERE categoryName = ? AND id IN (?)`,
        ['4000', 'הכנסות', ids],
      );
      await em.query(
        `UPDATE default_sub_category SET accountCode = ? WHERE subCategoryName = ? AND id IN (?)`,
        ['4010', 'הכנסות פטורות', ids],
      );

      this.logger.log(`Sub-category accountCode mapping applied to ${ids.length} previously-NULL row(s).`);
    }

    // user_sub_category: same guard — only rows whose accountCode is still
    // NULL AND whose pnlCategory matches the legacy map are touched.
    const legacyKeys = Object.keys(legacyMap);
    if (legacyKeys.length) {
      const whenSql = legacyKeys.map(() => 'WHEN ? THEN ?').join(' ');
      const caseParams: string[] = [];
      for (const k of legacyKeys) caseParams.push(k, legacyMap[k]);
      const inPlaceholders = legacyKeys.map(() => '?').join(', ');
      await em.query(
        `UPDATE user_sub_category
         SET accountCode = CASE pnlCategory ${whenSql} END
         WHERE pnlCategory IN (${inPlaceholders}) AND accountCode IS NULL`,
        [...caseParams, ...legacyKeys],
      );
    }
  }

  /**
   * Phase 3 rule 6 — post-seed validation/logging for default_sub_category.
   * Read-only: never writes. Runs after seedSubCategoryAccountCodes() on every
   * boot so the mapping stays observable without a manual DB query.
   */
  private async logSubCategoryAccountCodeValidation(): Promise<void> {
    const em = this.accountRepo.manager;
    const validCodes = new Set(DEFAULT_ACCOUNTS.map((a) => a.code));

    // Verify every non-null accountCode in use actually exists in the chart.
    const used: Array<{ accountCode: string }> = await em.query(
      `SELECT DISTINCT accountCode FROM default_sub_category WHERE accountCode IS NOT NULL`,
    );
    const unknown = used.map((r) => r.accountCode).filter((c) => !validCodes.has(c));
    if (unknown.length) {
      this.logger.error(
        `default_sub_category.accountCode references codes missing from DEFAULT_ACCOUNTS: ${unknown.join(', ')}`,
      );
    } else {
      this.logger.log(`All ${used.length} distinct default_sub_category.accountCode values exist in DEFAULT_ACCOUNTS.`);
    }

    // Sub-categories left NULL (private/non-business, or simply unmatched).
    const nullRows: Array<{ subCategoryName: string; categoryName: string }> = await em.query(
      `SELECT subCategoryName, categoryName FROM default_sub_category
       WHERE accountCode IS NULL ORDER BY categoryName, subCategoryName`,
    );
    this.logger.log(
      `Sub-categories with NULL accountCode (${nullRows.length}):\n` +
        nullRows.map((r) => `  ${r.categoryName} / ${r.subCategoryName}`).join('\n'),
    );

    // Recognized business-expense sub-categories that landed on the generic
    // 5000 fallback — i.e. nothing more specific matched them.
    const fallbackRows: Array<{ subCategoryName: string; categoryName: string }> = await em.query(
      `SELECT subCategoryName, categoryName FROM default_sub_category
       WHERE accountCode = ? AND isRecognized = 1 AND isExpense = 1
       ORDER BY categoryName, subCategoryName`,
      [AccountSeedService.EXPENSE_FALLBACK_ACCOUNT],
    );
    this.logger.log(
      `Recognized business-expense sub-categories on the 5000 fallback (${fallbackRows.length}):\n` +
        fallbackRows.map((r) => `  ${r.categoryName} / ${r.subCategoryName}`).join('\n'),
    );
  }
}
