import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, In, IsNull, Not, Repository } from 'typeorm';
import { Source, ConnectionRole } from './source.entity';
import { SourceType } from '../enum';
import { User } from '../users/user.entity';
import { UserSyncState, SyncSkipReason, ProcessStatus, ResultStatus } from './user-sync-state.entity';
import { UserSourceSyncState, SourceResult } from './user-source-sync-state.entity';
import { BankingBatchError, BankingIssue, bankingIssue } from '../feezback/core/open-banking-issue';

/**
 * If a sync row is stuck in `'running'` for longer than this, treat it as
 * abandoned (process crashed / pod killed mid-sync) and let the next caller
 * take the lock over. Keeps stuck rows from blocking a user forever.
 */
const STALE_LOCK_AFTER_MS = 5 * 60_000;

@Injectable()
export class UserSyncStateService {
  private readonly logger = new Logger(UserSyncStateService.name);

  constructor(
    @InjectRepository(UserSyncState)
    private readonly repo: Repository<UserSyncState>,
    @InjectRepository(UserSourceSyncState)
    private readonly sourceRepo: Repository<UserSourceSyncState>,
    @InjectRepository(Source) private readonly accountSourceRepo: Repository<Source>,
  ) {}

  /**
   * Atomically tries to acquire the per-user "sync running" lock at the DB level
   * and returns whether it was acquired. The implementation is race-safe across
   * processes/replicas:
   *
   *   1. Conditional UPDATE: flip an existing row to 'running', but only if it
   *      isn't already. The WHERE clause and SET happen in one statement, so
   *      two concurrent updaters can't both pass the check.
   *   2. Stale-lock takeover: if the previous holder crashed before clearing
   *      'running' (older than STALE_LOCK_AFTER_MS), steal it.
   *   3. Fallback INSERT: if no row was updated, either no row exists yet OR
   *      the row exists and is freshly running. Insert; the unique index on
   *      userId tells us which case we're in.
   *
   * Callers MUST honor `acquired === false` and skip running the sync; otherwise
   * the multi-replica race re-opens.
   */
  async markSyncRunning(
    userId: string,
    triggeredBy: 'login' | 'webhook' | 'manual',
  ): Promise<{ acquired: boolean }> {
    const statusFields = {
      triggeredBy,
      fullProcessStatus: 'running' as ProcessStatus,
      fullResultStatus: 'none' as ResultStatus,
      fullRowsWritten: 0,
      fullStartedAt: new Date(),
      fullFinishedAt: null,
      fullFailureReason: null,
      fullSkipReason: null,
    };

    // Step 1 — clean acquire: flip an existing row to 'running' only if it
    // isn't already. Object-form criteria so TypeORM does dialect-correct
    // identifier escaping (project runs on MySQL — raw double-quoted
    // identifiers would be parsed as string literals).
    const updated = await this.repo.update(
      {
        userId,
        fullProcessStatus: Not('running' as ProcessStatus),
      },
      statusFields,
    );
    if (updated.affected && updated.affected > 0) {
      return { acquired: true };
    }

    // Step 2 — stale-lock takeover. If a previous sync crashed mid-run, its row
    // stays 'running' forever. Detect via fullStartedAt: anything older than
    // STALE_LOCK_AFTER_MS is assumed abandoned.
    const staleThreshold = new Date(Date.now() - STALE_LOCK_AFTER_MS);
    const stolen = await this.repo.update(
      { userId, fullStartedAt: LessThan(staleThreshold) },
      statusFields,
    );
    if (stolen.affected && stolen.affected > 0) {
      this.logger.warn(
        `[markSyncRunning] Took over a stale lock (>${Math.round(STALE_LOCK_AFTER_MS / 60_000)} min old) for userId=${userId?.substring(0, 8)}...`,
      );
      return { acquired: true };
    }

    // Step 3 — no row exists yet, OR the row exists and is freshly running.
    try {
      await this.repo.insert({ userId, ...statusFields });
      return { acquired: true };
    } catch (err: any) {
      const isDuplicate =
        err?.code === '23505' ||
        err?.code === 'ER_DUP_ENTRY' ||
        /duplicate|unique/i.test(err?.message ?? '');
      if (isDuplicate) {
        return { acquired: false };
      }
      throw err;
    }
  }

