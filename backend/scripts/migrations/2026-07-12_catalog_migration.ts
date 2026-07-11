/**
 * Phase 2.2 — migrates the four legacy catalog tables (default_category,
 * default_sub_category, user_category, user_sub_category) into the new
 * two-table model (category, sub_category — D1/D3/D4/D5).
 *
 * Two modes sharing 100% of the resolution logic so the reviewed plan can
 * never drift from what actually gets applied:
 *
 *   MODE=review (default) — resolves every row, writes
 *     docs/redesign/phase2-catalog-review.md, writes NOTHING to the DB.
 *   MODE=apply CONFIRM=yes — re-runs the identical resolution inside one
 *     transaction, writes category/sub_category/booking_account rows, then
 *     dumps what was inserted for cutover.sql. Refuses without CONFIRM=yes.
 *
 * MODE=apply must not run until the review doc has been read and explicitly
 * signed off — that gate is enforced by process, not by this script.
 *
 * Must run against keepintax_prodcopy, not the configured dev DB (same
 * guard-rail pattern as generate-baseline-reports.ts):
 *
 *   DB_DATABASE=keepintax_prodcopy NODE_ENV=production SKIP_BOOT_SEED=true \
 *     npx ts-node -r tsconfig-paths/register scripts/migrations/2026-07-12_catalog_migration.ts
 *
 * Reads use raw dataSource.query() with explicit column lists for all four
 * legacy tables — never their TypeORM repositories, and never select
 * subAccountCode (schema-drift.md Gap 1: that column doesn't exist in
 * production; reading it via a repo against a NODE_ENV=production-booted
 * keepintax_prodcopy throws "Unknown column").
 */
import { NestFactory } from '@nestjs/core';
import { DataSource, EntityManager } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from '../../src/app.module';
import { CHART_ACCOUNTS, ACCOUNT_CODE_MIGRATION } from '../../src/bookkeeping/chart.seed';
import { Category } from '../../src/bookkeeping/category.entity';
import { SubCategory } from '../../src/bookkeeping/sub-category.entity';
import { BookingAccount } from '../../src/bookkeeping/account.entity';
import { CategoryType, ApprovalStatus, OwnerType, ExpenseReportScope, SYSTEM_CHART_OWNER_KEY } from '../../src/enum';

/** Parent category for the two ANNUAL merge groups — both source rows'
 *  original categories ("עסק" and "החזרי מס ודוח שנתי") aren't a clean fit
 *  post-merge (the merged row is purely an annual-report item, not tied to
 *  either), so both land under "החזרי מס ודוח שנתי", which already houses
 *  every other D14 bucket-2 ANNUAL SYSTEM row — keeps every ANNUAL item
 *  under one category rather than splitting them across two. */
const ANNUAL_MERGE_PARENT_CATEGORY = 'החזרי מס ודוח שנתי';

const MODE = process.env.MODE === 'apply' ? 'apply' : 'review';
const REVIEW_OUT = path.resolve(__dirname, '../../../docs/redesign/phase2-catalog-review.md');

// ── legacy row shapes (explicit column lists only, matching the raw SELECTs below) ──

interface LegacyCategory {
  id: number;
  categoryName: string;
  isExpense: boolean;
  accountCode: string | null;
}

interface LegacyUserCategory extends LegacyCategory {
  firebaseId: string;
  businessNumber: string;
}

interface LegacySubCategory {
  id: number;
  subCategoryName: string;
  categoryName: string;
  taxPercent: string | number;
  vatPercent: string | number;
  reductionPercent: string | number;
  isEquipment: boolean;
  isRecognized: boolean;
  isExpense: boolean;
  necessity: string;
  reportScope: string;
  pnlCategory: string | null;
  accountCode: string | null;
}

interface LegacyUserSubCategory extends LegacySubCategory {
  firebaseId: string;
  businessNumber: string;
}

// ── exclusions (D15 Correction #2 — documented-dead duplicate categories, re-verified below) ──

const EXCLUDED_CATEGORY_NAMES = new Set(['בית', 'בנקים וכרטיסי אשראי']);

// ── D14 bucket 1 — household/private: ALL children of these categories ──

const PRIVATE_CATEGORY_NAMES = new Set(['אוכל וצריכה שוטפת', 'ילדים ומשפחה', 'פנאי וחופשות', 'קניות']);

// D14 bucket 1 — בריאות: only these NAMED children (not the whole category)
const PRIVATE_SUBCATEGORY_NAMES = new Set(['רופא', 'תרופות', 'בדיקות', 'ביטוח בריאות', 'קופת חולים']);

// ── D14 bucket 2 — annual-report items (subCategoryName-keyed singletons) ──
//
// 'תרומה' (user_sub_category id 11, CLIENT_200866028, category "שונות") added
// per Elazar's explicit sign-off: NOT merged into the SYSTEM "תרומות מוכרות"
// row (name not exact-matched, no silent guess) — kept as its own CLIENT
// sub_category, own name preserved, just given the same ANNUAL/no-account
// treatment as the D14 bucket 2 items.
const ANNUAL_SUBCATEGORY_NAMES = new Set(['תרומות מוכרות', 'ביטוח חיים', 'ביטוח אובדן כושר עבודה', 'תרומה']);

