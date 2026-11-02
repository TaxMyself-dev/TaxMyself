import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Documents } from '../../documents/documents.entity';
import { ShaamEnvironment } from '../shaam.constants';
import {
  ShaamInvoiceAllocationAttemptState,
  ShaamInvoiceAllocationResolutionAction,
} from './shaam.enums';

@Entity('shaam_invoice_allocation_attempt')
@Index('ux_shaam_allocation_attempt_number', ['documentId', 'attemptNumber'], { unique: true })
@Index('ux_shaam_allocation_request_id', ['requestId'], { unique: true })
@Index('ix_shaam_allocation_document_state', ['documentId', 'state', 'createdAt'])
@Index('ix_shaam_allocation_state_created', ['state', 'createdAt'])
export class ShaamInvoiceAllocationAttempt {
  @PrimaryGeneratedColumn() id: number;
  @Column({ name: 'document_id', type: 'int' }) documentId: number;
  @ManyToOne(() => Documents, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'document_id', foreignKeyConstraintName: 'fk_shaam_allocation_attempt_document' })
  document: Documents;
  @Column({ name: 'attempt_number', type: 'int', unsigned: true }) attemptNumber: number;
  @Column({ name: 'request_id', type: 'char', length: 36 }) requestId: string;
  @Column({ name: 'actor_firebase_id', type: 'varchar', length: 255 }) actorFirebaseId: string;
  @Column({ name: 'effective_firebase_id', type: 'varchar', length: 255 }) effectiveFirebaseId: string;
  @Column({ type: 'varchar', length: 16 }) environment: ShaamEnvironment;
  @Column({ type: 'varchar', length: 32 }) state: ShaamInvoiceAllocationAttemptState;
  @Column({ name: 'payload_sha256', type: 'char', length: 64 }) payloadSha256: string;
  @Column({ name: 'lease_expires_at', type: 'datetime', nullable: true, default: null }) leaseExpiresAt: Date | null;
  @Column({ name: 'provider_http_status', type: 'smallint', unsigned: true, nullable: true, default: null }) providerHttpStatus: number | null;
  @Column({ name: 'failure_category', type: 'varchar', length: 64, nullable: true, default: null }) failureCategory: string | null;
  @Column({ name: 'provider_error_code', type: 'varchar', length: 128, nullable: true, default: null }) providerErrorCode: string | null;
  @Column({ name: 'submitted_at', type: 'datetime' }) submittedAt: Date;
  @Column({ name: 'unknown_since', type: 'datetime', nullable: true, default: null }) unknownSince: Date | null;
  @Column({ name: 'completed_at', type: 'datetime', nullable: true, default: null }) completedAt: Date | null;
  @Column({ name: 'resolution_action', type: 'varchar', length: 32, nullable: true, default: null }) resolutionAction: ShaamInvoiceAllocationResolutionAction | null;
  @Column({ name: 'resolution_evidence', type: 'varchar', length: 100, nullable: true, default: null }) resolutionEvidence: string | null;
  @Column({ name: 'resolved_by_firebase_id', type: 'varchar', length: 255, nullable: true, default: null }) resolvedByFirebaseId: string | null;
  @Column({ name: 'resolved_at', type: 'datetime', nullable: true, default: null }) resolvedAt: Date | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
