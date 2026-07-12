import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Category } from './category.entity';
import { SubCategory } from './sub-category.entity';
import { BookingAccount } from './account.entity';
import { AccountingSection } from './accounting-section.entity';
import { AccountCodeAllocatorService } from './account-code-allocator.service';
import {
  ApprovalStatus,
  CategoryType,
  ExpenseNecessity,
  ExpenseReportScope,
  OwnerType,
  RecognitionType,
  SYSTEM_CHART_OWNER_KEY,
  VisibilityScope,
} from 'src/enum';

export interface CatalogContext {
  userId?: string | null;
  accountantId?: string | null;
  businessNumber?: string | null;
}

export interface ResolvedSubCategory {
  subCategory: SubCategory;
  account: BookingAccount | null;
  section: AccountingSection | null;
  code6111: string | null;
  vatPercent: number | null;
  taxPercent: number | null;
  isEquipment: boolean | null;
  reductionPercent: number | null;
  recognitionType: RecognitionType | null;
}

/**
 * Write scope for a create/update: who the new row belongs to (D4). Built by
 * `buildScope` from a `CatalogContext` + the caller's declared `ownerType` —
 * the CRUD layer (ExpensesService today) always knows which scope a given
 * endpoint targets (admin default-catalog endpoints => SYSTEM, client
 * endpoints => CLIENT), it is never inferred from precedence.
 */
export interface CatalogScope {
  ownerType: OwnerType;
  chartOwnerKey: string;
  accountantId?: string | null;
  userId?: string | null;
  businessNumber?: string | null;
  visibilityScope?: VisibilityScope | null;
}

/** The full accounting law a booking_account carries (D1 revised). */
export interface AccountLaw {
  vatPercent: number;
  taxPercent: number;
  reductionPercent: number;
  isEquipment: boolean;
  recognitionType: RecognitionType;
}

export interface CreateSubCategoryInput {
  isPrivate?: boolean;
  /** Legacy percent-bearing path (old CreateUserSubCategoryDto shape) — resolves
   *  to a card via findOrCreateVariantAccount rather than living on the row. */
  law?: AccountLaw;
  /** Direct pointer, when the caller already resolved an account (e.g. future
   *  D11 accountant flow). Takes precedence over `law` when both are given. */
  accountId?: number | null;
  necessity?: ExpenseNecessity;
  reportScope?: ExpenseReportScope;
  createdByUserId?: string | null;
}

/**
 * Single resolution + CRUD point for the D1 four-table catalog model,
 * replacing the old default_/user_ four-table 5-level chain (Phase 2.3 read
 * side; Phase 2.4 the write side). CLIENT > ACCOUNTANT > SYSTEM precedence
 * by name throughout (D4).
 *
 * Phase 4.6: the `resolveAccountCode` transition adapter (string pair in /
 * code out, with a silent '60000' fallback) is GONE — every write path
 * resolves through resolveSubCategory/resolveByName and rejects unmappable
 * classifications instead of falling back.
 */
@Injectable()
export class CatalogService {
  constructor(
    @InjectRepository(Category) private readonly categoryRepo: Repository<Category>,
    @InjectRepository(SubCategory) private readonly subCategoryRepo: Repository<SubCategory>,
    @InjectRepository(BookingAccount) private readonly accountRepo: Repository<BookingAccount>,
    @InjectRepository(AccountingSection) private readonly sectionRepo: Repository<AccountingSection>,
    private readonly accountCodeAllocator: AccountCodeAllocatorService,
  ) {}

  private chartOwnerKeysFor(ctx: CatalogContext): string[] {
    // Precedence order — earlier entries win (D4: CLIENT > ACCOUNTANT > SYSTEM).
    const keys: string[] = [];
    if (ctx.businessNumber) keys.push(`CLIENT_${ctx.businessNumber}`);
    if (ctx.accountantId) keys.push(`ACCOUNTANT_${ctx.accountantId}`);
    keys.push(SYSTEM_CHART_OWNER_KEY);
    return keys;
  }

