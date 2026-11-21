import type { EntityManager } from 'typeorm';
import { FullTransactionCache } from '../transactions/full-transaction-cache.entity';
import { SlimTransaction } from '../transactions/slim-transaction.entity';
import { QA_MAIN, QA_SECOND } from './profiles/assistant-qa.profile';

// The dedicated fixture writes slim rows outside the provider processing path.
// Copy only classification state; never recreate or unconfirm an Expense.
export const assistantQaCacheOverlay = (slim: SlimTransaction) => ({
  category: slim.category,
  subCategory: slim.subCategory,
  subCategoryId: slim.subCategoryId ?? null,
  classificationType: slim.classificationType,
  confirmed: slim.confirmed,
  isLocked: slim.isLocked,
  isRecognized: slim.isRecognized,
  isEquipment: slim.isEquipment,
  vatPercent: slim.vatPercent,
  taxPercent: slim.taxPercent,
  reductionPercent: slim.reductionPercent,
  reportScope: slim.reportScope,
  vatReportingDate: slim.vatReportingDate ?? null,
  annualReportingYear: slim.annualReportingYear ?? null,
});

export async function synchronizeAssistantQaCache(
  manager: EntityManager,
  userId: string,
) {
  const caches = await manager.find(FullTransactionCache, {
    where: { userId },
    lock: { mode: 'pessimistic_write' },
  });
  const slims = await manager.find(SlimTransaction, {
    where: { userId },
    lock: { mode: 'pessimistic_write' },
  });
  const byId = new Map(slims.map((s) => [s.externalTransactionId, s]));
  let updated = 0;
  for (const cache of caches) {
    const slim = byId.get(cache.externalTransactionId);
    if (!slim) continue;
    if (
      ![QA_MAIN, QA_SECOND].includes(cache.businessNumber) ||
      slim.businessNumber !== cache.businessNumber ||
      slim.billId !== cache.billId
    )
      throw new Error('Assistant QA cache/slim ownership or account mismatch');
    await manager.update(
      FullTransactionCache,
      { id: cache.id, userId },
      assistantQaCacheOverlay(slim),
    );
    updated++;
  }
  return updated;
}
