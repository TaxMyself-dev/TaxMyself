import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export interface SourceResult {
  type: 'bank' | 'card';
  /** IBAN last-7 for bank; maskedPan last-4 for card. */
  sourceId: string;
  /** Card resourceId (UUID) — stored for retry API call; not used for sourceId matching. */
  resourceId?: string;
  /** Feezback consentId covering this source. Updated on each webhook without changing sync status. */
  consentId?: string;
  status: 'not_synced' | 'success' | 'failed';
  transactionCount: number;
  error?: string;
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
  status: 'not_synced' | 'success' | 'failed';

  @Column({ type: 'int', default: 0 })
  transactionCount: number;

  @Column({ type: 'varchar', nullable: true })
  error: string | null;
}
