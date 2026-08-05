/**
 * Phase 2.6 — runs the new flat CatalogSeedService (D13) against
 * keepintax_prodcopy and reports exactly what it did/would do. Expected to
 * be a near-total no-op: Phase 1.4's chart_renumber.sql already upserted
 * every accounting_section/booking_account row chart.seed.ts describes, and
 * Phase 2.2's catalog migration already inserted every SYSTEM category/
 * sub_category row catalog.seed.ts describes (cutover.sql Sections 3/4a/4b).
 * This script's job is to PROVE that — the flat seeder must reproduce the
 * already-migrated state exactly, with zero new/changed rows — since D13's
 * whole premise is that catalog.seed.ts is a portable, name-keyed restatement
 * of the same reviewed data, not a second, independent source of truth.
 *
 * Any unexpected diff here is a real bug (a transcription error in
 * catalog.seed.ts vs. what Phase 2.2 actually wrote) and must be fixed
 * before this seeder is trusted to run at a fresh production cutover.
 *
 * Two modes, same pattern as 2026-07-12_catalog_migration.ts:
 *   MODE=review (default) — read-only, reports what WOULD change, writes NOTHING.
 *   MODE=apply — actually calls CatalogSeedService.runSeed().
 *
 *   DB_DATABASE=keepintax_prodcopy NODE_ENV=production SKIP_BOOT_SEED=true \
 *     npx ts-node -r tsconfig-paths/register scripts/migrations/2026-07-12_run-catalog-seeder.ts
 */
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { CatalogSeedService } from '../../src/bookkeeping/catalog-seed.service';
import { CatalogService } from '../../src/bookkeeping/catalog.service';
import { ACCOUNTING_SECTIONS, CHART_ACCOUNTS } from '../../src/bookkeeping/chart.seed';
import { SYSTEM_CATEGORIES, SYSTEM_SUB_CATEGORIES } from '../../src/bookkeeping/catalog.seed';
import { OwnerType, SYSTEM_CHART_OWNER_KEY } from '../../src/enum';

const MODE = process.env.MODE === 'apply' ? 'apply' : 'review';

async function counts(dataSource: DataSource) {
  const [[sections], [accounts], [categories], [subCategories]] = await Promise.all([
    dataSource.query(`SELECT COUNT(*) n FROM accounting_section`),
    dataSource.query(`SELECT COUNT(*) n FROM booking_account`),
    dataSource.query(`SELECT COUNT(*) n FROM category`),
    dataSource.query(`SELECT COUNT(*) n FROM sub_category`),
  ]);
  return {
    sections: Number(sections.n),
    accounts: Number(accounts.n),
    categories: Number(categories.n),
    subCategories: Number(subCategories.n),
  };
}

/** Read-only dry run: for each seed row, classify as identical / would-update
 *  / would-insert against the current DB state — never writes. */
