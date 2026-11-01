import { EntityManager, In } from 'typeorm';
import { FullTransactionCache } from '../../transactions/full-transaction-cache.entity';
import { UserSourceSyncState } from '../../transactions/user-source-sync-state.entity';
import { UserTransactionCacheState } from '../../transactions/user-transaction-cache-state.entity';

/** Caller holds the tenant lock and has verified/locked the affected consent pointers. */
export async function clearSourceOperationalData(manager: EntityManager, userId: string, sourceIds: number[], invalidateFreshness = true): Promise<number> {
  if (!sourceIds.length) return 0;
  const criteria = { userId, sourceRecordId: In(sourceIds) };
  await resetSourceOperationalState(manager,userId,sourceIds);
  const deleted = await manager.delete(FullTransactionCache, criteria);
  if (invalidateFreshness || deleted.affected) await manager.delete(UserTransactionCacheState, { userId });
  return deleted.affected ?? 0;
}

export async function resetSourceOperationalState(manager: EntityManager, userId: string, sourceIds: number[]): Promise<void> {
  if (!sourceIds.length) return;
  const criteria = { userId, sourceRecordId: In(sourceIds) };
  await manager.update(UserSourceSyncState, criteria, {
    consentId: null, resourceId: null, status: 'not_synced', transactionCount: 0,
    error: null, resultRunId: null,
  });
  // Source/Bill, slim transactions, expenses, rules and webhook history are never touched.
}