  /**
   * Registers discovered sources (from a Feezback webhook) into user_source_sync_state.
   * New entries are written with status='not_synced'; existing entries get their
   * consentId (and optional identifiers) updated without changing their sync status.
   *
   * Direct/Debit cards (isDirect === true, determined from Feezback balances at
   * discovery) are pinned to the terminal status 'skipped_direct' — never
   * not_synced/failed — so no retry path ever selects them. If a card previously
   * marked skipped_direct is re-discovered with balances (isDirect === false),
   * it flips back to 'not_synced' so the next sync pulls it normally.
   */
  private async resolveSource(userId: string, src: Pick<SourceResult, 'type' | 'sourceId' | 'sourceRecordId' | 'connectionRole'>): Promise<Source> {
    const where = src.sourceRecordId
      ? { id: src.sourceRecordId, userId }
      : { userId, sourceName: src.sourceId, sourceType: src.type === 'bank' ? SourceType.BANK_ACCOUNT : SourceType.CREDIT_CARD,
          connectionRole: src.connectionRole ?? 'primary' as ConnectionRole };
    const source = await this.accountSourceRepo.findOne({ where });
    if (!source || source.userId !== userId || (src.connectionRole && src.connectionRole !== source.connectionRole) || source.sourceName !== src.sourceId || source.sourceType !== (src.type === 'bank' ? SourceType.BANK_ACCOUNT : SourceType.CREDIT_CARD)) {
      throw new BadRequestException('Source record not found for this user and payment source');
    }
    return source;
  }

  async upsertSourceConsents(
    userId: string,
    sources: Array<Pick<SourceResult, 'type' | 'sourceId' | 'sourceRecordId' | 'connectionRole' | 'resourceId' | 'consentId'> & { isDirect?: boolean | null }>,
    verifiedAt = new Date(),
  ): Promise<void> {
    const failures: BankingIssue[] = [];
    let completed = 0;
    for (const src of sources) {
      try {
      const source = await this.resolveSource(userId, src);
      const sourceRecordId = source.id;
      const existing = await this.sourceRepo.findOne({ where: { userId, sourceRecordId } });
      if (existing?.consentVerifiedAt && existing.consentVerifiedAt > verifiedAt) throw Object.assign(new Error('Stale consent snapshot'), { code: 'STALE_CONSENT_SNAPSHOT' });
      if (existing) {
        // Discovery (getUserAccounts) is the source of truth — when it provides
        // a fresh consentId / resourceId, overwrite the stored ones (consent
        // rotation changes consentId).
        const statusPatch: Partial<UserSourceSyncState> =
          src.isDirect === true
            ? { status: 'skipped_direct', transactionCount: 0, error: null }
            : src.isDirect === false && existing.status === 'skipped_direct'
              ? { status: 'not_synced', error: null }
              : src.consentId && src.consentId !== existing.consentId
                ? { status: 'not_synced', error: null }
              : {};
        const updated = await this.sourceRepo.update({ userId, sourceRecordId,
          consentVerifiedAt: existing.consentVerifiedAt ?? IsNull(),
          consentId: existing.consentId ?? IsNull(), resourceId: existing.resourceId ?? IsNull() }, {
          consentId: src.consentId ?? existing.consentId,
          resourceId: src.resourceId ?? existing.resourceId,
          consentVerifiedAt: verifiedAt,
          ...statusPatch,
        });
        if (updated?.affected === 0) throw Object.assign(new Error('Stale consent snapshot'), { code: 'STALE_CONSENT_SNAPSHOT' });
      } else {
        await this.sourceRepo.save(this.sourceRepo.create({
          userId,
          sourceId: src.sourceId,
          sourceRecordId,
          type: src.type,
          resourceId: src.resourceId ?? null,
          consentId: src.consentId ?? null,
          consentVerifiedAt: verifiedAt,
          status: src.isDirect === true ? 'skipped_direct' : 'not_synced',
          transactionCount: 0,
          error: null,
        }));
      }
      completed++;
      } catch (error) {
        failures.push(bankingIssue(this.logger, 'connection_save', userId, 'source_consent_write_failed', error, src));
      }
    }
    if (failures.length) {
      this.logger.error('[OpenBanking] '+JSON.stringify({stage:'connection_save',userId,outcome:completed?'partial':'failed',completed,failed:failures.length,errorIds:failures.map(i=>i.errorId)}));
      throw new BankingBatchError(failures, completed);
    }
  }

