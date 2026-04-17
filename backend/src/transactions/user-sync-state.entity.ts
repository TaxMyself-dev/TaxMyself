import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Lifecycle status for a sync stage.
 *
 * empty     — cache was cleared by the daily cleanup job; a new sync is required.
 *             NEVER returned to the frontend — translated to 'running' in API responses
 *             after a sync is triggered.
 * running   — stage is in progress
 * completed — stage finished successfully (data may be empty for the requested date range)
 * failed    — an error occurred during the stage; user should retry
 */
export type ProcessStatus = 'empty' | 'running' | 'completed' | 'failed';

/**
 * Backend-facing outcome quality for a sync stage.
 * Not used by the frontend to drive polling or reload decisions.
 *
 * none            — stage has not finished or was skipped (no quality assessment yet)
 * success         — no errors, all fetches succeeded
 * partial_success — errors occurred but some normalized data was produced
 * failed          — errors occurred and no normalized data was produced
 */
export type ResultStatus = 'none' | 'success' | 'partial_success' | 'failed';

/**
 * no_access    — user does not have OPEN_BANKING module access
 * cache_exists — full_transactions_cache already had rows for this user
 */
export type SyncSkipReason = 'no_access' | 'cache_exists';

@Entity('user_sync_state')
@Index('UQ_sync_state_user', ['userId'], { unique: true })
export class UserSyncState {
  @PrimaryGeneratedColumn()
  id: number;

  /** Firebase user ID — one row per user, upserted at the start of each sync session. */
  @Column({ type: 'varchar' })
  userId: string;

  @Column({ type: 'varchar', nullable: true })
  triggeredBy: 'login' | 'webhook' | 'manual' | null;

  // ---------------------------------------------------------------------------
  // Quick sync stage — Pull 1: current month + previous 2 full calendar months
  // ---------------------------------------------------------------------------

  @Column({ type: 'varchar', default: 'empty' })
  quickProcessStatus: ProcessStatus;

  @Column({ type: 'varchar', default: 'none' })
  quickResultStatus: ResultStatus;

  @Column({ type: 'int', default: 0 })
  quickRowsWritten: number;

  @Column({ type: 'timestamp', nullable: true })
  quickStartedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  quickFinishedAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  quickFailureReason: string | null;

  @Column({ type: 'varchar', nullable: true })
  quickSkipReason: SyncSkipReason | null;

  // ---------------------------------------------------------------------------
  // Full sync stage — Pull 2: up to 12-month backfill
  // Starts only after the quick stage completes without errors.
  // ---------------------------------------------------------------------------

  @Column({ type: 'varchar', default: 'empty' })
  fullProcessStatus: ProcessStatus;

  @Column({ type: 'varchar', default: 'none' })
  fullResultStatus: ResultStatus;

  @Column({ type: 'int', default: 0 })
  fullRowsWritten: number;

  @Column({ type: 'timestamp', nullable: true })
  fullStartedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  fullFinishedAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  fullFailureReason: string | null;

  @Column({ type: 'varchar', nullable: true })
  fullSkipReason: SyncSkipReason | null;
}
