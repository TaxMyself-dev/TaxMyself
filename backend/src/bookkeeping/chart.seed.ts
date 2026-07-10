import { AccountingSection } from './accounting-section.entity';
import { BookingAccount } from './account.entity';
import { AccountCodeMigration } from './account-code-migration.entity';
import { OwnerType, RecognitionType, SYSTEM_CHART_OWNER_KEY } from 'src/enum';

// ============================================================================
// Phase 1.3 (chart-revision session, 2026-07-10) — the new SYSTEM chart of
// accounts (D1/D2/D3, with D1/D5 REVISED that day: accounting law — vat%,
// tax%, isEquipment, reductionPercent, recognitionType — now lives on the
// CARD, not sub_category). Flat data only — NOT wired into any boot-time
// seeder yet; that wiring is Phase 1.4/2.6's job.
//
// SOURCE OF TRUTH FOR PERCENTS: queried live from `keepintax_prodcopy`'s
// `default_sub_category` (87 rows, read-only SELECT, 2026-07-10) — NOT from
// account-seed.service.ts's SUBCATEGORY_TAX_VAT_DEFAULTS, which is stale in
// several places (e.g. it says כיבוד=100/0 and גז=25/25; live data says 80/0
// and 25/0). Every percent below traces to a real row; see
// docs/redesign/phase1-chart-review.md §0/§6 for the full percent-conflict
// analysis this session ran (task 1.3's "conflict check") and every
// judgment call flagged there for Elazar's review before commit.
//
// NUMBERING FORMULA (revised 2026-07-10 — see phase1-chart-review.md §2):
//   - balance-sheet/technical 1000–2999: unchanged.
//   - income: new = old × 10 (4000→40000, 4010→40010) — unchanged.
//   - expense BLOCK ANCHORS (parent accounts): new = old + 55000, unchanged
//     (5200→60200 etc.) — these are now ALSO the section code for their
//     block ("section codes = block anchors").
//   - expense CHILDREN: jumps of 10 from the anchor (anchor+10, +20, ...),
//     REPLACING the old +1/+2/... offset scheme. Anchors are 100 apart, so a
//     block has room for at most 9 children (anchor+10..+90) before
//     colliding with the next block's anchor.
//   - A sub-category whose name is IDENTICAL to its parent block's name
//     (the "name collision" set flagged in the original review) is merged
//     into the parent card instead of getting its own child code — this is
//     also what makes the 9-child ceiling work for the one block (5100)
//     that had 10 old children (see phase1-chart-review.md §3a).
//   - New D14-decision-3 technical accounts: 90100/90200/90300 (unchanged),
//     plus this session's new 90400.
// ============================================================================

/** 16 sections — one per block. Section CODE = the block's anchor account
 *  code (revised 2026-07-10: "section codes = block anchors"), replacing
 *  the old arbitrary 10/20/30... scheme. Still a distinct namespace from
 *  `booking_account.code` per D1 — the numeric equality is intentional
 *  (mirrors the block anchor) but not a DB relationship. */
export const ACCOUNTING_SECTIONS: Pick<
  AccountingSection,
  'code' | 'name' | 'ownerType' | 'chartOwnerKey' | 'displayOrder'
