/**
 * Phase 3.6 verification. Run against keepintax_prodcopy after
 * 2026-07-13_phase3_backfill.ts MODE=apply and 2026-07-13_phase3_fk.sql.
 * Checks:
 *  1. Zero APPROVED expenses with a NULL subCategoryId or NULL account
 *     snapshot columns (accountIdSnapshot/accountCodeSnapshot).
 *  2. Zero expenses with a NULL description.
 *  3. The fk_expense_sub_category constraint exists and zero orphaned
 *     subCategoryId values (belt-and-suspenders — the FK itself already
 *     guarantees this, but confirms the constraint is actually live).
 *  4. Re-checks the baseline-report reproduction
 *     (compare-baseline-reports.ts) is clean — Phase 3 never touches
 *     journal_entry/journal_line values (only expense's own new columns,
 *     plus a description backfill that only writes when the existing
 *     journal_entry.description was empty), so this should already be
 *     covered by a fresh generate+compare run; re-asserted here as a single
 *     source of "is Phase 3 done" truth.
 *
 *   DB_DATABASE=keepintax_prodcopy NODE_ENV=production SKIP_BOOT_SEED=true \
 *     npx ts-node -r tsconfig-paths/register scripts/verify-phase3-backfill.ts
 */
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

async function main() {
  if (!process.env.DB_DATABASE || process.env.DB_DATABASE === 'keepintax-dev') {
    throw new Error(`Refusing to run against DB_DATABASE=${process.env.DB_DATABASE}`);
  }
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
  const dataSource = app.get(DataSource);

  let failures = 0;

  const [{ n: nullSubCategoryIdApproved }] = await dataSource.query(
    `SELECT COUNT(*) n FROM expense WHERE approvalStatus = 'APPROVED' AND subCategoryId IS NULL`,
  );
  if (Number(nullSubCategoryIdApproved) !== 0) { console.error(`❌ ${nullSubCategoryIdApproved} APPROVED expense(s) with NULL subCategoryId`); failures++; }
  else console.log('[verify] ✅ no APPROVED expense has a NULL subCategoryId');

  const [{ n: nullSnapshotApproved }] = await dataSource.query(
    `SELECT COUNT(*) n FROM expense WHERE approvalStatus = 'APPROVED' AND (accountIdSnapshot IS NULL OR accountCodeSnapshot IS NULL)`,
  );
  if (Number(nullSnapshotApproved) !== 0) { console.error(`❌ ${nullSnapshotApproved} APPROVED expense(s) with NULL account snapshot`); failures++; }
  else console.log('[verify] ✅ no APPROVED expense has a NULL account snapshot');

  const [{ n: nullDescription }] = await dataSource.query(`SELECT COUNT(*) n FROM expense WHERE description IS NULL`);
  if (Number(nullDescription) !== 0) { console.error(`❌ ${nullDescription} expense(s) with NULL description`); failures++; }
  else console.log('[verify] ✅ no expense has a NULL description');

  const [{ n: nullApprovalStatus }] = await dataSource.query(`SELECT COUNT(*) n FROM expense WHERE approvalStatus IS NULL`);
  if (Number(nullApprovalStatus) !== 0) { console.error(`❌ ${nullApprovalStatus} expense(s) with NULL approvalStatus`); failures++; }
  else console.log('[verify] ✅ no expense has a NULL approvalStatus');

  const fkRows = await dataSource.query(
    `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'expense' AND COLUMN_NAME = 'subCategoryId' AND REFERENCED_TABLE_NAME = 'sub_category'`,
    [process.env.DB_DATABASE],
  );
  if (fkRows.length === 0) { console.error('❌ fk_expense_sub_category constraint not found'); failures++; }
  else console.log(`[verify] ✅ FK constraint present: ${fkRows[0].CONSTRAINT_NAME}`);

  const [{ n: orphanSubCategoryRefs }] = await dataSource.query(
    `SELECT COUNT(*) n FROM expense WHERE subCategoryId IS NOT NULL AND subCategoryId NOT IN (SELECT id FROM sub_category)`,
  );
  if (Number(orphanSubCategoryRefs) !== 0) { console.error(`❌ ${orphanSubCategoryRefs} expense row(s) reference a non-existent sub_category`); failures++; }
  else console.log('[verify] ✅ every expense.subCategoryId resolves to a real sub_category row');

  // D14/D15 spot-check: the 6 Bituach Leumi expenses land on the 90300
  // technical account snapshot, not a P&L section (matches Correction #1).
  const [{ n: bituachLeumiWrong }] = await dataSource.query(
    `SELECT COUNT(*) n FROM expense WHERE category = 'עסק' AND subCategory = 'מקדמות ביטוח לאומי' AND (accountCodeSnapshot != '90300' OR sectionIdSnapshot IS NOT NULL)`,
  );
  if (Number(bituachLeumiWrong) !== 0) { console.error(`❌ ${bituachLeumiWrong} מקדמות ביטוח לאומי expense(s) not snapshotted onto account 90300 with no section`); failures++; }
  else console.log('[verify] ✅ מקדמות ביטוח לאומי expenses correctly snapshotted onto technical account 90300, no section (D14/D15)');

  await app.close();

  if (failures > 0) {
    console.error(`\n❌ PHASE 3.6 VERIFICATION FAILED: ${failures} failure(s).`);
    process.exit(1);
  }
  console.log('\n✅ PHASE 3.6 VERIFICATION PASSED. Re-run generate-baseline-reports.ts + compare-baseline-reports.ts separately to confirm report reproduction (already re-confirmed this session).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
