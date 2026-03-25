import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserSyncState, SyncSkipReason } from './user-sync-state.entity';

@Injectable()
export class UserSyncStateService {
  constructor(
    @InjectRepository(UserSyncState)
    private readonly repo: Repository<UserSyncState>,
  ) {}

  /**
   * Called from triggerFullSync — creates or resets the row for this sync session.
   * Sets quickStatus=running and fullStatus=pending.
   */
  async markQuickRunning(userId: string, triggeredBy: 'login' | 'webhook'): Promise<void> {
    await this.repo.upsert(
      {
        userId,
        triggeredBy,
        quickStatus: 'running',
        quickRowsWritten: 0,
        quickStartedAt: new Date(),
        quickFinishedAt: null,
        quickFailureReason: null,
        quickSkipReason: null,
        fullStatus: 'pending',
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
   * Called when either gate (no-access or cache-exists) blocks the sync.
   * Both stages are marked skipped because neither will run.
   */
  async markBothSkipped(userId: string, skipReason: SyncSkipReason): Promise<void> {
    const now = new Date();
    await this.repo.update({ userId }, {
      quickStatus: 'skipped',
      quickFinishedAt: now,
      quickSkipReason: skipReason,
      fullStatus: 'skipped',
      fullFinishedAt: now,
      fullSkipReason: skipReason,
    });
  }

  /** Called after Pull 1 (quick sync) completes. Only updates quick-stage columns. */
  async markQuickFinished(
    userId: string,
    status: 'success' | 'partial_success' | 'failed',
    rowsWritten: number,
    failureReason?: string,
  ): Promise<void> {
    await this.repo.update({ userId }, {
      quickStatus: status,
      quickRowsWritten: rowsWritten,
      quickFinishedAt: new Date(),
      ...(failureReason ? { quickFailureReason: failureReason.slice(0, 255) } : {}),
    });
  }

  /** Called just before Pull 2 (full sync) begins. Only updates full-stage columns. */
  async markFullRunning(userId: string): Promise<void> {
    await this.repo.update({ userId }, {
      fullStatus: 'running',
      fullStartedAt: new Date(),
    });
  }

  /** Called after Pull 2 (full sync) completes. Only updates full-stage columns. */
  async markFullFinished(
    userId: string,
    status: 'success' | 'partial_success' | 'failed',
    rowsWritten: number,
    failureReason?: string,
  ): Promise<void> {
    await this.repo.update({ userId }, {
      fullStatus: status,
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
      quickStatus: 'failed',
      quickFinishedAt: now,
      quickFailureReason: reason,
      fullStatus: 'failed',
      fullFinishedAt: now,
      fullFailureReason: reason,
    });
  }

  async getSyncState(userId: string): Promise<UserSyncState | null> {
    return this.repo.findOne({ where: { userId } });
  }
}
