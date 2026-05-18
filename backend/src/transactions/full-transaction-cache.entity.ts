import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  Index,
} from 'typeorm';
import { ReportPeriodLabel } from 'src/enum';
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

  // TEXT (not varchar/255): Feezback card transactionDetails / bank
  // remittanceInformationUnstructured can exceed 255 chars. MySQL TEXT
  // columns cannot have an explicit DEFAULT, so only `nullable` is set.
  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column('date')
  transactionDate: Date;

  @Column({ type: 'date', nullable: true, default: null })
  paymentDate: Date | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  paymentIdentifier: string | null;

  @Column('decimal', { precision: 10, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 3, nullable: true, default: 'ILS' })
  currency: string | null;

  /**
   * `|amount| * fxRateToIls`, stamped at sync time for non-ILS rows. Used by
   * the תזרים column renderer (shown in parentheses below the original) and
   * by the confirm-to-expense path (`Expense.sum = ilsAmount`). Null for
   * ILS rows (callers fall back to `amount`) and for non-ILS rows whose
   * BOI rate couldn't be fetched at sync time.
   */
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true, default: null })
  ilsAmount: number | null;

  /** The FX rate used to compute `ilsAmount`. Null for ILS rows. */
  @Column({ type: 'decimal', precision: 12, scale: 6, nullable: true, default: null })
  fxRateToIls: number | null;

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
  vatReportingDate: ReportPeriodLabel | null;

  /** Mirror of SlimTransaction.isLocked — surfaced here for the read path. */
  @Column({ type: 'boolean', default: false })
  isLocked: boolean;

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
