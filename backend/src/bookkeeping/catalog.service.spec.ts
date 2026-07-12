/**
 * Unit tests: CatalogService (Phase 2.7)
 *
 * Covers:
 *  - merge precedence (CLIENT > ACCOUNTANT > SYSTEM by name, D4)
 *  - findOrCreateVariantAccount: reuse vs. create, section inheritance from
 *    the base card, and the "refuse rather than create a sectionless card"
 *    rule (corrected in the Phase 2.4 plan review)
 *  - createSubCategory: isPrivate / ANNUAL bypass the law-resolution path
 *    entirely; a law with no resolvable section lands MISSING_ACCOUNTING_MAPPING
 *  - getCategoryNamesForUser (Phase 4.6 — replaced the legacy-table merge)
 */
import { Category } from './category.entity';
import { SubCategory } from './sub-category.entity';
import { BookingAccount } from './account.entity';
import { AccountingSection } from './accounting-section.entity';
import { CatalogService } from './catalog.service';
import { AccountCodeAllocatorService } from './account-code-allocator.service';
import { ApprovalStatus, CategoryType, ExpenseReportScope, OwnerType, RecognitionType, SYSTEM_CHART_OWNER_KEY } from '../enum';

function makeRepo<T extends { id?: number }>(rows: T[] = []) {
  let nextId = (Math.max(0, ...rows.map((r) => r.id ?? 0)) || 0) + 1;
  return {
    rows,
    find: jest.fn(async (opts: any) => rows.filter((r) => matches(r, opts?.where))),
    findOne: jest.fn(async (opts: any) => rows.find((r) => matches(r, opts?.where)) ?? null),
    findOneOrFail: jest.fn(async (opts: any) => {
      const found = rows.find((r) => matches(r, opts?.where));
      if (!found) throw new Error('not found');
      return found;
    }),
    create: jest.fn((partial: any) => ({ isActive: true, ...partial })),
    save: jest.fn(async (entity: any) => {
      if (Array.isArray(entity)) return entity.map((e) => saveOne(e));
      return saveOne(entity);
    }),
  };

  function saveOne(entity: any) {
    if (entity.id == null) {
      entity.id = nextId++;
      rows.push(entity);
    } else {
      const idx = rows.findIndex((r) => r.id === entity.id);
      if (idx >= 0) rows[idx] = entity;
      else rows.push(entity);
    }
    return entity;
  }
}

function matches(row: any, where: any): boolean {
  if (!where) return true;
  // TypeORM array-where = OR across the clauses.
  if (Array.isArray(where)) return where.some((clause) => matches(row, clause));
  return Object.entries(where).every(([key, value]) => {
    // TypeORM's In(...) returns a FindOperator whose `.type`/`.value` are
    // getters — duck-type it rather than importing the class.
    if (value && typeof value === 'object' && (value as any).type === 'in') {
      return ((value as any).value as any[]).includes(row[key]);
    }
    return row[key] === value;
  });
}