  /**
   * Build the write-scope for a create/update targeting `ownerType`. Unlike
   * `chartOwnerKeysFor` (read precedence), this is never inferred — the
   * caller always knows which scope an endpoint targets.
   */
  buildScope(ownerType: OwnerType, ctx: CatalogContext): CatalogScope {
    if (ownerType === OwnerType.SYSTEM) {
      return { ownerType: OwnerType.SYSTEM, chartOwnerKey: SYSTEM_CHART_OWNER_KEY };
    }
    if (ownerType === OwnerType.CLIENT) {
      if (!ctx.businessNumber) {
        throw new BadRequestException('businessNumber is required for a CLIENT-scoped catalog write');
      }
      return {
        ownerType: OwnerType.CLIENT,
        chartOwnerKey: `CLIENT_${ctx.businessNumber}`,
        userId: ctx.userId ?? null,
        businessNumber: ctx.businessNumber,
        visibilityScope: null,
      };
    }
    // ACCOUNTANT
    if (!ctx.accountantId) {
      throw new BadRequestException('accountantId is required for an ACCOUNTANT-scoped catalog write');
    }
    return {
      ownerType: OwnerType.ACCOUNTANT,
      chartOwnerKey: `ACCOUNTANT_${ctx.accountantId}`,
      accountantId: ctx.accountantId,
      visibilityScope: VisibilityScope.ALL_ACCOUNTANT_CLIENTS,
    };
  }

  /** Merged category list for a business context, CLIENT > ACCOUNTANT > SYSTEM
   *  by name (D4). */
  async getMergedCategories(ctx: CatalogContext, type?: CategoryType): Promise<Category[]> {
    const chartOwnerKeys = this.chartOwnerKeysFor(ctx);
    const rows = await this.categoryRepo.find({
      where: { chartOwnerKey: In(chartOwnerKeys), isActive: true, ...(type ? { type } : {}) },
    });
    return this.mergeByName(rows, chartOwnerKeys, (c) => c.name);
  }

  async getMergedSubCategories(ctx: CatalogContext, categoryId: number): Promise<SubCategory[]> {
    const chartOwnerKeys = this.chartOwnerKeysFor(ctx);
    const rows = await this.subCategoryRepo.find({
      where: { chartOwnerKey: In(chartOwnerKeys), categoryId, isActive: true },
      relations: ['account', 'category'],
    });
    return this.mergeByName(rows, chartOwnerKeys, (s) => s.name);
  }

  /**
   * Merged (CLIENT > ACCOUNTANT > SYSTEM) list of every active EXPENSE
   * sub-category for a business context, across ALL categories at once —
   * unlike getMergedSubCategories, not scoped to one categoryId. Feeds the
   * OCR extraction catalog (documents.service.ts buildExtractionCatalog):
   * the allowed-category hint sent to Claude and the review dialog's
   * dropdown list.
   */
  async getMergedExpenseCatalog(ctx: CatalogContext): Promise<SubCategory[]> {
    const chartOwnerKeys = this.chartOwnerKeysFor(ctx);
    const categories = await this.categoryRepo.find({
      where: { chartOwnerKey: In(chartOwnerKeys), isActive: true, type: CategoryType.EXPENSE },
    });
    const categoryIds = [...new Set(categories.map((c) => c.id))];
    if (categoryIds.length === 0) return [];
    const rows = await this.subCategoryRepo.find({
      where: { chartOwnerKey: In(chartOwnerKeys), categoryId: In(categoryIds), isActive: true },
      relations: ['account', 'category'],
    });
    return this.mergeByName(rows, chartOwnerKeys, (s) => s.name);
  }

  /** All active rows for one chartOwnerKey (admin/user "list everything I own"
   *  endpoints — getAllDefaultSubCategories / getAllUserSubCategories). */
  async findCategoriesByChartOwnerKey(chartOwnerKey: string): Promise<Category[]> {
    return this.categoryRepo.find({ where: { chartOwnerKey, isActive: true }, order: { name: 'ASC' } });
  }

  async findSubCategoriesByChartOwnerKey(chartOwnerKey: string): Promise<SubCategory[]> {
    return this.subCategoryRepo.find({
      where: { chartOwnerKey, isActive: true },
      relations: ['account', 'category'],
      order: { name: 'ASC' },
    });
  }