  /** Called only for independently complete provider reads; never for a failed source list. */
  async reconcileSourceConsents(userId: string, role: ConnectionRole,
    verified: Array<{ type: 'bank' | 'card'; sources: string[] }>, verifiedAt = new Date(),
    protectedConsentIds: string[] = []): Promise<void> {
    const failures: BankingIssue[] = [];
    for (const row of await this.getSourceResults(userId)) {
      const scope = verified.find(v => v.type === row.type);
      if (row.connectionRole !== role || !scope || scope.sources.includes(row.sourceId) ||
        !row.consentId || protectedConsentIds.includes(row.consentId)) continue;
      try {
        if (row.consentVerifiedAt && row.consentVerifiedAt > verifiedAt) throw Object.assign(new Error('Stale consent snapshot'), { code: 'STALE_CONSENT_SNAPSHOT' });
        const result = await this.sourceRepo.update({ userId, sourceRecordId: row.sourceRecordId,
          consentId: row.consentId, consentVerifiedAt: row.consentVerifiedAt ?? IsNull() },
          { consentId: null, consentVerifiedAt: verifiedAt });
        if (result?.affected === 0) throw Object.assign(new Error('Stale consent snapshot'), { code: 'STALE_CONSENT_SNAPSHOT' });
      } catch (error) {
        failures.push(bankingIssue(this.logger, 'connection_save', userId, 'consent_reconciliation_failed', error, row));
      }
    }
    if (failures.length) throw new BankingBatchError(failures);
  }

  /**
   * Called when a gate blocks the sync before any data is fetched.
   *
   * no_access    → status set to 'failed'    (user cannot sync; retry button shown)
   * cache_exists → status set to 'completed' (cache is already built; data is ready)
   */
  async markSyncSkipped(userId: string, skipReason: SyncSkipReason, previous?: UserSyncState | null): Promise<void> {
    const processStatus: ProcessStatus = skipReason === 'no_access' ? 'failed' : 'completed';
    const now = new Date();
    await this.repo.update({ userId }, {
      fullProcessStatus: processStatus,
      fullResultStatus: skipReason === 'cache_exists' ? previous?.fullResultStatus ?? 'none' : 'none',
      fullRowsWritten: skipReason === 'cache_exists' ? previous?.fullRowsWritten ?? 0 : 0,
      fullFinishedAt: now,
      fullSkipReason: skipReason,
      fullFailureReason: skipReason === 'cache_exists' ? previous?.fullFailureReason ?? null : null,
    });
  }

  /** Called after the sync pull completes. */
  async markSyncFinished(
    userId: string,
    processStatus: ProcessStatus,
    resultStatus: ResultStatus,
    rowsWritten: number,
    failureReason?: string,
  ): Promise<void> {
    await this.repo.update({ userId }, {
      fullProcessStatus: processStatus,
      fullResultStatus: resultStatus,
      fullRowsWritten: rowsWritten,
      fullFinishedAt: new Date(),
      fullSkipReason: null,
      fullFailureReason: failureReason ? failureReason.slice(0, 255) : null,
    });
  }