describe('CatalogService', () => {
  let categoryRepo: ReturnType<typeof makeRepo<any>>;
  let subCategoryRepo: ReturnType<typeof makeRepo<any>>;
  let accountRepo: ReturnType<typeof makeRepo<any>>;
  let sectionRepo: ReturnType<typeof makeRepo<any>>;
  let allocator: jest.Mocked<AccountCodeAllocatorService>;
  let service: CatalogService;

  const SYS = SYSTEM_CHART_OWNER_KEY;
  const CLIENT = 'CLIENT_123456789';

  beforeEach(() => {
    categoryRepo = makeRepo<any>([
      { id: 1, name: 'רכב ותחבורה', type: CategoryType.EXPENSE, chartOwnerKey: SYS, isActive: true },
    ]);
    subCategoryRepo = makeRepo<any>([]);
    accountRepo = makeRepo<any>([
      {
        id: 1,
        code: '60220',
        name: 'דלק',
        type: 'expense',
        sectionId: 99,
        code6111: null,
        vatPercent: 66.66,
        taxPercent: 45,
        reductionPercent: 0,
        isEquipment: false,
        recognitionType: RecognitionType.RECOGNIZED,
        chartOwnerKey: SYS,
        isActive: true,
      },
    ]);
    sectionRepo = makeRepo<any>([{ id: 99, code: '60200', name: 'רכב ותחבורה', chartOwnerKey: SYS, isActive: true }]);
    allocator = { getNextAccountCode: jest.fn().mockResolvedValue('80000') } as any;

    service = new CatalogService(
      categoryRepo as any,
      subCategoryRepo as any,
      accountRepo as any,
      sectionRepo as any,
      allocator,
    );
  });

  // ── merge precedence (D4) ──────────────────────────────────────────────

  describe('getMergedCategories', () => {
    it('CLIENT overrides SYSTEM by name', async () => {
      categoryRepo.rows.push({ id: 2, name: 'רכב ותחבורה', type: CategoryType.EXPENSE, chartOwnerKey: CLIENT, isActive: true });

      const merged = await service.getMergedCategories({ businessNumber: '123456789' });
      const named = merged.filter((c) => c.name === 'רכב ותחבורה');
      expect(named).toHaveLength(1);
      expect(named[0].chartOwnerKey).toBe(CLIENT);
    });

    it('falls back to SYSTEM when no CLIENT override exists', async () => {
      const merged = await service.getMergedCategories({ businessNumber: '123456789' });
      expect(merged.find((c) => c.name === 'רכב ותחבורה')?.chartOwnerKey).toBe(SYS);
    });

    // ── Phase 5.1: the ACCOUNTANT layer joins the merge via accountantIds ──

    it('ACCOUNTANT overrides SYSTEM but loses to CLIENT (D4 precedence)', async () => {
      categoryRepo.rows.push(
        { id: 3, name: 'רכב ותחבורה', type: CategoryType.EXPENSE, chartOwnerKey: 'ACCOUNTANT_agent-1', isActive: true },
        { id: 4, name: 'ייעוץ', type: CategoryType.EXPENSE, chartOwnerKey: 'ACCOUNTANT_agent-1', isActive: true },
        { id: 5, name: 'ייעוץ', type: CategoryType.EXPENSE, chartOwnerKey: CLIENT, isActive: true },
      );

      const merged = await service.getMergedCategories({
        businessNumber: '123456789',
        accountantIds: ['agent-1'],
      });

      expect(merged.find((c) => c.name === 'רכב ותחבורה')?.chartOwnerKey).toBe('ACCOUNTANT_agent-1');
      expect(merged.find((c) => c.name === 'ייעוץ')?.chartOwnerKey).toBe(CLIENT);
    });

    it('without accountantIds the ACCOUNTANT layer stays invisible (pre-5.1 ctx literals)', async () => {
      categoryRepo.rows.push(
        { id: 4, name: 'ייעוץ', type: CategoryType.EXPENSE, chartOwnerKey: 'ACCOUNTANT_agent-1', isActive: true },
      );
      const merged = await service.getMergedCategories({ businessNumber: '123456789' });
      expect(merged.find((c) => c.name === 'ייעוץ')).toBeUndefined();
    });
  });

  // ── resolveSubCategory tenant-scope check (Phase 4.1) ──────────────────

  describe('resolveSubCategory scope check', () => {
    beforeEach(() => {
      subCategoryRepo.rows.push({
        id: 50, name: 'דלק', categoryId: 1, chartOwnerKey: 'CLIENT_OTHER_BIZ',
        isActive: true, isPrivate: false, accountId: 1,
      });
    });

    it('resolves an in-scope id', async () => {
      subCategoryRepo.rows.push({
        id: 51, name: 'דלק', categoryId: 1, chartOwnerKey: SYS,
        isActive: true, isPrivate: false, accountId: 1,
      });
      const resolved = await service.resolveSubCategory(51, { businessNumber: '123456789' });
      expect(resolved.subCategory.id).toBe(51);
    });

    it('404s for an id belonging to another tenant (existence not leaked)', async () => {
      await expect(service.resolveSubCategory(50, { businessNumber: '123456789' }))
        .rejects.toThrow('Sub-category 50 not found');
    });

    it('404s for a missing id', async () => {
      await expect(service.resolveSubCategory(999, { businessNumber: '123456789' }))
        .rejects.toThrow('Sub-category 999 not found');
    });

    it('without ctx, resolves any id (internal/legacy callers)', async () => {
      const resolved = await service.resolveSubCategory(50);
      expect(resolved.subCategory.id).toBe(50);
    });
  });

  // ── repointSubCategoryAccount (Phase 4.2 / D9) ─────────────────────────

  describe('repointSubCategoryAccount', () => {
    const ctx = { userId: 'uid-1', businessNumber: '123456789' };

    beforeEach(() => {
      accountRepo.rows.push({
        id: 2, code: '80010', name: 'כרטיס לקוח', type: 'expense', sectionId: 99,
        chartOwnerKey: CLIENT, isActive: true,
      });
    });

    it('CLIENT sub_category → repoints in place + APPROVED', async () => {
      subCategoryRepo.rows.push({
        id: 60, name: 'דלק', categoryId: 1, chartOwnerKey: CLIENT,
        isActive: true, isPrivate: false, accountId: 1,
        approvalStatus: ApprovalStatus.MISSING_ACCOUNTING_MAPPING,
      });

      const result = await service.repointSubCategoryAccount(60, 2, ctx);

      expect(result.id).toBe(60);
      expect(result.accountId).toBe(2);
      expect(result.approvalStatus).toBe(ApprovalStatus.APPROVED);
    });

    it('SYSTEM sub_category → never edited; creates a same-named CLIENT override row', async () => {
      subCategoryRepo.rows.push({
        id: 61, name: 'דלק', categoryId: 1, chartOwnerKey: SYS,
        isActive: true, isPrivate: false, accountId: 1,
        category: { id: 1, name: 'רכב ותחבורה', type: CategoryType.EXPENSE },
      });

      const result = await service.repointSubCategoryAccount(61, 2, ctx);

      // The SYSTEM row itself is untouched.
      const systemRow = subCategoryRepo.rows.find((r: any) => r.id === 61);
      expect(systemRow.accountId).toBe(1);
      // A CLIENT override row now exists and points at the new card.
      expect(result.id).not.toBe(61);
      expect(result.chartOwnerKey).toBe(CLIENT);
      expect(result.name).toBe('דלק');
      expect(result.accountId).toBe(2);
    });

    it('SYSTEM sub_category with an EXISTING client override → repoints the override', async () => {
      subCategoryRepo.rows.push(
        {
          id: 61, name: 'דלק', categoryId: 1, chartOwnerKey: SYS,
          isActive: true, isPrivate: false, accountId: 1,
          category: { id: 1, name: 'רכב ותחבורה', type: CategoryType.EXPENSE },
        },
        {
          id: 62, name: 'דלק', categoryId: 5, chartOwnerKey: CLIENT,
          isActive: true, isPrivate: false, accountId: 1,
        },
      );
      categoryRepo.rows.push({ id: 5, name: 'רכב ותחבורה', type: CategoryType.EXPENSE, chartOwnerKey: CLIENT, isActive: true });

      const result = await service.repointSubCategoryAccount(61, 2, ctx);

      expect(result.id).toBe(62);
      expect(result.accountId).toBe(2);
      expect(subCategoryRepo.rows.filter((r: any) => r.name === 'דלק' && r.chartOwnerKey === CLIENT)).toHaveLength(1);
    });

    it('account outside the context scope → 404', async () => {
      accountRepo.rows.push({
        id: 3, code: '80020', name: 'של עסק אחר', type: 'expense', sectionId: 99,
        chartOwnerKey: 'CLIENT_OTHER', isActive: true,
      });
      subCategoryRepo.rows.push({
        id: 63, name: 'דלק', categoryId: 1, chartOwnerKey: CLIENT,
        isActive: true, isPrivate: false, accountId: 1,
      });
      await expect(service.repointSubCategoryAccount(63, 3, ctx)).rejects.toThrow('Account 3 not found');
    });

    // ── Phase 5.1: ACCOUNTANT rows get the same never-edit protection ──────

    it('ACCOUNTANT sub_category → never edited from a client ctx; creates a CLIENT override row', async () => {
      const accountantCtx = { ...ctx, accountantIds: ['agent-1'] };
      subCategoryRepo.rows.push({
        id: 70, name: 'איתוראן', categoryId: 1, chartOwnerKey: 'ACCOUNTANT_agent-1',
        isActive: true, isPrivate: false, accountId: 1,
        category: { id: 1, name: 'רכב ותחבורה', type: CategoryType.EXPENSE },
      });

      const result = await service.repointSubCategoryAccount(70, 2, accountantCtx);

      // The shared ACCOUNTANT row is untouched — editing it would re-map
      // every other client of that accountant.
      const accountantRow = subCategoryRepo.rows.find((r: any) => r.id === 70);
      expect(accountantRow.accountId).toBe(1);
      expect(result.id).not.toBe(70);
      expect(result.chartOwnerKey).toBe(CLIENT);
      expect(result.accountId).toBe(2);
    });
  });

  // ── findOrCreateVariantAccount ─────────────────────────────────────────

  describe('findOrCreateVariantAccount', () => {
    const law100 = { vatPercent: 100, taxPercent: 100, reductionPercent: 0, isEquipment: false, recognitionType: RecognitionType.RECOGNIZED };

    it('reuses an existing card with the exact same law in scope', async () => {
      accountRepo.rows.push({
        id: 2,
        code: '80000',
        name: 'existing variant',
        chartOwnerKey: CLIENT,
        isActive: true,
        ...law100,
      });

      const scope = { ownerType: OwnerType.CLIENT, chartOwnerKey: CLIENT, businessNumber: '123456789' };
      const result = await service.findOrCreateVariantAccount(scope, law100, 'דלק');

      expect(result?.id).toBe(2);
      expect(allocator.getNextAccountCode).not.toHaveBeenCalled();
    });

    it('creates a new card inheriting sectionId from the base account', async () => {
      const baseAccount = accountRepo.rows[0]; // SYSTEM דלק card, sectionId 99
      const scope = { ownerType: OwnerType.CLIENT, chartOwnerKey: CLIENT, businessNumber: '123456789' };

      const result = await service.findOrCreateVariantAccount(scope, law100, 'דלק', baseAccount, 'רכב ותחבורה');

      expect(result).not.toBeNull();
      expect(result?.sectionId).toBe(99);
      expect(result?.code).toBe('80000');
      expect(allocator.getNextAccountCode).toHaveBeenCalledWith({
        ownerType: OwnerType.CLIENT,
        type: 'expense',
        chartOwnerKey: CLIENT,
      });
    });

    it('refuses (returns null) rather than creating a sectionless card when no base account and no matching SYSTEM section exist', async () => {
      const scope = { ownerType: OwnerType.CLIENT, chartOwnerKey: CLIENT, businessNumber: '123456789' };

      const result = await service.findOrCreateVariantAccount(scope, law100, 'משהו חדש', null, 'קטגוריה שלא קיימת');

      expect(result).toBeNull();
      expect(allocator.getNextAccountCode).not.toHaveBeenCalled();
    });

    it('falls back to a SYSTEM section matching the category name when there is no base account', async () => {
      const scope = { ownerType: OwnerType.CLIENT, chartOwnerKey: CLIENT, businessNumber: '123456789' };

      // categoryName matches the seeded section's name directly.
      const result = await service.findOrCreateVariantAccount(scope, law100, 'דלק', null, 'רכב ותחבורה');

      expect(result?.sectionId).toBe(99);
    });
  });

  // ── createSubCategory ──────────────────────────────────────────────────

  describe('createSubCategory', () => {
    // Deliberately a category name with NO matching SYSTEM section, so the
    // MISSING_ACCOUNTING_MAPPING test below actually exercises the refusal
    // path rather than the "fall back to a same-named section" path.
    const category = { id: 1, name: 'קטגוריה שלא קיימת', type: CategoryType.EXPENSE, chartOwnerKey: SYS };
    const scope = { ownerType: OwnerType.CLIENT, chartOwnerKey: CLIENT, businessNumber: '123456789' };

    it('isPrivate never resolves an account and is APPROVED', async () => {
      const sub = await service.createSubCategory(scope, category as any, 'הוצאה פרטית', { isPrivate: true });
      expect(sub.accountId).toBeNull();
      expect(sub.approvalStatus).toBe(ApprovalStatus.APPROVED);
      expect(allocator.getNextAccountCode).not.toHaveBeenCalled();
    });

    it('ANNUAL reportScope never resolves an account and is APPROVED', async () => {
      const sub = await service.createSubCategory(scope, category as any, 'תרומה', {
        reportScope: ExpenseReportScope.ANNUAL,
      });
      expect(sub.accountId).toBeNull();
      expect(sub.approvalStatus).toBe(ApprovalStatus.APPROVED);
    });

    it('a law with no resolvable base card/section lands MISSING_ACCOUNTING_MAPPING, not an error', async () => {
      const sub = await service.createSubCategory(scope, category as any, 'תת קטגוריה חדשה לגמרי', {
        law: { vatPercent: 50, taxPercent: 50, reductionPercent: 0, isEquipment: false, recognitionType: RecognitionType.RECOGNIZED },
      });
      expect(sub.accountId).toBeNull();
      expect(sub.approvalStatus).toBe(ApprovalStatus.MISSING_ACCOUNTING_MAPPING);
    });

    it('a law matching an existing SYSTEM sub-category of the same name resolves via the base card', async () => {
      subCategoryRepo.rows.push({
        id: 10,
        categoryId: 1,
        name: 'דלק',
        chartOwnerKey: SYS,
        isActive: true,
        accountId: 1,
        account: accountRepo.rows[0],
      });

      const sub = await service.createSubCategory(scope, category as any, 'דלק', {
        law: { vatPercent: 100, taxPercent: 100, reductionPercent: 0, isEquipment: false, recognitionType: RecognitionType.RECOGNIZED },
      });

      expect(sub.approvalStatus).toBe(ApprovalStatus.APPROVED);
      expect(sub.accountId).not.toBeNull();
      const created = accountRepo.rows.find((a: any) => a.id === sub.accountId);
      expect(created?.sectionId).toBe(99); // inherited from the base דלק card
    });
  });

  // ── getMergedExpenseCatalog ──────────────────────────────────────────────
  // Regression coverage for the 2026-07-12 documents.service.ts bug:
  // buildExtractionCatalog (OCR/GET /documents/me/catalog) was still reading
  // the legacy DefaultSubCategory/UserSubCategory tables directly, which 500s
  // against a real prod-shaped DB (DefaultSubCategory.subAccountCode was
  // never actually present in production — schema-drift.md Gap 1). Ported to
  // this method instead.

  describe('getMergedExpenseCatalog', () => {
    it('returns EXPENSE sub-categories across ALL categories, not scoped to one categoryId', async () => {
      subCategoryRepo.rows.push({
        id: 10,
        categoryId: 1,
        name: 'דלק',
        chartOwnerKey: SYS,
        isActive: true,
        accountId: 1,
        account: accountRepo.rows[0],
        category: categoryRepo.rows[0],
      });

      const catalog = await service.getMergedExpenseCatalog({ businessNumber: '123456789' });

      expect(catalog).toHaveLength(1);
      expect(catalog[0]).toMatchObject({ name: 'דלק', chartOwnerKey: SYS });
      expect(catalog[0].account?.taxPercent).toBe(45);
    });

    it('CLIENT override wins over SYSTEM by name (D4)', async () => {
      subCategoryRepo.rows.push(
        { id: 10, categoryId: 1, name: 'דלק', chartOwnerKey: SYS, isActive: true, accountId: 1, account: accountRepo.rows[0] },
        { id: 11, categoryId: 1, name: 'דלק', chartOwnerKey: CLIENT, isActive: true, accountId: 1, account: accountRepo.rows[0] },
      );

      const catalog = await service.getMergedExpenseCatalog({ businessNumber: '123456789' });
      const delek = catalog.filter((s) => s.name === 'דלק');
      expect(delek).toHaveLength(1);
      expect(delek[0].chartOwnerKey).toBe(CLIENT);
    });

    it('excludes INCOME categories', async () => {
      categoryRepo.rows.push({ id: 2, name: 'שכר', type: CategoryType.INCOME, chartOwnerKey: SYS, isActive: true });
      subCategoryRepo.rows.push({
        id: 20, categoryId: 2, name: 'משכורת', chartOwnerKey: SYS, isActive: true, accountId: null, account: null,
      });

      const catalog = await service.getMergedExpenseCatalog({ businessNumber: '123456789' });
      expect(catalog.find((s) => s.name === 'משכורת')).toBeUndefined();
    });
  });

  // ── getCategoryNamesForUser (Phase 4.6 — replaced the legacy-table merge) ──

  describe('getCategoryNamesForUser', () => {
    it('returns SYSTEM + the user-owned category names, deduplicated', async () => {
      categoryRepo.rows.push(
        { id: 30, name: 'רכב ותחבורה', chartOwnerKey: SYS, isActive: true, userId: null },
        { id: 31, name: 'קטגוריה שלי', chartOwnerKey: 'CLIENT_111', isActive: true, userId: 'uid-1' },
        { id: 32, name: 'רכב ותחבורה', chartOwnerKey: 'CLIENT_111', isActive: true, userId: 'uid-1' },
        { id: 33, name: 'של מישהו אחר', chartOwnerKey: 'CLIENT_222', isActive: true, userId: 'uid-2' },
      );

      const names = await service.getCategoryNamesForUser('uid-1');

      expect(names).toContain('רכב ותחבורה');
      expect(names).toContain('קטגוריה שלי');
      expect(names).not.toContain('של מישהו אחר');
      expect(names.filter((n) => n === 'רכב ותחבורה')).toHaveLength(1);
    });
  });
});