  async findCategoryInScope(id: number, chartOwnerKey: string): Promise<Category | null> {
    return this.categoryRepo.findOne({ where: { id, chartOwnerKey, isActive: true } });
  }

  async findSubCategoryInScope(id: number, chartOwnerKey: string): Promise<SubCategory | null> {
    return this.subCategoryRepo.findOne({
      where: { id, chartOwnerKey, isActive: true },
      relations: ['account', 'category'],
    });
  }

  /** Unmerged, single-chartOwnerKey lookup — used for "does the CALLER's own
   *  row with this name already exist" checks (addUserCategory / the
   *  sub-category duplicate check), which historically only ever checked the
   *  caller's own table, never the SYSTEM defaults (a CLIENT row with the
   *  same name as a SYSTEM row is a valid override, not a duplicate — D4). */
  async findCategoryInSingleScope(chartOwnerKey: string, name: string, type?: CategoryType): Promise<Category | null> {
    return this.categoryRepo.findOne({
      where: { chartOwnerKey, name: name?.trim(), isActive: true, ...(type ? { type } : {}) },
    });
  }

  async findSubCategoryInSingleScope(chartOwnerKey: string, categoryId: number, name: string): Promise<SubCategory | null> {
    return this.subCategoryRepo.findOne({
      where: { chartOwnerKey, categoryId, name: name?.trim(), isActive: true },
    });
  }

  /** Name lookup honoring D4 precedence (used to translate the legacy
   *  categoryName-string DTOs into a categoryId). */
  async findCategoryByNameInScope(ctx: CatalogContext, name: string, type?: CategoryType): Promise<Category | null> {
    const trimmed = name?.trim();
    if (!trimmed) return null;
    const chartOwnerKeys = this.chartOwnerKeysFor(ctx);
    const rows = await this.categoryRepo.find({
      where: { chartOwnerKey: In(chartOwnerKeys), name: trimmed, isActive: true, ...(type ? { type } : {}) },
    });
    return this.pickByPrecedence(rows, chartOwnerKeys);
  }

  /** Same precedence for a sub_category by (categoryId, name). */
  async findSubCategoryByNameInScope(ctx: CatalogContext, categoryId: number, name: string): Promise<SubCategory | null> {
    const trimmed = name?.trim();
    if (!trimmed) return null;
    const chartOwnerKeys = this.chartOwnerKeysFor(ctx);
    const rows = await this.subCategoryRepo.find({
      where: { chartOwnerKey: In(chartOwnerKeys), categoryId, name: trimmed, isActive: true },
      relations: ['account', 'category'],
    });
    return this.pickByPrecedence(rows, chartOwnerKeys);
  }

  /** The SYSTEM sub_category of this name, if any — the "canonical same-named
   *  card" a variant diverges from (used to inherit sectionId/code6111). */
  private async findSystemSubCategoryByName(name: string): Promise<SubCategory | null> {
    const trimmed = name?.trim();
    if (!trimmed) return null;
    return this.subCategoryRepo.findOne({
      where: { chartOwnerKey: SYSTEM_CHART_OWNER_KEY, name: trimmed, isActive: true },
      relations: ['account'],
    });
  }

  /** Given rows spanning multiple chartOwnerKeys, keep one row per distinct
   *  name — the highest-precedence chartOwnerKey wins (D4's name-keyed
   *  override, same semantics as today's getCategories/getSubCategories merge). */
  private mergeByName<T extends { chartOwnerKey: string }>(
    rows: T[],
    precedenceOrder: string[],
    nameOf: (row: T) => string,
  ): T[] {
    const rank = new Map(precedenceOrder.map((key, i) => [key, i]));
    const byName = new Map<string, T>();
    for (const row of rows) {
      const name = nameOf(row);
      const existing = byName.get(name);
      if (!existing || (rank.get(row.chartOwnerKey) ?? Infinity) < (rank.get(existing.chartOwnerKey) ?? Infinity)) {
        byName.set(name, row);
      }
    }
    return [...byName.values()];
  }

  private pickByPrecedence<T extends { chartOwnerKey: string }>(rows: T[], precedenceOrder: string[]): T | null {
    for (const key of precedenceOrder) {
      const match = rows.find((r) => r.chartOwnerKey === key);
      if (match) return match;
    }
    return null;
  }