  /**
   * Called from the outer catch in doFullSync.
   * Marks the sync failed — used for unrecoverable errors that occur
   * before or during the pull sequence (e.g. gate-query DB errors).
   */
  async markSyncFailed(userId: string, failureReason: string): Promise<void> {
    const now = new Date();
    const reason = failureReason.slice(0, 255);
    // Use upsert so this always writes, even if markSyncRunning never created the row.
    await this.repo.upsert(
      {
        userId,
        fullProcessStatus: 'failed',
        fullResultStatus: 'failed',
        fullFinishedAt: now,
        fullFailureReason: reason,
      } as UserSyncState,
      ['userId'],
    );
  }

  /**
   * After a successful user-initiated single-source pull (retry-source /
   * settings per-account button), the cache now has data but the overall
   * `fullProcessStatus` may still be 'empty'/'failed'/null — which keeps
   * syncStateAllowsFetch closed, so the user can't see what they just pulled.
   * Promote the row to 'completed' so the fetch gate opens.
   *
   * Guard: never touch a 'running' row — a full sync owns the lifecycle then
   * and will set the terminal status itself; clobbering it would corrupt the
   * lock/lifecycle. Upsert so a user with no prior sync-state row still gets one.
   */
  async markCacheReadyAfterSourcePull(
    userId: string,
    resultStatus: ResultStatus = 'success',
    rowsWritten = 0,
    failureReason?: string,
  ): Promise<void> {
    const state = await this.repo.findOne({ where: { userId } });
    if (state?.fullProcessStatus === 'running') return;
    await this.repo.upsert(
      {
        userId,
        fullProcessStatus: 'completed',
        fullResultStatus: resultStatus,
        fullRowsWritten: rowsWritten,
        fullFinishedAt: new Date(),
        fullSkipReason: null,
        fullFailureReason: failureReason ? failureReason.slice(0, 255) : null,
      } as UserSyncState,
      ['userId'],
    );
  }

  async getSyncState(userId: string): Promise<UserSyncState | null> {
    return this.repo.findOne({ where: { userId } });
  }

  async savePermissionsSnapshot(userId: string, permissionsSnapshot: any,
    connection?: { connected: boolean; complete: boolean }): Promise<boolean> {
    return this.repo.manager.transaction(async manager => {
      // Same user-first lock order as ingestion/disconnection. No provider calls under this lock.
      const owner = await manager.getRepository(User).findOne({ where: { firebaseId: userId }, lock: { mode: 'pessimistic_write' } });
      if (!owner) throw new BadRequestException('User not found');
      const states = manager.getRepository(UserSyncState);
      const previous = await states.findOne({ where: { userId } });
      if (previous?.permissionsSnapshot?.observedAt > permissionsSnapshot.observedAt) return false;
      await states.upsert({ userId, permissionsSnapshot } as UserSyncState, ['userId']);
      if (connection && (connection.connected || connection.complete)) {
        await manager.getRepository(User).update({ firebaseId: userId }, { hasOpenBanking: connection.connected });
      }
      return true;
    });
  }

  async getSourceResults(userId: string): Promise<(UserSourceSyncState & { connectionRole: ConnectionRole })[]> {
    const rows = await this.sourceRepo.find({ where: { userId }, relations: ['source'] });
    return rows.map(row => Object.assign(row, { connectionRole: row.source?.connectionRole ?? 'primary' as ConnectionRole }));
  }

