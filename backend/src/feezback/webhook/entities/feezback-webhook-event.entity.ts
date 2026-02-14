import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'feezback_webhook_events' })
@Index('IDX_fbw_payload_hash', ['payloadHash'], { unique: true })
export class FeezbackWebhookEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({ name: 'received_at', type: 'timestamp', precision: 0, default: () => 'CURRENT_TIMESTAMP' })
  receivedAt: Date;

  @Column({ name: 'event_type', type: 'varchar', length: 128 })
  eventType: string;

  @Column({ name: 'payload_json', type: 'json' })
  payloadJson: any;

  @Column({ name: 'payload_hash', type: 'varchar', length: 64, unique: true })
  payloadHash: string;

  @Column({ name: 'processed_at', type: 'timestamp', nullable: true })
  processedAt: Date | null;

  @Column({ name: 'processing_error', type: 'text', nullable: true })
  processingError: string | null;
}
