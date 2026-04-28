import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserSyncState, SyncSkipReason, ProcessStatus, ResultStatus } from './user-sync-state.entity';
import { UserSourceSyncState, SourceResult } from './user-source-sync-state.entity';

@Injectable()
export class UserSyncStateService {
  constructor(
    @InjectRepository(UserSyncState)
    private readonly repo: Repository<UserSyncState>,
    @InjectRepository(UserSourceSyncState)
    private readonly sourceRepo: Repository<UserSourceSyncState>,
  ) {}

  /**
   * Called from triggerFullSync — creates or resets the row for this sync session.
   * Both stages start as 'running'; fullProcessStatus will be updated by markFullFinished.
   *
   * Guard: if either stage is already running (concurrent trigger), returns without writing.
   * The caller's in-flight deduplication (runningFullSyncByUser Map, DB guard) should prevent
   * this, but this is an extra safety net.
   */
  async markQuickRunning(userId: string, triggeredBy: 'login' | 'webhook' | 'manual'): Promise<void> {
    const current = await this.repo.findOne({ where: { userId } });
    if (current?.quickProcessStatus === 'running' || current?.fullProcessStatus === 'running') {
      return;
    }

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

    if (current) {
      // Row exists — update status fields only; preserve sourceResults so pre-populated
      // not_synced entries survive into the next login check.
      await this.repo.update({ userId }, statusFields);
    } else {
      // First sync ever — create the row.
      await this.repo.save(this.repo.create({ userId, ...statusFields }));
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
