import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { User } from '../users/user.entity';
import { Source, ConnectionRole } from '../transactions/source.entity';
import { FullTransactionCache } from '../transactions/full-transaction-cache.entity';
import { UserTransactionCacheState } from '../transactions/user-transaction-cache-state.entity';
import { UserSyncState } from '../transactions/user-sync-state.entity';
import type { DisconnectionTargets } from './feezback-disconnection.service';

/** Internal final-read evidence; never returned to the browser. */
export interface DisconnectionCacheProof {
  complete: boolean;
  consents: DisconnectionTargets['consents'];
  errors: DisconnectionTargets['errors'];
  sources: Array<{ sourceRecordId: number; connectionRole: ConnectionRole; consentId: string | null }>;
}

@Injectable()
export class FeezbackCacheCleanupService {
  constructor(private readonly dataSource: DataSource) {}

  async cleanup(userId: string, proof: DisconnectionCacheProof): Promise<{ deleted: number; full: boolean }> {
    const full = proof.complete && proof.errors.length === 0 && proof.consents.length === 0;
    const eligible = proof.sources.filter(source => {
      const role = source.connectionRole;
      if (proof.errors.some(error => error.connectionRole === role)) return false;
      const remaining = proof.consents.filter(consent => consent.connectionRole === role);
      if (!remaining.length) return true;
      // A pending permission or provider instrument without an owned stable
      // mapping may cover this source. Absence of a mapping is not proof.
      if (remaining.some(consent => !consent.sources.length || consent.sources.some(item => item.sourceRecordId === null))) return false;
      if (remaining.some(consent => consent.sources.some(item => item.sourceRecordId === source.sourceRecordId))) return false;
      return !!source.consentId && !remaining.some(consent => consent.consentId === source.consentId);
    }).map(source => source.sourceRecordId);
    if (!full && !eligible.length) return { deleted: 0, full: false };

    return this.dataSource.transaction(async manager => {
      // Feezback ingestion takes this same tenant row lock before persisting.
      const user = await manager.getRepository(User).findOne({
        where: { firebaseId: userId }, lock: { mode: 'pessimistic_write' },
      });
      if (!user) throw new BadRequestException('User not found');
      let sourceRecordIds: number[] = [];
      if (!full) {
        const owned = await manager.getRepository(Source).find({ where: { userId }, select: ['id', 'connectionRole'] });
        const ownedIds = new Set(owned.filter(source => proof.sources.some(item => item.sourceRecordId === source.id &&
          item.connectionRole === (source.connectionRole ?? 'primary'))).map(source => source.id));
        sourceRecordIds = [...new Set(eligible.filter(id => ownedIds.has(id)))];
        if (!sourceRecordIds.length) return { deleted: 0, full: false };
      }
      // Publish the verified full disconnect under the same lock before
      // deleting cache; a waiting persistence guard must observe false.
      if (full) await manager.update(User, { firebaseId: userId }, { hasOpenBanking: false });
      const deleted = await manager.delete(FullTransactionCache,
        full ? { userId } : { userId, sourceRecordId: In(sourceRecordIds) });
      // A partially removed cache must not remain advertised as fresh. Other
      // sources' outcomes and durable classifications are never reset here.
      await manager.delete(UserTransactionCacheState, { userId });
      if (full) await manager.update(UserSyncState, { userId }, {
        fullProcessStatus: 'empty', fullResultStatus: 'none', fullRowsWritten: 0,
        fullStartedAt: null, fullFinishedAt: null, fullSkipReason: null,
        fullFailureReason: null, lastSourcesRefreshAt: null,
      });
      return { deleted: deleted.affected ?? 0, full };
    });
  }
}
