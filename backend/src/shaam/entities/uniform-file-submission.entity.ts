import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ShaamEnvironment } from '../shaam.constants';
import { UniformFileRemoteStatus, UniformFileSubmissionState } from './shaam.enums';
import { Business } from '../../business/business.entity';

@Entity('uniform_file_submission')
@Index('ux_uniform_submission_artifact', ['environment', 'businessId', 'periodStart', 'periodEnd', 'iniSha256', 'bkmSha256'], { unique: true })
@Index('ix_uniform_submission_business_state', ['businessId', 'state', 'createdAt'])
export class UniformFileSubmission {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'business_id', type: 'int' }) businessId: number;
  @ManyToOne(() => Business, { onDelete: 'RESTRICT', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'business_id', foreignKeyConstraintName: 'fk_uniform_submission_business' })
  business: Business;
  @Column({ name: 'business_number_snapshot', type: 'varchar', length: 20 }) businessNumberSnapshot: string;
  @Column({ name: 'actor_firebase_id', type: 'varchar', length: 255 }) actorFirebaseId: string;
  @Column({ type: 'enum', enum: ShaamEnvironment, enumName: 'ShaamEnvironment' }) environment: ShaamEnvironment;
  @Column({ name: 'period_start', type: 'date' }) periodStart: string;
  @Column({ name: 'period_end', type: 'date' }) periodEnd: string;
  @Column({ name: 'representor_company_id', type: 'varchar', length: 20, nullable: true, default: null }) representorCompanyId: string | null;
  @Column({ type: 'enum', enum: UniformFileSubmissionState, enumName: 'UniformFileSubmissionState', default: UniformFileSubmissionState.GENERATED }) state: UniformFileSubmissionState;
  @Column({ name: 'ini_status', type: 'enum', enum: UniformFileRemoteStatus, enumName: 'UniformFileRemoteStatus', nullable: true, default: null }) iniStatus: UniformFileRemoteStatus | null;
  @Column({ name: 'bkm_status', type: 'enum', enum: UniformFileRemoteStatus, enumName: 'UniformFileRemoteStatus', nullable: true, default: null }) bkmStatus: UniformFileRemoteStatus | null;
  @Column({ name: 'ini_sha256', type: 'char', length: 64 }) iniSha256: string;
  @Column({ name: 'bkm_sha256', type: 'char', length: 64 }) bkmSha256: string;
  @Column({ name: 'ini_byte_length', type: 'bigint', unsigned: true }) iniByteLength: string;
  @Column({ name: 'bkm_byte_length', type: 'bigint', unsigned: true }) bkmByteLength: string;
  @Column({ name: 'shaam_unique_id', type: 'varchar', length: 255, nullable: true, default: null }) shaamUniqueId: string | null;
  @Column({ name: 'ini_file_name', type: 'varchar', length: 255, nullable: true, default: null }) iniFileName: string | null;
  @Column({ name: 'bkm_file_name', type: 'varchar', length: 255, nullable: true, default: null }) bkmFileName: string | null;
  @Column({ name: 'ini_file_unique_id', type: 'varchar', length: 255, nullable: true, default: null }) iniFileUniqueId: string | null;
  @Column({ name: 'bkm_file_unique_id', type: 'varchar', length: 255, nullable: true, default: null }) bkmFileUniqueId: string | null;
  @Column({ name: 'error_category', type: 'varchar', length: 64, nullable: true, default: null }) errorCategory: string | null;
  @Column({ name: 'error_code', type: 'varchar', length: 128, nullable: true, default: null }) errorCode: string | null;
  @Column({ name: 'error_message', type: 'varchar', length: 1000, nullable: true, default: null }) errorMessage: string | null;
  @Column({ name: 'retry_count', type: 'int', unsigned: true, default: 0 }) retryCount: number;
  @Column({ name: 'generated_at', type: 'datetime' }) generatedAt: Date;
  @Column({ name: 'uploaded_at', type: 'datetime', nullable: true, default: null }) uploadedAt: Date | null;
  @Column({ name: 'last_polled_at', type: 'datetime', nullable: true, default: null }) lastPolledAt: Date | null;
  @Column({ name: 'completed_at', type: 'datetime', nullable: true, default: null }) completedAt: Date | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
