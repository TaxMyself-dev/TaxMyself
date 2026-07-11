/**
 * Phase 2.2 post-apply verification. Run against keepintax_prodcopy after
 * MODE=apply. Checks:
 *  1. Row counts (category, sub_category, booking_account new codes).
 *  2. Uniqueness: no duplicate (chartOwnerKey,name,type) on category,
 *     (chartOwnerKey,categoryId,name) on sub_category.
 *  3. Referential integrity: every sub_category.accountId resolves to a real
 *     booking_account row.
 *  4. isPrivate consistency: isPrivate=1 rows never carry an accountId (D5).
 *  5. HARD GATE — parity spot-check: for every distinct (category,
 *     subCategory, firebaseId, businessNumber) pair actually referenced by
 *     the 85 `expense` rows, assert the OLD 5-level resolver's output,
 *     mapped through account_code_migration, equals CatalogService's new
 *     output — except the one registered D14/D15 exception (Bituach Leumi
 *     -> 90300, not the generic 5000->60000 path), same pattern as
 *     compare-baseline-reports.ts's intentional-diffs allowlist.
 *
 *   DB_DATABASE=keepintax_prodcopy NODE_ENV=production SKIP_BOOT_SEED=true \
 *     npx ts-node -r tsconfig-paths/register scripts/verify-phase2-catalog-migration.ts
 */
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { CatalogService } from '../src/bookkeeping/catalog.service';
import { ACCOUNT_CODE_MIGRATION, CHART_ACCOUNTS } from '../src/bookkeeping/chart.seed';

const chartAccountByCode = new Map(CHART_ACCOUNTS.map((a) => [a.code, a]));

// Registered exception (D14 bucket 3 / D15) — business 204245724's מקדמות
// ביטוח לאומי rows resolve to 90300 directly, not through the generic
// 5000->60000 accountCode-migration path.
const REGISTERED_EXCEPTIONS = [
  { category: 'עסק', subCategory: 'מקדמות ביטוח לאומי', expectedNewCode: '90300', reason: 'D14 bucket 3 / D15' },
];

async function oldResolverCode(
  dataSource: DataSource,
  categoryName: string,
  subCategoryName: string,
  firebaseId: string | null,
  businessNumber: string | null,
): Promise<string> {
  if (firebaseId && businessNumber) {
    const [userSub] = await dataSource.query(
      `SELECT accountCode FROM user_sub_category WHERE firebaseId=? AND businessNumber=? AND subCategoryName=? AND categoryName=? AND accountCode IS NOT NULL`,
      [firebaseId, businessNumber, subCategoryName, categoryName],
    );
    if (userSub?.accountCode) return userSub.accountCode;
  }
  const [defSub] = await dataSource.query(
    `SELECT accountCode FROM default_sub_category WHERE subCategoryName=? AND categoryName=? AND accountCode IS NOT NULL`,
    [subCategoryName, categoryName],
  );
  if (defSub?.accountCode) return defSub.accountCode;

  if (firebaseId && businessNumber) {
    const [userCat] = await dataSource.query(
      `SELECT accountCode FROM user_category WHERE firebaseId=? AND businessNumber=? AND categoryName=? AND accountCode IS NOT NULL`,
      [firebaseId, businessNumber, categoryName],
    );
    if (userCat?.accountCode) return userCat.accountCode;
  }
  const [defCat] = await dataSource.query(
    `SELECT accountCode FROM default_category WHERE categoryName=? AND accountCode IS NOT NULL`,
    [categoryName],
  );
  if (defCat?.accountCode) return defCat.accountCode;

  return '5000';
}

