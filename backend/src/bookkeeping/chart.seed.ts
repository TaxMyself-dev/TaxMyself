import { AccountingSection } from './accounting-section.entity';
import { BookingAccount } from './account.entity';
import { AccountCodeMigration } from './account-code-migration.entity';
import { OwnerType, SYSTEM_CHART_OWNER_KEY } from 'src/enum';

// ============================================================================
// Phase 1.3 — the new SYSTEM chart of accounts (D1/D2/D3 of the categories
// redesign). Flat data only — NOT wired into any boot-time seeder yet. That
// wiring (and the actual old-code renumbering of journal_line/journal_entry)
// is Phase 1.4/2.6's job, run as a separate, carefully-reviewed migration
// script/session, not on every app boot like the old AccountSeedService.
//
// Reviewed against docs/redesign/phase1-chart-review.md — every code6111
// below is intentionally NULL (no verified source for the official Form 6111
// classification yet; do NOT invent values — see D2/1.3 and that doc's open
// item 2). Fill in once Elazar provides the official list.
//
// Numbering formula (see phase1-chart-review.md §2):
//   - balance-sheet/technical 1000–2999: unchanged
//   - income: new = old × 10        (4000→40000, 4010→40010)
//   - expense parents 5000–6300: new = old + 55000  (→ 60000–61300)
//   - expense sub-ledger (old subAccountCode 5101–6303): same +55000 formula
//   - new D14-decision-3 technical accounts: 90100/90200/90300 (never existed
//     before)
// ============================================================================

/** 16 sections — one per current `pnlCategory` string (see review doc §0.1:
 *  the master plan's "18" does not match anything discoverable in code/data;
 *  proceeding with the 16 verified values). Section codes are our own
 *  internal grouping namespace, unrelated to booking_account.code/6111. */
export const ACCOUNTING_SECTIONS: Pick<
  AccountingSection,
  'code' | 'name' | 'ownerType' | 'chartOwnerKey' | 'displayOrder'
>[] = [
  { code: '10',  name: 'הכנסות',                   ownerType: OwnerType.SYSTEM, chartOwnerKey: SYSTEM_CHART_OWNER_KEY, displayOrder: 1  },
  { code: '20',  name: 'הכנסות פטורות',            ownerType: OwnerType.SYSTEM, chartOwnerKey: SYSTEM_CHART_OWNER_KEY, displayOrder: 2  },
  { code: '30',  name: 'הוצאות משרד',              ownerType: OwnerType.SYSTEM, chartOwnerKey: SYSTEM_CHART_OWNER_KEY, displayOrder: 3  },
  { code: '40',  name: 'רכב ותחבורה',              ownerType: OwnerType.SYSTEM, chartOwnerKey: SYSTEM_CHART_OWNER_KEY, displayOrder: 4  },
  { code: '50',  name: 'תקשורת',                   ownerType: OwnerType.SYSTEM, chartOwnerKey: SYSTEM_CHART_OWNER_KEY, displayOrder: 5  },
  { code: '60',  name: 'תוכנות ושירותי ענן',       ownerType: OwnerType.SYSTEM, chartOwnerKey: SYSTEM_CHART_OWNER_KEY, displayOrder: 6  },
  { code: '70',  name: 'שיווק ופרסום',             ownerType: OwnerType.SYSTEM, chartOwnerKey: SYSTEM_CHART_OWNER_KEY, displayOrder: 7  },
  { code: '80',  name: 'ייעוץ ושירותים מקצועיים', ownerType: OwnerType.SYSTEM, chartOwnerKey: SYSTEM_CHART_OWNER_KEY, displayOrder: 8  },
  { code: '90',  name: 'הנהלת חשבונות',            ownerType: OwnerType.SYSTEM, chartOwnerKey: SYSTEM_CHART_OWNER_KEY, displayOrder: 9  },
  { code: '100', name: 'שכר',                       ownerType: OwnerType.SYSTEM, chartOwnerKey: SYSTEM_CHART_OWNER_KEY, displayOrder: 10 },
  { code: '110', name: 'ספרות מקצועית',            ownerType: OwnerType.SYSTEM, chartOwnerKey: SYSTEM_CHART_OWNER_KEY, displayOrder: 11 },
  { code: '120', name: 'כיבוד',                     ownerType: OwnerType.SYSTEM, chartOwnerKey: SYSTEM_CHART_OWNER_KEY, displayOrder: 12 },
  { code: '130', name: 'עמלות ודמי כרטיס',         ownerType: OwnerType.SYSTEM, chartOwnerKey: SYSTEM_CHART_OWNER_KEY, displayOrder: 13 },
  { code: '140', name: 'הוצאות בלתי מזוהות',       ownerType: OwnerType.SYSTEM, chartOwnerKey: SYSTEM_CHART_OWNER_KEY, displayOrder: 14 },
  { code: '150', name: 'הוצאות מימון',              ownerType: OwnerType.SYSTEM, chartOwnerKey: SYSTEM_CHART_OWNER_KEY, displayOrder: 15 },
  { code: '160', name: 'פחת',                       ownerType: OwnerType.SYSTEM, chartOwnerKey: SYSTEM_CHART_OWNER_KEY, displayOrder: 16 },
];

