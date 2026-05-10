import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum ReportWorkflowType {
  VAT_REPORT = 'VAT_REPORT',
  ADVANCE_TAX = 'ADVANCE_TAX',
}

export enum ReportWorkflowStatus {
  WAITING_FOR_CLIENT = 'WAITING_FOR_CLIENT',
  READY_TO_PREPARE = 'READY_TO_PREPARE',
  REPORTED = 'REPORTED',
}

/** Source of the REPORTED transition — keeps room for SHAAM auto-mark. */
export enum ReportedSource {
  MANUAL_ACCOUNTANT = 'MANUAL_ACCOUNTANT',
  SHAAM_WEBHOOK = 'SHAAM_WEBHOOK',
}

@Entity('report_workflow')
@Index('ux_report_workflow', ['businessNumber', 'type', 'periodStart', 'periodEnd'], { unique: true })
@Index('ix_report_workflow_client', ['clientFirebaseId', 'status'])
export class ReportWorkflow {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  clientFirebaseId: string;

  @Column({ type: 'varchar', length: 255 })
  businessNumber: string;

  @Column({ type: 'enum', enum: ReportWorkflowType })
  type: ReportWorkflowType;

  @Column({ type: 'date' })
  periodStart: Date;

  @Column({ type: 'date' })
  periodEnd: Date;

  @Column({
    type: 'enum',
    enum: ReportWorkflowStatus,
    default: ReportWorkflowStatus.WAITING_FOR_CLIENT,
  })
  status: ReportWorkflowStatus;

  @Column({ type: 'datetime', nullable: true, default: null })
  clientConfirmedAt: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  clientConfirmedBy: string | null;

  @Column({ type: 'datetime', nullable: true, default: null })
  reportedAt: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  reportedByAccountantFirebaseId: string | null;

  @Column({ type: 'enum', enum: ReportedSource, nullable: true, default: null })
  reportedSource: ReportedSource | null;

  @Column({ type: 'text', nullable: true, default: null })
  notes: string | null;

  /**
   * Soft-delete marker. Set when a self-served client dismisses a workflow
   * from "המשימות שלי". Dismissed rows are excluded from list responses but
   * stay in the DB so the unique index on (businessNumber, type, periodStart,
   * periodEnd) prevents the generator from recreating the same period.
   */
  @Column({ type: 'datetime', nullable: true, default: null })
  dismissedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
