import { Column, Entity, Index, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Source, ConnectionRole } from './source.entity';
import type { BankingIssue } from '../feezback/core/open-banking-issue';

/**
 * Per-source sync outcome statuses:
 *   not_synced     — discovered but never pulled (retryable).
 *   success        — transactions fetched successfully.
 *   failed         — a fetch was attempted and failed (retryable).
 *   skipped_direct — legacy skipped state, upgraded/retried as not_synced.
 *                    New Direct imports use success/failed like credit cards.
 */
export type SourceSyncStatus = 'not_synced' | 'success' | 'failed' | 'skipped_direct';

export interface SourceResult {
  runId?: string;
  supportError?: BankingIssue;
  type: 'bank' | 'card';
  /** IBAN last-7 for bank; maskedPan last-4 for card. */
  sourceId: string;
  sourceRecordId?: number;
  /** Derived from Source; never persisted on the sync-state table. */
  connectionRole?: ConnectionRole;
  /** Card resourceId (UUID) — stored for retry API call; not used for sourceId matching. */
  resourceId?: string;
  /** Feezback consentId covering this source. Updated on each webhook without changing sync status. */
  consentId?: string;
  status: SourceSyncStatus;
  transactionCount: number;
  error?: string;
  /**
   * Full raw JSON returned by Feezback for this source's transactions fetch
   * (account/card metadata, asOf, transactions.booked/pending, all raw tx
   * fields). TRANSIENT — attached by pullOneSource/retrySource for the admin
   * pull-source endpoint only; NEVER persisted (updateSourceResults ignores it).
   * Used for debugging and forwarding the exact response to Feezback support.
   */
  rawTransactionsResponse?: any;
}

@Entity('user_source_sync_state')
@Index('UQ_source_sync_user_record', ['userId', 'sourceRecordId'], { unique: true })
export class UserSourceSyncState {
  @Column({ type: 'varchar', length: 36, nullable: true })
  resultRunId: string | null;
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar' })
  userId: string;

  @Column({ type: 'int' })
  sourceRecordId: number;

  @ManyToOne(() => Source, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sourceRecordId', foreignKeyConstraintName: 'FK_sync_source_record' })
  source: Source;

  /** IBAN last-7 for bank; maskedPan last-4 for card. */
  @Column({ type: 'varchar' })
  sourceId: string;

  @Column({ type: 'varchar' })
  type: 'bank' | 'card';

  /** Card UUID — stored for retry API call; not used for sourceId matching. */
  @Column({ type: 'varchar', nullable: true })
  resourceId: string | null;

  /** Feezback consentId covering this source. */
  @Column({ type: 'varchar', nullable: true })
  consentId: string | null;

  /** Internal freshness fence; never displayed in the payment-source table. */
  @Column({ type: 'datetime', precision: 3, nullable: true })
  consentVerifiedAt: Date | null;

  @Column({ type: 'varchar', length: 32, default: 'not_synced' })
  status: SourceSyncStatus;

  @Column({ type: 'int', default: 0 })
  transactionCount: number;

  @Column({ type: 'varchar', nullable: true })
  error: string | null;
}