/** Raw seed shape: `sectionCode` references ACCOUNTING_SECTIONS by code
 *  (resolved to a real sectionId by whichever runner consumes this — Phase
 *  1.4 — since seed data can't know DB-generated ids ahead of time).
 *  `legacyCode`/`legacySource` record the pre-redesign origin for
 *  traceability and feed ACCOUNT_CODE_MIGRATION below; both null for the
 *  three brand-new D14-decision-3 technical accounts. */
type ChartAccountSeed = Pick<
  BookingAccount,
  'code' | 'name' | 'type' | 'pnlCategory' | 'displayOrder' | 'code6111' | 'ownerType' | 'chartOwnerKey' | 'isActive'
> & {
  sectionCode: string | null;
  legacyCode: string | null;
  legacySource: 'accountCode' | 'subAccountCode' | null;
};

const SYSTEM_DEFAULTS = {
  ownerType: OwnerType.SYSTEM,
  chartOwnerKey: SYSTEM_CHART_OWNER_KEY,
  isActive: true,
  code6111: null, // NULL everywhere — see file header. Do not invent values.
} as const;

export const CHART_ACCOUNTS: ChartAccountSeed[] = [
  // ── 3a. Balance-sheet / technical — codes unchanged, no section ─────────
  { code: '1000', legacyCode: '1000', legacySource: 'accountCode', name: 'חשבון מעבר',              type: 'asset',     pnlCategory: null, displayOrder: null, sectionCode: null, ...SYSTEM_DEFAULTS },
  { code: '1100', legacyCode: '1100', legacySource: 'accountCode', name: 'בנק',                      type: 'asset',     pnlCategory: null, displayOrder: null, sectionCode: null, ...SYSTEM_DEFAULTS },
  { code: '1110', legacyCode: '1110', legacySource: 'accountCode', name: 'מזומן',                    type: 'asset',     pnlCategory: null, displayOrder: null, sectionCode: null, ...SYSTEM_DEFAULTS },
  { code: '1120', legacyCode: '1120', legacySource: 'accountCode', name: 'כרטיס אשראי / סליקה',     type: 'asset',     pnlCategory: null, displayOrder: null, sectionCode: null, ...SYSTEM_DEFAULTS },
  { code: '1200', legacyCode: '1200', legacySource: 'accountCode', name: 'לקוחות כלליים',            type: 'asset',     pnlCategory: null, displayOrder: null, sectionCode: null, ...SYSTEM_DEFAULTS },
  { code: '2000', legacyCode: '2000', legacySource: 'accountCode', name: 'ספקים כלליים',             type: 'liability', pnlCategory: null, displayOrder: null, sectionCode: null, ...SYSTEM_DEFAULTS },
  { code: '2100', legacyCode: '2100', legacySource: 'accountCode', name: 'כרטיסי אשראי לתשלום',     type: 'liability', pnlCategory: null, displayOrder: null, sectionCode: null, ...SYSTEM_DEFAULTS },
  { code: '2400', legacyCode: '2400', legacySource: 'accountCode', name: 'מע"מ עסקאות',              type: 'liability', pnlCategory: null, displayOrder: null, sectionCode: null, ...SYSTEM_DEFAULTS },
  { code: '2410', legacyCode: '2410', legacySource: 'accountCode', name: 'מע"מ תשומות',              type: 'asset',     pnlCategory: null, displayOrder: null, sectionCode: null, ...SYSTEM_DEFAULTS },

  // ── 3b. Income ───────────────────────────────────────────────────────────
  { code: '40000', legacyCode: '4000', legacySource: 'accountCode', name: 'הכנסות',          type: 'income', pnlCategory: 'הכנסות',          displayOrder: 1, sectionCode: '10', ...SYSTEM_DEFAULTS },
  { code: '40010', legacyCode: '4010', legacySource: 'accountCode', name: 'הכנסות פטורות',  type: 'income', pnlCategory: 'הכנסות פטורות',  displayOrder: 2, sectionCode: '20', ...SYSTEM_DEFAULTS },

  // ── 3c. Expense parent accounts ──────────────────────────────────────────
  { code: '60000', legacyCode: '5000', legacySource: 'accountCode', name: 'הוצאות בלתי מזוהות',      type: 'expense', pnlCategory: 'הוצאות בלתי מזוהות',      displayOrder: 14, sectionCode: '140', ...SYSTEM_DEFAULTS },
  { code: '60100', legacyCode: '5100', legacySource: 'accountCode', name: 'הוצאות משרד',              type: 'expense', pnlCategory: 'הוצאות משרד',              displayOrder: 3,  sectionCode: '30',  ...SYSTEM_DEFAULTS },
  { code: '60200', legacyCode: '5200', legacySource: 'accountCode', name: 'רכב ותחבורה',              type: 'expense', pnlCategory: 'רכב ותחבורה',              displayOrder: 4,  sectionCode: '40',  ...SYSTEM_DEFAULTS },
  { code: '60300', legacyCode: '5300', legacySource: 'accountCode', name: 'תקשורת',                   type: 'expense', pnlCategory: 'תקשורת',                   displayOrder: 5,  sectionCode: '50',  ...SYSTEM_DEFAULTS },
  { code: '60400', legacyCode: '5400', legacySource: 'accountCode', name: 'תוכנות ושירותי ענן',      type: 'expense', pnlCategory: 'תוכנות ושירותי ענן',      displayOrder: 6,  sectionCode: '60',  ...SYSTEM_DEFAULTS },
  { code: '60500', legacyCode: '5500', legacySource: 'accountCode', name: 'שיווק ופרסום',             type: 'expense', pnlCategory: 'שיווק ופרסום',             displayOrder: 7,  sectionCode: '70',  ...SYSTEM_DEFAULTS },
  { code: '60600', legacyCode: '5600', legacySource: 'accountCode', name: 'ייעוץ ושירותים מקצועיים', type: 'expense', pnlCategory: 'ייעוץ ושירותים מקצועיים', displayOrder: 8,  sectionCode: '80',  ...SYSTEM_DEFAULTS },
  { code: '60700', legacyCode: '5700', legacySource: 'accountCode', name: 'הנהלת חשבונות',            type: 'expense', pnlCategory: 'הנהלת חשבונות',            displayOrder: 9,  sectionCode: '90',  ...SYSTEM_DEFAULTS },
  { code: '60800', legacyCode: '5800', legacySource: 'accountCode', name: 'שכר',                      type: 'expense', pnlCategory: 'שכר',                      displayOrder: 10, sectionCode: '100', ...SYSTEM_DEFAULTS },
  { code: '60900', legacyCode: '5900', legacySource: 'accountCode', name: 'ספרות מקצועית',            type: 'expense', pnlCategory: 'ספרות מקצועית',            displayOrder: 11, sectionCode: '110', ...SYSTEM_DEFAULTS },
  { code: '61000', legacyCode: '6000', legacySource: 'accountCode', name: 'כיבוד',                    type: 'expense', pnlCategory: 'כיבוד',                    displayOrder: 12, sectionCode: '120', ...SYSTEM_DEFAULTS },
  { code: '61100', legacyCode: '6100', legacySource: 'accountCode', name: 'עמלות ודמי כרטיס',        type: 'expense', pnlCategory: 'עמלות ודמי כרטיס',        displayOrder: 13, sectionCode: '130', ...SYSTEM_DEFAULTS },
  { code: '61200', legacyCode: '6200', legacySource: 'accountCode', name: 'הוצאות מימון',             type: 'expense', pnlCategory: 'הוצאות מימון',             displayOrder: 15, sectionCode: '150', ...SYSTEM_DEFAULTS },
  { code: '61300', legacyCode: '6300', legacySource: 'accountCode', name: 'פחת',                      type: 'expense', pnlCategory: 'פחת',                      displayOrder: 16, sectionCode: '160', ...SYSTEM_DEFAULTS },

  // ── 3d. Expense sub-ledger accounts (dev-only subAccountCode today; real
  // per-sub-category accounts going forward — D1/D2). No independent prod
  // journal usage (production never populated subCounterAccountCode — D14).
  // Six ⚠️ below share their name with the parent account (review doc open
  // item 4) — left as named in the source data pending Elazar's rename call.
  { code: '60101', legacyCode: '5101', legacySource: 'subAccountCode', name: 'ארנונה',            type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '30', ...SYSTEM_DEFAULTS },
  { code: '60102', legacyCode: '5102', legacySource: 'subAccountCode', name: 'גז',                type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '30', ...SYSTEM_DEFAULTS },
  { code: '60103', legacyCode: '5103', legacySource: 'subAccountCode', name: 'הוצאות משרד',       type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '30', ...SYSTEM_DEFAULTS }, // ⚠️ name collision with parent 60100
  { code: '60104', legacyCode: '5104', legacySource: 'subAccountCode', name: 'ועד בית',           type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '30', ...SYSTEM_DEFAULTS },
  { code: '60105', legacyCode: '5105', legacySource: 'subAccountCode', name: 'חשמל',              type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '30', ...SYSTEM_DEFAULTS },
  { code: '60106', legacyCode: '5106', legacySource: 'subAccountCode', name: 'מים',               type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '30', ...SYSTEM_DEFAULTS },
  { code: '60107', legacyCode: '5107', legacySource: 'subAccountCode', name: 'שכירות',            type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '30', ...SYSTEM_DEFAULTS },
  { code: '60108', legacyCode: '5108', legacySource: 'subAccountCode', name: 'שכירות משרד',       type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '30', ...SYSTEM_DEFAULTS },
  { code: '60109', legacyCode: '5109', legacySource: 'subAccountCode', name: 'שליחויות',          type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '30', ...SYSTEM_DEFAULTS },
  { code: '60110', legacyCode: '5110', legacySource: 'subAccountCode', name: 'תחזוקה',            type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '30', ...SYSTEM_DEFAULTS },

  { code: '60201', legacyCode: '5201', legacySource: 'subAccountCode', name: 'ביטוח רכב',           type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '40', ...SYSTEM_DEFAULTS },
  { code: '60202', legacyCode: '5202', legacySource: 'subAccountCode', name: 'דלק',                 type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '40', ...SYSTEM_DEFAULTS },
  { code: '60203', legacyCode: '5203', legacySource: 'subAccountCode', name: 'חניה',                 type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '40', ...SYSTEM_DEFAULTS },
  { code: '60204', legacyCode: '5204', legacySource: 'subAccountCode', name: 'טיפולים',              type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '40', ...SYSTEM_DEFAULTS },
  { code: '60205', legacyCode: '5205', legacySource: 'subAccountCode', name: 'כבישי אגרה',           type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '40', ...SYSTEM_DEFAULTS },
  { code: '60206', legacyCode: '5206', legacySource: 'subAccountCode', name: 'מערכות',               type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '40', ...SYSTEM_DEFAULTS },
  { code: '60207', legacyCode: '5207', legacySource: 'subAccountCode', name: 'תחבורה ציבורית',       type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '40', ...SYSTEM_DEFAULTS },

  { code: '60301', legacyCode: '5301', legacySource: 'subAccountCode', name: 'אינטרנט',     type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '50', ...SYSTEM_DEFAULTS },
  { code: '60302', legacyCode: '5302', legacySource: 'subAccountCode', name: 'טלפון קווי',  type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '50', ...SYSTEM_DEFAULTS },
  { code: '60303', legacyCode: '5303', legacySource: 'subAccountCode', name: 'פלאפון',      type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '50', ...SYSTEM_DEFAULTS },

  { code: '60401', legacyCode: '5401', legacySource: 'subAccountCode', name: 'תוכנות', type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '60', ...SYSTEM_DEFAULTS },

  { code: '60501', legacyCode: '5501', legacySource: 'subAccountCode', name: 'שיווק ופרסום', type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '70', ...SYSTEM_DEFAULTS }, // ⚠️ name collision with parent 60500

  { code: '60601', legacyCode: '5601', legacySource: 'subAccountCode', name: 'ייעוץ והשתלמויות', type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '80', ...SYSTEM_DEFAULTS },
  { code: '60602', legacyCode: '5602', legacySource: 'subAccountCode', name: 'ייעוץ מקצועי',     type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '80', ...SYSTEM_DEFAULTS },

  { code: '60701', legacyCode: '5701', legacySource: 'subAccountCode', name: 'הנהלת חשבונות', type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '90', ...SYSTEM_DEFAULTS }, // ⚠️ name collision with parent 60700

  { code: '60801', legacyCode: '5801', legacySource: 'subAccountCode', name: 'שכר', type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '100', ...SYSTEM_DEFAULTS }, // ⚠️ name collision with parent 60800

  { code: '60901', legacyCode: '5901', legacySource: 'subAccountCode', name: 'ספרות מקצועית', type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '110', ...SYSTEM_DEFAULTS }, // ⚠️ name collision with parent 60900

  { code: '61001', legacyCode: '6001', legacySource: 'subAccountCode', name: 'כיבוד', type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '120', ...SYSTEM_DEFAULTS }, // ⚠️ name collision with parent 61000

  { code: '61101', legacyCode: '6101', legacySource: 'subAccountCode', name: 'עמלות ודמי כרטיס (עסק)',                type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '130', ...SYSTEM_DEFAULTS },
  { code: '61102', legacyCode: '6102', legacySource: 'subAccountCode', name: 'עמלות ודמי כרטיס (בנק, אשראי ותנועות)', type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '130', ...SYSTEM_DEFAULTS },

  { code: '61201', legacyCode: '6201', legacySource: 'subAccountCode', name: 'ריבית', type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '150', ...SYSTEM_DEFAULTS },

  { code: '61301', legacyCode: '6301', legacySource: 'subAccountCode', name: 'מחשב', type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '160', ...SYSTEM_DEFAULTS },
  { code: '61302', legacyCode: '6302', legacySource: 'subAccountCode', name: 'ריהוט', type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '160', ...SYSTEM_DEFAULTS },
  { code: '61303', legacyCode: '6303', legacySource: 'subAccountCode', name: 'רכב',   type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '160', ...SYSTEM_DEFAULTS },

  // ── 3e. New technical accounts (D14 decision 3) — never existed before.
  // Codes/readings confirmed with Elazar 2026-07-10 (see review doc §0,
  // resolved items): 90200 = VAT-remittance clearing, distinct from the
  // transactional 2400/2410 accounts.
  { code: '90100', legacyCode: null, legacySource: null, name: 'מקדמות מס הכנסה',      type: 'asset', pnlCategory: null, displayOrder: null, sectionCode: null, ...SYSTEM_DEFAULTS },
  { code: '90200', legacyCode: null, legacySource: null, name: 'גביית מע"מ',           type: 'asset', pnlCategory: null, displayOrder: null, sectionCode: null, ...SYSTEM_DEFAULTS },
  { code: '90300', legacyCode: null, legacySource: null, name: 'מקדמות ביטוח לאומי',  type: 'asset', pnlCategory: null, displayOrder: null, sectionCode: null, ...SYSTEM_DEFAULTS },
];

