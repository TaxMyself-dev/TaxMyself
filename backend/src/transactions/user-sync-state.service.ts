import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Not, Repository } from 'typeorm';
import { UserSyncState, SyncSkipReason, ProcessStatus, ResultStatus } from './user-sync-state.entity';
import { UserSourceSyncState, SourceResult } from './user-source-sync-state.entity';

/**
 * If a sync row is stuck in `'running'` for longer than this, treat it as
 * abandoned (process crashed / pod killed mid-sync) and let the next caller
 * take the lock over. Keeps stuck rows from blocking a user forever.
 */
const STALE_LOCK_AFTER_MS = 30 * 60_000;

@Injectable()
export class UserSyncStateService {
  private readonly logger = new Logger(UserSyncStateService.name);

  constructor(
    @InjectRepository(UserSyncState)
    private readonly repo: Repository<UserSyncState>,
    @InjectRepository(UserSourceSyncState)
    private readonly sourceRepo: Repository<UserSourceSyncState>,
  ) {}

  /**
   * Atomically tries to acquire the per-user "sync running" lock at the DB level
   * and returns whether it was acquired. The implementation is race-safe across
   * processes/replicas:
   *
   *   1. Conditional UPDATE: flip an existing row to 'running', but only if it
   *      isn't already. The WHERE clause and SET happen in one statement, so
   *      two concurrent updaters can't both pass the check.
   *   2. Fallback INSERT: if no row was updated, either no row exists yet OR
   *      the row exists and is already running. Try to insert a fresh row;
   *      the unique index on userId distinguishes the two cases — a duplicate
   *      key error means someone else already holds the lock.
   *
   * Callers MUST honor `acquired === false` and skip running the sync; otherwise
   * the multi-replica race re-opens.
   */
  async markQuickRunning(
    userId: string,
    triggeredBy: 'login' | 'webhook' | 'manual' | 'post-consent',
  ): Promise<{ acquired: boolean }> {
    const statusFields = {
      triggeredBy,
      quickProcessStatus: 'running' as ProcessStatus,
      quickResultStatus: 'none' as ResultStatus,
      quickRowsWritten: 0,
      quickStartedAt: new Date(),
      quickFinishedAt: null,
      quickFailureReason: null,
      quickSkipReason: null,
      fullProcessStatus: 'running' as ProcessStatus,
      fullResultStatus: 'none' as ResultStatus,
      fullRowsWritten: 0,
      fullStartedAt: new Date(),
      fullFinishedAt: null,
      fullFailureReason: null,
      fullSkipReason: null,
    };

    // Step 1 — clean acquire: flip an existing row to 'running', but only if
    // neither stage is currently 'running'. Atomic: WHERE + SET in one SQL.
    // Object-form criteria so TypeORM does dialect-correct identifier escaping
    // (project runs on MySQL — raw double-quoted identifiers would be parsed
    // as string literals).
    const updated = await this.repo.update(
      {
        userId,
        quickProcessStatus: Not('running' as ProcessStatus),
        fullProcessStatus: Not('running' as ProcessStatus),
      },
      statusFields,
    );
    if (updated.affected && updated.affected > 0) {
      return { acquired: true };
    }

    // Step 2 — stale-lock takeover. If a previous sync crashed mid-run, its row
    // stays 'running' forever and step 1 would never match. Detect that by
    // looking at quickStartedAt: anything older than STALE_LOCK_AFTER_MS is
    // assumed abandoned, so we can take the lock anyway. Atomic too — the
    // condition is part of the WHERE clause.
    const staleThreshold = new Date(Date.now() - STALE_LOCK_AFTER_MS);
    const stolen = await this.repo.update(
      { userId, quickStartedAt: LessThan(staleThreshold) },
      statusFields,
    );
    if (stolen.affected && stolen.affected > 0) {
      this.logger.warn(
        `[markQuickRunning] Took over a stale lock (>${Math.round(STALE_LOCK_AFTER_MS / 60_000)} min old) for userId=${userId?.substring(0, 8)}...`,
      );
      return { acquired: true };
    }

    // Step 3 — no row exists yet, OR the row exists and is freshly running.
    // Insert; the unique index on userId tells us which case we're in.
    try {
      await this.repo.insert({ userId, ...statusFields });
      return { acquired: true };
    } catch (err: any) {
      // Postgres '23505' / MySQL 'ER_DUP_ENTRY' / generic unique-constraint
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
   */
  async upsertSourceConsents(
    userId: string,
    sources: Array<Pick<SourceResult, 'type' | 'sourceId' | 'resourceId' | 'consentId'>>,
  ): Promise<void> {
    for (const src of sources) {
      const existing = await this.sourceRepo.findOne({ where: { userId, sourceId: src.sourceId } });
      if (existing) {
        await this.sourceRepo.update({ userId, sourceId: src.sourceId }, {
          consentId: src.consentId ?? existing.consentId,
          resourceId: src.resourceId ?? existing.resourceId,
        });
      } else {
        await this.sourceRepo.save(this.sourceRepo.create({
          userId,
          sourceId: src.sourceId,
          type: src.type,
          resourceId: src.resourceId ?? null,
          consentId: src.consentId ?? null,
          status: 'not_synced',
          transactionCount: 0,
          error: null,
        }));
      }
    }
  }

  /**
   * Called when a gate blocks the sync before any data is fetched.
   *
   * no_access   → both stages set to 'failed'  (user cannot sync; retry button shown)
   * cache_exists → both stages set to 'completed' (cache is already built; data is ready)
   */
  async markBothSkipped(userId: string, skipReason: SyncSkipReason): Promise<void> {
    const processStatus: ProcessStatus = skipReason === 'no_access' ? 'failed' : 'completed';
    const now = new Date();
    await this.repo.update({ userId }, {
      quickProcessStatus: processStatus,
      quickResultStatus: 'none',
      quickFinishedAt: now,
      quickSkipReason: skipReason,
      fullProcessStatus: processStatus,
      fullResultStatus: 'none',
      fullFinishedAt: now,
      fullSkipReason: skipReason,
    });
  }

  /** Called after Pull 1 (quick sync) completes. Only updates quick-stage columns. */
  async markQuickFinished(
    userId: string,
    processStatus: ProcessStatus,
    resultStatus: ResultStatus,
    rowsWritten: number,
    failureReason?: string,
  ): Promise<void> {
    await this.repo.update({ userId }, {
      quickProcessStatus: processStatus,
      quickResultStatus: resultStatus,
      quickRowsWritten: rowsWritten,
      quickFinishedAt: new Date(),
      ...(failureReason ? { quickFailureReason: failureReason.slice(0, 255) } : {}),
    });
  }

  /** Called just before Pull 2 (full sync) begins. Only updates full-stage columns. */
  async markFullRunning(userId: string): Promise<void> {
    await this.repo.update({ userId }, {
      fullProcessStatus: 'running',
      fullResultStatus: 'none',
      fullStartedAt: new Date(),
    });
  }

  /** Called after Pull 2 (full sync) completes. Only updates full-stage columns. */
  async markFullFinished(
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
      ...(failureReason ? { fullFailureReason: failureReason.slice(0, 255) } : {}),
    });
  }

