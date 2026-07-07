import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { IntegrationProvider, IntegrationStatus } from '../enums/integrations.enums';

/**
 * A connection between a KeepInTax user and an external provider account
 * (Google, Microsoft, Dropbox, ...). One row per user per provider.
 *
 * User identity via firebase_id (varchar) — no FK to the user table,
 * following the billing module convention.
 *
 * Tokens are stored AES-256-GCM encrypted (see integration-token-encryption.util.ts).
 * Plaintext tokens must never be persisted, logged, or returned by the API.
 */
@Entity('user_integrations')
@Index('ux_user_integrations_user_provider', ['firebaseId', 'provider'], { unique: true })
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

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
