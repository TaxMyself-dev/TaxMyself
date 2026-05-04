import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'feezback_consents' })
@Index(['firebaseId', 'tppId', 'consentId'], { unique: true })
export class FeezbackConsent {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'firebase_id', type: 'varchar', length: 128 })
  firebaseId: string;

  @Column({ name: 'tpp_id', type: 'varchar', length: 64 })
  tppId: string;

  @Column({ name: 'user_identifier', type: 'varchar', length: 256 })
  userIdentifier: string;

  @Column({ name: 'consent_id', type: 'varchar', length: 128 })
  consentId: string;

  @Column({ type: 'varchar', length: 256, nullable: true })
  context: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  status: string | null;

  @Column({ name: 'valid_until', type: 'date', nullable: true })
  validUntil: Date | null;

  @Column({ name: 'recurring_indicator', type: 'boolean', nullable: true })
  recurringIndicator: boolean | null;

  @Column({ name: 'aspsp_code', type: 'varchar', length: 64, nullable: true })
  aspspCode: string | null;

  @Column({ name: 'meta_json', type: 'json', nullable: true })
  metaJson: any;

  @Column({ name: 'raw_last_webhook_json', type: 'json', nullable: true })
  rawLastWebhookJson: any;

  @Column({ name: 'needs_sync', type: 'boolean', default: true })
  needsSync: boolean;

  @Column({ name: 'last_sync_at', type: 'datetime', nullable: true })
  lastSyncAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp', precision: 0, default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamp',
    precision: 0,
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updatedAt: Date;
}
