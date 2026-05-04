import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
export { SourceResult } from './user-source-sync-state.entity';

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
  // Sync stage — single full pull (12-month backfill).
  // The legacy two-stage (quick + full) layout was removed; only the full pass
  // remains. Column names keep the `full` prefix for backwards compatibility
  // with existing code/migrations.
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

  /**
   * Timestamp of the last successful Source-rows refresh from the Feezback API
   * (`refreshUserSources`). Used by the login path to skip the source-refresh
   * step when sources are already fresh. NULL = never refreshed.
   */
  @Column({ type: 'timestamp', nullable: true })
  lastSourcesRefreshAt: Date | null;

  /**
   * Timestamp of the user's most recent click on "Connect Open Banking" — set
   * by the consent-link endpoint right before redirecting to Feezback. Used
   * by the post-consent endpoint to decide if a webhook-triggered sync has
   * already covered this consent flow:
   *   - if `fullFinishedAt > lastConsentInitiatedAt` → sync already ran for this flow
   *   - else → still waiting for the webhook to fire the sync
   */
  @Column({ type: 'timestamp', nullable: true })
  lastConsentInitiatedAt: Date | null;

}