/**
 * account_code_migration seed rows — every code that exists in the OLD chart
 * (account.seed.ts's DEFAULT_ACCOUNTS + account-seed.service.ts's
 * SUBCATEGORY_SUB_ACCOUNT_CODES) mapped to its new home. Drives Phase 1.4's
 * UPDATE of journal_line.accountCode / journal_entry.counterAccountCode.
 *
 * NOT included here (per D14/D15 — handled as a targeted UPDATE in 1.4, not
 * a generic code-map row): business 204245724's six journal_line rows
 * currently on account 5000 whose journal_entry counterparty is Bituach
 * Leumi — those remap to 90300, not 60000.
 *
 * Balance-sheet/technical codes 1000/1100/1110/1120/1200/2000/2100/2400/2410
 * are intentionally absent — unchanged, nothing to migrate.
 */
export const ACCOUNT_CODE_MIGRATION: Pick<AccountCodeMigration, 'oldCode' | 'newCode' | 'source'>[] =
  CHART_ACCOUNTS
    .filter((a): a is ChartAccountSeed & { legacyCode: string; legacySource: 'accountCode' | 'subAccountCode' } =>
      a.legacyCode !== null && a.legacyCode !== a.code,
    )
    .map((a) => ({ oldCode: a.legacyCode, newCode: a.code, source: a.legacySource }));
