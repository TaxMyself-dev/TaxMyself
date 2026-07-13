/**
 * Unit tests: CatalogSeedService (Phase 2.7 / D13)
 *
 * Covers the seeder's core idempotency contract: running twice never
 * duplicates rows and never overwrites a row that already exists (an admin
 * edit via the default-sub-category endpoints owns that row from then on).
 */
import { CatalogSeedService } from './catalog-seed.service';
import { CatalogService } from './catalog.service';
import { AccountCodeAllocatorService } from './account-code-allocator.service';
import { SYSTEM_CATEGORIES, SYSTEM_SUB_CATEGORIES } from './catalog.seed';
import { CHART_ACCOUNTS, ACCOUNTING_SECTIONS } from './chart.seed';
import { SYSTEM_CHART_OWNER_KEY } from '../enum';

function makeRepo<T extends { id?: number }>(rows: T[] = []) {
  let nextId = (Math.max(0, ...rows.map((r) => r.id ?? 0)) || 0) + 1;
  return {
    rows,
    find: jest.fn(async (opts: any) => rows.filter((r) => matches(r, opts?.where))),
    findOne: jest.fn(async (opts: any) => rows.find((r) => matches(r, opts?.where)) ?? null),
    create: jest.fn((partial: any) => ({ isActive: true, ...partial })),
    save: jest.fn(async (entity: any) => (Array.isArray(entity) ? entity.map(saveOne) : saveOne(entity))),
    upsert: jest.fn(async (entities: any[], conflictCols: string[]) => {
      for (const e of entities) {
        const existing = rows.find((r) => conflictCols.every((c) => (r as any)[c] === e[c]));
        if (existing) Object.assign(existing, e);
        else saveOne({ ...e });
      }
    }),
  };

  function saveOne(entity: any) {
    if (entity.id == null) {
      entity.id = nextId++;
      rows.push(entity);
    }
    return entity;
  }
}

function matches(row: any, where: any): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, value]) => {
    if (value && typeof value === 'object' && (value as any).type === 'in') {
      return ((value as any).value as any[]).includes(row[key]);
    }
    return row[key] === value;
  });
}

describe('CatalogSeedService', () => {
  let categoryRepo: ReturnType<typeof makeRepo<any>>;
  let subCategoryRepo: ReturnType<typeof makeRepo<any>>;
  let accountRepo: ReturnType<typeof makeRepo<any>>;
  let sectionRepo: ReturnType<typeof makeRepo<any>>;
  let catalogService: CatalogService;
  let seeder: CatalogSeedService;

  beforeEach(() => {
    categoryRepo = makeRepo<any>([]);
    subCategoryRepo = makeRepo<any>([]);
    accountRepo = makeRepo<any>([]);
    sectionRepo = makeRepo<any>([]);
    const allocator = { getNextAccountCode: jest.fn() } as unknown as AccountCodeAllocatorService;

    catalogService = new CatalogService(categoryRepo as any, subCategoryRepo as any, accountRepo as any, sectionRepo as any, allocator, { transaction: jest.fn() } as any, { createQueryBuilder: jest.fn() } as any);
    seeder = new CatalogSeedService(sectionRepo as any, accountRepo as any, catalogService);
    delete process.env.SKIP_BOOT_SEED;
  });

  it('seeds every SYSTEM category and sub-category on the first run', async () => {
    await seeder.onModuleInit();

    expect(categoryRepo.rows.filter((c: any) => c.chartOwnerKey === SYSTEM_CHART_OWNER_KEY)).toHaveLength(SYSTEM_CATEGORIES.length);
    expect(subCategoryRepo.rows.filter((s: any) => s.chartOwnerKey === SYSTEM_CHART_OWNER_KEY)).toHaveLength(SYSTEM_SUB_CATEGORIES.length);
    expect(sectionRepo.rows).toHaveLength(ACCOUNTING_SECTIONS.length);
    expect(accountRepo.rows).toHaveLength(CHART_ACCOUNTS.length);
  });

  it('is idempotent — a second run creates no new rows and does not touch existing ones', async () => {
    await seeder.onModuleInit();
    const categoryCountAfterFirst = categoryRepo.rows.length;
    const subCategoryCountAfterFirst = subCategoryRepo.rows.length;

    // Simulate an admin edit: flip one sub-category's necessity.
    const edited = subCategoryRepo.rows.find((s: any) => s.name === 'דלק');
    edited.necessity = 'MANDATORY';

    await seeder.onModuleInit();

    expect(categoryRepo.rows).toHaveLength(categoryCountAfterFirst);
    expect(subCategoryRepo.rows).toHaveLength(subCategoryCountAfterFirst);
    expect(subCategoryRepo.rows.find((s: any) => s.name === 'דלק').necessity).toBe('MANDATORY');
  });

  it('respects SKIP_BOOT_SEED', async () => {
    process.env.SKIP_BOOT_SEED = 'true';
    await seeder.onModuleInit();
    expect(categoryRepo.rows).toHaveLength(0);
    expect(accountRepo.rows).toHaveLength(0);
  });

  it('every accountCode referenced by a seed row resolves to a real CHART_ACCOUNTS code', () => {
    const validCodes = new Set(CHART_ACCOUNTS.map((a) => a.code));
    const missing = SYSTEM_SUB_CATEGORIES.filter((s) => s.accountCode && !validCodes.has(s.accountCode));
    expect(missing).toEqual([]);
  });

  it('every sub-category references a category present in SYSTEM_CATEGORIES', () => {
    const categoryNames = new Set(SYSTEM_CATEGORIES.map((c) => c.name));
    const missing = SYSTEM_SUB_CATEGORIES.filter((s) => !categoryNames.has(s.category));
    expect(missing).toEqual([]);
  });
});