  /** subCategoryId -> account -> the FULL accounting law (D1/D3 revised) —
   *  consumed by Phase 4's snapshot/journal write paths.
   *
   *  When `ctx` is provided the row's chartOwnerKey must be visible to that
   *  context (CLIENT_{biz} / ACCOUNTANT_{id} / SYSTEM) — without this check,
   *  any authenticated caller could classify onto another tenant's private
   *  sub_category by guessing ids. Out-of-scope ids 404 exactly like missing
   *  ones so existence is not leaked. */
  async resolveSubCategory(subCategoryId: number, ctx?: CatalogContext): Promise<ResolvedSubCategory> {
    const subCategory = await this.subCategoryRepo.findOne({
      where: { id: subCategoryId },
      relations: ['account', 'account.section', 'category'],
    });
    if (!subCategory || (ctx && !this.chartOwnerKeysFor(ctx).includes(subCategory.chartOwnerKey))) {
      throw new NotFoundException(`Sub-category ${subCategoryId} not found`);
    }
    return this.toResolved(subCategory);
  }

  private toResolved(subCategory: SubCategory): ResolvedSubCategory {
    const account = subCategory.account ?? null;
    return {
      subCategory,
      account,
      section: account?.section ?? null,
      code6111: account?.code6111 ?? null,
      vatPercent: account?.vatPercent ?? null,
      taxPercent: account?.taxPercent ?? null,
      isEquipment: account?.isEquipment ?? null,
      reductionPercent: account?.reductionPercent ?? null,
      recognitionType: account?.recognitionType ?? null,
    };
  }

  /**
   * Name-based resolution (categoryName, subCategoryName) -> full law, honoring
   * D4 precedence. Used by ExpensesService's legacy-DTO resolvers
   * (getSubCategoryIsEquipment/getSubCategoryReportScope) which only have
   * strings to go on until Phase 4 moves expense creation to subCategoryId.
   * Returns null when unresolved (private, or no matching row) so callers
   * can tell "unknown" apart from "known but zero".
   */
  async resolveByName(
    categoryName: string,
    subCategoryName: string,
    ctx: CatalogContext,
  ): Promise<ResolvedSubCategory | null> {
    const category = categoryName?.trim();
    const subCategory = subCategoryName?.trim();
    if (!category || !subCategory) return null;

    const chartOwnerKeys = this.chartOwnerKeysFor(ctx);
    const categoryRows = await this.categoryRepo.find({
      where: { chartOwnerKey: In(chartOwnerKeys), name: category, isActive: true },
    });
    const categoryRow = this.pickByPrecedence(categoryRows, chartOwnerKeys);
    if (!categoryRow) return null;

    const subCategoryRows = await this.subCategoryRepo.find({
      where: { chartOwnerKey: In(chartOwnerKeys), categoryId: categoryRow.id, name: subCategory, isActive: true },
      relations: ['account', 'account.section', 'category'],
    });
    const subCategoryRow = this.pickByPrecedence(subCategoryRows, chartOwnerKeys);
    if (!subCategoryRow) return null;
    return this.toResolved(subCategoryRow);
  }

  /**
   * Legacy-table-free replacement for the OLD merged category-name list
   * (default_category ∪ user_category by firebaseId) that
   * TransactionsService's legacy transactions-table filter consumed
   * (Phase 4.6). Keyed by firebaseId across ALL the user's businesses —
   * exactly the old read's semantics — plus SYSTEM.
   */
  async getCategoryNamesForUser(firebaseId: string): Promise<string[]> {
    const rows = await this.categoryRepo.find({
      where: [
        { chartOwnerKey: SYSTEM_CHART_OWNER_KEY, isActive: true },
        { userId: firebaseId, isActive: true },
      ],
      select: { name: true } as any,
    });
    return [...new Set(rows.map((r) => r.name))];
  }

  // ==========================================================================
  // Write side (Phase 2.4) — CRUD backing ExpensesService's ported endpoints.
  // ==========================================================================

