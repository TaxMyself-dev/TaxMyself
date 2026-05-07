import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum TaskType {
  VAT_REPORT = 'VAT_REPORT',
  ADVANCE_TAX = 'ADVANCE_TAX',
  ANNUAL_REPORT = 'ANNUAL_REPORT',
  CUSTOM = 'CUSTOM',
}

export enum TaskSource {
  AUTO = 'AUTO',
  MANUAL = 'MANUAL',
}

@Entity('accountant_task')
@Index('ux_accountant_task_auto', ['businessNumber', 'type', 'periodStart', 'periodEnd'], { unique: true })
@Index('ix_accountant_task_owner', ['accountantFirebaseId', 'isComplete', 'visibleFrom'])
export class AccountantTask {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  accountantFirebaseId: string;

  @Column({ type: 'varchar', length: 255 })
  clientFirebaseId: string;

  @Column({ type: 'varchar', length: 255 })
  businessNumber: string;

  @Column({ type: 'enum', enum: TaskType, enumName: 'AccountantTaskType' })
  type: TaskType;

  @Column({ type: 'enum', enum: TaskSource, enumName: 'AccountantTaskSource' })
  source: TaskSource;

  @Column({ type: 'date', nullable: true, default: null })
  periodStart: Date | null;

  @Column({ type: 'date', nullable: true, default: null })
  periodEnd: Date | null;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true, default: null })
  description: string | null;

  @Column({ type: 'date' })
  dueDate: Date;

  @Column({ type: 'date' })
  visibleFrom: Date;

  @Column({ type: 'boolean', default: false })
  isComplete: boolean;

  @Column({ type: 'datetime', nullable: true, default: null })
  completedAt: Date | null;

  @Column({ type: 'datetime', nullable: true, default: null })
  dismissedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