  /**
   * Merges new source results into the user_source_sync_state table.
   *
   * status/transactionCount/error are updated only for the current consent. The incoming
   * result never rotates identifiers on an existing row. resourceId/consentId are NEVER nulled
   * — discovery owns them on existing rows; first successful pulls can register new rows, and
   * pullOneSource/retrySource depend on them. A failed bank SourceResult, for
   * example, carries no ids; without this guard it would wipe the ids and
   * break the subsequent per-account retry.
   */
  async updateSourceResults(userId: string, incoming: SourceResult[]): Promise<void> {
    const failures: BankingIssue[] = [];
    for (const src of incoming) {
      try {
      if (src.status === 'failed' && src.error && !/^OB-0[1-4]\|/.test(src.error)) {
        const httpStatus = Number(/status[=:](\d{3})/.exec(src.error)?.[1]) || undefined;
        const issue = bankingIssue(this.logger, 'transaction_fetch', userId,
          httpStatus && [401, 403, 404].includes(httpStatus) ? 'provider_authorization_denied' : 'source_fetch_failed',
          { status: httpStatus }, src, { received: src.transactionCount });
        src.error = `${issue.code}|${issue.errorId}${httpStatus ? '|' + httpStatus : ''}`;
      }
      const source = await this.resolveSource(userId, src);
      const sourceRecordId = source.id;
      const existing = await this.sourceRepo.findOne({ where: { userId, sourceRecordId } });
      if (existing) {
        // Discovery owns consent rotation. An older pull must not restore a
        // revoked consent or overwrite a newly reconnected source's identifiers.
        if ((src.consentId && src.consentId !== existing.consentId) ||
          (src.resourceId && existing.resourceId && src.resourceId !== existing.resourceId)) continue;
        await this.sourceRepo.update({
          userId, sourceRecordId,
          consentId: existing.consentId ?? IsNull(),
          resourceId: existing.resourceId ?? IsNull(),
        }, {
          status: src.status, transactionCount: src.transactionCount, error: src.error ?? null,
        });
        // Checked atomically: disconnection/reconnection between findOne and
        // UPDATE makes a stale result a no-op instead of resurrecting consent.
        continue;
      }
      try {
        await this.sourceRepo.insert({
          userId,
          sourceId: src.sourceId,
          sourceRecordId,
          type: src.type,
          resourceId: src.resourceId ?? null,
          consentId: src.consentId ?? null,
          status: src.status,
          transactionCount: src.transactionCount,
          error: src.error ?? null,
        });
      } catch (error: any) {
        // Discovery may have registered the row after findOne. Never overwrite
        // its newer consent/resource metadata with an older pull's INSERT.
        if (error?.code !== 'ER_DUP_ENTRY' && error?.code !== '23505') throw error;
      }
      } catch (error) {
        failures.push(bankingIssue(this.logger, 'transaction_save', userId, 'source_outcome_write_failed', error, src,
          { received: src.transactionCount }));
      }
    }
    if (failures.length) {
      this.logger.error('[OpenBanking] '+JSON.stringify({stage:'transaction_save',userId,outcome:failures.length===incoming.length?'failed':'partial',completed:incoming.length-failures.length,failed:failures.length,errorIds:failures.map(i=>i.errorId)}));
      throw new BankingBatchError(failures, incoming.length - failures.length);
    }
  }

  /** DEV fixtures must create permanent sources too, so the same FK invariant holds. */
  async updateSimulatedSourceResults(userId: string, incoming: SourceResult[]): Promise<void> {
    if (process.env.NODE_ENV === 'production') throw new BadRequestException('Dev simulator is disabled in production');
    await this.accountSourceRepo.upsert(incoming.map(src => ({
      userId, sourceName: src.sourceId,
      sourceType: src.type === 'bank' ? SourceType.BANK_ACCOUNT : SourceType.CREDIT_CARD,
      connectionRole: src.connectionRole ?? 'primary' as ConnectionRole,
    })), ['userId', 'sourceType', 'sourceName', 'connectionRole']);
    await this.updateSourceResults(userId, incoming);
  }

  async clearSourceResults(userId: string): Promise<void> {
    await this.sourceRepo.delete({ userId });
  }

