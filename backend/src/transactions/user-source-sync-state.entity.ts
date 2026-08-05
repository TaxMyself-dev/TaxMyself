import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Per-source sync outcome statuses:
 *   not_synced     — discovered but never pulled (retryable).
 *   success        — transactions fetched successfully.
 *   failed         — a fetch was attempted and failed (retryable).
 *   skipped_direct — TERMINAL, intentional: this source is a Direct/Debit card.
 *                    Its transactions are deliberately NOT imported from the
 *                    card feed because they arrive through the bank-account
 *                    feed. Never selected for automatic or manual retry.
 */
export type SourceSyncStatus = 'not_synced' | 'success' | 'failed' | 'skipped_direct';

export interface SourceResult {
  type: 'bank' | 'card';
  /** IBAN last-7 for bank; maskedPan last-4 for card. */
  sourceId: string;
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
@Index('UQ_source_sync_user_source', ['userId', 'sourceId'], { unique: true })
export class UserSourceSyncState {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar' })
  userId: string;

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

  @Column({ type: 'varchar', default: 'not_synced' })
  status: SourceSyncStatus;

  @Column({ type: 'int', default: 0 })
  transactionCount: number;

  @Column({ type: 'varchar', nullable: true })
  error: string | null;
}