async function review(dataSource: DataSource, catalogService: CatalogService) {
  let sectionsIdentical = 0, sectionsDiffer: string[] = [], sectionsMissing: string[] = [];
  for (const s of ACCOUNTING_SECTIONS) {
    const [row] = await dataSource.query(
      `SELECT name, displayOrder FROM accounting_section WHERE chartOwnerKey=? AND code=?`,
      [s.chartOwnerKey, s.code],
    );
    if (!row) sectionsMissing.push(s.code);
    else if (row.name !== s.name || Number(row.displayOrder) !== s.displayOrder) sectionsDiffer.push(s.code);
    else sectionsIdentical++;
  }

  let accountsIdentical = 0, accountsDiffer: string[] = [], accountsMissing: string[] = [];
  const sectionIdByCode = new Map<string, number>();
  const sectionRows = await dataSource.query(`SELECT id, code FROM accounting_section WHERE chartOwnerKey=?`, [SYSTEM_CHART_OWNER_KEY]);
  for (const r of sectionRows) sectionIdByCode.set(r.code, r.id);

  for (const a of CHART_ACCOUNTS) {
    const [row] = await dataSource.query(
      `SELECT name, sectionId, vatPercent, taxPercent, reductionPercent, isEquipment, recognitionType FROM booking_account WHERE chartOwnerKey=? AND code=?`,
      [a.chartOwnerKey, a.code],
    );
    const expectedSectionId = a.sectionCode ? sectionIdByCode.get(a.sectionCode) ?? null : null;
    const numOrNull = (v: any) => (v === null || v === undefined ? null : Number(v));
    if (!row) {
      accountsMissing.push(a.code);
    } else if (
      row.name !== a.name ||
      (row.sectionId ?? null) !== expectedSectionId ||
      numOrNull(row.vatPercent) !== numOrNull(a.vatPercent) ||
      numOrNull(row.taxPercent) !== numOrNull(a.taxPercent)
    ) {
      accountsDiffer.push(a.code);
    } else {
      accountsIdentical++;
    }
  }

  let categoriesExisting = 0, categoriesMissing: string[] = [];
  for (const c of SYSTEM_CATEGORIES) {
    const existing = await catalogService.findCategoryInSingleScope(SYSTEM_CHART_OWNER_KEY, c.name, c.type);
    if (existing) categoriesExisting++;
    else categoriesMissing.push(c.name);
  }

  let subCategoriesExisting = 0, subCategoriesMissing: string[] = [];
  const categoryIdByName = new Map<string, number>();
  const categoryRows = await dataSource.query(`SELECT id, name FROM category WHERE chartOwnerKey=?`, [SYSTEM_CHART_OWNER_KEY]);
  for (const r of categoryRows) categoryIdByName.set(r.name, r.id);

  for (const s of SYSTEM_SUB_CATEGORIES) {
    const categoryId = categoryIdByName.get(s.category);
    if (!categoryId) {
      subCategoriesMissing.push(`${s.category} / ${s.name} (parent category missing)`);
      continue;
    }
    const existing = await catalogService.findSubCategoryInSingleScope(SYSTEM_CHART_OWNER_KEY, categoryId, s.name);
    if (existing) subCategoriesExisting++;
    else subCategoriesMissing.push(`${s.category} / ${s.name}`);
  }

  console.log('\n[review] accounting_section: identical=%d differ=%s missing=%s', sectionsIdentical, JSON.stringify(sectionsDiffer), JSON.stringify(sectionsMissing));
  console.log('[review] booking_account:     identical=%d differ=%s missing=%s', accountsIdentical, JSON.stringify(accountsDiffer), JSON.stringify(accountsMissing));
  console.log('[review] category:            existing=%d missing=%s', categoriesExisting, JSON.stringify(categoriesMissing));
  console.log('[review] sub_category:        existing=%d missing=%s', subCategoriesExisting, JSON.stringify(subCategoriesMissing));

  const isNoOp =
    sectionsDiffer.length === 0 && sectionsMissing.length === 0 &&
    accountsDiffer.length === 0 && accountsMissing.length === 0 &&
    categoriesMissing.length === 0 && subCategoriesMissing.length === 0;

  if (isNoOp) {
    console.log('\n✅ MODE=review: confirmed no-op — catalog.seed.ts / chart.seed.ts exactly reproduce the already-migrated state. Safe to MODE=apply (it will write nothing new).');
  } else {
    console.error('\n❌ MODE=review found real diffs — investigate before MODE=apply.');
  }
  return isNoOp;
}

async function main() {
  if (!process.env.DB_DATABASE || process.env.DB_DATABASE === 'keepintax-dev') {
    throw new Error(`Refusing to run against DB_DATABASE=${process.env.DB_DATABASE}`);
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error', 'log'] });
  const dataSource = app.get(DataSource);
  const catalogService = app.get(CatalogService);

  if (MODE === 'review') {
    console.log(`[run-catalog-seeder] MODE=review against ${process.env.DB_DATABASE} — read-only.`);
    await review(dataSource, catalogService);
    await app.close();
    return;
  }

  console.log(`[run-catalog-seeder] MODE=apply against ${process.env.DB_DATABASE}.`);
  const seeder = app.get(CatalogSeedService);
  const before = await counts(dataSource);
  console.log('[run-catalog-seeder] before:', before);

  await seeder.runSeed();

  const after = await counts(dataSource);
  console.log('[run-catalog-seeder] after: ', after);
  const diff = {
    sections: after.sections - before.sections,
    accounts: after.accounts - before.accounts,
    categories: after.categories - before.categories,
    subCategories: after.subCategories - before.subCategories,
  };
  console.log('[run-catalog-seeder] diff:  ', diff);

  const isNoOp = Object.values(diff).every((n) => n === 0);
  console.log(isNoOp
    ? '\n✅ Confirmed no-op — nothing new written.'
    : '\n⚠️  Non-zero diff — see counts above.');

  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
