import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  IntegrationProvider,
  IntegrationStatus,
  IntegrationSyncStatus,
} from '../enums/integrations.enums';

/**
 * A connection between a KeepInTax user and an external provider account
 * (Google, Microsoft, Dropbox, ...). One row per connected provider account,
 * so a single user may connect MULTIPLE accounts of the same provider (e.g.
 * several Gmail mailboxes).
 *
 * A provider account belongs to exactly one KeepInTax user globally: this is
 * enforced by UNIQUE(provider, account_id). The (firebase_id, provider) index
 * is non-unique and only supports listing a user's accounts for a provider.
 *
 * User identity via firebase_id (varchar) — no FK to the user table,
 * following the billing module convention.
 *
 * Tokens are stored AES-256-GCM encrypted (see integration-token-encryption.util.ts).
 * Plaintext tokens must never be persisted, logged, or returned by the API.
 */
@Entity('user_integrations')
@Index('ux_user_integrations_provider_account', ['provider', 'accountId'], { unique: true })
@Index('ix_user_integrations_user_provider', ['firebaseId', 'provider'])
@Index('ix_user_integrations_provider_status', ['provider', 'status'])
export class UserIntegration {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'firebase_id', type: 'varchar', length: 255 })
  firebaseId: string;

  @Column({
    type: 'enum',
    enum: IntegrationProvider,
    enumName: 'IntegrationProvider',
  })
  provider: IntegrationProvider;

  /** Provider-side account identifier (e.g. Google `sub` claim). Set during OAuth (Phase B). */
  @Column({ name: 'account_id', type: 'varchar', length: 255, nullable: true, default: null })
  accountId: string | null;

  /** Email of the connected external account, for display in the UI. */
  @Column({ name: 'account_email', type: 'varchar', length: 320, nullable: true, default: null })
  accountEmail: string | null;

  /**
   * AES-256-GCM encrypted refresh token. Encrypt/decrypt only via the service.
   * Null after disconnect: the row is kept (status REVOKED) but tokens are cleared.
   */
  @Column({ name: 'refresh_token', type: 'text', nullable: true, default: null })
  refreshToken: string | null;

  /** AES-256-GCM encrypted short-lived access token. Optional cache; may be null. */
  @Column({ name: 'access_token', type: 'text', nullable: true, default: null })
  accessToken: string | null;

  /** Space-delimited OAuth scopes granted by the user. */
  @Column({ type: 'text', nullable: true, default: null })
  scopes: string | null;

  /** Expiry of the cached access token (not of the integration itself). */
  @Column({ name: 'expires_at', type: 'datetime', nullable: true, default: null })
  expiresAt: Date | null;

  @Column({
    type: 'enum',
    enum: IntegrationStatus,
    enumName: 'IntegrationStatus',
    default: IntegrationStatus.ACTIVE,
  })
  status: IntegrationStatus;

  // --- Gmail sync state (all null until the user runs the initial manual import) ---
  // Scoped to this single mailbox: each connected account has its own row and
  // its own cursor/initial-import state. Reconnecting the SAME account
  // (matched by provider + account_id) preserves these fields.

  /**
   * When the initial manual Gmail import finished successfully.
   * Non-null is the eligibility flag for the nightly automatic sync.
   */
  @Column({ name: 'initial_import_completed_at', type: 'datetime', nullable: true, default: null })
  initialImportCompletedAt: Date | null;

  /**
   * Date range the user chose for the initial import (audit/display only).
   * DATE columns round-trip as 'YYYY-MM-DD' strings with the mysql driver.
   */
  @Column({ name: 'initial_import_from_date', type: 'date', nullable: true, default: null })
  initialImportFromDate: string | null;

  @Column({ name: 'initial_import_to_date', type: 'date', nullable: true, default: null })
  initialImportToDate: string | null;

  /** When the most recent sync run (initial or nightly) started. */
  @Column({ name: 'last_sync_started_at', type: 'datetime', nullable: true, default: null })
  lastSyncStartedAt: Date | null;

  /**
   * Incremental-sync cursor: the nightly sync pulls mail received from this
   * instant until now. Advanced only after a fully successful run — a failed
   * run leaves it untouched so the next run re-covers the window (re-imports
   * are harmless thanks to content-hash dedup in imported_documents).
   */
  @Column({ name: 'last_successful_sync_at', type: 'datetime', nullable: true, default: null })
  lastSuccessfulSyncAt: Date | null;

  @Column({
    name: 'last_sync_status',
    type: 'enum',
    enum: IntegrationSyncStatus,
    enumName: 'IntegrationSyncStatus',
    nullable: true,
    default: null,
  })
  lastSyncStatus: IntegrationSyncStatus | null;

  /** Failure detail of the last sync run; null while running and after success. */
  @Column({ name: 'last_sync_error', type: 'text', nullable: true, default: null })
  lastSyncError: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