// ── D14 bucket 2 + this session's confirmed extension — duplicate-naming merges into ONE ANNUAL sub_category ──

interface AnnualMerge { mergeInto: string; memberSubCategoryNames: string[] }
const ANNUAL_MERGES: AnnualMerge[] = [
  { mergeInto: 'הפקדה לפנסיה', memberSubCategoryNames: ['הפקדה לקרן פנסיה', 'הפקדה לפנסיה (עצמאי)'] },
  { mergeInto: 'הפקדה לקרן השתלמות', memberSubCategoryNames: ['הפקדה לקרן השתלמות', 'הפקדה לקרן השתלמות (עצמאי)'] },
];

// ── D14 bucket 3 + D15 — business payments that are not P&L expenses, and this session's edge-case accounts ──

interface AccountOverride { categoryName?: string; subCategoryName: string; targetCode: string; note: string }
const ACCOUNT_OVERRIDES: AccountOverride[] = [
  { categoryName: 'עסק', subCategoryName: 'מקדמות ביטוח לאומי', targetCode: '90300', note: 'D14 bucket 3 / D15 — Bituach Leumi advances, not P&L' },
  { subCategoryName: 'מקדמות מס הכנסה', targetCode: '90100', note: 'D14 bucket 3' },
  { subCategoryName: 'גביית מע"מ', targetCode: '90200', note: 'D14 bucket 3' },
  { subCategoryName: 'ביט', targetCode: '90500', note: 'this session — internal account transfers' },
  { subCategoryName: 'בין חשבונותי', targetCode: '90500', note: 'this session — internal account transfers' },
  { subCategoryName: 'חיוב אשראי חודשי', targetCode: '90500', note: 'this session — internal account transfers' },
  { subCategoryName: 'משיכת מזומן', targetCode: '90500', note: 'this session — internal account transfers' },
  { subCategoryName: 'פייבוקס', targetCode: '90500', note: 'this session — internal account transfers' },
  { subCategoryName: 'פרעון הלוואה', targetCode: '90600', note: 'this session — loan principal repayment' },
];

type Disposition =
  | { kind: 'ACCOUNT'; code: string; codeName: string; source: string }
  | { kind: 'PRIVATE'; source: string }
  | { kind: 'ANNUAL'; mergeInto?: string; source: string }
  | { kind: 'MISSING_MAPPING'; source: string }
  | { kind: 'UNRESOLVED' };

const chartAccountByCode = new Map(CHART_ACCOUNTS.map((a) => [a.code, a]));
const chartAccountByName = new Map(CHART_ACCOUNTS.map((a) => [a.name, a]));
const accountCodeMigrationMap = new Map(ACCOUNT_CODE_MIGRATION.map((m) => [m.oldCode, m.newCode]));

function overrideFor(categoryName: string, subCategoryName: string): AccountOverride | undefined {
  return ACCOUNT_OVERRIDES.find(
    (o) => o.subCategoryName === subCategoryName && (!o.categoryName || o.categoryName === categoryName),
  );
}

function annualMergeFor(subCategoryName: string): AnnualMerge | undefined {
  return ANNUAL_MERGES.find((m) => m.memberSubCategoryNames.includes(subCategoryName));
}

/**
 * Resolve one (categoryName, subCategoryName, accountCode) triple to its
 * Phase 2 disposition. Order: explicit override table → D14 private/annual
 * buckets → exact name match against CHART_ACCOUNTS → old accountCode via
 * ACCOUNT_CODE_MIGRATION → unresolved.
 */
function resolveDisposition(categoryName: string, subCategoryName: string, oldAccountCode: string | null): Disposition {
  const merge = annualMergeFor(subCategoryName);
  if (merge) return { kind: 'ANNUAL', mergeInto: merge.mergeInto, source: 'ANNUAL_MERGE' };

  if (ANNUAL_SUBCATEGORY_NAMES.has(subCategoryName)) return { kind: 'ANNUAL', source: 'D14 bucket 2' };

  if (PRIVATE_CATEGORY_NAMES.has(categoryName)) return { kind: 'PRIVATE', source: 'D14 bucket 1 (category)' };
  if (categoryName === 'בריאות וביטוחים' && PRIVATE_SUBCATEGORY_NAMES.has(subCategoryName)) {
    return { kind: 'PRIVATE', source: 'D14 bucket 1 (בריאות וביטוחים named child)' };
  }

  const override = overrideFor(categoryName, subCategoryName);
  if (override) {
    const acct = chartAccountByCode.get(override.targetCode);
    return { kind: 'ACCOUNT', code: override.targetCode, codeName: acct?.name ?? '?', source: `override: ${override.note}` };
  }

  const nameMatch = chartAccountByName.get(subCategoryName);
  if (nameMatch) return { kind: 'ACCOUNT', code: nameMatch.code, codeName: nameMatch.name, source: 'name match vs CHART_ACCOUNTS' };

  if (oldAccountCode) {
    const newCode = accountCodeMigrationMap.get(oldAccountCode) ?? (chartAccountByCode.has(oldAccountCode) ? oldAccountCode : null);
    if (newCode) {
      const acct = chartAccountByCode.get(newCode);
      return { kind: 'ACCOUNT', code: newCode, codeName: acct?.name ?? '?', source: `accountCode fallback (${oldAccountCode} → ${newCode})` };
    }
  }

  return { kind: 'UNRESOLVED' };
}

