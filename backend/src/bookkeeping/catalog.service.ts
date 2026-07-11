import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Category } from './category.entity';
import { SubCategory } from './sub-category.entity';
import { BookingAccount } from './account.entity';
import { AccountingSection } from './accounting-section.entity';
import { CategoryType, RecognitionType, SYSTEM_CHART_OWNER_KEY } from 'src/enum';

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
 * Retired hardcoded fallback ('5000') no longer exists as a booking_account
 * code after Phase 1's renumbering — 60000 ("הוצאות לא מוכרות") is its
 * replacement, the NOT_RECOGNIZED catch-all card.
 */
const FALLBACK_ACCOUNT_CODE = '60000';

/**
 * Single resolution point for the D1 four-table catalog model, replacing the
 * old default_/user_ four-table 5-level chain (Phase 2.3). CLIENT >
 * ACCOUNTANT > SYSTEM precedence by name throughout (D4), generalizing the
 * merge-by-name behavior ExpensesService.getCategories/getSubCategories
 * already implement today.
 */
@Injectable()
export class CatalogService {
  constructor(
    @InjectRepository(Category) private readonly categoryRepo: Repository<Category>,
    @InjectRepository(SubCategory) private readonly subCategoryRepo: Repository<SubCategory>,
  ) {}

  private chartOwnerKeysFor(ctx: CatalogContext): string[] {
    // Precedence order — earlier entries win (D4: CLIENT > ACCOUNTANT > SYSTEM).
    const keys: string[] = [];
    if (ctx.businessNumber) keys.push(`CLIENT_${ctx.businessNumber}`);
    if (ctx.accountantId) keys.push(`ACCOUNTANT_${ctx.accountantId}`);
    keys.push(SYSTEM_CHART_OWNER_KEY);
    return keys;
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
      relations: ['account'],
    });
    return this.mergeByName(rows, chartOwnerKeys, (s) => s.name);
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
   *  what Phase 3/4 will consume directly for snapshot/journal writes. */
  async resolveSubCategory(subCategoryId: number): Promise<ResolvedSubCategory> {
    const subCategory = await this.subCategoryRepo.findOneOrFail({
      where: { id: subCategoryId },
      relations: ['account', 'account.section'],
    });
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
   * Thin adapter over the merged catalog matching the OLD
   * ExpensesService.resolveAccountCode's exact signature (D2.3 — "same
   * signature, string in / code out") so its single caller
   * (buildExpenseJournalLines) needs zero changes beyond delegating here.
   * `firebaseId` is accepted for signature parity with the old resolver
   * only — catalog scoping is by businessNumber (chartOwnerKey), never by
   * firebaseId, per D4.
   *
   * TRANSITION BRIDGE ONLY — TODO(Phase 4): once expense creation/approval
   * resolves through subCategoryId directly (D1/4.1), a PRIVATE or
   * unmapped sub_category is rejected before journal posting is ever
   * attempted — private expenses never reach the journal at all (D5).
   * Falling back to the 60000 catch-all here is only correct while this
   * string-name adapter remains the sole entry point (pre-Phase-4); do not
   * carry this fallback forward into the subCategoryId-based flow.
   */
  async resolveAccountCode(
    categoryName: string,
    subCategoryName: string,
    _firebaseId?: string | null,
    businessNumber?: string | null,
  ): Promise<string> {
    const category = categoryName?.trim();
    const subCategory = subCategoryName?.trim();
    if (!category || !subCategory) return FALLBACK_ACCOUNT_CODE;

    const chartOwnerKeys = businessNumber
      ? [`CLIENT_${businessNumber}`, SYSTEM_CHART_OWNER_KEY]
      : [SYSTEM_CHART_OWNER_KEY];

    const categoryRows = await this.categoryRepo.find({
      where: { chartOwnerKey: In(chartOwnerKeys), name: category },
    });
    const categoryRow = this.pickByPrecedence(categoryRows, chartOwnerKeys);
    if (!categoryRow) return FALLBACK_ACCOUNT_CODE;

    const subCategoryRows = await this.subCategoryRepo.find({
      where: { chartOwnerKey: In(chartOwnerKeys), categoryId: categoryRow.id, name: subCategory },
      relations: ['account'],
    });
    const subCategoryRow = this.pickByPrecedence(subCategoryRows, chartOwnerKeys);
    if (!subCategoryRow || subCategoryRow.isPrivate || !subCategoryRow.account) {
      return FALLBACK_ACCOUNT_CODE;
    }
    return subCategoryRow.account.code;
  }
}
