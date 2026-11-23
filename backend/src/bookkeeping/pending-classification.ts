import { EntityManager, In, IsNull } from 'typeorm';
import type { CatalogService, ResolvedSubCategory } from './catalog.service';
import { Business } from '../business/business.entity';
import { Delegation, DelegationStatus } from '../delegation/delegation.entity';
import { SlimTransaction } from '../transactions/slim-transaction.entity';
import { FullTransactionCache } from '../transactions/full-transaction-cache.entity';
import { ClassifiedTransactions } from '../transactions/classified-transactions.entity';
import { Bill } from '../transactions/bill.entity';
import { Expense } from '../expenses/expenses.entity';
import { ExpenseApprovalStatus, RecognitionType } from '../enum';

/** Transaction/rule columns are a read model of the effective subcategory.
 * Only approval freezes that model. ONE_TIME selects a subcategory, not old law. */
export function transactionClassification(resolved: ResolvedSubCategory) {
  return {
    category: resolved.subCategory.category.name,
    subCategory: resolved.subCategory.name,
    subCategoryId: resolved.subCategory.id,
    vatPercent: Number(resolved.vatPercent ?? 0),
    taxPercent: Number(resolved.taxPercent ?? 0),
    reductionPercent: Number(resolved.reductionPercent ?? 0),
    isEquipment: resolved.isEquipment ?? false,
    isRecognized: !resolved.subCategory.isPrivate && resolved.recognitionType === RecognitionType.RECOGNIZED,
    reportScope: resolved.reportScope,
  };
}

export interface PendingCatalogFilter { userId?: string; businessNumber?: string; subCategoryName?: string }

/** Called inside the catalog write transaction, and before reading old pending
 * data. Correlated guards are evaluated by UPDATE, so approved/locked rows and
 * their cache overlays are never refreshed, including inconsistent legacy flags. */
export async function reconcilePendingClassifications(
  manager: EntityManager, catalog: CatalogService, filter: PendingCatalogFilter = {},
): Promise<void> {
  const businesses = await manager.getRepository(Business).find({ where: {
    ...(filter.userId ? { firebaseId: filter.userId } : {}),
    ...(filter.businessNumber ? { businessNumber: filter.businessNumber } : {}),
  } });
  const escape = (name: string) => manager.connection.driver.escape(name);
  const expenseTable = escape(manager.getRepository(Expense).metadata.tableName);
  const slimTable = escape(manager.getRepository(SlimTransaction).metadata.tableName);
  for (const business of businesses) {
    const userId = business.firebaseId;
    const businessNumber = business.businessNumber;
    const delegations = await manager.getRepository(Delegation).find({
      where: { userId, status: DelegationStatus.ACTIVE }, order: { id: 'ASC' },
    });
    const ctx = { userId, businessNumber, businessType: business.businessField,
      accountantIds: [...new Set(delegations.map(d => d.agentId))] };
    const rules = await manager.getRepository(ClassifiedTransactions).createQueryBuilder('r')
      .innerJoin(Bill, 'b', 'b.id = r.billId AND b.userId = r.userId')
      .where('r.userId = :userId', { userId })
      .andWhere('COALESCE(r.businessNumber, b.businessNumber) = :businessNumber', { businessNumber }).getMany();
    const bills = await manager.getRepository(Bill).find({ where: { userId, businessNumber } });
    const billIds = bills.map(b => b.id);
    const pendingWhere = [
      { userId, businessNumber, confirmed: false, isLocked: false },
      { userId, businessNumber: IsNull(), billId: In(billIds), confirmed: false, isLocked: false },
    ];
    const pending = await manager.getRepository(SlimTransaction).find({
      where: pendingWhere,
      select: { category: true, subCategory: true },
    });
    const cachePending = await manager.getRepository(FullTransactionCache).find({
      where: pendingWhere,
      select: { category: true, subCategory: true },
    });
    const pairs = new Map<string, { category: string; subCategory: string }>();
    for (const row of [...pending, ...cachePending, ...rules]) {
      if (!row.category || !row.subCategory || (filter.subCategoryName && row.subCategory !== filter.subCategoryName)) continue;
      pairs.set(JSON.stringify([row.category, row.subCategory]), row);
    }
    for (const pair of pairs.values()) {
        const resolved = await catalog.resolveByName(pair.category, pair.subCategory, ctx);
        // Deletion/rename is handled separately; never substitute another label.
        if (!resolved) continue;
        const patch = transactionClassification(resolved);
        // Do not rewrite unchanged rows or updatedAt on every list request.
        const changed = Object.keys(patch).map(key => {
          const column = manager.getRepository(SlimTransaction).metadata.findColumnWithPropertyName(key)!;
          return 'NOT (' + escape(column.databaseName) + ' <=> :law_' + key + ')';
        }).join(' OR ');
        const lawParams = Object.fromEntries(Object.entries(patch).map(([k,v]) => ['law_' + k,v]));
        for (const entity of [SlimTransaction, FullTransactionCache]) {
          const repo = manager.getRepository(entity);
          const table = escape(repo.metadata.tableName);
          const changes = entity === SlimTransaction ? changed : Object.keys(patch).map(key =>
            'NOT (' + escape(repo.metadata.findColumnWithPropertyName(key)!.databaseName) + ' <=> :law_' + key + ')').join(' OR ');
          await repo.createQueryBuilder().update(entity).set(patch)
            .where('userId = :userId AND (businessNumber = :businessNumber OR (businessNumber IS NULL AND billId IN (:...billIds)))', { userId, businessNumber, billIds: billIds.length ? billIds : [-1] })
            .andWhere('category = :category AND subCategory = :subCategory', { category: pair.category, subCategory: pair.subCategory })
            .andWhere('confirmed = false AND isLocked = false')
            .andWhere('NOT EXISTS (SELECT 1 FROM ' + expenseTable + ' e WHERE e.userId = ' + table + '.userId AND e.externalTransactionId = ' + table + '.externalTransactionId AND (e.approvalStatus = :approved OR e.isReported = true))', { approved: ExpenseApprovalStatus.APPROVED })
            .andWhere(entity === FullTransactionCache
              ? 'NOT EXISTS (SELECT 1 FROM ' + slimTable + ' s WHERE s.userId = ' + table + '.userId AND s.externalTransactionId = ' + table + '.externalTransactionId AND (s.confirmed = true OR s.isLocked = true))'
              : '1 = 1')
            .andWhere('(' + changes + ')', lawParams).execute();
        }
        // A rule's optional business wins; otherwise its bill supplies scope.
        // Never collapse rules belonging to different businesses into one law.
        for (const rule of rules.filter(r => r.category === pair.category && r.subCategory === pair.subCategory)) {
          if (Object.entries(patch).some(([k,v]) => String(rule[k]) !== String(v)))
            await manager.getRepository(ClassifiedTransactions).update({ id: rule.id, userId }, patch);
        }
    }
  }
}
