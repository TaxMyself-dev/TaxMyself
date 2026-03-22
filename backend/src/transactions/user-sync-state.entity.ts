import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * pending         — stage has not started yet (only used for fullStatus before Pull 2 begins)
 * running         — stage is in progress
 * completed       — stage finished and rowsWritten > 0
 * completed_empty — stage finished but no rows were written to full_transactions_cache
 * failed          — an unexpected error stopped the stage
 * skipped         — stage was intentionally skipped (see skipReason)
 */
export type SyncStatus = 'pending' | 'running' | 'completed' | 'completed_empty' | 'failed' | 'skipped';

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
  triggeredBy: 'login' | 'webhook' | null;

  // ---------------------------------------------------------------------------
  // Quick sync stage — Pull 1: current month + previous 2 full calendar months
  // ---------------------------------------------------------------------------

  @Column({ type: 'varchar', default: 'pending' })
  quickStatus: SyncStatus;

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
  // Starts only after the quick stage completes successfully.
  // ---------------------------------------------------------------------------

  @Column({ type: 'varchar', default: 'pending' })
  fullStatus: SyncStatus;

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
