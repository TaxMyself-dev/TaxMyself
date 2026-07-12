import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { IntegrationProvider } from '../enums/integrations.enums';

/**
 * Short-lived CSRF state for an OAuth connect attempt. One row per attempt —
 * a user may have several parallel attempts in flight. Rows are single-use:
 * deleted on callback validation, and expired rows are purged before each
 * new state is created.
 */
@Entity('oauth_states')
@Index('ux_oauth_states_state', ['state'], { unique: true })
@Index('ix_oauth_states_expires', ['expiresAt'])
export class OauthState {
  @PrimaryGeneratedColumn()
  id: number;

  /** Random 32-byte hex value carried through the provider's redirect. */
  @Column({ type: 'varchar', length: 64 })
  state: string;

  @Column({ name: 'firebase_id', type: 'varchar', length: 255 })
  firebaseId: string;

  @Column({
    type: 'enum',
    enum: IntegrationProvider,
    enumName: 'IntegrationProvider',
  })
  provider: IntegrationProvider;

  /** Optional frontend path to land on after a successful connect. Unused until Phase F. */
  @Column({ name: 'redirect_after_success', type: 'varchar', length: 512, nullable: true, default: null })
  redirectAfterSuccess: string | null;

  @Column({ name: 'expires_at', type: 'datetime' })
  expiresAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
