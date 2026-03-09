import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  Index,
} from 'typeorm';
import { DualMonthReport, SingleMonthReport } from 'src/enum';
import { ClassificationType } from './enums/classification-type.enum';

@Entity('full_transactions_cache')
@Index('UQ_cache_user_external', ['userId', 'externalTransactionId'], { unique: true })
@Index('IDX_cache_userId', ['userId'])
@Index('IDX_cache_billId', ['billId'])
@Index('IDX_cache_transactionDate', ['transactionDate'])
export class FullTransactionCache {

  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar' })
  externalTransactionId: string;

  @Column({ type: 'varchar' })
  userId: string;

  @Column({ type: 'int', nullable: true, default: null })
  billId: number | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  billName: string | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  businessNumber: string | null;

  @Column({ type: 'varchar' })
  merchantName: string;

  @Column({ type: 'varchar', nullable: true, default: null })
  note: string | null;

  @Column('date')
  transactionDate: Date;

  @Column({ type: 'date', nullable: true, default: null })
  paymentDate: Date | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  paymentIdentifier: string | null;

  @Column('decimal', { precision: 10, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', nullable: true, default: null })
  category: string | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  subCategory: string | null;

  @Column({ type: 'boolean', default: false })
  isRecognized: boolean;

  @Column({ type: 'int', default: 0 })
  vatPercent: number;

  @Column({ type: 'int', default: 0 })
  taxPercent: number;

  @Column({ type: 'boolean', default: false })
  isEquipment: boolean;

  @Column({ type: 'int', default: 0 })
  reductionPercent: number;

  @Column({
    type: 'varchar',
    nullable: true,
    default: null,
  })
  vatReportingDate: SingleMonthReport | DualMonthReport | null;

  @Column({ type: 'boolean', default: false })
  confirmed: boolean;

  @Column({
    type: 'enum',
    enum: ClassificationType,
    nullable: true,
    default: null,
  })
  classificationType: ClassificationType | null;
}