  /**
   * Called from the outer catch in doFullSync.
   * Marks both stages failed — used for unrecoverable errors that occur
   * before or during the pull sequence (e.g. gate-query DB errors).
   */
  async markBothFailed(userId: string, failureReason: string): Promise<void> {
    const now = new Date();
    const reason = failureReason.slice(0, 255);
    // Use upsert so this always writes, even if markQuickRunning never created the row.
    await this.repo.upsert(
      {
        userId,
        quickProcessStatus: 'failed',
        quickResultStatus: 'failed',
        quickFinishedAt: now,
        quickFailureReason: reason,
        fullProcessStatus: 'failed',
        fullResultStatus: 'failed',
        fullFinishedAt: now,
        fullFailureReason: reason,
      } as UserSyncState,
      ['userId'],
    );
  }

  async getSyncState(userId: string): Promise<UserSyncState | null> {
    return this.repo.findOne({ where: { userId } });
  }

  async getSourceResults(userId: string): Promise<UserSourceSyncState[]> {
    return this.sourceRepo.find({ where: { userId } });
  }

  /**
   * Merges new source results into the user_source_sync_state table.
   * Sources with the same sourceId are overwritten; new sources are inserted.
   */
  async updateSourceResults(userId: string, incoming: SourceResult[]): Promise<void> {
    for (const src of incoming) {
      await this.sourceRepo.upsert(
        {
          userId,
          sourceId: src.sourceId,
          type: src.type,
          resourceId: src.resourceId ?? null,
          consentId: src.consentId ?? null,
          status: src.status,
          transactionCount: src.transactionCount,
          error: src.error ?? null,
        },
        ['userId', 'sourceId'],
      );
    }
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
   * Clears the consentId on every user_source_sync_state row that points at a
   * specific consent (called when that consent has been revoked or expired by
   * the bank/Feezback). Affected rows flip back to status='not_synced' so the
   * dialog renders the "בצע חיבור מחדש" button instead of "נסה שוב".
   */
  async clearConsentOnSources(userId: string, consentId: string): Promise<number> {
    const result = await this.sourceRepo.update(
      { userId, consentId },
      { consentId: null, status: 'not_synced', error: null },
    );
    return result.affected ?? 0;
  }

  /** Called when an admin clears a user's transaction cache — forces a fresh sync on next login. */
  async markBothEmpty(userId: string): Promise<void> {
    await this.repo.update({ userId }, {
      quickProcessStatus: 'empty',
      quickResultStatus: 'none',
      quickRowsWritten: 0,
      quickFinishedAt: null,
      quickSkipReason: null,
      quickFailureReason: null,
      fullProcessStatus: 'empty',
      fullResultStatus: 'none',
      fullRowsWritten: 0,
      fullFinishedAt: null,
      fullSkipReason: null,
      fullFailureReason: null,
    });
    // Reset per-source status so next sync re-processes all sources.
    // Keeps consentId and identifiers intact — only clears sync outcome data.
    await this.sourceRepo.update({ userId }, {
      status: 'not_synced',
      transactionCount: 0,
      error: null,
    });
  }
}