  async findOrCreateCategory(
    scope: CatalogScope,
    name: string,
    type: CategoryType,
    createdByUserId?: string | null,
  ): Promise<Category> {
    const trimmed = name?.trim();
    if (!trimmed) throw new BadRequestException('categoryName is required');

    const existing = await this.categoryRepo.findOne({
      where: { chartOwnerKey: scope.chartOwnerKey, name: trimmed, type, isActive: true },
    });
    if (existing) return existing;

    return this.categoryRepo.save(
      this.categoryRepo.create({
        name: trimmed,
        type,
        ownerType: scope.ownerType,
        chartOwnerKey: scope.chartOwnerKey,
        accountantId: scope.accountantId ?? null,
        userId: scope.userId ?? null,
        businessNumber: scope.businessNumber ?? null,
        visibilityScope: scope.visibilityScope ?? null,
        isDefault: scope.ownerType === OwnerType.SYSTEM,
        createdByUserId: createdByUserId ?? null,
      }),
    );
  }

  /**
   * Find-or-create a booking_account carrying exactly `law` in `scope`
   * (D1: "a different percentage combination = a different card").
   *
   * Section resolution (corrected 2026-07-12 review — same rule the Phase
   * 2.2 migration used for percent-variant rows): a created variant NEVER
   * gets a null sectionId — that would silently drop the expense from the
   * P&L. Resolution order: (1) `baseAccount.sectionId` — the canonical
   * same-named card this variant diverges from; (2) a SYSTEM section whose
   * name matches `categoryName`, if resolvable; (3) refuse (return null) —
   * the caller must land the sub_category as MISSING_ACCOUNTING_MAPPING
   * instead of creating a sectionless card.
   */
  async findOrCreateVariantAccount(
    scope: CatalogScope,
    law: AccountLaw,
    nameHint: string,
    baseAccount?: BookingAccount | null,
    categoryName?: string | null,
  ): Promise<BookingAccount | null> {
    const existing = await this.accountRepo.findOne({
      where: {
        chartOwnerKey: scope.chartOwnerKey,
        isActive: true,
        vatPercent: law.vatPercent,
        taxPercent: law.taxPercent,
        reductionPercent: law.reductionPercent,
        isEquipment: law.isEquipment,
        recognitionType: law.recognitionType,
      },
    });
    if (existing) return existing;

    const sectionId = await this.resolveVariantSectionId(baseAccount, categoryName);
    if (sectionId === null) return null;

    const code = await this.accountCodeAllocator.getNextAccountCode({
      ownerType: scope.ownerType,
      type: 'expense',
      chartOwnerKey: scope.chartOwnerKey,
    });

    const lawSummary = `מוכר ${law.taxPercent}%/${law.vatPercent}%`;
    return this.accountRepo.save(
      this.accountRepo.create({
        code,
        name: `${nameHint} — ${lawSummary}`,
        type: 'expense',
        sectionId,
        code6111: baseAccount?.code6111 ?? null,
        vatPercent: law.vatPercent,
        taxPercent: law.taxPercent,
        reductionPercent: law.reductionPercent,
        isEquipment: law.isEquipment,
        recognitionType: law.recognitionType,
        ownerType: scope.ownerType,
        chartOwnerKey: scope.chartOwnerKey,
        accountantId: scope.accountantId ?? null,
        userId: scope.userId ?? null,
        businessNumber: scope.businessNumber ?? null,
        visibilityScope: scope.visibilityScope ?? null,
        isActive: true,
      }),
    );
  }

  private async resolveVariantSectionId(
    baseAccount?: BookingAccount | null,
    categoryName?: string | null,
  ): Promise<number | null> {
    if (baseAccount?.sectionId) return baseAccount.sectionId;
    const trimmed = categoryName?.trim();
    if (trimmed) {
      const section = await this.sectionRepo.findOne({
        where: { chartOwnerKey: SYSTEM_CHART_OWNER_KEY, name: trimmed, isActive: true },
      });
      if (section) return section.id;
    }
    return null;
  }