>[] = [
  { code: '40000', name: 'הכנסות',                   ownerType: OwnerType.SYSTEM, chartOwnerKey: SYSTEM_CHART_OWNER_KEY, displayOrder: 1  },
  { code: '40010', name: 'הכנסות פטורות',            ownerType: OwnerType.SYSTEM, chartOwnerKey: SYSTEM_CHART_OWNER_KEY, displayOrder: 2  },
  { code: '60100', name: 'הוצאות משרד',              ownerType: OwnerType.SYSTEM, chartOwnerKey: SYSTEM_CHART_OWNER_KEY, displayOrder: 3  },
  { code: '60200', name: 'רכב ותחבורה',              ownerType: OwnerType.SYSTEM, chartOwnerKey: SYSTEM_CHART_OWNER_KEY, displayOrder: 4  },
  { code: '60300', name: 'תקשורת',                   ownerType: OwnerType.SYSTEM, chartOwnerKey: SYSTEM_CHART_OWNER_KEY, displayOrder: 5  },
  { code: '60400', name: 'תוכנות ושירותי ענן',       ownerType: OwnerType.SYSTEM, chartOwnerKey: SYSTEM_CHART_OWNER_KEY, displayOrder: 6  },
  { code: '60500', name: 'שיווק ופרסום',             ownerType: OwnerType.SYSTEM, chartOwnerKey: SYSTEM_CHART_OWNER_KEY, displayOrder: 7  },
  { code: '60600', name: 'ייעוץ ושירותים מקצועיים', ownerType: OwnerType.SYSTEM, chartOwnerKey: SYSTEM_CHART_OWNER_KEY, displayOrder: 8  },
  { code: '60700', name: 'הנהלת חשבונות',            ownerType: OwnerType.SYSTEM, chartOwnerKey: SYSTEM_CHART_OWNER_KEY, displayOrder: 9  },
  { code: '60800', name: 'שכר',                       ownerType: OwnerType.SYSTEM, chartOwnerKey: SYSTEM_CHART_OWNER_KEY, displayOrder: 10 },
  { code: '60900', name: 'ספרות מקצועית',            ownerType: OwnerType.SYSTEM, chartOwnerKey: SYSTEM_CHART_OWNER_KEY, displayOrder: 11 },
  { code: '61000', name: 'כיבוד',                     ownerType: OwnerType.SYSTEM, chartOwnerKey: SYSTEM_CHART_OWNER_KEY, displayOrder: 12 },
  { code: '61100', name: 'עמלות ודמי כרטיס',         ownerType: OwnerType.SYSTEM, chartOwnerKey: SYSTEM_CHART_OWNER_KEY, displayOrder: 13 },
  { code: '60000', name: 'הוצאות בלתי מזוהות',       ownerType: OwnerType.SYSTEM, chartOwnerKey: SYSTEM_CHART_OWNER_KEY, displayOrder: 14 },
  { code: '61200', name: 'הוצאות מימון',              ownerType: OwnerType.SYSTEM, chartOwnerKey: SYSTEM_CHART_OWNER_KEY, displayOrder: 15 },
  { code: '61300', name: 'פחת',                       ownerType: OwnerType.SYSTEM, chartOwnerKey: SYSTEM_CHART_OWNER_KEY, displayOrder: 16 },
];

type ChartAccountSeed = Pick<
  BookingAccount,
  'code' | 'name' | 'type' | 'pnlCategory' | 'displayOrder' | 'code6111' | 'ownerType' | 'chartOwnerKey' | 'isActive'
  | 'vatPercent' | 'taxPercent' | 'reductionPercent' | 'isEquipment' | 'recognitionType'
> & {
  sectionCode: string | null;
  /** Primary historical origin for this account's own row in
   *  account_code_migration. Secondary old codes that got MERGED into this
   *  account (rather than becoming their own child) are NOT recorded here —
   *  see MERGED_SUBACCOUNT_MIGRATIONS below. */
  legacyCode: string | null;
  legacySource: 'accountCode' | 'subAccountCode' | null;
};

const SYSTEM_DEFAULTS = {
  ownerType: OwnerType.SYSTEM,
  chartOwnerKey: SYSTEM_CHART_OWNER_KEY,
  isActive: true,
  code6111: null, // NULL everywhere — see file header. Do not invent values.
} as const;

/** Income / balance-sheet / technical accounts: no deductibility law applies. */
const NOT_APPLICABLE_LAW = {
  vatPercent: null,
  taxPercent: null,
  reductionPercent: null,
  isEquipment: null,
  recognitionType: null,
} as const;

