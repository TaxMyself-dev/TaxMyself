import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DefaultBookingAccount } from './account.entity';
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
    @InjectRepository(DefaultBookingAccount)
    private readonly accountRepo: Repository<DefaultBookingAccount>,
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
    'בית':                      '5100',
    'רכב ותחבורה':              '5200',
    'בנקים וכרטיסי אשראי':     '6100',
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
    'דיור והוצאות הבית':        '5100', // legacy alias for בית
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
    // 5300 — תקשורת
    { category: 'דיור והוצאות הבית', subCategory: 'פלאפון',     pnlCategory: 'תקשורת' },
    { category: 'דיור והוצאות הבית', subCategory: 'אינטרנט',    pnlCategory: 'תקשורת' },
    { category: 'דיור והוצאות הבית', subCategory: 'טלפון קווי', pnlCategory: 'תקשורת' },
    { category: 'בית', subCategory: 'פלאפון',     pnlCategory: 'תקשורת' }, // modern category alias
    { category: 'בית', subCategory: 'אינטרנט',    pnlCategory: 'תקשורת' },
    { category: 'בית', subCategory: 'טלפון קווי', pnlCategory: 'תקשורת' },
    { category: 'עסק', subCategory: 'תוכנות',     pnlCategory: 'תקשורת ותוכנות' }, // keyword step overrides to 5400
    // 5400 — שיווק ופרסום
    { category: 'עסק', subCategory: 'שיווק ופרסום', pnlCategory: 'שיווק ופרסום' },
    // 5500 — ייעוץ ושירותים מקצועיים
    { category: 'עסק', subCategory: 'ייעוץ והשתלמויות', pnlCategory: 'ייעוץ ושירותים מקצועיים' },
    { category: 'עסק', subCategory: 'ייעוץ מקצועי',     pnlCategory: 'ייעוץ ושירותים מקצועיים' },
    // 5600 — הנהלת חשבונות
    { category: 'עסק', subCategory: 'רואה חשבון',    pnlCategory: 'הנהלת חשבונות' },
    { category: 'עסק', subCategory: 'הנהלת חשבונות', pnlCategory: 'הנהלת חשבונות' },
    // 5900 — ספרות מקצועית
    { category: 'עסק', subCategory: 'ספרות מקצועית', pnlCategory: 'ספרות מקצועית' },
    // 6000 — כיבוד
    { category: 'עסק', subCategory: 'כיבוד', pnlCategory: 'כיבוד' },
    // 6100 — עמלות ודמי כרטיס
    { category: 'עסק', subCategory: 'עמלות ודמי כרטיס',                pnlCategory: 'עמלות ודמי כרטיס' },
    { category: 'בנק, אשראי ותנועות', subCategory: 'עמלות ודמי כרטיס', pnlCategory: 'עמלות ודמי כרטיס' },
    // 6200 — הוצאות מימון (keyword 'ריבית' also routes accountCode to 6200)
    { category: 'בנק, אשראי ותנועות',     subCategory: 'ריבית', pnlCategory: 'הוצאות מימון' },
    { category: 'בנקים וכרטיסי אשראי',   subCategory: 'ריבית', pnlCategory: 'הוצאות מימון' },
  ];

  /**
   * Sub-categories whose VAT deductibility percent (vatPercent) differs from
   * the default 100. Applied idempotently on every boot, after
   * seedExpenseSubCategoryMappings creates any missing rows.
   *
   * Values: 0 = no deductible input VAT; 67 = two-thirds (רכב פרטי rule);
   * 100 = fully deductible (default — not listed here, that's the INSERT default).
   */
  private static readonly SUBCATEGORY_VAT_DEFAULTS: ReadonlyArray<{
    category: string;
    subCategory: string;
    vatPercent: number;
  }> = [
    // דיור / home expenses — not VAT-deductible for businesses
    { category: 'דיור והוצאות הבית', subCategory: 'ארנונה',   vatPercent: 0  },
    { category: 'דיור והוצאות הבית', subCategory: 'חשמל',     vatPercent: 0  },
    { category: 'דיור והוצאות הבית', subCategory: 'מים',      vatPercent: 0  },
    { category: 'דיור והוצאות הבית', subCategory: 'גז',       vatPercent: 0  },
    { category: 'דיור והוצאות הבית', subCategory: 'ועד בית',  vatPercent: 0  },
    { category: 'דיור והוצאות הבית', subCategory: 'תחזוקה',   vatPercent: 0  },
    { category: 'דיור והוצאות הבית', subCategory: 'גינה',     vatPercent: 0  },
    { category: 'דיור והוצאות הבית', subCategory: 'משכנתא',   vatPercent: 0  },
    { category: 'דיור והוצאות הבית', subCategory: 'שכירות',   vatPercent: 0  },
    // רכב — 2/3 deductible VAT (Israeli tax law: private vehicle rule)
    { category: 'רכב ותחבורה', subCategory: 'דלק',            vatPercent: 67 },
    { category: 'רכב ותחבורה', subCategory: 'חניה',            vatPercent: 67 },
    { category: 'רכב ותחבורה', subCategory: 'טיפולים',         vatPercent: 67 },
    { category: 'רכב ותחבורה', subCategory: 'כבישי אגרה',      vatPercent: 67 },
    { category: 'רכב ותחבורה', subCategory: 'מעורכות',         vatPercent: 67 },
    { category: 'רכב ותחבורה', subCategory: 'תחבורה ציבורית',  vatPercent: 67 },
    // רכב — insurance: no deductible input VAT
    { category: 'רכב ותחבורה', subCategory: 'ביטוח רכב',      vatPercent: 0  },
    // כיבוד — meals/entertainment: no input VAT deduction allowed
    { category: 'עסק', subCategory: 'כיבוד',                   vatPercent: 0  },
  ];

  async onModuleInit(): Promise<void> {
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

    // Ensure the expense sub-categories exist with the right pnlCategory BEFORE
    // the accountCode mapping runs (the mapping derives accountCode from
    // pnlCategory). Own try so a failure here doesn't block the mapping below.
    try {
      await this.seedExpenseSubCategoryMappings();
    } catch (err: any) {
      this.logger.error(
        `Expense sub-category pnlCategory seed failed: ${err?.message ?? err}`,
      );
    }

    // Apply correct vatPercent values for sub-categories whose deductibility
    // differs from the default (100%). Runs after seedExpenseSubCategoryMappings
    // so missing rows are created first.
    try {
      await this.seedSubCategoryVatDefaults();
    } catch (err: any) {
      this.logger.error(
        `Sub-category VAT defaults seed failed: ${err?.message ?? err}`,
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
    const entries = Object.entries(AccountSeedService.CATEGORY_ACCOUNT_DEFAULTS);
    for (const [categoryName, code] of entries) {
      await em.query(
        'UPDATE default_category SET accountCode = ? WHERE categoryName = ?',
        [code, categoryName],
      );
    }
    const mappingLines = entries
      .map(([categoryName, code]) => `  ${categoryName} -> ${code ?? 'NULL'}`)
      .join('\n');
    this.logger.log(
      `Category accountCode defaults applied (${entries.length} categories):\n${mappingLines}`,
    );
  }

  /**
   * Ensure each (category, subCategory) in EXPENSE_SUBCATEGORY_PNL exists in the
   * GLOBAL default_sub_category catalog and carries the intended pnlCategory.
   * Existing rows are updated in place (pnlCategory only — other fields kept);
   * missing rows are created with sensible defaults. Idempotent across boots.
   * Runs BEFORE seedSubCategoryAccountCodes so the accountCode mapping sees the
   * freshly-set pnlCategory values.
   */
  private async seedExpenseSubCategoryMappings(): Promise<void> {
    const em = this.accountRepo.manager;
    for (const { category, subCategory, pnlCategory } of AccountSeedService.EXPENSE_SUBCATEGORY_PNL) {
      const existing: Array<{ id: number }> = await em.query(
        'SELECT id FROM default_sub_category WHERE categoryName = ? AND subCategoryName = ? LIMIT 1',
        [category, subCategory],
      );
      if (existing.length) {
        await em.query(
          'UPDATE default_sub_category SET pnlCategory = ? WHERE categoryName = ? AND subCategoryName = ?',
          [pnlCategory, category, subCategory],
        );
      } else {
        // necessity + reportScope rely on their DB column defaults; accountCode
        // is set right after by seedSubCategoryAccountCodes.
        await em.query(
          `INSERT INTO default_sub_category
             (subCategoryName, categoryName, taxPercent, vatPercent, reductionPercent,
              isEquipment, isRecognized, isExpense, pnlCategory)
           VALUES (?, ?, 100, 100, 0, 0, 1, 1, ?)`,
          [subCategory, category, pnlCategory],
        );
      }
    }
    this.logger.log(
      `Expense sub-category pnlCategory mappings ensured (${AccountSeedService.EXPENSE_SUBCATEGORY_PNL.length} pairs).`,
    );
  }

  /**
   * Apply correct vatPercent values for sub-categories whose VAT deductibility
   * differs from the insert default (100). Idempotent — safe on every boot.
   * Runs after seedExpenseSubCategoryMappings so all rows exist before we update.
   */
  private async seedSubCategoryVatDefaults(): Promise<void> {
    const em = this.accountRepo.manager;
    for (const { category, subCategory, vatPercent } of AccountSeedService.SUBCATEGORY_VAT_DEFAULTS) {
      await em.query(
        'UPDATE default_sub_category SET vatPercent = ? WHERE categoryName = ? AND subCategoryName = ?',
        [vatPercent, category, subCategory],
      );
    }
    this.logger.log(
      `Sub-category VAT defaults applied (${AccountSeedService.SUBCATEGORY_VAT_DEFAULTS.length} pairs).`,
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
   */
  private async seedSubCategoryAccountCodes(): Promise<void> {
    const em = this.accountRepo.manager;
    const fallback = AccountSeedService.EXPENSE_FALLBACK_ACCOUNT;
    const legacyMap = AccountSeedService.PNL_CATEGORY_TO_ACCOUNT;

    // 1. Baseline for recognized, deductible business expenses — "if unsure,
    //    map to 5000". Rows that aren't a recognized expense are left alone.
    await em.query(
      `UPDATE default_sub_category SET accountCode = ? WHERE isRecognized = 1 AND isExpense = 1`,
      [fallback],
    );

    // 2. Legacy pnlCategory → account, pre-Phase-1 mapping.
    for (const [pnlCategory, code] of Object.entries(legacyMap)) {
      await em.query(
        `UPDATE default_sub_category SET accountCode = ? WHERE pnlCategory = ?`,
        [code, pnlCategory],
      );
    }

    // 3. 'ספקים' was account 5800's OLD name pre-Phase-1; 5800 now means "שכר".
    //    Any row still tagged with this stale pnlCategory falls back to 5000.
    await em.query(
      `UPDATE default_sub_category SET accountCode = ? WHERE pnlCategory = ?`,
      [fallback, 'ספקים'],
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
        `UPDATE default_sub_category SET accountCode = ? WHERE categoryName = ?`,
        [code, categoryName],
      );
    }

    // 5. Sub-category NAME keyword overrides — most specific textual signal.
    for (const { code, keywords } of AccountSeedService.SUBCATEGORY_KEYWORD_RULES) {
      const likeClauses = keywords.map(() => 'subCategoryName LIKE ?').join(' OR ');
      await em.query(
        `UPDATE default_sub_category SET accountCode = ? WHERE ${likeClauses}`,
        [code, ...keywords.map((k) => `%${k}%`)],
      );
    }

    // 6. Equipment — blanket-routed to depreciation; no fixed-assets chart yet.
    await em.query(
      `UPDATE default_sub_category SET accountCode = ? WHERE isEquipment = 1`,
      ['6300'],
    );

    // 7. Income — most specific subcategory applied last so it wins over the
    //    general income-category default.
    await em.query(
      `UPDATE default_sub_category SET accountCode = ? WHERE categoryName = ?`,
      ['4000', 'הכנסות'],
    );
    await em.query(
      `UPDATE default_sub_category SET accountCode = ? WHERE subCategoryName = ?`,
      ['4010', 'הכנסות פטורות'],
    );

    this.logger.log('Sub-category accountCode mapping applied (Phase 3 rule cascade).');

    // user_sub_category: unchanged legacy behavior (out of Phase 3 scope) —
    // only rows whose pnlCategory matches the legacy map are touched.
    const legacyKeys = Object.keys(legacyMap);
    if (legacyKeys.length) {
      const whenSql = legacyKeys.map(() => 'WHEN ? THEN ?').join(' ');
      const caseParams: string[] = [];
      for (const k of legacyKeys) caseParams.push(k, legacyMap[k]);
      const inPlaceholders = legacyKeys.map(() => '?').join(', ');
      await em.query(
        `UPDATE user_sub_category
         SET accountCode = CASE pnlCategory ${whenSql} END
         WHERE pnlCategory IN (${inPlaceholders})`,
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