  /**
   * Create a thin sub_category in `scope` under `category`. When `input.law`
   * is given (the legacy percent-bearing DTO path) and no explicit
   * `accountId`, resolves/creates the matching card via
   * findOrCreateVariantAccount, using the SYSTEM sub_category of the same
   * name (if any) as the base card for section/6111 inheritance. Falls back
   * to MISSING_ACCOUNTING_MAPPING (not an error) when no card can be
   * resolved without inventing a section.
   */
  async createSubCategory(scope: CatalogScope, category: Category, name: string, input: CreateSubCategoryInput): Promise<SubCategory> {
    const trimmed = name?.trim();
    if (!trimmed) throw new BadRequestException('subCategoryName is required');

    let accountId: number | null = input.accountId ?? null;
    let approvalStatus = ApprovalStatus.APPROVED;
    const isAnnual = input.reportScope === ExpenseReportScope.ANNUAL;

    if (input.isPrivate || isAnnual) {
      // Neither PRIVATE nor ANNUAL rows ever carry an account (D5 / D14
      // decision 2 respectively) — accountId stays whatever was passed
      // (normally null) and this is APPROVED, not MISSING_ACCOUNTING_MAPPING.
    } else if (accountId == null && input.law) {
      const baseAccount = await this.findSystemSubCategoryByName(trimmed).then((s) => s?.account ?? null);
      const account = await this.findOrCreateVariantAccount(scope, input.law, trimmed, baseAccount, category.name);
      if (account) {
        accountId = account.id;
      } else {
        approvalStatus = ApprovalStatus.MISSING_ACCOUNTING_MAPPING;
      }
    } else if (accountId == null) {
      approvalStatus = ApprovalStatus.MISSING_ACCOUNTING_MAPPING;
    }

    return this.subCategoryRepo.save(
      this.subCategoryRepo.create({
        categoryId: category.id,
        name: trimmed,
        isPrivate: input.isPrivate ?? false,
        accountId: input.isPrivate ? null : accountId,
        necessity: input.necessity ?? ExpenseNecessity.IMPORTANT,
        reportScope: input.reportScope ?? ExpenseReportScope.PNL,
        ownerType: scope.ownerType,
        chartOwnerKey: scope.chartOwnerKey,
        accountantId: scope.accountantId ?? null,
        userId: scope.userId ?? null,
        businessNumber: scope.businessNumber ?? null,
        visibilityScope: scope.visibilityScope ?? null,
        approvalStatus,
        isDefault: scope.ownerType === OwnerType.SYSTEM,
        createdByUserId: input.createdByUserId ?? null,
      }),
    );
  }

  /**
   * Re-resolve/create the variant card for a sub_category's new law and
   * repoint accountId — never mutates the old card in place (D10: "percents
   * are never edited in place — they belong to the card").
   */
  async updateSubCategoryLaw(sub: SubCategory, scope: CatalogScope, law: AccountLaw): Promise<SubCategory> {
    const baseAccount = sub.account ?? (await this.findSystemSubCategoryByName(sub.name).then((s) => s?.account ?? null));
    const category = sub.category ?? (await this.categoryRepo.findOne({ where: { id: sub.categoryId } }));
    const account = await this.findOrCreateVariantAccount(scope, law, sub.name, baseAccount, category?.name ?? null);
    sub.accountId = account?.id ?? null;
    sub.approvalStatus = account ? ApprovalStatus.APPROVED : ApprovalStatus.MISSING_ACCOUNTING_MAPPING;
    return this.subCategoryRepo.save(sub);
  }

  /** Soft delete — a hard delete of a SYSTEM category could orphan CLIENT
   *  sub_categories pointing at it by categoryId (D4 merge reads by name,
   *  but categoryId FKs on sub_category are real). */
  async deleteCategory(category: Category): Promise<void> {
    category.isActive = false;
    await this.categoryRepo.save(category);
  }

  async deleteSubCategory(sub: SubCategory): Promise<void> {
    sub.isActive = false;
    await this.subCategoryRepo.save(sub);
  }

  async findCategoryById(id: number): Promise<Category | null> {
    return this.categoryRepo.findOne({ where: { id } });
  }

  /** Look up an existing chart account by its exact code (seeder use — the
   *  flat catalog seed points sub_category rows at already-known SYSTEM
   *  chart codes, never through the variant-law resolution path). */
  async findAccountByCode(chartOwnerKey: string, code: string): Promise<BookingAccount | null> {
    return this.accountRepo.findOne({ where: { chartOwnerKey, code } });
  }