export const CHART_ACCOUNTS: ChartAccountSeed[] = [
  // ── 3a. Balance-sheet / technical — codes unchanged, no section, no law ──
  { code: '1000', legacyCode: '1000', legacySource: 'accountCode', name: 'חשבון מעבר',              type: 'asset',     pnlCategory: null, displayOrder: null, sectionCode: null, ...SYSTEM_DEFAULTS, ...NOT_APPLICABLE_LAW },
  { code: '1100', legacyCode: '1100', legacySource: 'accountCode', name: 'בנק',                      type: 'asset',     pnlCategory: null, displayOrder: null, sectionCode: null, ...SYSTEM_DEFAULTS, ...NOT_APPLICABLE_LAW },
  { code: '1110', legacyCode: '1110', legacySource: 'accountCode', name: 'מזומן',                    type: 'asset',     pnlCategory: null, displayOrder: null, sectionCode: null, ...SYSTEM_DEFAULTS, ...NOT_APPLICABLE_LAW },
  { code: '1120', legacyCode: '1120', legacySource: 'accountCode', name: 'כרטיס אשראי / סליקה',     type: 'asset',     pnlCategory: null, displayOrder: null, sectionCode: null, ...SYSTEM_DEFAULTS, ...NOT_APPLICABLE_LAW },
  { code: '1200', legacyCode: '1200', legacySource: 'accountCode', name: 'לקוחות כלליים',            type: 'asset',     pnlCategory: null, displayOrder: null, sectionCode: null, ...SYSTEM_DEFAULTS, ...NOT_APPLICABLE_LAW },
  { code: '2000', legacyCode: '2000', legacySource: 'accountCode', name: 'ספקים כלליים',             type: 'liability', pnlCategory: null, displayOrder: null, sectionCode: null, ...SYSTEM_DEFAULTS, ...NOT_APPLICABLE_LAW },
  { code: '2100', legacyCode: '2100', legacySource: 'accountCode', name: 'כרטיסי אשראי לתשלום',     type: 'liability', pnlCategory: null, displayOrder: null, sectionCode: null, ...SYSTEM_DEFAULTS, ...NOT_APPLICABLE_LAW },
  { code: '2400', legacyCode: '2400', legacySource: 'accountCode', name: 'מע"מ עסקאות',              type: 'liability', pnlCategory: null, displayOrder: null, sectionCode: null, ...SYSTEM_DEFAULTS, ...NOT_APPLICABLE_LAW },
  { code: '2410', legacyCode: '2410', legacySource: 'accountCode', name: 'מע"מ תשומות',              type: 'asset',     pnlCategory: null, displayOrder: null, sectionCode: null, ...SYSTEM_DEFAULTS, ...NOT_APPLICABLE_LAW },

  // ── 3b. Income — no deductibility law applies ───────────────────────────
  { code: '40000', legacyCode: '4000', legacySource: 'accountCode', name: 'הכנסות',          type: 'income', pnlCategory: 'הכנסות',          displayOrder: 1, sectionCode: '40000', ...SYSTEM_DEFAULTS, ...NOT_APPLICABLE_LAW },
  { code: '40010', legacyCode: '4010', legacySource: 'accountCode', name: 'הכנסות פטורות',  type: 'income', pnlCategory: 'הכנסות פטורות',  displayOrder: 2, sectionCode: '40010', ...SYSTEM_DEFAULTS, ...NOT_APPLICABLE_LAW },

  // ── 3c. Expense block anchors (parent accounts = section codes) ────────
  // 60000 — kept as the true "unidentified"/NOT_RECOGNIZED catch-all (0/0),
  // matching live row שונות/שונות (tax0/vat0, rec=0). Named 'הוצאות לא
  // מוכרות' per Elazar's 2026-07-10 decision (distinguishes the CARD from
  // the section, which keeps the broader legacy label 'הוצאות בלתי מזוהות'
  // — see ACCOUNTING_SECTIONS above; pnlCategory below is also left on the
  // legacy label since it's a temporary D1.2 field, dropped Phase 7).
  // The other live row sharing old code 5000 — עסק/ספקים (tax100/vat100,
  // rec=1) — is a DIFFERENT treatment (a real, if generic, recognized
  // supplier expense); split approved 2026-07-10, gets its own new child
  // 60010 below rather than silently sharing 60000's percents (D1's
  // "different combo = different card"). The third row sharing 5000 —
  // עסק/מקדמות ביטוח לאומי — is the D14/D15-registered Bituach Leumi case;
  // it is NOT part of this block at all, it remaps to the new 90300
  // technical account (see §3e).
  { code: '60000', legacyCode: '5000', legacySource: 'accountCode', name: 'הוצאות לא מוכרות',        type: 'expense', pnlCategory: 'הוצאות בלתי מזוהות',      displayOrder: 14, sectionCode: '60000', ...SYSTEM_DEFAULTS, vatPercent: 0,   taxPercent: 0,   reductionPercent: 0, isEquipment: false, recognitionType: RecognitionType.NOT_RECOGNIZED },
  // NEW child (2026-07-10 session, approved) — not from any old subAccountCode
  // (עסק/ספקים previously pointed at bare accountCode '5000', never had a
  // sub-ledger code of its own).
  { code: '60010', legacyCode: null,   legacySource: null,          name: 'ספקים — כללי (הוצאה מוכרת)', type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '60000', ...SYSTEM_DEFAULTS, vatPercent: 100, taxPercent: 100, reductionPercent: 0, isEquipment: false, recognitionType: RecognitionType.RECOGNIZED },

  // 60100 — הוצאות משרד. Parent absorbs the old subAccountCode 5103
  // (עסק/הוצאות משרד) because its name is IDENTICAL to the block/section
  // name AND its percents (100/100) match what the parent should carry as
  // the "general office expense" treatment — this also resolves the block's
  // numbering (10 old children would overflow the 9-slot jump-of-10 ceiling
  // before hitting 60200, see file header). See §3d for the 8 real children
  // and §0 for the 3 anomalous rows (גינה/משכנתא/שכירות) redirected to 60000.
  { code: '60100', legacyCode: '5100', legacySource: 'accountCode', name: 'הוצאות משרד',              type: 'expense', pnlCategory: 'הוצאות משרד',              displayOrder: 3,  sectionCode: '60100', ...SYSTEM_DEFAULTS, vatPercent: 100, taxPercent: 100, reductionPercent: 0, isEquipment: false, recognitionType: RecognitionType.RECOGNIZED },
  // 60200 — רכב ותחבורה. No live sub-category posts directly to the bare
  // parent; default matches the block's normalized child combo (45/66.67).
  { code: '60200', legacyCode: '5200', legacySource: 'accountCode', name: 'רכב ותחבורה',              type: 'expense', pnlCategory: 'רכב ותחבורה',              displayOrder: 4,  sectionCode: '60200', ...SYSTEM_DEFAULTS, vatPercent: 66.67, taxPercent: 45,  reductionPercent: 0, isEquipment: false, recognitionType: RecognitionType.RECOGNIZED },
  // 60300 — תקשורת. Default matches the canonical "דיור והוצאות הבית" combo
  // (25/25) — NOT the stale "בית" duplicate-category combo (100/100); see §0.
  { code: '60300', legacyCode: '5300', legacySource: 'accountCode', name: 'תקשורת',                   type: 'expense', pnlCategory: 'תקשורת',                   displayOrder: 5,  sectionCode: '60300', ...SYSTEM_DEFAULTS, vatPercent: 25,  taxPercent: 25,  reductionPercent: 0, isEquipment: false, recognitionType: RecognitionType.RECOGNIZED },
  { code: '60400', legacyCode: '5400', legacySource: 'accountCode', name: 'תוכנות ושירותי ענן',      type: 'expense', pnlCategory: 'תוכנות ושירותי ענן',      displayOrder: 6,  sectionCode: '60400', ...SYSTEM_DEFAULTS, vatPercent: 100, taxPercent: 100, reductionPercent: 0, isEquipment: false, recognitionType: RecognitionType.RECOGNIZED },
  // 60500 — שיווק ופרסום. Absorbs old subAccountCode 5501 (name-identical).
  { code: '60500', legacyCode: '5500', legacySource: 'accountCode', name: 'שיווק ופרסום',             type: 'expense', pnlCategory: 'שיווק ופרסום',             displayOrder: 7,  sectionCode: '60500', ...SYSTEM_DEFAULTS, vatPercent: 100, taxPercent: 100, reductionPercent: 0, isEquipment: false, recognitionType: RecognitionType.RECOGNIZED },
  { code: '60600', legacyCode: '5600', legacySource: 'accountCode', name: 'ייעוץ ושירותים מקצועיים', type: 'expense', pnlCategory: 'ייעוץ ושירותים מקצועיים', displayOrder: 8,  sectionCode: '60600', ...SYSTEM_DEFAULTS, vatPercent: 100, taxPercent: 100, reductionPercent: 0, isEquipment: false, recognitionType: RecognitionType.RECOGNIZED },
  // 60700 — הנהלת חשבונות. Absorbs old subAccountCode 5701 (name-identical)
  // AND the live row עסק/רואה חשבון (no old subAccountCode, identical 100/100
  // percents — same card, no conflict, see §0).
  { code: '60700', legacyCode: '5700', legacySource: 'accountCode', name: 'הנהלת חשבונות',            type: 'expense', pnlCategory: 'הנהלת חשבונות',            displayOrder: 9,  sectionCode: '60700', ...SYSTEM_DEFAULTS, vatPercent: 100, taxPercent: 100, reductionPercent: 0, isEquipment: false, recognitionType: RecognitionType.RECOGNIZED },
  { code: '60800', legacyCode: '5800', legacySource: 'accountCode', name: 'שכר',                      type: 'expense', pnlCategory: 'שכר',                      displayOrder: 10, sectionCode: '60800', ...SYSTEM_DEFAULTS, vatPercent: 0,   taxPercent: 100, reductionPercent: 0, isEquipment: false, recognitionType: RecognitionType.RECOGNIZED },
  // 60900 — ספרות מקצועית. Absorbs old subAccountCode 5901 (name-identical).
  // See §0 for two anomalous "הפקדה לקרן השתלמות" rows and one "פנאי וחופשות"
  // row that currently squat on this code in prod but do NOT belong here.
  { code: '60900', legacyCode: '5900', legacySource: 'accountCode', name: 'ספרות מקצועית',            type: 'expense', pnlCategory: 'ספרות מקצועית',            displayOrder: 11, sectionCode: '60900', ...SYSTEM_DEFAULTS, vatPercent: 100, taxPercent: 100, reductionPercent: 0, isEquipment: false, recognitionType: RecognitionType.RECOGNIZED },
  // 61000 — כיבוד. Absorbs old subAccountCode 6001 (name-identical).
  // taxPercent=80 confirmed against live data AND Elazar's explicit
  // instruction this session (was wrongly hardcoded as 100 previously).
  { code: '61000', legacyCode: '6000', legacySource: 'accountCode', name: 'כיבוד',                    type: 'expense', pnlCategory: 'כיבוד',                    displayOrder: 12, sectionCode: '61000', ...SYSTEM_DEFAULTS, vatPercent: 0,   taxPercent: 80,  reductionPercent: 0, isEquipment: false, recognitionType: RecognitionType.RECOGNIZED },
  // NEW child (2026-07-10 session, requested; percents confirmed same day by
  // Elazar: tax=100/vat=0) — code/section not derived from any existing row
  // (no "מתנות מוכרות" row exists anywhere in default_sub_category — the
  // live "קניות/מתנות" row is the unrelated PERSONAL-gifts item,
  // isRecognized=0). Placed under כיבוד per common Israeli practice grouping
  // "כיבוד ומתנות" together.
  { code: '61010', legacyCode: null,   legacySource: null,          name: 'מתנות מוכרות',                type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '61000', ...SYSTEM_DEFAULTS, vatPercent: 0,   taxPercent: 100, reductionPercent: 0, isEquipment: false, recognitionType: RecognitionType.RECOGNIZED },
  { code: '61100', legacyCode: '6100', legacySource: 'accountCode', name: 'עמלות ודמי כרטיס',        type: 'expense', pnlCategory: 'עמלות ודמי כרטיס',        displayOrder: 13, sectionCode: '61100', ...SYSTEM_DEFAULTS, vatPercent: 0,   taxPercent: 100, reductionPercent: 0, isEquipment: false, recognitionType: RecognitionType.RECOGNIZED },
  { code: '61200', legacyCode: '6200', legacySource: 'accountCode', name: 'הוצאות מימון',             type: 'expense', pnlCategory: 'הוצאות מימון',             displayOrder: 15, sectionCode: '61200', ...SYSTEM_DEFAULTS, vatPercent: 0,   taxPercent: 100, reductionPercent: 0, isEquipment: false, recognitionType: RecognitionType.RECOGNIZED },
  // 61300 — פחת. Parent unused directly by any live row (all 3 real
  // depreciation sub-categories are its children below); nominal 0/0.
  { code: '61300', legacyCode: '6300', legacySource: 'accountCode', name: 'פחת',                      type: 'expense', pnlCategory: 'פחת',                      displayOrder: 16, sectionCode: '61300', ...SYSTEM_DEFAULTS, vatPercent: 0,   taxPercent: 0,   reductionPercent: 0, isEquipment: false, recognitionType: RecognitionType.RECOGNIZED },

  // ── 3d. Expense children — jumps of 10 from their block anchor ─────────
  // Percents sourced live from keepintax_prodcopy.default_sub_category
  // (queried 2026-07-10) — see file header. `legacyCode` is the old dev-only
  // subAccountCode (never present in production — schema-drift.md Gap 1).

  // 60100 block — הוצאות משרד (8 children; old 5103 merged into parent above,
  // old 5107 "דיור והוצאות הבית/שכירות" redirected to 60000 — see §0: live
  // data shows it tax0/vat0/isRecognized=0, NOT the 25/0 the old hardcoded
  // defaults assumed, so it does not belong in the 25/0 "home office" group
  // below and is not a recognized business card at all).
  { code: '60110', legacyCode: '5101', legacySource: 'subAccountCode', name: 'ארנונה',       type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '60100', ...SYSTEM_DEFAULTS, vatPercent: 0,   taxPercent: 25,  reductionPercent: 0, isEquipment: false, recognitionType: RecognitionType.RECOGNIZED },
  { code: '60120', legacyCode: '5102', legacySource: 'subAccountCode', name: 'גז',           type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '60100', ...SYSTEM_DEFAULTS, vatPercent: 0,   taxPercent: 25,  reductionPercent: 0, isEquipment: false, recognitionType: RecognitionType.RECOGNIZED },
  { code: '60130', legacyCode: '5104', legacySource: 'subAccountCode', name: 'ועד בית',      type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '60100', ...SYSTEM_DEFAULTS, vatPercent: 0,   taxPercent: 25,  reductionPercent: 0, isEquipment: false, recognitionType: RecognitionType.RECOGNIZED },
  { code: '60140', legacyCode: '5105', legacySource: 'subAccountCode', name: 'חשמל',         type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '60100', ...SYSTEM_DEFAULTS, vatPercent: 0,   taxPercent: 25,  reductionPercent: 0, isEquipment: false, recognitionType: RecognitionType.RECOGNIZED },
  { code: '60150', legacyCode: '5106', legacySource: 'subAccountCode', name: 'מים',          type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '60100', ...SYSTEM_DEFAULTS, vatPercent: 0,   taxPercent: 25,  reductionPercent: 0, isEquipment: false, recognitionType: RecognitionType.RECOGNIZED },
  { code: '60160', legacyCode: '5110', legacySource: 'subAccountCode', name: 'תחזוקה',       type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '60100', ...SYSTEM_DEFAULTS, vatPercent: 0,   taxPercent: 25,  reductionPercent: 0, isEquipment: false, recognitionType: RecognitionType.RECOGNIZED },
  { code: '60170', legacyCode: '5108', legacySource: 'subAccountCode', name: 'שכירות משרד',  type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '60100', ...SYSTEM_DEFAULTS, vatPercent: 100, taxPercent: 100, reductionPercent: 0, isEquipment: false, recognitionType: RecognitionType.RECOGNIZED },
  { code: '60180', legacyCode: '5109', legacySource: 'subAccountCode', name: 'שליחויות',     type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '60100', ...SYSTEM_DEFAULTS, vatPercent: 100, taxPercent: 100, reductionPercent: 0, isEquipment: false, recognitionType: RecognitionType.RECOGNIZED },

  // 60200 block — רכב ותחבורה (7 children). Live data had a split — five
  // rows at vat=67.00, מערכות alone at vat=66.66 — normalized 2026-07-10 to
  // 66.67 uniformly across all six deductible-VAT car-expense cards.
  { code: '60210', legacyCode: '5201', legacySource: 'subAccountCode', name: 'ביטוח רכב',          type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '60200', ...SYSTEM_DEFAULTS, vatPercent: 0,     taxPercent: 45, reductionPercent: 0, isEquipment: false, recognitionType: RecognitionType.RECOGNIZED },
  { code: '60220', legacyCode: '5202', legacySource: 'subAccountCode', name: 'דלק',                 type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '60200', ...SYSTEM_DEFAULTS, vatPercent: 66.67, taxPercent: 45, reductionPercent: 0, isEquipment: false, recognitionType: RecognitionType.RECOGNIZED },
  { code: '60230', legacyCode: '5203', legacySource: 'subAccountCode', name: 'חניה',                 type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '60200', ...SYSTEM_DEFAULTS, vatPercent: 66.67, taxPercent: 45, reductionPercent: 0, isEquipment: false, recognitionType: RecognitionType.RECOGNIZED },
  { code: '60240', legacyCode: '5204', legacySource: 'subAccountCode', name: 'טיפולים',              type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '60200', ...SYSTEM_DEFAULTS, vatPercent: 66.67, taxPercent: 45, reductionPercent: 0, isEquipment: false, recognitionType: RecognitionType.RECOGNIZED },
  { code: '60250', legacyCode: '5205', legacySource: 'subAccountCode', name: 'כבישי אגרה',           type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '60200', ...SYSTEM_DEFAULTS, vatPercent: 66.67, taxPercent: 45, reductionPercent: 0, isEquipment: false, recognitionType: RecognitionType.RECOGNIZED },
  { code: '60260', legacyCode: '5206', legacySource: 'subAccountCode', name: 'מערכות',               type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '60200', ...SYSTEM_DEFAULTS, vatPercent: 66.67, taxPercent: 45, reductionPercent: 0, isEquipment: false, recognitionType: RecognitionType.RECOGNIZED },
  { code: '60270', legacyCode: '5207', legacySource: 'subAccountCode', name: 'תחבורה ציבורית',       type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '60200', ...SYSTEM_DEFAULTS, vatPercent: 66.67, taxPercent: 45, reductionPercent: 0, isEquipment: false, recognitionType: RecognitionType.RECOGNIZED },

  // 60300 block — תקשורת (3 children). Uses the canonical "דיור והוצאות הבית"
  // combo (25/25) — see §0 re: the stale "בית" duplicate-category rows
  // (100/100) that also currently reference old code 5300.
  { code: '60310', legacyCode: '5301', legacySource: 'subAccountCode', name: 'אינטרנט',     type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '60300', ...SYSTEM_DEFAULTS, vatPercent: 25, taxPercent: 25, reductionPercent: 0, isEquipment: false, recognitionType: RecognitionType.RECOGNIZED },
  { code: '60320', legacyCode: '5302', legacySource: 'subAccountCode', name: 'טלפון קווי',  type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '60300', ...SYSTEM_DEFAULTS, vatPercent: 25, taxPercent: 25, reductionPercent: 0, isEquipment: false, recognitionType: RecognitionType.RECOGNIZED },
  { code: '60330', legacyCode: '5303', legacySource: 'subAccountCode', name: 'פלאפון',      type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '60300', ...SYSTEM_DEFAULTS, vatPercent: 25, taxPercent: 25, reductionPercent: 0, isEquipment: false, recognitionType: RecognitionType.RECOGNIZED },

  // 60400 block — תוכנות ושירותי ענן (1 child; distinct from parent, names
  // are similar but not identical so no merge per the collision rule).
  { code: '60410', legacyCode: '5401', legacySource: 'subAccountCode', name: 'תוכנות', type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '60400', ...SYSTEM_DEFAULTS, vatPercent: 100, taxPercent: 100, reductionPercent: 0, isEquipment: false, recognitionType: RecognitionType.RECOGNIZED },

  // 60500 block — שיווק ופרסום: ZERO children (old 5501 merged into parent).

  // 60600 block — ייעוץ ושירותים מקצועיים (2 children).
  { code: '60610', legacyCode: '5601', legacySource: 'subAccountCode', name: 'ייעוץ והשתלמויות', type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '60600', ...SYSTEM_DEFAULTS, vatPercent: 100, taxPercent: 100, reductionPercent: 0, isEquipment: false, recognitionType: RecognitionType.RECOGNIZED },
  { code: '60620', legacyCode: '5602', legacySource: 'subAccountCode', name: 'ייעוץ מקצועי',     type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '60600', ...SYSTEM_DEFAULTS, vatPercent: 100, taxPercent: 100, reductionPercent: 0, isEquipment: false, recognitionType: RecognitionType.RECOGNIZED },

  // 60700 block — הנהלת חשבונות: ZERO children (old 5701 merged into parent;
  // live row עסק/רואה חשבון also merges — see parent comment above).

  // 60800 block — שכר (1 child). NAME FIX this session: the old hardcoded
  // SUBCATEGORY_SUB_ACCOUNT_CODES used subCategoryName 'שכר', but the live
  // row is actually named 'הוצאות שכר' — the old mapping's WHERE clause
  // never matched any real row under that name. Corrected here.
  { code: '60810', legacyCode: '5801', legacySource: 'subAccountCode', name: 'הוצאות שכר', type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '60800', ...SYSTEM_DEFAULTS, vatPercent: 0, taxPercent: 100, reductionPercent: 0, isEquipment: false, recognitionType: RecognitionType.RECOGNIZED },

  // 60900 block — ספרות מקצועית: ZERO children (old 5901 merged into parent).

  // 61000 block — כיבוד: ZERO children (old 6001 merged into parent).

  // 61100 block — עמלות ודמי כרטיס (2 children — kept distinct with
  // disambiguating suffixes despite the "עסק" one's name otherwise colliding
  // with the parent, because a second real card is needed here regardless).
  { code: '61110', legacyCode: '6101', legacySource: 'subAccountCode', name: 'עמלות ודמי כרטיס (עסק)',                type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '61100', ...SYSTEM_DEFAULTS, vatPercent: 0, taxPercent: 100, reductionPercent: 0, isEquipment: false, recognitionType: RecognitionType.RECOGNIZED },
  { code: '61120', legacyCode: '6102', legacySource: 'subAccountCode', name: 'עמלות ודמי כרטיס (בנק, אשראי ותנועות)', type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '61100', ...SYSTEM_DEFAULTS, vatPercent: 0, taxPercent: 25,  reductionPercent: 0, isEquipment: false, recognitionType: RecognitionType.RECOGNIZED },

  // 61200 block — הוצאות מימון (1 child).
  { code: '61210', legacyCode: '6201', legacySource: 'subAccountCode', name: 'ריבית', type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '61200', ...SYSTEM_DEFAULTS, vatPercent: 0, taxPercent: 100, reductionPercent: 0, isEquipment: false, recognitionType: RecognitionType.RECOGNIZED },

  // 61300 block — פחת (3 children). NO live default_sub_category rows exist
  // for these yet (category 'רכוש קבוע (פחת)' has zero rows in prod, despite
  // being coded in account-seed.service.ts's EXPENSE_SUBCATEGORY_PNL) — the
  // percents below are sourced from the hardcoded SUBCATEGORY_TAX_VAT_DEFAULTS
  // fallback (the only source available), NOT live DB. Flagged.
  { code: '61310', legacyCode: '6301', legacySource: 'subAccountCode', name: 'מחשב', type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '61300', ...SYSTEM_DEFAULTS, vatPercent: 100, taxPercent: 0, reductionPercent: 33.33, isEquipment: true, recognitionType: RecognitionType.RECOGNIZED },
  { code: '61320', legacyCode: '6302', legacySource: 'subAccountCode', name: 'ריהוט', type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '61300', ...SYSTEM_DEFAULTS, vatPercent: 100, taxPercent: 0, reductionPercent: 7,     isEquipment: true, recognitionType: RecognitionType.RECOGNIZED },
  { code: '61330', legacyCode: '6303', legacySource: 'subAccountCode', name: 'רכב',   type: 'expense', pnlCategory: null, displayOrder: null, sectionCode: '61300', ...SYSTEM_DEFAULTS, vatPercent: 0,   taxPercent: 0, reductionPercent: 15,    isEquipment: true, recognitionType: RecognitionType.RECOGNIZED },

  // ── 3e. New technical accounts (D14 decision 3 + this session's 90400) ──
  // Codes/readings for 90100–90300 confirmed with Elazar 2026-07-10 (Session
  // 2): 90200 = VAT-remittance clearing, distinct from 2400/2410.
  { code: '90100', legacyCode: null, legacySource: null, name: 'מקדמות מס הכנסה',           type: 'asset', pnlCategory: null, displayOrder: null, sectionCode: null, ...SYSTEM_DEFAULTS, ...NOT_APPLICABLE_LAW },
  { code: '90200', legacyCode: null, legacySource: null, name: 'גביית מע"מ',                type: 'asset', pnlCategory: null, displayOrder: null, sectionCode: null, ...SYSTEM_DEFAULTS, ...NOT_APPLICABLE_LAW },
  { code: '90300', legacyCode: null, legacySource: null, name: 'מקדמות ביטוח לאומי',       type: 'asset', pnlCategory: null, displayOrder: null, sectionCode: null, ...SYSTEM_DEFAULTS, ...NOT_APPLICABLE_LAW },
  // NEW this session — withholding tax the business's CLIENTS deducted at
  // source from payments made to it (an asset: offsettable against the
  // business's own income-tax liability), same technical-account pattern as
  // the three above. Section/percents not applicable, same as its siblings.
  { code: '90400', legacyCode: null, legacySource: null, name: 'מס במקור שנוכה מלקוחות',   type: 'asset', pnlCategory: null, displayOrder: null, sectionCode: null, ...SYSTEM_DEFAULTS, ...NOT_APPLICABLE_LAW },
];