interface ReviewRow {
  sourceTable: string;
  oldId: number;
  ownerScope: string;
  categoryName: string;
  subCategoryName: string;
  disposition: Disposition;
}

interface VariantCase {
  userSubCategoryId: number;
  firebaseId: string;
  businessNumber: string;
  categoryName: string;
  subCategoryName: string;
  ownPercents: { tax: number; vat: number; red: number; eq: boolean };
  baseTarget: { code: string; name: string } | null;
  baseTargetPercents: { tax: number | null; vat: number | null; red: number | null; eq: boolean | null } | null;
  differs: boolean;
}

function fmtDisposition(d: Disposition): string {
  if (d.kind === 'ACCOUNT') return `${d.code} ${d.codeName}`;
  if (d.kind === 'PRIVATE') return 'PRIVATE';
  if (d.kind === 'ANNUAL') return d.mergeInto ? `ANNUAL (merge → "${d.mergeInto}")` : 'ANNUAL';
  if (d.kind === 'MISSING_MAPPING') return 'MISSING_ACCOUNTING_MAPPING (migrated, no card yet)';
  return 'UNRESOLVED';
}

async function main() {
  if (!process.env.DB_DATABASE || process.env.DB_DATABASE === 'keepintax-dev') {
    throw new Error(
      `Refusing to run against DB_DATABASE=${process.env.DB_DATABASE}. ` +
      `Set DB_DATABASE=keepintax_prodcopy explicitly before running this script.`,
    );
  }
  if (MODE === 'apply' && process.env.CONFIRM !== 'yes') {
    throw new Error('MODE=apply requires CONFIRM=yes — refusing to write without explicit confirmation.');
  }
  console.log(`[catalog_migration] MODE=${MODE} target database: ${process.env.DB_DATABASE}`);

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
  const dataSource = app.get(DataSource);

  // ── re-verify the D15 Correction #2 zero-usage premise before excluding ──
  const excludedList = [...EXCLUDED_CATEGORY_NAMES];
  const expenseUsage: { category: string; n: string }[] = await dataSource.query(
    `SELECT category, COUNT(*) as n FROM expense WHERE category IN (?, ?) GROUP BY category`,
    excludedList,
  );
  const ruleUsage: { category: string; n: string }[] = await dataSource.query(
    `SELECT category, COUNT(*) as n FROM classified_transactions WHERE category IN (?, ?) GROUP BY category`,
    excludedList,
  );
  if (expenseUsage.length || ruleUsage.length) {
    throw new Error(
      `EXCLUDED_CATEGORY_NAMES premise no longer holds — live usage found: ` +
      `expense=${JSON.stringify(expenseUsage)} rules=${JSON.stringify(ruleUsage)}. STOP, per Execution Rule 5.`,
    );
  }
  console.log('[catalog_migration] re-verified: zero live usage of excluded duplicate categories (D15 Correction #2)');

  // ── reads: raw SQL only, explicit columns, never subAccountCode ──
  const defaultCategories: LegacyCategory[] = await dataSource.query(
    `SELECT id, categoryName, isExpense, accountCode FROM default_category`,
  );
  const defaultSubCategories: LegacySubCategory[] = await dataSource.query(
    `SELECT id, subCategoryName, categoryName, taxPercent, vatPercent, reductionPercent,
            isEquipment, isRecognized, isExpense, necessity, reportScope, pnlCategory, accountCode
     FROM default_sub_category`,
  );
  const userCategories: LegacyUserCategory[] = await dataSource.query(
    `SELECT id, categoryName, firebaseId, businessNumber, isExpense, accountCode FROM user_category`,
  );
  const userSubCategories: LegacyUserSubCategory[] = await dataSource.query(
    `SELECT id, firebaseId, businessNumber, subCategoryName, categoryName, taxPercent, vatPercent,
            reductionPercent, isEquipment, isRecognized, isExpense, necessity, reportScope, pnlCategory, accountCode
     FROM user_sub_category`,
  );
  console.log(
    `[catalog_migration] read ${defaultCategories.length} default_category, ${defaultSubCategories.length} default_sub_category, ` +
    `${userCategories.length} user_category, ${userSubCategories.length} user_sub_category`,
  );

  // ── categories ──
  const includedDefaultCategories = defaultCategories.filter((c) => !EXCLUDED_CATEGORY_NAMES.has(c.categoryName));
  const excludedDefaultCategories = defaultCategories.filter((c) => EXCLUDED_CATEGORY_NAMES.has(c.categoryName));
  const conflictingUserCategories = userCategories.filter((c) => EXCLUDED_CATEGORY_NAMES.has(c.categoryName));
  if (conflictingUserCategories.length) {
    throw new Error(
      `user_category row(s) reference an excluded duplicate category — do not silently drop CLIENT data: ` +
      JSON.stringify(conflictingUserCategories),
    );
  }

  // ── sub_categories: default_sub_category ──
  const reviewRows: ReviewRow[] = [];
  const unresolved: ReviewRow[] = [];
  const excludedRows: ReviewRow[] = [];

  for (const sc of defaultSubCategories) {
    const row: ReviewRow = {
      sourceTable: 'default_sub_category',
      oldId: sc.id,
      ownerScope: 'SYSTEM',
      categoryName: sc.categoryName,
      subCategoryName: sc.subCategoryName,
      disposition: { kind: 'UNRESOLVED' },
    };
    if (EXCLUDED_CATEGORY_NAMES.has(sc.categoryName)) {
      row.disposition = { kind: 'UNRESOLVED' };
      excludedRows.push(row);
      continue;
    }
    row.disposition = resolveDisposition(sc.categoryName, sc.subCategoryName, sc.accountCode);
    reviewRows.push(row);
    if (row.disposition.kind === 'UNRESOLVED') unresolved.push(row);
  }

  // ── sub_categories: user_sub_category (CLIENT), + percent-variant detection ──
  const variantCases: VariantCase[] = [];
  const missingMapping: ReviewRow[] = [];
  const unmatchedParents: { id: number; categoryName: string; businessNumber: string }[] = [];

  for (const sc of userSubCategories) {
    let disposition = resolveDisposition(sc.categoryName, sc.subCategoryName, sc.accountCode);
    // D5's explicit design for exactly this case: a CLIENT sub_category with
    // no resolvable card still gets created (so Phase 3.2's expense backfill
    // has something to attach to) — just unmapped, pending an accountant.
    // Only applies to CLIENT rows; SYSTEM (default_sub_category) rows with
    // no resolution are a genuine open question, left UNRESOLVED for Elazar.
    if (disposition.kind === 'UNRESOLVED') {
      disposition = { kind: 'MISSING_MAPPING', source: 'D5 — CLIENT row, no resolvable card, migrated unmapped' };
    }
    const row: ReviewRow = {
      sourceTable: 'user_sub_category',
      oldId: sc.id,
      ownerScope: `CLIENT_${sc.businessNumber}`,
      categoryName: sc.categoryName,
      subCategoryName: sc.subCategoryName,
      disposition,
    };
    reviewRows.push(row);
    if (row.disposition.kind === 'MISSING_MAPPING') missingMapping.push(row);

    // parent category resolution: CLIENT-scoped name match, else SYSTEM
    const hasClientParent = userCategories.some((c) => c.businessNumber === sc.businessNumber && c.categoryName === sc.categoryName);
    const hasSystemParent = includedDefaultCategories.some((c) => c.categoryName === sc.categoryName);
    if (!hasClientParent && !hasSystemParent) {
      unmatchedParents.push({ id: sc.id, categoryName: sc.categoryName, businessNumber: sc.businessNumber });
    }

    // percent-variant check (only meaningful when the disposition resolved to a real account)
    if (row.disposition.kind === 'ACCOUNT') {
      const target = chartAccountByCode.get(row.disposition.code);
      const own = {
        tax: Number(sc.taxPercent),
        vat: Number(sc.vatPercent),
        red: Number(sc.reductionPercent),
        eq: !!sc.isEquipment,
      };
      // Technical/balance/income accounts (NOT_APPLICABLE_LAW — recognitionType
      // null) carry no percents by design (D14 bucket 3 etc.) — comparing an
      // expense-shaped percent set against them is a category error, not a
      // genuine D1 variant-card case. Only compare when the target is a real
      // expense card (recognitionType set).
      const targetPercents = target && target.recognitionType != null
        ? { tax: target.taxPercent, vat: target.vatPercent, red: target.reductionPercent, eq: target.isEquipment }
        : null;
      const differs = !!targetPercents && (
        Number(targetPercents.tax) !== own.tax ||
        Number(targetPercents.vat) !== own.vat ||
        Number(targetPercents.red ?? 0) !== own.red ||
        !!targetPercents.eq !== own.eq
      );
      if (differs) {
        variantCases.push({
          userSubCategoryId: sc.id,
          firebaseId: sc.firebaseId,
          businessNumber: sc.businessNumber,
          categoryName: sc.categoryName,
          subCategoryName: sc.subCategoryName,
          ownPercents: own,
          baseTarget: target ? { code: target.code, name: target.name } : null,
          baseTargetPercents: targetPercents,
          differs: true,
        });
      }
    }
  }

  // ── completeness assertion ──
  const totalLegacy = defaultSubCategories.length + userSubCategories.length;
  const totalAccountedFor = reviewRows.length + excludedRows.length;
  if (totalAccountedFor !== totalLegacy) {
    throw new Error(`Completeness check failed: ${totalAccountedFor} accounted for vs ${totalLegacy} legacy rows.`);
  }
  console.log(`[catalog_migration] completeness OK: ${totalAccountedFor}/${totalLegacy} legacy sub-category rows accounted for`);

  // ── write review doc ──
  const lines: string[] = [];
  lines.push('# Phase 2.2 catalog migration — review table');
  lines.push('');
  lines.push(`Generated ${new Date().toISOString()} by \`backend/scripts/migrations/2026-07-12_catalog_migration.ts\` (MODE=review), against \`${process.env.DB_DATABASE}\`.`);
  lines.push('');
  lines.push('**No writes have been made.** This is a dry run of the Phase 2.2 data migration for sign-off before `MODE=apply` runs.');
  lines.push('');
  lines.push(`Categories: ${defaultCategories.length} default_category (${includedDefaultCategories.length} migrated, ${excludedDefaultCategories.length} excluded) + ${userCategories.length} user_category (CLIENT) = ${includedDefaultCategories.length + userCategories.length} \`category\` rows.`);
  lines.push('');
  lines.push(`Sub-categories: ${defaultSubCategories.length} default_sub_category + ${userSubCategories.length} user_sub_category legacy rows → ${reviewRows.length} migrated (${missingMapping.length} of them MISSING_ACCOUNTING_MAPPING, some collapse via ANNUAL merges), ${excludedRows.length} excluded (dead duplicate categories), ${unresolved.length} SYSTEM rows genuinely unresolved (need a decision).`);
  lines.push('');

  lines.push('## Excluded categories (D15 Correction #2 — re-verified zero live usage)');
  lines.push('');
  lines.push('These categoryName values have no matching `default_category` row at all (confirmed: default_category has 12 rows, none named "בית"/"בנקים וכרטיסי אשראי") — they only ever existed as orphan `default_sub_category.categoryName` strings. Excluded per the already-approved Correction #2.');
  lines.push('');
  if (!excludedRows.length) {
    lines.push('None found in this run.');
  } else {
    lines.push('| Source table | Old id | Category → SubCategory |');
    lines.push('|---|---|---|');
    for (const r of excludedRows) lines.push(`| ${r.sourceTable} | ${r.oldId} | ${r.categoryName} → ${r.subCategoryName} |`);
  }
  lines.push('');

  lines.push('## Resolved sub_category rows');
  lines.push('');
  lines.push('| Source table | Old id | Owner scope | Category → SubCategory | Disposition |');
  lines.push('|---|---|---|---|---|');
  for (const r of reviewRows) {
    if (r.disposition.kind === 'UNRESOLVED') continue;
    lines.push(`| ${r.sourceTable} | ${r.oldId} | ${r.ownerScope} | ${r.categoryName} → ${r.subCategoryName} | ${fmtDisposition(r.disposition)} |`);
  }
  lines.push('');

  lines.push('## Percent-variant cases (user_sub_category whose percents differ from the resolved target card)');
  lines.push('');
  if (!variantCases.length) {
    lines.push('None found.');
  } else {
    lines.push('| user_sub_category id | firebaseId / businessNumber | Category → SubCategory | Own (tax/vat/red/eq) | Base target | Base target (tax/vat/red/eq) | Needs new variant code |');
    lines.push('|---|---|---|---|---|---|---|');
    for (const v of variantCases) {
      const own = `${v.ownPercents.tax}/${v.ownPercents.vat}/${v.ownPercents.red}/${v.ownPercents.eq ? 'Y' : 'N'}`;
      const base = v.baseTargetPercents ? `${v.baseTargetPercents.tax}/${v.baseTargetPercents.vat}/${v.baseTargetPercents.red}/${v.baseTargetPercents.eq ? 'Y' : 'N'}` : '?';
      lines.push(`| ${v.userSubCategoryId} | ${v.firebaseId} / ${v.businessNumber} | ${v.categoryName} → ${v.subCategoryName} | ${own} | ${v.baseTarget ? `${v.baseTarget.code} ${v.baseTarget.name}` : '?'} | ${base} | YES — CLIENT 80000-range code allocated at apply time |`);
    }
  }
  lines.push('');

  lines.push('## Unmatched CLIENT sub_category parents (no CLIENT or SYSTEM category by that name)');
  lines.push('');
  if (!unmatchedParents.length) {
    lines.push('None found.');
  } else {
    for (const u of unmatchedParents) lines.push(`- user_sub_category id ${u.id}, businessNumber ${u.businessNumber}, categoryName "${u.categoryName}" — needs manual review`);
  }
  lines.push('');

  lines.push('## MISSING_ACCOUNTING_MAPPING (CLIENT rows migrated unmapped, per D5)');
  lines.push('');
  lines.push('No override, no name match, no accountCode fallback for these CLIENT rows — per D5, a CLIENT sub_category with no resolvable card is still created (accountId=NULL, approvalStatus=MISSING_ACCOUNTING_MAPPING) rather than dropped, so Phase 3.2\'s expense backfill has something real to attach to. An accountant completes the mapping later (D9).');
  lines.push('');
  if (!missingMapping.length) {
    lines.push('None found.');
  } else {
    lines.push('| user_sub_category id | Owner scope | Category → SubCategory |');
    lines.push('|---|---|---|');
    for (const r of missingMapping) lines.push(`| ${r.oldId} | ${r.ownerScope} | ${r.categoryName} → ${r.subCategoryName} |`);
  }
  lines.push('');

  lines.push('## Unresolved SYSTEM rows (no override, no name match, no accountCode fallback — NOT migrated, needs Elazar\'s decision)');
  lines.push('');
  if (!unresolved.length) {
    lines.push('None — every SYSTEM row resolved.');
  } else {
    lines.push('| Source table | Old id | Owner scope | Category → SubCategory |');
    lines.push('|---|---|---|---|');
    for (const r of unresolved) lines.push(`| ${r.sourceTable} | ${r.oldId} | ${r.ownerScope} | ${r.categoryName} → ${r.subCategoryName} |`);
  }
  lines.push('');

  lines.push('## PROPOSED dispositions requiring explicit confirmation before apply');
  lines.push('');
  lines.push('- קרן השתלמות merge (עסק/הפקדה לקרן השתלמות + החזרי מס/הפקדה לקרן השתלמות (עצמאי) → ONE ANNUAL sub_category) — **CONFIRMED** by Elazar this session, same pattern as the pension merge.');
  lines.push('- Internal account transfers (ביט, בין חשבונותי, חיוב אשראי חודשי, משיכת מזומן, פייבוקס) → new account 90500 — **CONFIRMED** this session.');
  lines.push('- Loan principal repayment (פרעון הלוואה) → new account 90600 — **CONFIRMED** this session (account 1000 checked and rejected as a target — vestigial, never-posted-to placeholder).');
  lines.push('- Orphan "בית"/"בנקים וכרטיסי אשראי" exclusion — **APPROVED**, zero-usage verification is what matters, not the exact table-level shape.');
  lines.push('- 7 MISSING_ACCOUNTING_MAPPING CLIENT rows — **APPROVED** as correct D5 behavior, kept as-is.');
  lines.push('- user_sub_category id 11 ("שונות → תרומה") — **APPROVED**: own CLIENT sub_category, own name preserved, reportScope=ANNUAL, no account. NOT merged into "תרומות מוכרות".');
  lines.push('');

  fs.mkdirSync(path.dirname(REVIEW_OUT), { recursive: true });
  fs.writeFileSync(REVIEW_OUT, lines.join('\n'));
  console.log(`[catalog_migration] wrote ${REVIEW_OUT}`);

  if (MODE === 'review') {
    console.log('[catalog_migration] MODE=review complete — no writes made. Awaiting sign-off before MODE=apply.');
    await app.close();
    return;
  }

  // ── MODE=apply: re-derive the identical plan, write it in one transaction ──
  console.log('[catalog_migration] MODE=apply — writing category/sub_category/booking_account rows...');

  const insertedCategoryIds: number[] = [];
  const insertedSubCategoryIds: number[] = [];
  const insertedAccountCodes: string[] = [];

  await dataSource.transaction(async (manager: EntityManager) => {
    const categoryRepo = manager.getRepository(Category);
    const subCategoryRepo = manager.getRepository(SubCategory);
    const bookingAccountRepo = manager.getRepository(BookingAccount);

    // 1. Ensure this session's new technical accounts (90500/90600) exist.
    for (const code of ['90500', '90600']) {
      const existing = await bookingAccountRepo.findOne({ where: { chartOwnerKey: SYSTEM_CHART_OWNER_KEY, code } });
      if (existing) continue;
      const chartRow = chartAccountByCode.get(code);
      if (!chartRow) throw new Error(`chart.seed.ts has no CHART_ACCOUNTS entry for ${code}`);
      const saved = await bookingAccountRepo.save(bookingAccountRepo.create({
        code: chartRow.code,
        name: chartRow.name,
        type: chartRow.type,
        pnlCategory: chartRow.pnlCategory,
        displayOrder: chartRow.displayOrder,
        section: null,
        sectionId: null,
        code6111: chartRow.code6111,
        vatPercent: chartRow.vatPercent,
        taxPercent: chartRow.taxPercent,
        reductionPercent: chartRow.reductionPercent,
        isEquipment: chartRow.isEquipment,
        recognitionType: chartRow.recognitionType,
        ownerType: chartRow.ownerType,
        chartOwnerKey: chartRow.chartOwnerKey,
        isActive: chartRow.isActive,
      }));
      insertedAccountCodes.push(saved.code);
      console.log(`[catalog_migration] inserted booking_account ${saved.code} ${saved.name} (id ${saved.id})`);
    }

    const allSystemAccounts = await bookingAccountRepo.find({ where: { chartOwnerKey: SYSTEM_CHART_OWNER_KEY } });
    const accountIdByCode = new Map(allSystemAccounts.map((a) => [a.code, a.id]));

    // 2. SYSTEM categories (default_category, none excluded at this level — verified above).
    const categoryIdByKey = new Map<string, number>();
    for (const c of includedDefaultCategories) {
      const saved = await categoryRepo.save(categoryRepo.create({
        name: c.categoryName,
        type: c.isExpense ? CategoryType.EXPENSE : CategoryType.INCOME,
        defaultRecognitionType: null,
        ownerType: OwnerType.SYSTEM,
        chartOwnerKey: SYSTEM_CHART_OWNER_KEY,
        isDefault: true,
        isActive: true,
      }));
      insertedCategoryIds.push(saved.id);
      categoryIdByKey.set(`${SYSTEM_CHART_OWNER_KEY}::${c.categoryName}`, saved.id);
    }

    // 3. CLIENT categories (user_category).
    for (const c of userCategories) {
      const key = `CLIENT_${c.businessNumber}`;
      const saved = await categoryRepo.save(categoryRepo.create({
        name: c.categoryName,
        type: c.isExpense ? CategoryType.EXPENSE : CategoryType.INCOME,
        defaultRecognitionType: null,
        ownerType: OwnerType.CLIENT,
        chartOwnerKey: key,
        userId: c.firebaseId,
        businessNumber: c.businessNumber,
        isDefault: false,
        createdByUserId: c.firebaseId,
        isActive: true,
      }));
      insertedCategoryIds.push(saved.id);
      categoryIdByKey.set(`${key}::${c.categoryName}`, saved.id);
    }

    // 4. SYSTEM sub_categories (default_sub_category), collapsing ANNUAL_MERGES into one row each.
    const mergeSubCategoryId = new Map<string, number>();
    for (const sc of defaultSubCategories) {
      if (EXCLUDED_CATEGORY_NAMES.has(sc.categoryName)) continue;

      const disposition = resolveDisposition(sc.categoryName, sc.subCategoryName, sc.accountCode);
      if (disposition.kind === 'UNRESOLVED') {
        throw new Error(`Unresolved SYSTEM row at apply time (was resolved at review time?): id ${sc.id} ${sc.categoryName}/${sc.subCategoryName}`);
      }

      if (disposition.kind === 'ANNUAL' && disposition.mergeInto) {
        if (!mergeSubCategoryId.has(disposition.mergeInto)) {
          const categoryId = categoryIdByKey.get(`${SYSTEM_CHART_OWNER_KEY}::${ANNUAL_MERGE_PARENT_CATEGORY}`);
          if (!categoryId) throw new Error(`No SYSTEM category id for merge parent "${ANNUAL_MERGE_PARENT_CATEGORY}"`);
          const saved = await subCategoryRepo.save(subCategoryRepo.create({
            categoryId,
            name: disposition.mergeInto,
            isPrivate: false,
            accountId: null,
            reportScope: ExpenseReportScope.ANNUAL,
            ownerType: OwnerType.SYSTEM,
            chartOwnerKey: SYSTEM_CHART_OWNER_KEY,
            approvalStatus: ApprovalStatus.APPROVED,
            isDefault: true,
            isActive: true,
          }));
          mergeSubCategoryId.set(disposition.mergeInto, saved.id);
          insertedSubCategoryIds.push(saved.id);
          console.log(`[catalog_migration] inserted merged ANNUAL sub_category "${disposition.mergeInto}" (id ${saved.id})`);
        }
        continue; // subsequent members of the same merge group point at the same row, no separate insert
      }

      const categoryId = categoryIdByKey.get(`${SYSTEM_CHART_OWNER_KEY}::${sc.categoryName}`);
      if (!categoryId) throw new Error(`No SYSTEM category id for "${sc.categoryName}" (sub_category id ${sc.id})`);

      let isPrivate = false;
      let accountId: number | null = null;
      let reportScope = ExpenseReportScope.PNL;
      if (disposition.kind === 'PRIVATE') {
        isPrivate = true;
      } else if (disposition.kind === 'ANNUAL') {
        reportScope = ExpenseReportScope.ANNUAL;
      } else if (disposition.kind === 'ACCOUNT') {
        const id = accountIdByCode.get(disposition.code);
        if (!id) throw new Error(`No booking_account id for code ${disposition.code} (sub_category id ${sc.id})`);
        accountId = id;
      }

      const saved = await subCategoryRepo.save(subCategoryRepo.create({
        categoryId,
        name: sc.subCategoryName,
        isPrivate,
        accountId,
        reportScope,
        ownerType: OwnerType.SYSTEM,
        chartOwnerKey: SYSTEM_CHART_OWNER_KEY,
        approvalStatus: ApprovalStatus.APPROVED,
        isDefault: true,
        isActive: true,
      }));
      insertedSubCategoryIds.push(saved.id);
    }

    // 5. CLIENT sub_categories (user_sub_category). Percent-variant handling
    //    intentionally omitted here — MODE=review found 0 genuine variant
    //    cases this run; if any appear at apply time (DB state changed since
    //    review), fail loudly rather than silently allocate a new card.
    for (const sc of userSubCategories) {
      let disposition = resolveDisposition(sc.categoryName, sc.subCategoryName, sc.accountCode);
      let approvalStatus = ApprovalStatus.APPROVED;
      if (disposition.kind === 'UNRESOLVED') {
        disposition = { kind: 'MISSING_MAPPING', source: 'D5 — CLIENT row, no resolvable card, migrated unmapped' };
      }
      if (disposition.kind === 'MISSING_MAPPING') approvalStatus = ApprovalStatus.MISSING_ACCOUNTING_MAPPING;

      if (disposition.kind === 'ACCOUNT') {
        const target = chartAccountByCode.get(disposition.code);
        if (target && target.recognitionType != null) {
          const own = { tax: Number(sc.taxPercent), vat: Number(sc.vatPercent), red: Number(sc.reductionPercent), eq: !!sc.isEquipment };
          const differs =
            Number(target.taxPercent) !== own.tax ||
            Number(target.vatPercent) !== own.vat ||
            Number(target.reductionPercent ?? 0) !== own.red ||
            !!target.isEquipment !== own.eq;
          if (differs) {
            throw new Error(
              `Percent-variant case found at apply time that MODE=review did not report (DB state changed?) — ` +
              `user_sub_category id ${sc.id} (${sc.categoryName}/${sc.subCategoryName}). STOP, re-run MODE=review.`,
            );
          }
        }
      }

      const clientKey = `CLIENT_${sc.businessNumber}`;
      const categoryId = categoryIdByKey.get(`${clientKey}::${sc.categoryName}`) ?? categoryIdByKey.get(`${SYSTEM_CHART_OWNER_KEY}::${sc.categoryName}`);
      if (!categoryId) throw new Error(`No category id resolvable for CLIENT row id ${sc.id} (${sc.categoryName})`);

      let isPrivate = false;
      let accountId: number | null = null;
      let reportScope = ExpenseReportScope.PNL;
      if (disposition.kind === 'PRIVATE') {
        isPrivate = true;
      } else if (disposition.kind === 'ANNUAL') {
        reportScope = ExpenseReportScope.ANNUAL;
      } else if (disposition.kind === 'ACCOUNT') {
        const id = accountIdByCode.get(disposition.code);
        if (!id) throw new Error(`No booking_account id for code ${disposition.code} (user_sub_category id ${sc.id})`);
        accountId = id;
      }

      const saved = await subCategoryRepo.save(subCategoryRepo.create({
        categoryId,
        name: sc.subCategoryName,
        isPrivate,
        accountId,
        reportScope,
        ownerType: OwnerType.CLIENT,
        chartOwnerKey: clientKey,
        userId: sc.firebaseId,
        businessNumber: sc.businessNumber,
        approvalStatus,
        isDefault: false,
        createdByUserId: sc.firebaseId,
        isActive: true,
      }));
      insertedSubCategoryIds.push(saved.id);
    }
  });

  console.log(
    `[catalog_migration] MODE=apply complete: ${insertedAccountCodes.length} booking_account, ` +
    `${insertedCategoryIds.length} category, ${insertedSubCategoryIds.length} sub_category rows inserted.`,
  );

  // ── read back what was actually written, for the cutover.sql dump ──
  const writtenAccounts = insertedAccountCodes.length
    ? await dataSource.query(`SELECT * FROM booking_account WHERE code IN (?) ORDER BY code`, [insertedAccountCodes])
    : [];
  const writtenCategories = await dataSource.query(`SELECT * FROM category WHERE id IN (?) ORDER BY id`, [insertedCategoryIds]);
  const writtenSubCategories = await dataSource.query(`SELECT * FROM sub_category WHERE id IN (?) ORDER BY id`, [insertedSubCategoryIds]);

  const dumpPath = path.resolve(__dirname, '2026-07-12_catalog_migration_result.json');
  fs.writeFileSync(
    dumpPath,
    JSON.stringify({ writtenAccounts, writtenCategories, writtenSubCategories }, null, 2),
  );
  console.log(`[catalog_migration] wrote readback dump to ${dumpPath} (source for the cutover.sql Section 4 INSERTs)`);

  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
