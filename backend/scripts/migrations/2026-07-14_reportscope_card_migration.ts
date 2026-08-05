/**
 * reportScope model change (2026-07-14) — data-side migration against
 * keepintax_prodcopy. Run 2026-07-14_reportscope_card_migration_schema.sql
 * FIRST (DDL, not transactional, not run by this script — same split as
 * every prior schema+data migration pair in this project).
 *
 * What this script does, in order:
 *   1. Runs CatalogSeedService.runSeed() (idempotent, upsert-by-code for
 *      accounts) — this alone (a) flips the six 90100-90600 accounts'
 *      reportScope to TECHNICAL and (b) creates the five new 613xx ANNUAL
 *      accounts. It does NOT touch the five existing SYSTEM sub_category
 *      rows (create-if-missing only).
 *   2. Orphan check: any CLIENT_/ACCOUNTANT_-scoped sub_category sharing one
 *      of the five ANNUAL names? None expected (D14 never documented one) —
 *      verified by query, not assumed. Aborts before step 3 if any are found
 *      so a human can decide what to do with them, per this project's
 *      "verify zero orphans, don't guess" discipline.
 *   3. Targeted UPDATE: repoints the five existing SYSTEM sub_category rows
 *      at their new accountId (the one write this script makes outside the
 *      seeder — see docs/redesign/reportscope-card-migration-review.md).
 *
 * Two modes, same pattern as every prior migration script here:
 *   MODE=review (default) — steps 1-2 read-only, reports what WOULD change,
 *     writes NOTHING.
 *   MODE=apply — actually runs the seeder + step 3's UPDATE.
 *
 *   DB_DATABASE=keepintax_prodcopy NODE_ENV=production SKIP_BOOT_SEED=true \
 *     npx ts-node -r tsconfig-paths/register scripts/migrations/2026-07-14_reportscope_card_migration.ts
 */
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { CatalogSeedService } from '../../src/bookkeeping/catalog-seed.service';

const MODE = process.env.MODE === 'apply' ? 'apply' : 'review';

/** name -> new SYSTEM account code, per the review doc's table. */
const ANNUAL_REPOINTS: { name: string; code: string }[] = [
  { name: 'תרומות מוכרות', code: '61340' },
  { name: 'ביטוח חיים', code: '61350' },
  { name: 'ביטוח אובדן כושר עבודה', code: '61360' },
  { name: 'הפקדה לפנסיה', code: '61370' },
  { name: 'הפקדה לקרן השתלמות', code: '61380' },
];

const TECHNICAL_CODES = ['90100', '90200', '90300', '90400', '90500', '90600'];

async function checkSchemaReady(dataSource: DataSource): Promise<boolean> {
  const [col] = await dataSource.query(
    `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'booking_account' AND COLUMN_NAME = 'reportScope'`,
  );
  return !!col;
}

async function orphanCheck(dataSource: DataSource): Promise<{ name: string; chartOwnerKey: string; count: number }[]> {
  const names = ANNUAL_REPOINTS.map((r) => r.name);
  const rows = await dataSource.query(
    `SELECT name, chartOwnerKey, COUNT(*) as cnt FROM sub_category
     WHERE name IN (${names.map(() => '?').join(',')}) AND chartOwnerKey != 'SYSTEM' AND isActive = 1
     GROUP BY name, chartOwnerKey`,
    names,
  );
  return rows.map((r: any) => ({ name: r.name, chartOwnerKey: r.chartOwnerKey, count: Number(r.cnt) }));
}

async function reviewReportScopeValues(dataSource: DataSource) {
  const technical = await dataSource.query(
    `SELECT code, reportScope, recognitionType FROM booking_account WHERE chartOwnerKey='SYSTEM' AND code IN (${TECHNICAL_CODES.map(() => '?').join(',')})`,
    TECHNICAL_CODES,
  );
  const annualCodes = ANNUAL_REPOINTS.map((r) => r.code);
  const annual = await dataSource.query(
    `SELECT code, name, reportScope, recognitionType FROM booking_account WHERE chartOwnerKey='SYSTEM' AND code IN (${annualCodes.map(() => '?').join(',')})`,
    annualCodes,
  );
  const subCats = await dataSource.query(
    `SELECT name, accountId FROM sub_category WHERE chartOwnerKey='SYSTEM' AND name IN (${ANNUAL_REPOINTS.map(() => '?').join(',')})`,
    ANNUAL_REPOINTS.map((r) => r.name),
  );

  console.log('\n[review] TECHNICAL accounts (expect reportScope=technical, recognitionType=NOT_APPLICABLE on all six):');
  console.table(technical);
  console.log('[review] ANNUAL accounts (expect 5 rows, reportScope=annual, recognitionType=NOT_APPLICABLE):');
  console.table(annual);
  console.log('[review] ANNUAL sub_category rows (expect accountId set to match the account codes above):');
  console.table(subCats);
}

async function main() {
  if (!process.env.DB_DATABASE || process.env.DB_DATABASE === 'keepintax-dev') {
    throw new Error(`Refusing to run against DB_DATABASE=${process.env.DB_DATABASE}`);
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error', 'log'] });
  const dataSource = app.get(DataSource);

  const schemaReady = await checkSchemaReady(dataSource);
  if (!schemaReady) {
    console.error(
      '\n❌ booking_account.reportScope does not exist yet — run 2026-07-14_reportscope_card_migration_schema.sql first.',
    );
    await app.close();
    process.exit(1);
  }

  const orphans = await orphanCheck(dataSource);
  if (orphans.length) {
    console.error('\n⚠️  Non-SYSTEM sub_category rows share a name with an ANNUAL card — review before proceeding:');
    console.table(orphans);
  } else {
    console.log('\n✅ Orphan check: zero CLIENT/ACCOUNTANT-scoped rows share a name with any of the five ANNUAL cards.');
  }

  if (MODE === 'review') {
    console.log(`\n[reportscope-migration] MODE=review against ${process.env.DB_DATABASE} — read-only.`);
    const seedService = app.get(CatalogSeedService);
    void seedService; // present in the DI graph; runSeed() is NOT called in review mode
    await reviewReportScopeValues(dataSource);
    await app.close();
    return;
  }

  if (orphans.length) {
    console.error('\n❌ Refusing MODE=apply while orphans are unresolved — see the table above. Fix or explicitly clear this check first.');
    await app.close();
    process.exit(1);
  }

  console.log(`\n[reportscope-migration] MODE=apply against ${process.env.DB_DATABASE}.`);
  const seeder = app.get(CatalogSeedService);
  await seeder.runSeed();
  console.log('[reportscope-migration] seeder run complete (TECHNICAL flags + 5 new ANNUAL accounts).');

  for (const { name, code } of ANNUAL_REPOINTS) {
    const result = await dataSource.query(
      `UPDATE sub_category s
       JOIN booking_account a ON a.chartOwnerKey = 'SYSTEM' AND a.code = ?
       SET s.accountId = a.id
       WHERE s.chartOwnerKey = 'SYSTEM' AND s.name = ?`,
      [code, name],
    );
    console.log(`[reportscope-migration] repointed "${name}" -> account ${code}:`, result);
  }

  await reviewReportScopeValues(dataSource);
  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