/**
 * Secondary old subAccountCodes that got MERGED into an existing account
 * (name-identical to their block, or redirected to a different block
 * entirely) rather than becoming their own child — so they can't be derived
 * from a CHART_ACCOUNTS row's own `legacyCode` (that slot is already used by
 * the block's primary old accountCode). Each of these was a dev-only
 * subAccountCode, never present in production (schema-drift.md Gap 1).
 */
const MERGED_SUBACCOUNT_MIGRATIONS: Pick<AccountCodeMigration, 'oldCode' | 'newCode' | 'source'>[] = [
  { oldCode: '5103', newCode: '60100', source: 'subAccountCode' }, // עסק/הוצאות משרד — merged into parent (name-identical)
  { oldCode: '5107', newCode: '60000', source: 'subAccountCode' }, // דיור והוצאות הבית/שכירות — redirected, NOT recognized in live data (see §0)
  { oldCode: '5501', newCode: '60500', source: 'subAccountCode' }, // עסק/שיווק ופרסום — merged into parent (name-identical)
  { oldCode: '5701', newCode: '60700', source: 'subAccountCode' }, // עסק/הנהלת חשבונות — merged into parent (name-identical)
  { oldCode: '5901', newCode: '60900', source: 'subAccountCode' }, // עסק/ספרות מקצועית — merged into parent (name-identical)
  { oldCode: '6001', newCode: '61000', source: 'subAccountCode' }, // עסק/כיבוד — merged into parent (name-identical)
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
 * Leumi — those remap to 90300, not 60000/60010.
 *
 * Balance-sheet/technical codes 1000/1100/1110/1120/1200/2000/2100/2400/2410
 * are intentionally absent — unchanged, nothing to migrate.
 */
export const ACCOUNT_CODE_MIGRATION: Pick<AccountCodeMigration, 'oldCode' | 'newCode' | 'source'>[] = [
  ...CHART_ACCOUNTS
    .filter((a): a is ChartAccountSeed & { legacyCode: string; legacySource: 'accountCode' | 'subAccountCode' } =>
      a.legacyCode !== null && a.legacyCode !== a.code,
    )
    .map((a) => ({ oldCode: a.legacyCode, newCode: a.code, source: a.legacySource })),
  ...MERGED_SUBACCOUNT_MIGRATIONS,
];
