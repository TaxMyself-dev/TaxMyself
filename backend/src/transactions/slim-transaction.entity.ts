import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { DualMonthReport, SingleMonthReport } from 'src/enum';
import { ClassificationType } from './enums/classification-type.enum';

@Entity('slim_transactions')
@Index('UQ_slim_user_external', ['userId', 'externalTransactionId'], { unique: true })
export class SlimTransaction {

  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar' })
  externalTransactionId: string;

  @Column({ type: 'varchar' })
  userId: string;

  @Column({ type: 'int' })
  billId: number;

  @Column({
    type: 'enum',
    enum: ClassificationType,
  })
  classificationType: ClassificationType;

  @Column({ type: 'varchar' })
  category: string;

  @Column({ type: 'varchar' })
  subCategory: string;

  @Column({ type: 'boolean', default: false })
  confirmed: boolean;

  @Column({ type: 'int', default: 0 })
  taxPercent: number;

  @Column({ type: 'int', default: 0 })
  vatPercent: number;

  @Column({
    type: 'varchar',
    nullable: true,
    default: null,
  })
  vatReportingDate: SingleMonthReport | DualMonthReport | null;

  @Column({ type: 'int', default: 0 })
  reductionPercent: number;

  @Column({ type: 'boolean', default: false })
  isEquipment: boolean;

  @Column({ type: 'boolean', default: false })
  isRecognized: boolean;

  @Column({ type: 'varchar', nullable: true, default: null })
  businessNumber: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
