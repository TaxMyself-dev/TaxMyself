import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserSyncState, SyncSkipReason, ProcessStatus, ResultStatus } from './user-sync-state.entity';

@Injectable()
export class UserSyncStateService {
  constructor(
    @InjectRepository(UserSyncState)
    private readonly repo: Repository<UserSyncState>,
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
    const current = await this.repo.findOne({
      where: { userId },
      select: ['quickProcessStatus', 'fullProcessStatus'],
    });
    if (current?.quickProcessStatus === 'running' || current?.fullProcessStatus === 'running') {
      return;
    }

    await this.repo.upsert(
      {
        userId,
        triggeredBy,
        quickProcessStatus: 'running',
        quickResultStatus: 'none',
        quickRowsWritten: 0,
        quickStartedAt: new Date(),
        quickFinishedAt: null,
        quickFailureReason: null,
        quickSkipReason: null,
        fullProcessStatus: 'running',
        fullResultStatus: 'none',
        fullRowsWritten: 0,
        fullStartedAt: null,
        fullFinishedAt: null,
        fullFailureReason: null,
        fullSkipReason: null,
      } as UserSyncState,
      ['userId'],
    );
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
    await this.repo.update({ userId }, {
      quickProcessStatus: 'failed',
      quickResultStatus: 'failed',
      quickFinishedAt: now,
      quickFailureReason: reason,
      fullProcessStatus: 'failed',
      fullResultStatus: 'failed',
      fullFinishedAt: now,
      fullFailureReason: reason,
    });
  }

  async getSyncState(userId: string): Promise<UserSyncState | null> {
    return this.repo.findOne({ where: { userId } });
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
  }
}