  /**
   * Stamps `lastSourcesRefreshAt` on the user's sync-state row. Called at the
   * end of a successful `refreshUserSources` run so the login path can skip a
   * redundant refresh on the next login if it's recent enough.
   *
   * Upsert so a brand-new user without any prior sync state still gets a row.
   */
  async markSourcesRefreshed(userId: string): Promise<void> {
    await this.repo.upsert(
      { userId, lastSourcesRefreshAt: new Date() } as UserSyncState,
      ['userId'],
    );
  }

  /**
   * Stamps `lastConsentInitiatedAt = now` on the user's sync-state row. Called
   * by the consent-link endpoint at the moment the user clicks "Connect Open
   * Banking" and we hand them off to the Feezback portal. The post-consent
   * endpoint compares this against `fullFinishedAt` to know whether a
   * webhook-triggered sync has already covered this consent flow.
   */
  async markConsentInitiated(userId: string): Promise<void> {
    const now = new Date();
    await this.repo.upsert(
      { userId, lastConsentInitiatedAt: now } as UserSyncState,
      ['userId'],
    );
    const masked = userId.length >= 8 ? userId.substring(0, 8) + '...' : userId;
    this.logger.log(`[UserSyncState] lastConsentInitiatedAt = ${now.toISOString()} | userId=${masked}`);
  }

  /**
   * Clears `lastConsentInitiatedAt`. Called when a consent is revoked / expired
   * via the ConsentStatusChanged webhook so the "unprocessed consent" guard in
   * triggerPostLoginSync can no longer match — otherwise revoked users would be
   * permanently locked out of login sync.
   */
  async clearConsentInitiated(userId: string): Promise<void> {
    await this.repo.update({ userId }, { lastConsentInitiatedAt: null });
  }

  /**
   * Clears the consentId on every user_source_sync_state row that points at a
   * specific consent (called when that consent has been revoked or expired by
   * the bank/Feezback). Affected rows flip back to status='not_synced' so the
   * dialog renders the "בצע חיבור מחדש" button instead of "נסה שוב".
   *
   * Direct-card rows keep their terminal 'skipped_direct' status (they must
   * never look retryable/pending) — only their consentId is nulled.
   */
  async clearConsentOnSources(userId: string, consentId: string, spouse?: boolean): Promise<number> {
    const identity = spouse === undefined ? {} : { sourceRecordId: In((await this.accountSourceRepo.find({
      where: { userId, connectionRole: spouse ? 'spouse' : 'primary' }, select: ['id'],
    })).map(source => source.id)) };
    const resetResult = await this.sourceRepo.update(
      { userId, consentId, ...identity, status: Not('skipped_direct') },
      { consentId: null, consentVerifiedAt: new Date(), status: 'not_synced', error: null },
    );
    const directResult = await this.sourceRepo.update(
      { userId, consentId, ...identity, status: 'skipped_direct' },
      { consentId: null, consentVerifiedAt: new Date() },
    );
    return (resetResult.affected ?? 0) + (directResult.affected ?? 0);
  }

  /** Called when an admin clears a user's transaction cache — forces a fresh sync on next login. */
  async markSyncEmpty(userId: string): Promise<void> {
    await this.repo.update({ userId }, {
      fullProcessStatus: 'empty',
      fullResultStatus: 'none',
      fullRowsWritten: 0,
      fullFinishedAt: null,
      fullSkipReason: null,
      fullFailureReason: null,
    });
    // Reset per-source status so next sync re-processes all sources.
    // Keeps consentId and identifiers intact — only clears sync outcome data.
    // skipped_direct rows stay terminal — a Direct card is skipped by design,
    // not an outcome to re-attempt; the next sync re-confirms it from balances.
    await this.sourceRepo.update({ userId, status: Not('skipped_direct') }, {
      status: 'not_synced',
      transactionCount: 0,
      error: null,
    });
  }
}