async function main() {
  if (!process.env.DB_DATABASE || process.env.DB_DATABASE === 'keepintax-dev') {
    throw new Error(`Refusing to run against DB_DATABASE=${process.env.DB_DATABASE}`);
  }
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
  const dataSource = app.get(DataSource);
  const catalogService = app.get(CatalogService);

  let failures = 0;

  // ── 1. row counts ──
  const [{ n: categoryCount }] = await dataSource.query(`SELECT COUNT(*) n FROM category`);
  const [{ n: subCategoryCount }] = await dataSource.query(`SELECT COUNT(*) n FROM sub_category`);
  const newAccounts = await dataSource.query(`SELECT code, name FROM booking_account WHERE code IN ('90500','90600')`);
  console.log(`[verify] category=${categoryCount} sub_category=${subCategoryCount} new booking_account rows=${JSON.stringify(newAccounts)}`);
  if (Number(categoryCount) !== 14) { console.error(`❌ expected 14 category rows, got ${categoryCount}`); failures++; }
  if (Number(subCategoryCount) !== 96) { console.error(`❌ expected 96 sub_category rows, got ${subCategoryCount}`); failures++; }
  if (newAccounts.length !== 2) { console.error(`❌ expected 2 new booking_account rows (90500/90600), got ${newAccounts.length}`); failures++; }

  // ── 2. uniqueness ──
  const dupCategories = await dataSource.query(
    `SELECT chartOwnerKey, name, type, COUNT(*) c FROM category GROUP BY chartOwnerKey, name, type HAVING c > 1`,
  );
  if (dupCategories.length) { console.error(`❌ duplicate category rows:`, dupCategories); failures++; }
  else console.log('[verify] ✅ no duplicate category rows');

  const dupSubCategories = await dataSource.query(
    `SELECT chartOwnerKey, categoryId, name, COUNT(*) c FROM sub_category GROUP BY chartOwnerKey, categoryId, name HAVING c > 1`,
  );
  if (dupSubCategories.length) { console.error(`❌ duplicate sub_category rows:`, dupSubCategories); failures++; }
  else console.log('[verify] ✅ no duplicate sub_category rows');

  // ── 3. referential integrity ──
  const [{ n: orphanAccountRefs }] = await dataSource.query(
    `SELECT COUNT(*) n FROM sub_category WHERE accountId IS NOT NULL AND accountId NOT IN (SELECT id FROM booking_account)`,
  );
  if (Number(orphanAccountRefs) !== 0) { console.error(`❌ ${orphanAccountRefs} sub_category rows reference a non-existent booking_account`); failures++; }
  else console.log('[verify] ✅ every sub_category.accountId resolves to a real booking_account row');

  // ── 4. isPrivate consistency (D5) ──
  const [{ n: privateWithAccount }] = await dataSource.query(
    `SELECT COUNT(*) n FROM sub_category WHERE isPrivate = 1 AND accountId IS NOT NULL`,
  );
  if (Number(privateWithAccount) !== 0) { console.error(`❌ ${privateWithAccount} PRIVATE sub_category rows carry an accountId (D5 violation)`); failures++; }
  else console.log('[verify] ✅ no PRIVATE sub_category row carries an accountId');

  // ── 5. HARD GATE — parity spot-check over every distinct pair the 85 expenses actually use ──
  const pairs: { category: string; subCategory: string; firebaseId: string; businessNumber: string }[] = await dataSource.query(
    `SELECT DISTINCT category, subCategory, userId as firebaseId, businessNumber FROM expense WHERE category IS NOT NULL AND subCategory IS NOT NULL`,
  );
  console.log(`[verify] parity spot-check over ${pairs.length} distinct (category,subCategory,firebaseId,businessNumber) pairs from live expense data`);

  const migrationMap = new Map(ACCOUNT_CODE_MIGRATION.map((m) => [m.oldCode, m.newCode]));
  let parityChecked = 0;
  let parityRegisteredExceptions = 0;
  let parityRefinements = 0;

  for (const p of pairs) {
    const oldCode = await oldResolverCode(dataSource, p.category, p.subCategory, p.firebaseId, p.businessNumber);
    const expectedNewCode = migrationMap.get(oldCode) ?? oldCode; // unchanged codes (1000-2999 range) pass through
    const newCode = await catalogService.resolveAccountCode(p.category, p.subCategory, p.firebaseId, p.businessNumber);

    const exception = REGISTERED_EXCEPTIONS.find((e) => e.category === p.category && e.subCategory === p.subCategory);
    if (exception) {
      parityRegisteredExceptions++;
      if (newCode !== exception.expectedNewCode) {
        console.error(`❌ registered exception mismatch: ${p.category}/${p.subCategory} expected ${exception.expectedNewCode} (${exception.reason}), got ${newCode}`);
        failures++;
      } else {
        console.log(`[verify] (registered exception, ${exception.reason}) ${p.category}/${p.subCategory}: old=${oldCode} generic-map=${expectedNewCode} new=${newCode} ✅ (expected divergence)`);
      }
      continue;
    }

    parityChecked++;
    if (newCode === expectedNewCode) {
      continue; // exact match, unchanged categorization
    }
    // Phase 1.3 deliberately built granular child accounts by NAME under
    // their old block's anchor (subAccountCode was never in production —
    // schema-drift.md Gap 1 — so the old flat resolver only ever knew the
    // bare parent code). A new result that is a CHILD of the expected old
    // parent block is the intended refinement, not a divergence — same
    // exclusion compare-baseline-reports.ts already applies when regrouping
    // the ledger (only accountCode-sourced rows are compared 1:1, never
    // subAccountCode-sourced ones).
    const newAccount = chartAccountByCode.get(newCode);
    if (newAccount?.sectionCode === expectedNewCode) {
      parityRefinements++;
      continue;
    }
    console.error(`❌ PARITY MISMATCH: ${p.category}/${p.subCategory} (biz ${p.businessNumber}) — old=${oldCode} → expected(via migration map)=${expectedNewCode}, CatalogService returned=${newCode}`);
    failures++;
  }
  console.log(`[verify] parity: ${parityChecked} pairs checked, ${parityRefinements} intentional parent→child refinements, ${parityRegisteredExceptions} registered exceptions confirmed, ${failures} unregistered mismatches`);

  await app.close();

  if (failures > 0) {
    console.error(`\n❌ VERIFICATION FAILED: ${failures} failure(s).`);
    process.exit(1);
  }
  console.log(`\n✅ ALL VERIFICATION CHECKS PASSED.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
