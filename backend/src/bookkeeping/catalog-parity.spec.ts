/**
 * Phase 2.7 — the committed parity test the master plan calls for: "for
 * every (category, subCategory) pair in the production baseline, old
 * resolveAccountCode output == new CatalogService output (through the code
 * migration map)". Promotes `backend/scripts/verify-phase2-catalog-migration.ts`'s
 * hand-rolled check (worklog 2026-07-12) into a committed Jest suite.
 *
 * Requires a live DB connection to a migrated copy (keepintax_prodcopy) —
 * skipped by default so `npm test` never needs DB access. Run explicitly:
 *
 *   DB_DATABASE=keepintax_prodcopy NODE_ENV=production SKIP_BOOT_SEED=true \
 *     npx jest catalog-parity --runInBand
 */
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module';
import { CatalogService } from './catalog.service';
import { ACCOUNT_CODE_MIGRATION, CHART_ACCOUNTS } from './chart.seed';

const dbIsSet = !!process.env.DB_DATABASE && process.env.DB_DATABASE !== 'keepintax-dev';
const describeIfDb = dbIsSet ? describe : describe.skip;

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

describeIfDb('Phase 2 catalog parity (live DB)', () => {
  jest.setTimeout(120_000);

  let app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>;
  let dataSource: DataSource;
  let catalogService: CatalogService;
  const chartAccountByCode = new Map(CHART_ACCOUNTS.map((a) => [a.code, a]));
  const migrationMap = new Map(ACCOUNT_CODE_MIGRATION.map((m) => [m.oldCode, m.newCode]));

  beforeAll(async () => {
    app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
    dataSource = app.get(DataSource);
    catalogService = app.get(CatalogService);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('row counts, uniqueness, and referential integrity hold', async () => {
    const [{ n: orphanAccountRefs }] = await dataSource.query(
      `SELECT COUNT(*) n FROM sub_category WHERE accountId IS NOT NULL AND accountId NOT IN (SELECT id FROM booking_account)`,
    );
    expect(Number(orphanAccountRefs)).toBe(0);

    const [{ n: privateWithAccount }] = await dataSource.query(
      `SELECT COUNT(*) n FROM sub_category WHERE isPrivate = 1 AND accountId IS NOT NULL`,
    );
    expect(Number(privateWithAccount)).toBe(0);

    const dupCategories = await dataSource.query(
      `SELECT chartOwnerKey, name, type, COUNT(*) c FROM category GROUP BY chartOwnerKey, name, type HAVING c > 1`,
    );
    expect(dupCategories).toEqual([]);

    const dupSubCategories = await dataSource.query(
      `SELECT chartOwnerKey, categoryId, name, COUNT(*) c FROM sub_category GROUP BY chartOwnerKey, categoryId, name HAVING c > 1`,
    );
    expect(dupSubCategories).toEqual([]);
  });

  it('HARD GATE — every live (category, subCategory) pair resolves through CatalogService exactly as the old resolver predicts', async () => {
    const pairs: { category: string; subCategory: string; firebaseId: string; businessNumber: string }[] = await dataSource.query(
      `SELECT DISTINCT category, subCategory, userId as firebaseId, businessNumber FROM expense WHERE category IS NOT NULL AND subCategory IS NOT NULL`,
    );
    expect(pairs.length).toBeGreaterThan(0);

    const mismatches: string[] = [];

    for (const p of pairs) {
      const oldCode = await oldResolverCode(dataSource, p.category, p.subCategory, p.firebaseId, p.businessNumber);
      const expectedNewCode = migrationMap.get(oldCode) ?? oldCode;
      const newCode = await catalogService.resolveAccountCode(p.category, p.subCategory, p.firebaseId, p.businessNumber);

      const exception = REGISTERED_EXCEPTIONS.find((e) => e.category === p.category && e.subCategory === p.subCategory);
      if (exception) {
        if (newCode !== exception.expectedNewCode) {
          mismatches.push(`registered exception violated: ${p.category}/${p.subCategory} expected ${exception.expectedNewCode}, got ${newCode}`);
        }
        continue;
      }

      if (newCode === expectedNewCode) continue;

      // Intentional parent->child refinement (Phase 1.3 built granular
      // children the old flat resolver never knew about) — same exclusion
      // compare-baseline-reports.ts applies.
      const newAccount = chartAccountByCode.get(newCode);
      if (newAccount?.sectionCode === expectedNewCode) continue;

      mismatches.push(`${p.category}/${p.subCategory} (biz ${p.businessNumber}): old=${oldCode} expected(via map)=${expectedNewCode} got=${newCode}`);
    }

    expect(mismatches).toEqual([]);
  });
});