  /** Persist non-law field changes (necessity/reportScope/...) without
   *  touching accountId — callers that only need updateSubCategoryLaw's
   *  card-repointing skip this and call that instead. */
  async saveSubCategory(sub: SubCategory): Promise<SubCategory> {
    return this.subCategoryRepo.save(sub);
  }

  async saveCategory(category: Category): Promise<Category> {
    return this.categoryRepo.save(category);
  }

  // ==========================================================================
  // Phase 4.2 — reclassification primitives (D10).
  // ==========================================================================

  /** Account by code across the context's visible chart owners, CLIENT >
   *  ACCOUNTANT > SYSTEM precedence (Phase 4.2 override-mapping lookup).
   *  Loads the section relation — callers snapshot section fields from it. */
  async findAccountByCodeInScope(code: string, ctx: CatalogContext): Promise<BookingAccount | null> {
    const trimmed = code?.trim();
    if (!trimmed) return null;
    const chartOwnerKeys = this.chartOwnerKeysFor(ctx);
    const rows = await this.accountRepo.find({
      where: { chartOwnerKey: In(chartOwnerKeys), code: trimmed, isActive: true },
      relations: ['section'],
    });
    return this.pickByPrecedence(rows, chartOwnerKeys);
  }

  /** Account by id, validated against the context's visible chart owners —
   *  same no-existence-leak semantics as resolveSubCategory's scope check. */
  async findAccountByIdInScope(accountId: number, ctx: CatalogContext): Promise<BookingAccount | null> {
    const account = await this.accountRepo.findOne({
      where: { id: accountId, isActive: true },
      relations: ['section'],
    });
    if (!account || !this.chartOwnerKeysFor(ctx).includes(account.chartOwnerKey)) return null;
    return account;
  }

  /**
   * D9's "החל גם על סיווגים עתידיים" primitive (Phase 4.2; Phase 5.3 reuses
   * it): repoint a sub_category at a different card so FUTURE classifications
   * resolve there. History never moves (D10 — no journal or expense writes
   * here).
   *
   * SYSTEM rows are never edited: a same-named CLIENT-scoped override row is
   * created (or repointed when one already exists) — D4 merge precedence
   * makes it win by name for this business.
   */
  async repointSubCategoryAccount(
    subCategoryId: number,
    accountId: number,
    ctx: CatalogContext,
  ): Promise<SubCategory> {
    const sub = await this.subCategoryRepo.findOne({
      where: { id: subCategoryId },
      relations: ['category'],
    });
    if (!sub || !this.chartOwnerKeysFor(ctx).includes(sub.chartOwnerKey)) {
      throw new NotFoundException(`Sub-category ${subCategoryId} not found`);
    }
    if (sub.isPrivate) {
      throw new BadRequestException('תת-קטגוריה פרטית לעולם אינה ממופה לחשבון (D5)');
    }
    const account = await this.findAccountByIdInScope(accountId, ctx);
    if (!account) {
      throw new NotFoundException(`Account ${accountId} not found`);
    }

    if (sub.chartOwnerKey === SYSTEM_CHART_OWNER_KEY) {
      const scope = this.buildScope(OwnerType.CLIENT, ctx);
      const category = await this.findOrCreateCategory(
        scope,
        sub.category?.name ?? '',
        sub.category?.type ?? CategoryType.EXPENSE,
        ctx.userId ?? null,
      );
      const existing = await this.subCategoryRepo.findOne({
        where: { chartOwnerKey: scope.chartOwnerKey, categoryId: category.id, name: sub.name, isActive: true },
      });
      if (existing) {
        existing.accountId = account.id;
        existing.approvalStatus = ApprovalStatus.APPROVED;
        return this.subCategoryRepo.save(existing);
      }
      return this.createSubCategory(scope, category, sub.name, {
        accountId: account.id,
        necessity: sub.necessity,
        reportScope: sub.reportScope,
        createdByUserId: ctx.userId ?? null,
      });
    }

    sub.accountId = account.id;
    sub.approvalStatus = ApprovalStatus.APPROVED;
    return this.subCategoryRepo.save(sub);
  }
}
